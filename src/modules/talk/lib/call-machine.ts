/**
 * The client call state machine.
 *
 * A call touches a modal, a floating pill, three tones, a peer connection, a
 * timer and a mute button. Spreading that across booleans is how you end up
 * with a ringtone that will not stop. It lives here instead: one status, one
 * reducer, no React, no WebRTC — which also makes it directly testable.
 */
import type { CallMedia, CallOutcome, SessionDescription, TalkPerson } from './protocol';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'in-call' | 'ended';

/** Mirrors the useful subset of RTCPeerConnection's connectionState. */
export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'failed';

export type CallDirection = 'incoming' | 'outgoing';

/** Why the call finished, in the words the modal shows for two seconds. */
export type EndReason =
  | 'busy'
  | 'unavailable'
  | 'no-answer'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'failed';

/** Who the call is with, as the call screen shows them. */
export type CallPeer = TalkPerson;

export interface CallState {
  status: CallStatus;
  callId: number | null;
  conversationId: number | null;
  peer: CallPeer | null;
  direction: CallDirection | null;
  /** Audio, or audio and video. Fixed when the call is placed. */
  media: CallMedia;
  /** The caller's offer, held until the callee presses Accept. */
  pendingOffer: SessionDescription | null;
  connection: PeerConnectionState;
  /** Wall-clock ms when the call connected, for the running timer. */
  answeredAt: number | null;
  muted: boolean;
  /** The user turned their own camera off. Video calls only. */
  cameraOff: boolean;
  /** False when getUserMedia could not give us a camera at all. */
  cameraAvailable: boolean;
  /** True while the peer is actually sending video we can show. */
  remoteVideo: boolean;
  minimized: boolean;
  endReason: EndReason | null;
  endedDuration: number;
}

export const initialCallState: CallState = {
  status: 'idle',
  callId: null,
  conversationId: null,
  peer: null,
  direction: null,
  media: 'audio',
  pendingOffer: null,
  connection: 'new',
  answeredAt: null,
  muted: false,
  cameraOff: false,
  cameraAvailable: true,
  remoteVideo: false,
  minimized: false,
  endReason: null,
  endedDuration: 0,
};

export type CallEvent =
  /** The user pressed Call. The id arrives later, with `ringing`. */
  | { type: 'place'; peer: CallPeer; media: CallMedia }
  /** The server acknowledged the offer and is ringing the callee. */
  | { type: 'ringing'; callId: number; conversationId: number }
  /** An incoming call arrived. */
  | {
      type: 'incoming';
      callId: number;
      conversationId: number;
      peer: CallPeer;
      media: CallMedia;
      sdp: SessionDescription;
    }
  /** The callee pressed Accept. */
  | { type: 'accept' }
  /** The caller's peer answered. */
  | { type: 'accepted' }
  | { type: 'connection'; value: PeerConnectionState }
  /** Terminal: the server said the call is over. */
  | { type: 'ended'; callId: number; outcome: CallOutcome; duration: number }
  /** A reason arriving just before `ended`, so the modal can name it. */
  | { type: 'reason'; callId: number | null; reason: EndReason }
  /** Local failure: getUserMedia refused, the peer connection died. */
  | { type: 'fail'; reason?: EndReason }
  | { type: 'toggle-mute' }
  | { type: 'toggle-camera' }
  /** getUserMedia gave us no camera, so this side is audio only. */
  | { type: 'camera-unavailable' }
  /** The peer's video track started or stopped carrying frames. */
  | { type: 'remote-video'; on: boolean }
  | { type: 'toggle-minimized' }
  /** Clear the modal after the two second "Call ended" pause. */
  | { type: 'reset' };

const OUTCOME_REASON: Record<CallOutcome, EndReason> = {
  answered: 'completed',
  no_answer: 'no-answer',
  declined: 'declined',
  cancelled: 'cancelled',
  busy: 'busy',
  failed: 'failed',
};

/** True while a call occupies the screen — the modal or the pill is showing. */
export function isCallActive(state: CallState): boolean {
  return state.status !== 'idle';
}

/** True when this call should be laid out as video rather than as a phone call. */
export function isVideoCall(state: CallState): boolean {
  return state.media === 'video';
}

/**
 * Whether to show the peer's video or fall back to their avatar. A video call
 * where the other side has their camera off is still a video call, but there
 * is nothing to render.
 */
export function showsRemoteVideo(state: CallState): boolean {
  return state.media === 'video' && state.status === 'in-call' && state.remoteVideo;
}

/** Whether to show our own preview. */
export function showsLocalVideo(state: CallState): boolean {
  return (
    state.media === 'video' &&
    state.status === 'in-call' &&
    state.cameraAvailable &&
    !state.cameraOff
  );
}

/** Which tone, if any, belongs to this state. */
export function toneFor(state: CallState): 'ringback' | 'ringtone' | null {
  if (state.status === 'calling') return 'ringback';
  if (state.status === 'ringing') return 'ringtone';
  return null;
}

export function callMachine(state: CallState, event: CallEvent): CallState {
  switch (event.type) {
    case 'place':
      // Only from rest: the UI hides the Call button during a call.
      if (state.status !== 'idle' && state.status !== 'ended') return state;
      return {
        ...initialCallState,
        status: 'calling',
        peer: event.peer,
        direction: 'outgoing',
        media: event.media,
      };

    case 'ringing':
      if (state.status !== 'calling') return state;
      return { ...state, callId: event.callId, conversationId: event.conversationId };

    case 'incoming':
      // Glare is resolved before this event is dispatched; see `resolveGlare`.
      if (state.status !== 'idle' && state.status !== 'ended') return state;
      return {
        ...initialCallState,
        status: 'ringing',
        callId: event.callId,
        conversationId: event.conversationId,
        peer: event.peer,
        direction: 'incoming',
        media: event.media,
        pendingOffer: event.sdp,
      };

    // Neither transition resets `connection`. On a fast local network ICE can
    // finish before the server's answer gets back, and overwriting it here
    // would throw that away — leaving a call that is carrying audio while the
    // screen says "Connecting…" for as long as it lasts, because
    // `connectionState` has already reached its final value and fires again
    // for nobody.
    case 'accept':
      if (state.status !== 'ringing') return state;
      return { ...state, status: 'in-call', answeredAt: Date.now() };

    case 'accepted':
      if (state.status !== 'calling') return state;
      return { ...state, status: 'in-call', answeredAt: Date.now() };

    case 'connection':
      // Kept from the moment the peer connection is built, not only once the
      // call is established, for the same reason.
      if (state.status === 'idle') return state;
      return { ...state, connection: event.value };

    case 'reason':
      if (state.status === 'idle') return state;
      // A late reason for a call we have already moved past is not ours.
      if (event.callId !== null && state.callId !== null && event.callId !== state.callId) {
        return state;
      }
      return { ...state, endReason: event.reason };

    case 'ended': {
      if (state.status === 'idle') return state;
      if (state.callId !== null && event.callId !== state.callId) return state;
      // A reason already set (busy, unavailable) is more specific than the
      // outcome, so keep it.
      const reason = state.endReason ?? OUTCOME_REASON[event.outcome];
      return {
        ...state,
        status: 'ended',
        connection: 'new',
        endReason: reason,
        endedDuration: event.duration,
        minimized: false,
        pendingOffer: null,
      };
    }

    case 'fail':
      if (state.status === 'idle') return state;
      return {
        ...state,
        status: 'ended',
        connection: 'new',
        endReason: event.reason ?? 'failed',
        endedDuration: 0,
        minimized: false,
        pendingOffer: null,
      };

    case 'toggle-mute':
      if (state.status !== 'in-call') return state;
      return { ...state, muted: !state.muted };

    case 'toggle-camera':
      // Nothing to toggle on an audio call, or without a camera to begin with.
      if (state.status !== 'in-call' || state.media !== 'video') return state;
      if (!state.cameraAvailable) return state;
      return { ...state, cameraOff: !state.cameraOff };

    case 'camera-unavailable':
      if (state.status === 'idle') return state;
      return { ...state, cameraAvailable: false, cameraOff: true };

    case 'remote-video':
      if (state.status === 'idle') return state;
      return { ...state, remoteVideo: event.on };

    case 'toggle-minimized':
      if (state.status !== 'in-call') return state;
      return { ...state, minimized: !state.minimized };

    case 'reset':
      return initialCallState;
  }
}

/* ------------------------------------------------------------------ */
/* Glare                                                               */
/* ------------------------------------------------------------------ */

export type GlareResolution =
  /** Take the incoming call normally. */
  | 'accept-incoming'
  /** We called them and they called us: hold our call, drop theirs. */
  | 'ignore-incoming'
  /** We called them and they called us: cancel ours, take theirs. */
  | 'yield-to-incoming'
  /** We are busy with someone else. */
  | 'reject-incoming';

/**
 * Two people pressing Call at the same instant would leave both ringing and
 * neither answered. The tie is broken by user id, which both sides know and
 * agree on: the lower id keeps its own call, the higher id gives way.
 */
export function resolveGlare(
  state: CallState,
  incomingFromId: number,
  myId: number,
): GlareResolution {
  if (state.status === 'idle' || state.status === 'ended') return 'accept-incoming';

  // A call in flight with somebody else: this is plain busy, not glare.
  if (state.status !== 'calling' || state.peer?.id !== incomingFromId) {
    return 'reject-incoming';
  }

  // No call id means the server never acknowledged our offer — it refused it,
  // because this very peer's offer got there first. There is nothing to hold
  // on to, whatever the ids say, so take theirs.
  if (state.callId === null) return 'yield-to-incoming';

  return myId < incomingFromId ? 'ignore-incoming' : 'yield-to-incoming';
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * What the call screen says about the call, as a key into the `calls.status`
 * messages. The words themselves belong to the component, which knows the
 * language; this only decides which of them applies.
 */
export type StatusKey =
  | 'calling'
  | 'incomingCall'
  | 'incomingVideoCall'
  | 'connecting'
  | 'connected'
  | 'busy'
  | 'unavailable'
  | 'noAnswer'
  | 'declined'
  | 'cancelled'
  | 'failed'
  | 'ended';

export function endReasonKey(reason: EndReason | null): StatusKey {
  switch (reason) {
    case 'busy':
      return 'busy';
    case 'unavailable':
      return 'unavailable';
    case 'no-answer':
      return 'noAnswer';
    case 'declined':
      return 'declined';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    default:
      return 'ended';
  }
}

/** Null only at rest, when there is no call to describe. */
export function statusKey(state: CallState): StatusKey | null {
  switch (state.status) {
    case 'calling':
      return 'calling';
    case 'ringing':
      return state.media === 'video' ? 'incomingVideoCall' : 'incomingCall';
    case 'in-call':
      return state.connection === 'connected' ? 'connected' : 'connecting';
    case 'ended':
      return endReasonKey(state.endReason);
    default:
      return null;
  }
}
