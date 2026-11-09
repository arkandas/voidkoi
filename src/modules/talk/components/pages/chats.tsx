'use client';

import { MessageCircle, Paperclip, Search, SquarePen, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

import { AppSwitcher } from '@/components/shell/switcher';
import { Button, EmptyState, IconButton, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { ChatHeader } from '@/modules/talk/components/chat/chat-header';
import { Composer } from '@/modules/talk/components/chat/composer';
import { ConversationList } from '@/modules/talk/components/chat/conversation-list';
import { DeleteChatDialog } from '@/modules/talk/components/chat/delete-chat-dialog';
import { GroupConfirmDialog, type GroupConfirmAction } from '@/modules/talk/components/chat/group-confirm-dialog';
import { GroupHeader, type GroupAction } from '@/modules/talk/components/chat/group-header';
import { GroupInfoDialog } from '@/modules/talk/components/chat/group-info-dialog';
import { MessageTimeline, type TimelineEntry } from '@/modules/talk/components/chat/message-timeline';
import { NewChatDialog } from '@/modules/talk/components/chat/new-chat-dialog';
import { AttachmentViewer } from '@/modules/talk/components/files/attachment-viewer';
import { useHideTabBar } from '@/modules/talk/components/layout/talk-shell';
import { api } from '@/modules/talk/lib/api';
import { conversationTitle, findMember } from '@/modules/talk/lib/groups';
import { useCall } from '@/modules/talk/lib/hooks/use-call';
import { useMediaQuery } from '@/lib/use-media-query';
import { useRealtime, useRealtimeMessages } from '@/modules/talk/lib/hooks/use-realtime';
import { useTalkData } from '@/modules/talk/lib/hooks/use-talk-data';
import { useTalkMe } from '@/modules/talk/lib/hooks/use-talk-me';
import { useUploads, type PendingUpload } from '@/modules/talk/lib/hooks/use-uploads';
import { chimeSent, setOpenConversation } from '@/modules/talk/lib/message-sound';
import type { Attachment, ChatMessage, ConversationSummary, TimelineItem } from '@/modules/talk/lib/protocol';
import { useTimeFormat } from '@/modules/talk/lib/time';

const PAGE_SIZE = 50;

let lastPlaceholderId = 0;

/** A negative id for a message the server hasn't stored yet, unique even within one millisecond. */
function nextPlaceholderId(): number {
  lastPlaceholderId = Math.min(lastPlaceholderId - 1, -Date.now());
  return lastPlaceholderId;
}

/** Whether a drag carries files, rather than text or a link from the page. */
function carriesFiles(event: DragEvent): boolean {
  return [...event.dataTransfer.types].includes('Files');
}

export function ChatsPage() {
  // useSearchParams needs a Suspense boundary for the build to prerender.
  return (
    <Suspense fallback={null}>
      <Chats />
    </Suspense>
  );
}

function Chats() {
  const me = useTalkMe();
  const { conversations, refreshConversations, loading: listLoading, maxUploadBytes } = useTalkData();
  const { send, statusOf } = useRealtime();
  const { startCall, state: callState } = useCall();
  const toast = useToast();
  const t = useTranslations('talk.chat');
  const locale = useLocale();
  const format = useTimeFormat();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedUserId = Number(searchParams.get('with') ?? '');
  /** A group's notification links to the conversation itself: there is no one person to open. */
  const requestedConversationId = Number(searchParams.get('conversation') ?? '');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** A conversation opened from People before the list has caught up. */
  const [pendingConversation, setPendingConversation] = useState<ConversationSummary | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** clientId -> the optimistic entry's id, until the server echoes it back. */
  const [optimistic] = useState(() => new Map<string, number>());
  const [picking, setPicking] = useState(false);
  /** Narrows the list by name. */
  const [query, setQuery] = useState('');
  /** The picture open full screen, and the message it came in. */
  const [viewing, setViewing] = useState<{ attachment: Attachment; message: ChatMessage } | null>(null);
  /** The chat waiting for "are you sure?", and whether it is being deleted. */
  const [deleting, setDeleting] = useState<{ conversation: ConversationSummary; busy: boolean } | null>(null);
  const [showingInfo, setShowingInfo] = useState(false);
  /** Leaving or deleting a group, waiting for "are you sure?". */
  const [confirming, setConfirming] = useState<{ action: GroupConfirmAction; conversation: ConversationSummary; busy: boolean } | null>(null);
  /** Files are being dragged over the open conversation. */
  const [dropping, setDropping] = useState(false);
  /** dragenter and dragleave fire for every child crossed; counted to know when it really left. */
  const dragDepth = useRef(0);
  /** Object URLs handed over by sent uploads, released when the page goes. */
  const [localPreviews] = useState(() => new Set<string>());

  // With nothing picked, the newest conversation is open on a wide screen. Not on a
  // phone, where only the list is on screen: opening one there would mark it read unseen.
  const wide = useMediaQuery('(min-width: 64rem)', true);
  const activeId = selectedId ?? (wide ? (conversations[0]?.id ?? null) : null);
  const selected = conversations.find(conversation => conversation.id === activeId) ?? (pendingConversation?.id === activeId ? pendingConversation : null);
  // For the message sound: a message in the conversation on screen needs none.
  const openConversationId = selected?.id ?? null;
  useEffect(() => {
    setOpenConversation(openConversationId);
    return () => setOpenConversation(null);
  }, [openConversationId]);
  const loading = activeId !== null && loadedId !== activeId;
  /** A group you have left, or were taken out of: readable, not writable. */
  const readOnly = selected?.group ? !selected.group.active : false;

  /* --- arriving with ?with=<userId> or ?conversation=<id> ----------- */

  /** Open the conversation with somebody, making it if this is the first word between them. */
  const openWith = useCallback(
    async (userId: number): Promise<void> => {
      try {
        const { conversation } = await api.conversationWith(userId);
        setPendingConversation(conversation);
        setSelectedId(conversation.id);
        await refreshConversations();
      } catch {
        toast.show(t('errors.open'), 'error');
      }
    },
    [refreshConversations, toast, t],
  );

  useEffect(() => {
    if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) return;
    let cancelled = false;
    void (async () => {
      if (!cancelled) await openWith(requestedUserId);
      // Drop the parameter so a reload doesn't open it again over a later pick.
      if (!cancelled) router.replace('/talk');
    })();
    return () => {
      cancelled = true;
    };
    // Once per requested person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedUserId]);

  useEffect(() => {
    if (!Number.isInteger(requestedConversationId) || requestedConversationId <= 0) return;
    // Wait for the list, so a group that is gone is said to be gone.
    if (listLoading) return;
    let cancelled = false;
    void (async () => {
      if (conversations.some(conversation => conversation.id === requestedConversationId)) setSelectedId(requestedConversationId);
      else toast.show(t('errors.open'), 'error');
      if (!cancelled) router.replace('/talk');
    })();
    return () => {
      cancelled = true;
    };
    // Once per requested conversation, when the list is there to look in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedConversationId, listLoading]);

  /** Open a conversation that may not be in the list yet, like a group just made. */
  const openConversation = useCallback(
    (conversation: ConversationSummary) => {
      setPendingConversation(conversation);
      setSelectedId(conversation.id);
      void refreshConversations();
    },
    [refreshConversations],
  );

  /* --- loading the open conversation -------------------------------- */

  useEffect(() => {
    if (activeId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await api.timeline(activeId, { limit: PAGE_SIZE });
        if (cancelled) return;
        setEntries(page.items.map(item => ({ item })));
        setNextBefore(page.nextBefore);
        setLoadedId(activeId);
        // Opening a conversation is what marks it read.
        await api.markRead(activeId);
        if (!cancelled) await refreshConversations();
      } catch {
        if (!cancelled) {
          setEntries([]);
          setLoadedId(activeId);
          toast.show(t('errors.load'), 'error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /** The newest page again, after something the socket only announced. Messages on their way keep their place. */
  const reloadTimeline = useCallback(
    (conversationId: number) => {
      void api
        .timeline(conversationId, { limit: PAGE_SIZE })
        .then(page => {
          if (conversationId !== activeId) return;
          setEntries(current => [...page.items.map(item => ({ item })), ...current.filter(entry => entry.pending)]);
          setNextBefore(page.nextBefore);
        })
        .catch(() => undefined);
    },
    [activeId],
  );

  const loadMore = useCallback(async () => {
    if (activeId === null || nextBefore === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.timeline(activeId, { before: nextBefore, limit: PAGE_SIZE });
      setEntries(current => [...page.items.map(item => ({ item })), ...current]);
      setNextBefore(page.nextBefore);
    } catch {
      toast.show(t('errors.loadEarlier'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [activeId, nextBefore, loadingMore, toast, t]);

  /* --- sending ------------------------------------------------------ */

  const onSend = useCallback(
    (text: string) => {
      if (activeId === null) return;
      const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const placeholderId = nextPlaceholderId();

      // The bubble appears at once, dimmed, and is swapped for the stored row when the server echoes this clientId.
      const draft: TimelineItem = { kind: 'message', id: placeholderId, conversationId: activeId, senderId: me.id, body: text, createdAt: new Date().toISOString() };
      setEntries(current => [...current, { item: draft, pending: true }]);

      if (!send({ type: 'chat', conversationId: activeId, text, clientId })) {
        setEntries(current => current.filter(entry => !(entry.item.kind === 'message' && entry.item.id === placeholderId)));
        toast.show(t('errors.notSent'), 'error');
        return;
      }
      chimeSent();
      optimistic.set(clientId, placeholderId);
    },
    [activeId, me.id, send, toast, optimistic, t],
  );

  /* --- files --------------------------------------------------------- */

  /** A file is stored: send it as a message of its own, with the upload's key as the clientId. */
  const deliver = useCallback(
    (upload: PendingUpload, attachment: Attachment): boolean => {
      const sent = send({ type: 'chat', conversationId: upload.conversationId, text: '', clientId: upload.key, attachmentId: attachment.id });
      if (!sent) return false;
      chimeSent();

      // Finished while another conversation was open: that one loads it when next opened.
      if (upload.conversationId !== activeId) {
        if (upload.localPreview) URL.revokeObjectURL(upload.localPreview);
        return true;
      }

      const placeholderId = nextPlaceholderId();
      const draft: TimelineItem = {
        kind: 'message',
        id: placeholderId,
        conversationId: upload.conversationId,
        senderId: me.id,
        body: '',
        attachment,
        createdAt: new Date().toISOString(),
      };
      if (upload.localPreview) localPreviews.add(upload.localPreview);
      setEntries(current => [...current, { item: draft, pending: true, localPreview: upload.localPreview }]);
      optimistic.set(upload.key, placeholderId);
      return true;
    },
    [activeId, me.id, send, optimistic, localPreviews],
  );

  const { uploads: pendingUploads, add: addUploads, cancel: cancelUpload, retry: retryUpload } = useUploads({ maxUploadBytes, deliver });

  useEffect(
    () => () => {
      for (const url of localPreviews) URL.revokeObjectURL(url);
    },
    [localPreviews],
  );

  const onFiles = useCallback(
    (files: File[]) => {
      if (activeId === null || files.length === 0) return;
      const refused = addUploads(activeId, files);
      if (refused.length === 0 || maxUploadBytes === null) return;
      const max = formatBytes(maxUploadBytes, locale);
      toast.show(refused.length === 1 ? t('attach.tooLarge', { name: refused[0]!.name, max }) : t('attach.tooLargeMany', { count: refused.length, max }), 'error');
    },
    [activeId, addUploads, maxUploadBytes, locale, toast, t],
  );

  const onDragEnter = (event: DragEvent<HTMLElement>): void => {
    // Nowhere to drop a file in a group you're no longer in.
    if (!carriesFiles(event) || readOnly) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDropping(true);
  };

  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    if (!carriesFiles(event)) return;
    // Without this the browser opens the file in the tab instead.
    event.preventDefault();
    event.dataTransfer.dropEffect = readOnly ? 'none' : 'copy';
  };

  const onDragLeave = (event: DragEvent<HTMLElement>): void => {
    if (!carriesFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };

  const onDrop = (event: DragEvent<HTMLElement>): void => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    if (!readOnly) onFiles([...event.dataTransfer.files]);
  };

  const closeViewer = useCallback(() => setViewing(null), []);

  /* --- deleting ------------------------------------------------------ */

  const onDeleteMessage = useCallback(
    (messageId: number, scope: 'me' | 'everyone') => {
      // Applied here first. 'everyone' also comes back over the socket, and the handler below changes nothing then.
      setEntries(current =>
        scope === 'me'
          ? current.filter(entry => !(entry.item.kind === 'message' && entry.item.id === messageId))
          : current.map(entry =>
              entry.item.kind === 'message' && entry.item.id === messageId
                ? { ...entry, item: { ...entry.item, body: '', attachment: null, deletedAt: new Date().toISOString() } }
                : entry,
            ),
      );
      void api
        .deleteMessage(messageId, scope)
        .then(refreshConversations)
        .catch(() => toast.show(t('errors.deleteMessage'), 'error'));
    },
    [refreshConversations, toast, t],
  );

  const onDeleteCall = useCallback(
    (callId: number) => {
      setEntries(current => current.filter(entry => !(entry.item.kind === 'call' && entry.item.id === callId)));
      void api.deleteCall(callId).catch(() => toast.show(t('errors.deleteCall'), 'error'));
    },
    [toast, t],
  );

  const onClearConversation = useCallback(() => {
    if (activeId === null) return;
    const conversationId = activeId;
    setEntries([]);
    setNextBefore(null);
    void api
      .clearConversation(conversationId)
      .then(refreshConversations)
      .catch(() => toast.show(t('errors.clear'), 'error'));
  }, [activeId, refreshConversations, toast, t]);

  /** Forget a chat that is no longer in the list, and close it if it is open. */
  const dropConversation = useCallback(
    (conversationId: number) => {
      if (activeId === conversationId) {
        setSelectedId(null);
        setEntries([]);
        setNextBefore(null);
        setLoadedId(null);
        setShowingInfo(false);
        setConfirming(null);
      }
      setPendingConversation(current => (current?.id === conversationId ? null : current));
      // Arrived with ?with= or ?conversation=: drop it, or the chat would open straight back up.
      if (requestedUserId > 0 || requestedConversationId > 0) router.replace('/talk');
      void refreshConversations();
    },
    [activeId, requestedUserId, requestedConversationId, router, refreshConversations],
  );

  const onConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    const { conversation } = deleting;
    setDeleting({ conversation, busy: true });
    try {
      await api.deleteConversation(conversation.id);
      setDeleting(null);
      dropConversation(conversation.id);
      toast.show(t('deleteChat.deleted'), 'success');
    } catch {
      setDeleting({ conversation, busy: false });
      toast.show(t('deleteChat.failed'), 'error');
    }
  }, [deleting, dropConversation, toast, t]);

  /* --- groups -------------------------------------------------------- */

  const onGroupAction = useCallback(
    (conversation: ConversationSummary, action: GroupAction) => {
      if (action === 'info') setShowingInfo(true);
      else if (action === 'clear') onClearConversation();
      else if (action === 'deleteChat') setDeleting({ conversation, busy: false });
      else setConfirming({ action: action === 'leave' ? 'leave' : 'delete', conversation, busy: false });
    },
    [onClearConversation],
  );

  /** A group changed from here: the list and the notices catch up. */
  const onGroupChanged = useCallback(
    (conversation: ConversationSummary) => {
      setPendingConversation(current => (current?.id === conversation.id ? conversation : current));
      void refreshConversations();
      reloadTimeline(conversation.id);
    },
    [refreshConversations, reloadTimeline],
  );

  const onConfirmGroupAction = useCallback(async () => {
    if (!confirming) return;
    const { action, conversation } = confirming;
    const name = conversationTitle(conversation);
    setConfirming({ ...confirming, busy: true });
    try {
      if (action === 'leave') {
        const { conversation: after } = await api.leaveGroup(conversation.id);
        setConfirming(null);
        setShowingInfo(false);
        // The last one out: the group is gone with them.
        if (after) onGroupChanged(after);
        else dropConversation(conversation.id);
        toast.show(t('group.leave.left', { name }), 'success');
      } else {
        await api.deleteGroup(conversation.id);
        setConfirming(null);
        dropConversation(conversation.id);
        toast.show(t('group.delete.deleted'), 'success');
      }
    } catch {
      setConfirming({ ...confirming, busy: false });
      toast.show(action === 'leave' ? t('group.leave.failed') : t('group.delete.failed'), 'error');
    }
  }, [confirming, onGroupChanged, dropConversation, toast, t]);

  /* --- live updates ------------------------------------------------- */

  useRealtimeMessages(message => {
    // Deleted on another of this person's devices.
    if (message.type === 'conversation-removed') {
      dropConversation(message.conversationId);
      return;
    }

    // Renamed, or people came or went: the open one also needs its notices, and whether you're still in it.
    if (message.type === 'conversation-changed') {
      if (message.conversationId === activeId) reloadTimeline(message.conversationId);
      return;
    }

    if (message.type === 'message') {
      const { message: stored, clientId } = message;
      if (stored.conversationId !== activeId) return;

      // Resolved before the updater runs: React may call an updater twice, so it must stay pure.
      const placeholderId = clientId === undefined ? undefined : optimistic.get(clientId);
      if (clientId !== undefined) optimistic.delete(clientId);

      setEntries(current => {
        if (placeholderId !== undefined) {
          return current.map(entry =>
            entry.item.kind === 'message' && entry.item.id === placeholderId
              ? // The sender keeps drawing a picture from memory, not a reload.
                { item: { kind: 'message' as const, ...stored }, localPreview: entry.localPreview }
              : entry,
          );
        }
        // A refetch may have raced the socket.
        const already = current.some(entry => entry.item.kind === 'message' && entry.item.id === stored.id);
        return already ? current : [...current, { item: { kind: 'message' as const, ...stored } }];
      });

      if (stored.senderId !== me.id) {
        void api
          .markRead(stored.conversationId, stored.id)
          .then(refreshConversations)
          .catch(() => undefined);
      }
      return;
    }

    // The server refused a message this page sent: take back its bubble.
    if (message.type === 'error' && message.clientId !== undefined) {
      const placeholderId = optimistic.get(message.clientId);
      if (placeholderId === undefined) return;
      optimistic.delete(message.clientId);
      setEntries(current => current.filter(entry => !(entry.item.kind === 'message' && entry.item.id === placeholderId)));
      toast.show(
        message.code === 'bad_attachment' ? t('errors.fileNotSent') : message.code === 'unknown_conversation' ? t('group.notMember') : t('errors.refused'),
        'error',
      );
      // Most likely taken out of a group a moment ago: show it read-only.
      if (message.code === 'unknown_conversation') void refreshConversations();
      return;
    }

    if (message.type === 'message-deleted') {
      if (message.conversationId !== activeId) {
        // Not the open conversation, but its preview in the list is stale.
        void refreshConversations();
        return;
      }
      setEntries(current =>
        current.map(entry =>
          entry.item.kind === 'message' && entry.item.id === message.messageId
            ? { ...entry, item: { ...entry.item, body: '', attachment: null, deletedAt: message.deletedAt } }
            : entry,
        ),
      );
      void refreshConversations();
      return;
    }

    // A finished call becomes a row in the timeline.
    if (message.type === 'call-ended' && activeId !== null) reloadTimeline(activeId);
  });

  /* --- render -------------------------------------------------------- */

  const other = selected?.other ?? null;
  const group = selected?.group ?? null;
  const title = selected ? conversationTitle(selected) : '';
  const otherStatus = other ? statusOf(other.id) : 'offline';
  const callDisabled = callState.status !== 'idle' && callState.status !== 'ended';

  const needle = query.trim().toLowerCase();
  const shown =
    needle === ''
      ? conversations
      : conversations.filter(
          conversation => conversationTitle(conversation).toLowerCase().includes(needle) || (conversation.other?.username.toLowerCase().includes(needle) ?? false),
        );

  const senderName = (message: ChatMessage): string =>
    message.senderId === me.id ? t('viewer.you') : (other?.displayName ?? findMember(group, message.senderId)?.displayName ?? t('notice.someone'));

  // On a phone there is room for one or the other: the list until somebody is picked, then the conversation.
  const reading = selectedId !== null;
  useHideTabBar(reading && !wide);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className={cn('w-full shrink-0 flex-col bg-surface lg:flex lg:w-80 lg:border-r lg:border-line lg:bg-canvas', reading ? 'hidden' : 'flex')}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2.5 pb-2 sm:px-4 lg:pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <AppSwitcher />
            <h1 className="truncate text-lg font-bold tracking-tight text-ink sm:text-xl">{t('title')}</h1>
          </div>
          <IconButton size="sm" variant="default" label={t('startChat')} onClick={() => setPicking(true)} icon={<SquarePen size={16} />} className="size-9" />
        </div>
        <div className="shrink-0 border-b border-line px-3 pb-3">
          <div className="relative">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') setQuery('');
              }}
              placeholder={t('search.placeholder')}
              aria-label={t('search.label')}
              className="h-9 w-full rounded-lg border border-line bg-raised pr-8 pl-9 text-base text-ink outline-hidden transition-colors placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/25 lg:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('search.clear')}
                className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ink-faint hover:text-ink-muted"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="themed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          <ConversationList
            conversations={shown}
            selectedId={activeId}
            onSelect={conversation => setSelectedId(conversation.id)}
            onNew={() => setPicking(true)}
            statusOf={statusOf}
            query={query}
            viewerId={me.id}
          />
        </div>
      </aside>

      <DeleteChatDialog
        name={deleting ? conversationTitle(deleting.conversation) : null}
        group={deleting?.conversation.kind === 'group'}
        deleting={deleting?.busy ?? false}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void onConfirmDelete()}
      />

      {picking ? (
        <NewChatDialog
          meId={me.id}
          statusOf={statusOf}
          onClose={() => setPicking(false)}
          onPick={user => {
            setPicking(false);
            void openWith(user.id);
          }}
          onGroupCreated={conversation => {
            setPicking(false);
            openConversation(conversation);
          }}
        />
      ) : null}

      {selected && group && showingInfo ? (
        <GroupInfoDialog
          conversationId={selected.id}
          group={group}
          viewerId={me.id}
          statusOf={statusOf}
          onClose={() => setShowingInfo(false)}
          onChanged={onGroupChanged}
          onLeave={() => {
            setShowingInfo(false);
            setConfirming({ action: 'leave', conversation: selected, busy: false });
          }}
          onDeleteGroup={() => {
            setShowingInfo(false);
            setConfirming({ action: 'delete', conversation: selected, busy: false });
          }}
          onDeleteChat={() => {
            setShowingInfo(false);
            setDeleting({ conversation: selected, busy: false });
          }}
        />
      ) : null}

      <GroupConfirmDialog
        action={confirming?.action ?? null}
        name={confirming ? conversationTitle(confirming.conversation) : ''}
        busy={confirming?.busy ?? false}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void onConfirmGroupAction()}
      />

      {selected ? (
        <section
          className={cn('relative min-w-0 flex-1 flex-col lg:flex', reading ? 'flex' : 'hidden')}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {group ? (
            <GroupHeader conversationId={selected.id} group={group} viewerId={me.id} onAction={action => onGroupAction(selected, action)} onBack={() => setSelectedId(null)} />
          ) : other ? (
            <ChatHeader
              other={{ ...other, status: otherStatus }}
              status={otherStatus}
              callDisabled={callDisabled}
              onCall={media => startCall({ id: other.id, username: other.username, displayName: other.displayName, avatar: other.avatar }, media)}
              onClear={onClearConversation}
              onDelete={() => setDeleting({ conversation: selected, busy: false })}
              onBack={() => setSelectedId(null)}
            />
          ) : null}
          <MessageTimeline
            entries={entries}
            viewerId={me.id}
            hasMore={nextBefore !== null}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
            loading={loading}
            onDeleteMessage={onDeleteMessage}
            onDeleteCall={onDeleteCall}
            uploads={pendingUploads.filter(upload => upload.conversationId === selected.id)}
            onCancelUpload={cancelUpload}
            onRetryUpload={retryUpload}
            onOpenAttachment={(attachment, message) => setViewing({ attachment, message })}
            group={group}
          />
          {readOnly ? (
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-line bg-surface px-4 py-3.5">
              <p className="text-sm text-ink-muted">{t('group.readOnly')}</p>
              <Button variant="ghost" size="sm" onClick={() => setDeleting({ conversation: selected, busy: false })} className="text-danger hover:bg-danger-soft">
                {t('group.header.deleteChat')}
              </Button>
            </div>
          ) : (
            <Composer onSend={onSend} onFiles={onFiles} placeholder={t('composer.placeholderTo', { name: title })} />
          )}
          {dropping ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-surface/90"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent dark:bg-card">
                <Paperclip size={24} />
              </span>
              <p className="text-lg font-semibold text-ink">{t('attach.dropHere', { name: title })}</p>
            </div>
          ) : null}
          {viewing ? (
            <AttachmentViewer attachment={viewing.attachment} detail={`${senderName(viewing.message)} · ${format.callTime(viewing.message.createdAt)}`} onClose={closeViewer} />
          ) : null}
        </section>
      ) : (
        <section className="hidden flex-1 pt-14 lg:block">
          <EmptyState className="py-20" icon={<MessageCircle size={24} />} title={t('noConversationOpen')} />
        </section>
      )}
    </div>
  );
}
