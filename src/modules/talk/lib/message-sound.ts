/**
 * The sound a new message makes while Talk is open.
 *
 * With Talk closed or in the background, a notification carries the system's
 * own sound, and nothing here plays over it. With Talk open, nothing does
 * unless this does — except when the message is already in front of you: the
 * conversation it arrived in is open in the window you are using.
 */
import { serviceWorkerRegistration } from './service-worker';
import { messageStyle, playMessageTone, playSentTone } from './tones';

/** The conversation on screen, as the chats page says; null for none. */
let openConversationId: number | null = null;

export function setOpenConversation(conversationId: number | null): void {
  openConversationId = conversationId;
}

export interface ChimeContext {
  conversationId: number;
  openConversationId: number | null;
  /** The page is showing, not a background tab or a minimised window. */
  visible: boolean;
  /** This window has the keyboard: the one you are using. */
  focused: boolean;
  /** This device gets push notifications, which make their own sound. */
  pushedHere: boolean;
}

export function shouldChime(context: ChimeContext): boolean {
  if (!context.visible) return !context.pushedHere;
  return !(context.focused && context.openConversationId === context.conversationId);
}

async function pushedHere(): Promise<boolean> {
  try {
    const registration = await serviceWorkerRegistration();
    return (await registration?.pushManager?.getSubscription()) != null;
  } catch {
    return false;
  }
}

/** The sound of your own message going out. */
export function chimeSent(): void {
  playSentTone();
}

/** Play the sound for a message that just arrived, if it should be heard. */
export async function chimeFor(conversationId: number): Promise<void> {
  if (messageStyle() === 'off') return;
  const visible = document.visibilityState === 'visible';
  const context: ChimeContext = {
    conversationId,
    openConversationId,
    visible,
    focused: document.hasFocus(),
    pushedHere: visible ? false : await pushedHere(),
  };
  if (shouldChime(context)) playMessageTone();
}
