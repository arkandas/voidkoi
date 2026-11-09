/**
 * Calls, on the server. The server decides whether a call exists, who may
 * act on it and how it ended; the browsers only carry SDP and ICE candidates
 * for each other. Every step writes the call's row, so the history is the
 * database's, not one browser's opinion of it.
 *
 * Audio and video never come through here: once both sides have each other's
 * SDP and candidates, the media goes browser to browser.
 */
import {
  isMissedOutcome,
  type CallMedia,
  type CallOutcome,
  type IceCandidate,
  type PresenceUser,
  type ServerIncomingCall,
  type SessionDescription,
} from '@/modules/talk/lib/protocol';

import { callDurationSeconds, finishCall, insertCall, markCallAnswered } from '../calls';
import { getOrCreateDirectConversation } from '../conversations';
import type { Database } from '../db';
import { findTalkUser, findUser, toDirectoryUser } from '../users';
import type { Connection, PresenceRegistry } from './presence';

type CallStatus = 'ringing' | 'connected';

interface ActiveCall {
  id: number;
  conversationId: number;
  callerId: number;
  calleeId: number;
  media: CallMedia;
  status: CallStatus;
  ringTimer: NodeJS.Timeout | null;
  /** The caller, as the callee is shown them. */
  from: PresenceUser;
  /** Kept while it rings, for a callee who connects after it started. */
  offer: SessionDescription;
  callerCandidates: IceCandidate[];
}

/** A call as a notification describes it. */
export interface RingingCall {
  id: number;
  calleeId: number;
  callerName: string;
  media: CallMedia;
}

/** Far more than a real offer gathers; a bound on a browser that misbehaves. */
const MAX_BUFFERED_CANDIDATES = 64;

export interface CallManagerHooks {
  /** Someone's in-call status changed, so presence can be sent again. */
  onPresenceChanged(): void;
  log(message: string): void;
  /** Whether someone without Talk open can still be reached: a notification can wake them. */
  canWake(userId: number): Promise<boolean>;
  /** A call started ringing. Tells the callee's phone if they aren't looking. */
  ringing(call: RingingCall): void;
  /** A call ended without the callee picking up. */
  missed(call: RingingCall): void;
}

export class CallManager {
  private readonly active = new Map<number, ActiveCall>();
  /** userId -> callId, so a disconnect finds its call at once. */
  private readonly byUser = new Map<number, number>();

  constructor(
    private readonly db: Database,
    private readonly presence: PresenceRegistry,
    private readonly ringTimeoutMs: number,
    private readonly hooks: CallManagerHooks,
  ) {}

  /** The call someone is in now, if any. */
  activeCallFor(userId: number): ActiveCall | null {
    const callId = this.byUser.get(userId);
    return callId === undefined ? null : (this.active.get(callId) ?? null);
  }

  /* ---------------------------------------------------------------- */
  /* Placing a call                                                    */
  /* ---------------------------------------------------------------- */

  async offer(caller: Connection, to: number, sdp: SessionDescription, media: CallMedia = 'audio'): Promise<void> {
    if (to === caller.userId) {
      caller.send({ type: 'error', code: 'not_allowed', message: 'You cannot call yourself.' });
      return;
    }
    if (this.activeCallFor(caller.userId)) {
      caller.send({ type: 'error', code: 'invalid_state', message: 'You are already in a call.' });
      return;
    }

    const callee = await findTalkUser(this.db, to);
    if (!callee) {
      caller.send({ type: 'error', code: 'unknown_user', message: 'No such person.' });
      return;
    }

    const conversation = await getOrCreateDirectConversation(this.db, caller.userId, to);
    const row = await insertCall(this.db, conversation.id, caller.userId, to, media);
    const callerRow = await findUser(this.db, caller.userId);

    // Not online, and nothing can reach them: kept as a missed call, so it is
    // in their history, and the caller is told why nothing rings. Someone with
    // notifications on is not out of reach: their phone rings, and the call
    // waits for them to open Talk.
    if (!this.presence.isOnline(to) && !(await this.hooks.canWake(to))) {
      await finishCall(this.db, row.id, 'no_answer');
      caller.send({ type: 'unavailable', callId: row.id, to });
      caller.send({ type: 'call-ended', callId: row.id, outcome: 'no_answer', duration: 0 });
      return;
    }

    if (this.presence.statusOf(to) === 'in-call' || this.activeCallFor(to)) {
      await finishCall(this.db, row.id, 'busy');
      caller.send({ type: 'busy', callId: row.id, to });
      caller.send({ type: 'call-ended', callId: row.id, outcome: 'busy', duration: 0 });
      return;
    }

    const call: ActiveCall = {
      id: row.id,
      conversationId: conversation.id,
      callerId: caller.userId,
      calleeId: to,
      media,
      status: 'ringing',
      ringTimer: null,
      from: callerRow
        ? toDirectoryUser(callerRow, 'in-call')
        : { id: caller.userId, username: '', displayName: '', avatar: null, status: 'in-call' },
      offer: sdp,
      callerCandidates: [],
    };
    this.track(call);

    call.ringTimer = setTimeout(() => {
      void this.timeout(call.id).catch(error => this.hooks.log(`Talk: the ring timer of call ${call.id} failed: ${String(error)}`));
    }, this.ringTimeoutMs);
    call.ringTimer.unref();

    caller.send({ type: 'call-ringing', callId: row.id, to, conversationId: conversation.id, media });
    // Nothing reaches a callee who isn't connected; `redeliver` hands them the call when they connect.
    this.presence.sendTo(to, this.incomingCall(call));
    this.hooks.ringing(this.describe(call));
  }

  /**
   * A socket just opened. If its owner's phone is ringing (they tapped the
   * notification, or took over from another tab), show them the call, with
   * every candidate the caller has sent so far.
   */
  redeliver(connection: Connection): void {
    const call = this.activeCallFor(connection.userId);
    if (!call || call.status !== 'ringing' || call.calleeId !== connection.userId) return;

    connection.send(this.incomingCall(call));
    for (const candidate of call.callerCandidates) {
      connection.send({ type: 'ice-candidate', callId: call.id, from: call.callerId, candidate });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Answering                                                         */
  /* ---------------------------------------------------------------- */

  async accept(callee: Connection, callId: number, sdp: SessionDescription): Promise<void> {
    const call = this.active.get(callId);
    if (!call || call.calleeId !== callee.userId) {
      callee.send({ type: 'error', code: 'unknown_call', message: 'That call is no longer live.' });
      return;
    }
    if (call.status !== 'ringing') {
      callee.send({ type: 'error', code: 'invalid_state', message: 'That call has already been answered.' });
      return;
    }

    this.clearRingTimer(call);
    call.status = 'connected';
    await markCallAnswered(this.db, callId);

    this.presence.setInCall(call.callerId, true);
    this.presence.setInCall(call.calleeId, true);
    this.hooks.onPresenceChanged();

    this.presence.sendTo(call.callerId, { type: 'call-accepted', callId, from: callee.userId, sdp });
  }

  async decline(callee: Connection, callId: number): Promise<void> {
    const call = this.active.get(callId);
    if (!call || call.calleeId !== callee.userId || call.status !== 'ringing') {
      callee.send({ type: 'error', code: 'unknown_call', message: 'That call is no longer live.' });
      return;
    }
    await this.end(call, 'declined', callee.userId);
  }

  async cancel(caller: Connection, callId: number): Promise<void> {
    const call = this.active.get(callId);
    if (!call || call.callerId !== caller.userId || call.status !== 'ringing') {
      caller.send({ type: 'error', code: 'unknown_call', message: 'That call is no longer live.' });
      return;
    }
    await this.end(call, 'cancelled', caller.userId);
  }

  async hangup(conn: Connection, callId: number): Promise<void> {
    const call = this.active.get(callId);
    if (!call || !this.isParticipant(call, conn.userId)) {
      conn.send({ type: 'error', code: 'unknown_call', message: 'That call is no longer live.' });
      return;
    }
    // Hanging up before an answer is a cancel or a decline; the page doesn't offer it, but nothing depends on that.
    const outcome: CallOutcome = call.status === 'connected' ? 'answered' : conn.userId === call.callerId ? 'cancelled' : 'declined';
    await this.end(call, outcome, conn.userId);
  }

  /* ---------------------------------------------------------------- */
  /* Trickle ICE                                                       */
  /* ---------------------------------------------------------------- */

  relayCandidate(conn: Connection, callId: number, candidate: IceCandidate): void {
    const call = this.active.get(callId);
    // Candidates often arrive a beat after a call ends; dropping them is right.
    if (!call || !this.isParticipant(call, conn.userId)) return;

    const peerId = conn.userId === call.callerId ? call.calleeId : call.callerId;
    if (conn.userId === call.callerId && call.status === 'ringing' && call.callerCandidates.length < MAX_BUFFERED_CANDIDATES) {
      call.callerCandidates.push(candidate);
    }
    this.presence.sendTo(peerId, { type: 'ice-candidate', callId, from: conn.userId, candidate });
  }

  /** "My camera is on / off", to the other side. */
  relayCameraState(conn: Connection, callId: number, on: boolean): void {
    const call = this.active.get(callId);
    if (!call || !this.isParticipant(call, conn.userId)) return;

    const peerId = conn.userId === call.callerId ? call.calleeId : call.callerId;
    this.presence.sendTo(peerId, { type: 'camera-state', callId, from: conn.userId, on });
  }

  /* ---------------------------------------------------------------- */
  /* Endings nobody asked for                                          */
  /* ---------------------------------------------------------------- */

  private async timeout(callId: number): Promise<void> {
    const call = this.active.get(callId);
    if (!call || call.status !== 'ringing') return;

    this.clearRingTimer(call);
    const row = await finishCall(this.db, call.id, 'no_answer');
    this.untrack(call);

    // `no-answer` names the reason; `call-ended` is what every page moves on.
    for (const userId of [call.callerId, call.calleeId]) {
      this.presence.sendTo(userId, { type: 'no-answer', callId: call.id });
      this.presence.sendTo(userId, { type: 'call-ended', callId: call.id, outcome: row?.outcome ?? 'no_answer', duration: 0 });
    }
    this.releaseInCall(call);
    this.hooks.missed(this.describe(call));
  }

  /** A socket closed. A call its owner was in ends as if they had hung up: their sound is gone either way. */
  async handleDisconnect(userId: number): Promise<void> {
    const call = this.activeCallFor(userId);
    if (!call) return;

    // A callee who can still pick up keeps ringing: another tab took over, or
    // a phone put the page to sleep and the notification will bring it back.
    if (call.status === 'ringing' && userId === call.calleeId && (this.presence.isOnline(userId) || (await this.hooks.canWake(userId)))) {
      return;
    }

    const outcome: CallOutcome = call.status === 'connected' ? 'answered' : userId === call.callerId ? 'cancelled' : 'no_answer';
    await this.end(call, outcome, userId);
  }

  /** Stop every ring timer, as the process stops. */
  shutdown(): void {
    for (const call of this.active.values()) this.clearRingTimer(call);
    this.active.clear();
    this.byUser.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private async end(call: ActiveCall, outcome: CallOutcome, by: number): Promise<void> {
    this.clearRingTimer(call);
    this.untrack(call);

    // Written only while it has no outcome, so whichever of a hangup and a timeout lands first counts.
    const row = await finishCall(this.db, call.id, outcome);
    const duration = row ? callDurationSeconds(row.answered_at, row.ended_at) : 0;
    const finalOutcome = row?.outcome ?? outcome;

    for (const userId of [call.callerId, call.calleeId]) {
      this.presence.sendTo(userId, { type: 'call-ended', callId: call.id, outcome: finalOutcome, duration, from: by });
    }
    this.releaseInCall(call);
    if (call.status === 'ringing' && isMissedOutcome(finalOutcome)) this.hooks.missed(this.describe(call));
  }

  private incomingCall(call: ActiveCall): ServerIncomingCall {
    return { type: 'incoming-call', callId: call.id, from: call.from, conversationId: call.conversationId, media: call.media, sdp: call.offer };
  }

  private describe(call: ActiveCall): RingingCall {
    return { id: call.id, calleeId: call.calleeId, callerName: call.from.displayName, media: call.media };
  }

  private releaseInCall(call: ActiveCall): void {
    const wasInCall = this.presence.statusOf(call.callerId) === 'in-call' || this.presence.statusOf(call.calleeId) === 'in-call';
    this.presence.setInCall(call.callerId, false);
    this.presence.setInCall(call.calleeId, false);
    if (wasInCall) this.hooks.onPresenceChanged();
  }

  private isParticipant(call: ActiveCall, userId: number): boolean {
    return call.callerId === userId || call.calleeId === userId;
  }

  private track(call: ActiveCall): void {
    this.active.set(call.id, call);
    this.byUser.set(call.callerId, call.id);
    this.byUser.set(call.calleeId, call.id);
  }

  private untrack(call: ActiveCall): void {
    this.active.delete(call.id);
    if (this.byUser.get(call.callerId) === call.id) this.byUser.delete(call.callerId);
    if (this.byUser.get(call.calleeId) === call.id) this.byUser.delete(call.calleeId);
  }

  private clearRingTimer(call: ActiveCall): void {
    if (call.ringTimer) {
      clearTimeout(call.ringTimer);
      call.ringTimer = null;
    }
  }
}
