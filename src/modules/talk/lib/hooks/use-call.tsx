'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { api } from '../api';
import { callMachine, initialCallState, resolveGlare, toneFor, type CallPeer, type CallState } from '../call-machine';
import { deviceConstraint, isMissingDeviceError, type DeviceKind } from '../media-devices';
import { refreshDevices } from '../media-devices-store';
import type { CallMedia, IceCandidate, IceServer, SessionDescription } from '../protocol';
import { installAudioUnlock, playEndTone, startTone, stopTone } from '../tones';
import { useMediaDevices } from './use-media-devices';
import { useRealtime, useRealtimeMessages } from './use-realtime';
import { useTalkMe } from './use-talk-me';

/** How long "Call ended" stays on screen before the modal closes. */
const ENDED_LINGER_MS = 2000;

/**
 * 720p30 asked for, 1080p accepted. Anything more is bandwidth nobody sees on
 * a call window this size.
 */
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Cap the outgoing video. Without this the encoder will happily fill a home
 * uplink and take the audio down with it — and audio is the part you cannot
 * afford to lose on a call.
 */
const MAX_VIDEO_BITRATE = 1_200_000;

interface CallContextValue {
  state: CallState;
  startCall(peer: CallPeer, media?: CallMedia): void;
  accept(): void;
  decline(): void;
  /** Cancel an outgoing call that is still ringing. */
  cancel(): void;
  hangup(): void;
  toggleMute(): void;
  toggleCamera(): void;
  /**
   * True while a device swap is in flight, so a menu can show which entry is
   * being switched to rather than appearing to do nothing.
   */
  switchingDevice: DeviceKind | null;
  toggleMinimized(): void;
  /** The element the remote audio plays through; mounted by the provider. */
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
  /**
   * The peer's stream, for any surface that wants to show the video. The
   * provider keeps playing the *audio* through its own element, so moving
   * between the modal and the minimised pill never interrupts the sound.
   */
  remoteStream: MediaStream | null;
  /** Our own camera, for the local preview. */
  localStream: MediaStream | null;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(callMachine, initialCallState);
  const { send } = useRealtime();
  const me = useTalkMe();
  const { selected } = useMediaDevices();
  const myId = me.id;

  const [switchingDevice, setSwitchingDevice] = useState<DeviceKind | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Held in state, not a ref: the video surfaces re-render when they arrive.
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  /** Remote candidates that arrived before the remote description was set. */
  const queuedRemoteRef = useRef<IceCandidate[]>([]);
  /** Our own candidates, gathered before the server told us the call id. */
  const queuedLocalRef = useRef<IceCandidate[]>([]);
  const callIdRef = useRef<number | null>(null);
  const iceServersRef = useRef<IceServer[] | null>(null);

  /* ---------------------------------------------------------------- */
  /* Media and peer connection                                         */
  /* ---------------------------------------------------------------- */

  const teardown = useCallback(() => {
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        // Already closed.
      }
    }

    const stream = localStreamRef.current;
    localStreamRef.current = null;
    // Releases the microphone and camera, and with them the browser's
    // recording indicators.
    for (const track of stream?.getTracks() ?? []) track.stop();
    setLocalStream(null);
    setRemoteStream(null);

    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    queuedRemoteRef.current = [];
    queuedLocalRef.current = [];
    callIdRef.current = null;
  }, []);

  const loadIceServers = useCallback(async (): Promise<IceServer[]> => {
    if (iceServersRef.current) return iceServersRef.current;
    try {
      const { iceServers } = await api.config();
      iceServersRef.current = iceServers;
      return iceServers;
    } catch {
      // No STUN still works on a LAN, where host candidates reach each other.
      iceServersRef.current = [];
      return [];
    }
  }, []);

  const flushLocalCandidates = useCallback(
    (callId: number) => {
      for (const candidate of queuedLocalRef.current.splice(0)) {
        send({ type: 'ice-candidate', callId, candidate });
      }
    },
    [send],
  );

  /** Tell the peer whether our camera is on. They cannot work it out. */
  const announceCamera = useCallback(
    (callId: number, on: boolean) => {
      send({ type: 'camera-state', callId, on });
    },
    [send],
  );

  const createPeerConnection = useCallback(async (): Promise<RTCPeerConnection> => {
    const iceServers = await loadIceServers();
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event): void => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON() as IceCandidate;
      // Trickle starts as soon as the local description is set, which can be
      // before the server has told us the call id.
      if (callIdRef.current === null) queuedLocalRef.current.push(candidate);
      else send({ type: 'ice-candidate', callId: callIdRef.current, candidate });
    };

    pc.ontrack = (event): void => {
      const [stream] = event.streams;
      if (!stream) return;

      // The <audio> element plays the sound whatever else the stream carries,
      // so audio never stops when a video surface mounts or unmounts.
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        void remoteAudioRef.current.play().catch(() => undefined);
      }
      setRemoteStream(stream);

      if (event.track.kind === 'video') {
        // Whether the peer's camera is *on* arrives as an explicit
        // `camera-state` message: a disabled video track still transmits black
        // frames, so nothing here can tell the difference. This only covers
        // the track going away entirely.
        event.track.onended = (): void => dispatch({ type: 'remote-video', on: false });
      }
    };

    pc.onconnectionstatechange = (): void => {
      const value = pc.connectionState;
      if (value === 'connected') dispatch({ type: 'connection', value: 'connected' });
      else if (value === 'connecting' || value === 'new')
        dispatch({ type: 'connection', value: 'connecting' });
      else if (value === 'failed') dispatch({ type: 'connection', value: 'failed' });
    };

    pcRef.current = pc;
    return pc;
  }, [loadIceServers, send]);

  /**
   * The chosen devices, readable from a callback that must not be rebuilt
   * every time somebody plugs in a headset.
   */
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  /** What the live tracks were actually opened with, which can differ. */
  const appliedRef = useRef<{ audioinput: string | null; videoinput: string | null }>({
    audioinput: null,
    videoinput: null,
  });

  /**
   * Open the microphone, and the camera too for a video call.
   *
   * A missing or refused camera must not sink the call: we fall back to audio
   * only and tell the machine, so the UI can say so and hide the camera button.
   */
  const capture = useCallback(async (media: CallMedia): Promise<MediaStream> => {
    const chosen = selectedRef.current;
    appliedRef.current = { audioinput: chosen.audioinput, videoinput: chosen.videoinput };

    // `pinned` is tried first. A device chosen weeks ago may not be plugged in
    // today, and `exact` throws rather than silently substituting another one,
    // so the retry without it is what keeps the call alive.
    const audioFor = (pinned: boolean): MediaTrackConstraints => ({
      ...AUDIO_CONSTRAINTS,
      ...(pinned ? deviceConstraint(chosen.audioinput) : {}),
    });
    const videoFor = (pinned: boolean): MediaTrackConstraints => ({
      ...VIDEO_CONSTRAINTS,
      ...(pinned ? deviceConstraint(chosen.videoinput) : {}),
    });

    const keep = (stream: MediaStream): MediaStream => {
      localStreamRef.current = stream;
      setLocalStream(stream);
      // Access was just granted, which is what makes the browser say what each
      // device is called: the in-call menus show real names from here on.
      void refreshDevices();
      return stream;
    };

    if (media === 'video') {
      try {
        return keep(
          await navigator.mediaDevices.getUserMedia({
            audio: audioFor(true),
            video: videoFor(true),
          }),
        );
      } catch (error) {
        if (isMissingDeviceError(error)) {
          try {
            return keep(
              await navigator.mediaDevices.getUserMedia({
                audio: audioFor(false),
                video: videoFor(false),
              }),
            );
          } catch {
            // Still no camera. Fall through to audio only.
          }
        }
        // No camera, or permission refused for it specifically. Carry on with
        // sound; the other side can still send video.
        dispatch({ type: 'camera-unavailable' });
        appliedRef.current.videoinput = null;
      }
    }

    try {
      return keep(
        await navigator.mediaDevices.getUserMedia({ audio: audioFor(true), video: false }),
      );
    } catch (error) {
      if (!isMissingDeviceError(error)) throw error;
      // The chosen microphone is gone. Any microphone beats no call.
      appliedRef.current.audioinput = null;
      return keep(
        await navigator.mediaDevices.getUserMedia({ audio: audioFor(false), video: false }),
      );
    }
  }, []);

  /** Hold the outgoing video to a sane bitrate once a sender exists. */
  const capBitrate = useCallback(async (pc: RTCPeerConnection): Promise<void> => {
    const sender = pc.getSenders().find((each) => each.track?.kind === 'video');
    if (!sender) return;
    const parameters = sender.getParameters();
    // Chrome hands back an empty list before the first negotiation.
    if (parameters.encodings.length === 0) parameters.encodings = [{}];
    for (const encoding of parameters.encodings) encoding.maxBitrate = MAX_VIDEO_BITRATE;
    parameters.degradationPreference = 'balanced';
    await sender.setParameters(parameters).catch(() => undefined);
  }, []);

  const drainRemoteCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const candidate of queuedRemoteRef.current.splice(0)) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const startCall = useCallback(
    (peer: CallPeer, media: CallMedia = 'audio') => {
      if (state.status !== 'idle' && state.status !== 'ended') return;
      dispatch({ type: 'place', peer, media });

      void (async () => {
        try {
          const stream = await capture(media);
          const pc = await createPeerConnection();
          for (const track of stream.getTracks()) pc.addTrack(track, stream);
          await capBitrate(pc);

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const sent = send({
            type: 'call-offer',
            to: peer.id,
            media,
            sdp: { type: 'offer', sdp: offer.sdp } as SessionDescription,
          });
          // A closed socket would leave the caller on "Calling…" for ever,
          // holding the microphone open, with nothing on the other end.
          if (!sent) throw new Error('not connected');
        } catch {
          teardown();
          dispatch({ type: 'fail' });
        }
      })();
    },
    [state.status, capture, capBitrate, createPeerConnection, send, teardown],
  );

  const accept = useCallback(() => {
    const callId = state.callId;
    const offer = state.pendingOffer;
    const media = state.media;
    if (state.status !== 'ringing' || callId === null || !offer) return;

    dispatch({ type: 'accept' });
    callIdRef.current = callId;

    void (async () => {
      try {
        const stream = await capture(media);
        const pc = await createPeerConnection();
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
        await capBitrate(pc);

        await pc.setRemoteDescription(offer as RTCSessionDescriptionInit);
        await drainRemoteCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        send({
          type: 'call-accept',
          callId,
          sdp: { type: 'answer', sdp: answer.sdp } as SessionDescription,
        });
        flushLocalCandidates(callId);

        if (media === 'video') {
          announceCamera(callId, stream.getVideoTracks().some((track) => track.enabled));
        }
      } catch {
        send({ type: 'hangup', callId });
        teardown();
        dispatch({ type: 'fail' });
      }
    })();
  }, [
    state.status,
    state.callId,
    state.pendingOffer,
    state.media,
    capture,
    capBitrate,
    createPeerConnection,
    drainRemoteCandidates,
    flushLocalCandidates,
    announceCamera,
    send,
    teardown,
  ]);

  const decline = useCallback(() => {
    if (state.status !== 'ringing' || state.callId === null) return;
    send({ type: 'call-decline', callId: state.callId });
  }, [state.status, state.callId, send]);

  const cancel = useCallback(() => {
    if (state.status !== 'calling') return;
    if (state.callId === null) {
      // The server has not answered our offer yet; drop it locally.
      teardown();
      dispatch({ type: 'fail', reason: 'cancelled' });
      return;
    }
    send({ type: 'call-cancel', callId: state.callId });
  }, [state.status, state.callId, send, teardown]);

  const hangup = useCallback(() => {
    if (state.callId === null) return;
    send({ type: 'hangup', callId: state.callId });
  }, [state.callId, send]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !state.muted;
    for (const track of stream.getAudioTracks()) track.enabled = !nextMuted;
    dispatch({ type: 'toggle-mute' });
  }, [state.muted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || state.media !== 'video' || !state.cameraAvailable) return;
    const nextOff = !state.cameraOff;
    // Disabling rather than stopping keeps the track in the sender, so there
    // is nothing to renegotiate when it comes back.
    for (const track of stream.getVideoTracks()) track.enabled = !nextOff;
    dispatch({ type: 'toggle-camera' });
    if (state.callId !== null) announceCamera(state.callId, !nextOff);
  }, [state.media, state.cameraOff, state.cameraAvailable, state.callId, announceCamera]);

  /**
   * Move a live call onto a different microphone or camera.
   *
   * `replaceTrack` swaps the source feeding an existing sender, which needs no
   * offer/answer round trip: the peer sees one continuous track and never
   * learns that anything changed. Renegotiating instead would risk glare with
   * whatever else the call is doing.
   */
  const switchDevice = useCallback(
    async (kind: 'audioinput' | 'videoinput', deviceId: string | null): Promise<void> => {
      const pc = pcRef.current;
      const stream = localStreamRef.current;
      if (!pc || !stream) return;

      const isAudio = kind === 'audioinput';
      const wanted = isAudio ? 'audio' : 'video';
      const sender = pc.getSenders().find((each) => each.track?.kind === wanted);
      const old = (isAudio ? stream.getAudioTracks() : stream.getVideoTracks())[0];
      if (!sender || !old) return;

      setSwitchingDevice(kind);
      try {
        const fresh = await navigator.mediaDevices.getUserMedia(
          isAudio
            ? { audio: { ...AUDIO_CONSTRAINTS, ...deviceConstraint(deviceId) }, video: false }
            : { audio: false, video: { ...VIDEO_CONSTRAINTS, ...deviceConstraint(deviceId) } },
        );
        const next = (isAudio ? fresh.getAudioTracks() : fresh.getVideoTracks())[0];
        if (!next) {
          for (const track of fresh.getTracks()) track.stop();
          return;
        }

        // A newly opened track is always enabled. Carrying the old track's
        // state across is what stops changing microphone from unmuting you,
        // or changing camera from turning a camera back on.
        next.enabled = old.enabled;

        await sender.replaceTrack(next);

        const updated = new MediaStream(
          stream.getTracks().map((track) => (track === old ? next : track)),
        );
        old.stop();
        localStreamRef.current = updated;
        setLocalStream(updated);

        // The bitrate cap lives on the sender's encodings, which a new video
        // track resets.
        if (!isAudio) await capBitrate(pc);
      } catch {
        // Keep the track we have. A failed swap must never leave a live call
        // in silence.
      } finally {
        setSwitchingDevice(null);
      }
    },
    [capBitrate],
  );

  /**
   * Follow the chosen devices while a call is up.
   *
   * Choosing in settings and choosing from the in-call menu are the same act,
   * so both land here rather than each having to know about the peer
   * connection.
   */
  useEffect(() => {
    if (state.status !== 'in-call') return;

    for (const kind of ['audioinput', 'videoinput'] as const) {
      if (selected[kind] === appliedRef.current[kind]) continue;
      appliedRef.current[kind] = selected[kind];
      void switchDevice(kind, selected[kind]);
    }
  }, [selected, state.status, switchDevice]);

  /**
   * Route the peer's voice to the chosen speaker.
   *
   * Chrome and Edge only; an empty id puts it back on the system default.
   */
  useEffect(() => {
    const element = remoteAudioRef.current;
    if (!element || typeof element.setSinkId !== 'function') return;
    void element.setSinkId(selected.audiooutput ?? '').catch(() => undefined);
  }, [selected.audiooutput]);

  const toggleMinimized = useCallback(() => dispatch({ type: 'toggle-minimized' }), []);

  /* ---------------------------------------------------------------- */
  /* Server frames                                                     */
  /* ---------------------------------------------------------------- */

  useRealtimeMessages((message) => {
    switch (message.type) {
      case 'call-ringing': {
        callIdRef.current = message.callId;
        dispatch({
          type: 'ringing',
          callId: message.callId,
          conversationId: message.conversationId,
        });
        flushLocalCandidates(message.callId);
        return;
      }

      case 'incoming-call': {
        const resolution = resolveGlare(state, message.from.id, myId);

        if (resolution === 'ignore-incoming') {
          // We called them first and we hold the lower id: let our own call
          // stand. Their side will give way and answer ours.
          return;
        }
        if (resolution === 'reject-incoming') {
          send({ type: 'call-decline', callId: message.callId });
          return;
        }
        if (resolution === 'yield-to-incoming') {
          // We called them, but our id is higher: drop ours and take theirs.
          if (state.callId !== null) send({ type: 'call-cancel', callId: state.callId });
          teardown();
          dispatch({ type: 'reset' });
        }

        dispatch({
          type: 'incoming',
          callId: message.callId,
          conversationId: message.conversationId,
          peer: { id: message.from.id, username: message.from.username, displayName: message.from.displayName, avatar: message.from.avatar },
          media: message.media,
          sdp: message.sdp,
        });
        return;
      }

      case 'call-accepted': {
        const pc = pcRef.current;
        if (!pc) return;
        void (async () => {
          try {
            await pc.setRemoteDescription(message.sdp as RTCSessionDescriptionInit);
            await drainRemoteCandidates();
            dispatch({ type: 'accepted' });

            if (state.media === 'video') {
              const tracks = localStreamRef.current?.getVideoTracks() ?? [];
              announceCamera(message.callId, tracks.some((track) => track.enabled));
            }
          } catch {
            if (state.callId !== null) send({ type: 'hangup', callId: state.callId });
            teardown();
            dispatch({ type: 'fail' });
          }
        })();
        return;
      }

      case 'ice-candidate': {
        const pc = pcRef.current;
        if (!pc || pc.remoteDescription === null) {
          // Arrived before we have somewhere to put it; hold on to it.
          queuedRemoteRef.current.push(message.candidate);
          return;
        }
        void pc.addIceCandidate(message.candidate).catch(() => undefined);
        return;
      }

      case 'camera-state':
        if (state.callId !== null && message.callId !== state.callId) return;
        dispatch({ type: 'remote-video', on: message.on });
        return;

      case 'unavailable':
        dispatch({ type: 'reason', callId: message.callId, reason: 'unavailable' });
        return;

      case 'busy':
        dispatch({ type: 'reason', callId: message.callId, reason: 'busy' });
        return;

      case 'no-answer':
        dispatch({ type: 'reason', callId: message.callId, reason: 'no-answer' });
        return;

      case 'call-ended':
        teardown();
        dispatch({
          type: 'ended',
          callId: message.callId,
          outcome: message.outcome,
          duration: message.duration,
        });
        return;

      case 'error':
        // The server refused our offer — we called someone who is already in a
        // call, or who just called us and got there first. Only ever while our
        // own call is still unplaced: by the time we have yielded and answered
        // theirs, this frame is stale and must not touch the live call.
        if (state.status === 'calling' && state.callId === null) {
          teardown();
          dispatch({ type: 'fail' });
        }
        return;

      default:
        return;
    }
  });

  /* ---------------------------------------------------------------- */
  /* Sound and lifecycle                                               */
  /* ---------------------------------------------------------------- */

  // Arm the AudioContext on the first gesture after load, so a call arriving
  // an hour later can still ring without another one.
  useEffect(() => installAudioUnlock(), []);

  useEffect(() => {
    const tone = toneFor(state);
    if (tone) startTone(tone);
    else stopTone();
  }, [state]);

  useEffect(() => {
    if (state.status === 'ended') playEndTone();
  }, [state.status]);

  // "Call ended" lingers for two seconds, then the modal goes away.
  useEffect(() => {
    if (state.status !== 'ended') return;
    const timer = setTimeout(() => dispatch({ type: 'reset' }), ENDED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [state.status]);

  useEffect(() => {
    return () => {
      stopTone();
      teardown();
    };
  }, [teardown]);

  const value = useMemo<CallContextValue>(
    () => ({
      state,
      startCall,
      accept,
      decline,
      cancel,
      hangup,
      toggleMute,
      toggleCamera,
      toggleMinimized,
      switchingDevice,
      remoteAudioRef,
      remoteStream,
      localStream,
    }),
    [
      state,
      startCall,
      accept,
      decline,
      cancel,
      hangup,
      toggleMute,
      toggleCamera,
      toggleMinimized,
      switchingDevice,
      remoteStream,
      localStream,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {/* The peer's audio. Hidden, but it is what you actually hear. */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used inside a CallProvider');
  return context;
}
