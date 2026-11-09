import { describe, expect, it } from 'vitest';

import en from '@/messages/en/talk.json';

import type { SessionDescription } from './protocol';

import {
  callMachine,
  endReasonKey,
  initialCallState,
  isCallActive,
  isVideoCall,
  resolveGlare,
  showsLocalVideo,
  showsRemoteVideo,
  statusKey,
  toneFor,
  type CallState,
  type EndReason,
} from './call-machine';

const OFFER: SessionDescription = { type: 'offer', sdp: 'v=0' };
const PEER = { id: 7, username: 'grace', displayName: 'Grace', avatar: null };

const run = (events: Parameters<typeof callMachine>[1][], from = initialCallState): CallState =>
  events.reduce(callMachine, from);

describe('placing a call', () => {
  it('goes idle -> calling -> in-call -> ended -> idle', () => {
    let state = callMachine(initialCallState, { type: 'place', peer: PEER, media: 'audio' });
    expect(state.status).toBe('calling');
    expect(state.direction).toBe('outgoing');
    expect(toneFor(state)).toBe('ringback');

    state = callMachine(state, { type: 'ringing', callId: 42, conversationId: 3 });
    expect(state.callId).toBe(42);
    expect(state.conversationId).toBe(3);

    state = callMachine(state, { type: 'accepted' });
    expect(state.status).toBe('in-call');
    // Not yet connected, and the label says as much whatever the exact value.
    expect(state.connection).not.toBe('connected');
    expect(statusKey(state)).toBe('connecting');
    expect(state.answeredAt).not.toBeNull();
    // The ringback stops the moment the call is answered.
    expect(toneFor(state)).toBeNull();

    state = callMachine(state, { type: 'connection', value: 'connected' });
    expect(statusKey(state)).toBe('connected');

    state = callMachine(state, { type: 'ended', callId: 42, outcome: 'answered', duration: 61 });
    expect(state.status).toBe('ended');
    expect(state.endedDuration).toBe(61);
    expect(statusKey(state)).toBe('ended');

    expect(callMachine(state, { type: 'reset' })).toEqual(initialCallState);
  });

  it('ignores a second Call press while one is in flight', () => {
    const calling = callMachine(initialCallState, { type: 'place', peer: PEER, media: 'audio' });
    const again = callMachine(calling, { type: 'place', peer: { id: 9, username: 'alan', displayName: 'Alan', avatar: null }, media: 'audio' });
    expect(again).toBe(calling);
  });

  it('shows busy, then ends, keeping the more specific reason', () => {
    const state = run([
      { type: 'place', peer: PEER, media: 'audio' },
      { type: 'ringing', callId: 42, conversationId: 3 },
      { type: 'reason', callId: 42, reason: 'busy' },
      { type: 'ended', callId: 42, outcome: 'busy', duration: 0 },
    ]);
    expect(state.status).toBe('ended');
    expect(statusKey(state)).toBe('busy');
  });

  it.each([
    ['unavailable', 'unavailable'],
    ['no-answer', 'noAnswer'],
  ] as const)('reports %s to the caller', (reason, key) => {
    const state = run([
      { type: 'place', peer: PEER, media: 'audio' },
      { type: 'ringing', callId: 1, conversationId: 1 },
      { type: 'reason', callId: 1, reason },
      { type: 'ended', callId: 1, outcome: 'no_answer', duration: 0 },
    ]);
    expect(statusKey(state)).toBe(key);
  });
});

describe('receiving a call', () => {
  it('goes idle -> ringing -> in-call', () => {
    let state = callMachine(initialCallState, {
      type: 'incoming',
      callId: 5,
      conversationId: 2,
      peer: PEER,
      media: 'audio',
      sdp: OFFER,
    });
    expect(state.status).toBe('ringing');
    expect(state.direction).toBe('incoming');
    expect(state.pendingOffer).toEqual(OFFER);
    expect(toneFor(state)).toBe('ringtone');

    state = callMachine(state, { type: 'accept' });
    expect(state.status).toBe('in-call');
    expect(toneFor(state)).toBeNull();
  });

  it('reports a decline as ended', () => {
    const state = run([
      { type: 'incoming', callId: 5, conversationId: 2, peer: PEER, media: 'audio', sdp: OFFER },
      { type: 'ended', callId: 5, outcome: 'declined', duration: 0 },
    ]);
    expect(statusKey(state)).toBe('declined');
    expect(state.pendingOffer).toBeNull();
  });
});

describe('events that do not apply', () => {
  it('ignores an end for a different call', () => {
    const calling = run([
      { type: 'place', peer: PEER, media: 'audio' },
      { type: 'ringing', callId: 42, conversationId: 1 },
    ]);
    expect(callMachine(calling, { type: 'ended', callId: 99, outcome: 'answered', duration: 5 })).toBe(
      calling,
    );
  });

  it('ignores everything while idle', () => {
    for (const event of [
      { type: 'accept' },
      { type: 'accepted' },
      { type: 'connection', value: 'connected' },
      { type: 'ended', callId: 1, outcome: 'answered', duration: 1 },
      { type: 'toggle-mute' },
      { type: 'toggle-minimized' },
    ] as const) {
      expect(callMachine(initialCallState, event)).toBe(initialCallState);
    }
  });

  it('only mutes and minimises during a live call', () => {
    const ringing = callMachine(initialCallState, {
      type: 'incoming',
      callId: 5,
      conversationId: 2,
      peer: PEER,
      media: 'audio',
      sdp: OFFER,
    });
    expect(callMachine(ringing, { type: 'toggle-mute' })).toBe(ringing);

    const live = callMachine(ringing, { type: 'accept' });
    expect(callMachine(live, { type: 'toggle-mute' }).muted).toBe(true);
    expect(callMachine(live, { type: 'toggle-minimized' }).minimized).toBe(true);
  });

  it('un-minimises when the call ends, so "Call ended" is not hidden', () => {
    const minimized = run([
      { type: 'incoming', callId: 5, conversationId: 2, peer: PEER, media: 'audio', sdp: OFFER },
      { type: 'accept' },
      { type: 'toggle-minimized' },
    ]);
    expect(minimized.minimized).toBe(true);

    const ended = callMachine(minimized, {
      type: 'ended',
      callId: 5,
      outcome: 'answered',
      duration: 3,
    });
    expect(ended.minimized).toBe(false);
  });

  it('treats a local failure as a terminal state', () => {
    const state = run([{ type: 'place', peer: PEER, media: 'audio' }, { type: 'fail' }]);
    expect(state.status).toBe('ended');
    expect(statusKey(state)).toBe('failed');
    expect(isCallActive(state)).toBe(true);
    expect(isCallActive(callMachine(state, { type: 'reset' }))).toBe(false);
  });
});

describe('glare', () => {
  const calling = run([
    { type: 'place', peer: PEER, media: 'audio' },
    { type: 'ringing', callId: 42, conversationId: 1 },
  ]);

  it('lets the lower id keep its own call', () => {
    // Me = 3, them = 7. I am lower, so I hold and ignore their ring.
    expect(resolveGlare(calling, PEER.id, 3)).toBe('ignore-incoming');
  });

  it('makes the higher id give way', () => {
    // Me = 9, them = 7. I am higher, so I cancel mine and answer theirs.
    expect(resolveGlare(calling, PEER.id, 9)).toBe('yield-to-incoming');
  });

  it('agrees with itself from both sides', () => {
    // Whatever the pair, exactly one side yields — but only once both offers
    // have a call id, since an unacknowledged one always gives way.
    const pairs: Array<[number, number]> = [
      [1, 2],
      [2, 1],
      [10, 3],
      [3, 10],
    ];
    for (const [a, b] of pairs) {
      const mine = run([
        { type: 'place', peer: { id: b, username: 'peer', displayName: 'peer', avatar: null }, media: 'audio' },
        { type: 'ringing', callId: 1, conversationId: 1 },
      ]);
      const theirs = run([
        { type: 'place', peer: { id: a, username: 'peer', displayName: 'peer', avatar: null }, media: 'audio' },
        { type: 'ringing', callId: 2, conversationId: 1 },
      ]);
      const decisions = [resolveGlare(mine, b, a), resolveGlare(theirs, a, b)];
      expect(decisions.filter((d) => d === 'yield-to-incoming')).toHaveLength(1);
      expect(decisions.filter((d) => d === 'ignore-incoming')).toHaveLength(1);
    }
  });

  it('takes a call when nothing is happening', () => {
    expect(resolveGlare(initialCallState, 7, 3)).toBe('accept-incoming');
  });

  it('gives way when our own offer was never acknowledged', () => {
    // No call id means the server refused our offer, because this peer's offer
    // arrived first. Holding out on a call that does not exist would leave
    // both sides ringing at nothing.
    const unplaced = run([{ type: 'place', peer: PEER, media: 'audio' }]);
    expect(unplaced.callId).toBeNull();
    // Lower id, which would normally hold — but there is nothing to hold.
    expect(resolveGlare(unplaced, PEER.id, 3)).toBe('yield-to-incoming');
    expect(resolveGlare(unplaced, PEER.id, 99)).toBe('yield-to-incoming');
  });

  it('rejects a third party while busy with someone else', () => {
    expect(resolveGlare(calling, 99, 3)).toBe('reject-incoming');

    const live = run([
      { type: 'incoming', callId: 5, conversationId: 2, peer: PEER, media: 'audio', sdp: OFFER },
      { type: 'accept' },
    ]);
    expect(resolveGlare(live, 99, 3)).toBe('reject-incoming');
    // Even the same peer calling again mid-call is not glare.
    expect(resolveGlare(live, PEER.id, 3)).toBe('reject-incoming');
  });
});


describe('video calls', () => {
  const place = { type: 'place', peer: PEER, media: 'video' } as const;

  it('carries the media from the moment the call is placed', () => {
    const state = callMachine(initialCallState, place);
    expect(state.media).toBe('video');
    expect(isVideoCall(state)).toBe(true);
    // An audio call never becomes a video one; nothing renegotiates.
    expect(isVideoCall(callMachine(initialCallState, { type: 'place', peer: PEER, media: 'audio' })))
      .toBe(false);
  });

  it('tells the callee what they are answering', () => {
    const ringing = callMachine(initialCallState, {
      type: 'incoming',
      callId: 5,
      conversationId: 2,
      peer: PEER,
      media: 'video',
      sdp: OFFER,
    });
    expect(statusKey(ringing)).toBe('incomingVideoCall');
    expect(ringing.media).toBe('video');
  });

  it('shows our own preview only once connected, with a working camera', () => {
    const calling = run([place]);
    // Nothing is on screen before the call connects.
    expect(showsLocalVideo(calling)).toBe(false);

    const live = run([place, { type: 'ringing', callId: 1, conversationId: 1 }, { type: 'accepted' }]);
    expect(showsLocalVideo(live)).toBe(true);

    expect(showsLocalVideo(callMachine(live, { type: 'toggle-camera' }))).toBe(false);
    expect(showsLocalVideo(callMachine(live, { type: 'camera-unavailable' }))).toBe(false);
  });

  it('falls back to the avatar until the peer actually sends frames', () => {
    const live = run([place, { type: 'ringing', callId: 1, conversationId: 1 }, { type: 'accepted' }]);
    expect(showsRemoteVideo(live)).toBe(false);

    const withVideo = callMachine(live, { type: 'remote-video', on: true });
    expect(showsRemoteVideo(withVideo)).toBe(true);

    // The peer covering their camera puts the avatar back.
    expect(showsRemoteVideo(callMachine(withVideo, { type: 'remote-video', on: false }))).toBe(
      false,
    );
  });

  it("never shows the peer's video on an audio call", () => {
    const live = run([
      { type: 'place', peer: PEER, media: 'audio' },
      { type: 'ringing', callId: 1, conversationId: 1 },
      { type: 'accepted' },
      { type: 'remote-video', on: true },
    ]);
    expect(showsRemoteVideo(live)).toBe(false);
  });

  it('offers no camera toggle on an audio call', () => {
    const live = run([
      { type: 'place', peer: PEER, media: 'audio' },
      { type: 'ringing', callId: 1, conversationId: 1 },
      { type: 'accepted' },
    ]);
    expect(callMachine(live, { type: 'toggle-camera' })).toBe(live);
  });

  it('keeps the camera off once we know there is none', () => {
    const live = run([place, { type: 'ringing', callId: 1, conversationId: 1 }, { type: 'accepted' }]);
    const noCamera = callMachine(live, { type: 'camera-unavailable' });
    expect(noCamera.cameraAvailable).toBe(false);
    expect(noCamera.cameraOff).toBe(true);
    // Pressing the button cannot turn on a camera that is not there.
    expect(callMachine(noCamera, { type: 'toggle-camera' })).toBe(noCamera);
  });

  it('resets the media when the call is cleared', () => {
    const ended = run([
      place,
      { type: 'ringing', callId: 1, conversationId: 1 },
      { type: 'accepted' },
      { type: 'ended', callId: 1, outcome: 'answered', duration: 5 },
    ]);
    expect(callMachine(ended, { type: 'reset' }).media).toBe('audio');
  });
});

describe('the peer connection racing the answer', () => {
  /**
   * ICE can finish before the server's answer gets back. On a local network it
   * usually does.
   *
   * `connectionState` reaching 'connected' fires once and never again, so a
   * machine that ignores it before the call is established never hears about
   * it — and shows "Connecting…" over a call that is already carrying audio,
   * for as long as the call lasts.
   */
  it('remembers a connection that lands before the call is answered', () => {
    let state = callMachine(initialCallState, {
      type: 'place',
      peer: { id: 2, username: 'grace', displayName: 'Grace', avatar: null },
      media: 'audio',
    });
    state = callMachine(state, { type: 'ringing', callId: 7, conversationId: 1 });

    // The peer connection gets there first.
    state = callMachine(state, { type: 'connection', value: 'connected' });
    state = callMachine(state, { type: 'accepted' });

    expect(state.status).toBe('in-call');
    expect(state.connection).toBe('connected');
    expect(statusKey(state)).toBe('connected');
  });

  it('remembers it on the answering side too', () => {
    let state = callMachine(initialCallState, {
      type: 'incoming',
      callId: 9,
      conversationId: 1,
      peer: { id: 3, username: 'ada', displayName: 'Ada', avatar: null },
      media: 'audio',
      sdp: { type: 'offer', sdp: 'x' },
    });

    state = callMachine(state, { type: 'connection', value: 'connected' });
    state = callMachine(state, { type: 'accept' });

    expect(state.status).toBe('in-call');
    expect(statusKey(state)).toBe('connected');
  });

  it('still ignores one with no call in progress', () => {
    const state = callMachine(initialCallState, { type: 'connection', value: 'connected' });
    expect(state).toEqual(initialCallState);
  });
});

describe('status keys', () => {
  it('name a message for every reason a call can end', () => {
    const reasons: Array<EndReason | null> = [
      'busy', 'unavailable', 'no-answer', 'declined', 'cancelled', 'completed', 'failed', null,
    ];
    for (const reason of reasons) expect(en.calls.status).toHaveProperty(endReasonKey(reason));
  });
});
