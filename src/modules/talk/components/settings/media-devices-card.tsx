'use client';

import { Camera, Mic, Volume2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, Button, Card, CardTitle, Select, type SelectOption } from '@/components/ui';
import { meterStream, type LevelMeter } from '@/modules/talk/lib/audio-level';
import { cn } from '@/lib/cn';
import { listFor, useDeviceName, useMediaDevices } from '@/modules/talk/lib/hooks/use-media-devices';
import { deviceConstraint, isMissingDeviceError, type DeviceKind } from '@/modules/talk/lib/media-devices';

/** The value standing in for "whatever the operating system prefers". */
const SYSTEM = '';

/**
 * The level meter, as a row of blocks rather than one sliding bar.
 *
 * Blocks read better at a glance: you learn where "loud enough" sits on the
 * scale after one look, and a bar that stops in the same place every time is
 * much easier to spot than a smooth one. The last few are amber and red, which
 * is the language every mixing desk already uses for "too hot".
 */
const SEGMENTS = 24;
const AMBER_FROM = 17;
const RED_FROM = 21;

function segmentTone(index: number): string {
  if (index >= RED_FROM) return 'bg-danger';
  if (index >= AMBER_FROM) return 'bg-warning';
  return 'bg-success';
}

type TestState =
  | { status: 'off' }
  | { status: 'starting' }
  | {
      status: 'on';
      hasVideo: boolean;
      /** The device the browser actually opened, which "Same as system" hides. */
      audioLabel: string;
      /**
       * True when the track is live but no audio is arriving through it. On
       * macOS that is usually the browser missing microphone permission in
       * System Settings, and it looks exactly like a silent room unless it is
       * said out loud.
       */
      silent: boolean;
    }
  /** `blocked` when the browser refused permission, which the person can fix. */
  | { status: 'failed'; reason: 'blocked' | 'unavailable' };

/**
 * Pick the microphone, camera and speaker, and prove the choice was right.
 *
 * A list of names is a guess. The preview and the level meter are the point of
 * the card: they answer "can this thing actually see and hear me?" before
 * somebody finds out during a call.
 */
export function MediaDevicesCard() {
  const t = useTranslations('talk.calls.devices');
  const format = useFormatter();
  const deviceName = useDeviceName();
  const { devices, choices, selected, lost, namesKnown, canChooseSpeaker, choose, refresh } =
    useMediaDevices();

  const [test, setTest] = useState<TestState>({ status: 'off' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const meterBoxRef = useRef<HTMLDivElement>(null);
  const segmentsRef = useRef<Array<HTMLSpanElement | null>>([]);
  /** How many blocks are currently lit, so untouched frames write nothing. */
  const litRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<LevelMeter | null>(null);

  /**
   * Light the blocks for a level.
   *
   * Called sixty times a second, so it writes only what changed: the lit count
   * lands on one of twenty-four values, and most frames land on the same one as
   * the last, which costs nothing at all.
   */
  const paintLevel = useCallback((level: number): void => {
    const lit = Math.max(0, Math.min(SEGMENTS, Math.round(level * SEGMENTS)));
    if (lit === litRef.current) return;

    const from = Math.min(lit, litRef.current);
    const to = Math.max(lit, litRef.current);
    for (let index = from; index < to; index += 1) {
      const segment = segmentsRef.current[index];
      if (segment) segment.style.opacity = index < lit ? '1' : '0.16';
    }
    litRef.current = lit;
    // A number the tests can read, rather than measuring pixels.
    if (meterBoxRef.current) meterBoxRef.current.dataset['lit'] = String(lit);
  }, []);

  /** Let go of the hardware. Deliberately touches no React state. */
  const release = useCallback((): void => {
    meterRef.current?.stop();
    meterRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    // The blocks are written to directly, so they are put out directly too.
    litRef.current = SEGMENTS;
    paintLevel(0);
  }, [paintLevel]);

  const stopTest = useCallback((): void => {
    release();
    setTest({ status: 'off' });
  }, [release]);

  // Never hold the camera open after the card goes away.
  useEffect(() => release, [release]);

  const startTest = useCallback(async (): Promise<void> => {
    release();
    setTest({ status: 'starting' });

    const wantsCamera = devices.cameras.length > 0 || !namesKnown;

    const open = async (pinned: boolean): Promise<MediaStream> =>
      navigator.mediaDevices.getUserMedia({
        audio: pinned ? { ...deviceConstraint(selected.audioinput) } : true,
        video: wantsCamera ? (pinned ? { ...deviceConstraint(selected.videoinput) } : true) : false,
      });

    let stream: MediaStream;
    try {
      stream = await open(true);
    } catch (error) {
      if (!isMissingDeviceError(error)) {
        setTest({
          status: 'failed',
          reason:
            error instanceof Error && error.name === 'NotAllowedError' ? 'blocked' : 'unavailable',
        });
        return;
      }
      // A chosen device has been unplugged since. Show what is actually here.
      try {
        stream = await open(false);
      } catch {
        setTest({ status: 'failed', reason: 'unavailable' });
        return;
      }
    }

    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;

    // Sixty writes a second go straight to the element. Routing them through
    // React would re-render this card on every frame to move one bar.
    meterRef.current = meterStream(
      stream,
      paintLevel,
      (dead) =>
        setTest((current) => (current.status === 'on' ? { ...current, silent: dead } : current)),
    );

    const audio = stream.getAudioTracks()[0];

    // Granting access is what unlocks the names, so the lists fill in now.
    await refresh();
    setTest({
      status: 'on',
      hasVideo: stream.getVideoTracks().length > 0,
      audioLabel: audio?.label ?? '',
      silent: false,
    });
  }, [devices.cameras.length, namesKnown, paintLevel, refresh, release, selected]);

  const testing = test.status === 'on';

  const startTestRef = useRef(startTest);
  useEffect(() => {
    startTestRef.current = startTest;
  }, [startTest]);

  /**
   * Changing device mid-test re-opens on the new one, so the preview and the
   * meter keep telling the truth about what is selected.
   *
   * Only a *change* counts: the ids in force when the test started were
   * already used to open it, and re-opening on those would restart the camera
   * the moment it appeared.
   */
  const previewingRef = useRef<{ audio: string | null; video: string | null } | null>(null);
  useEffect(() => {
    if (!testing) {
      previewingRef.current = null;
      return;
    }
    const current = { audio: selected.audioinput, video: selected.videoinput };
    const previous = previewingRef.current;
    previewingRef.current = current;
    if (previous === null) return;
    if (previous.audio === current.audio && previous.video === current.video) return;
    void startTestRef.current();
  }, [testing, selected.audioinput, selected.videoinput]);

  const optionsFor = (kind: DeviceKind): SelectOption[] => {
    const available = listFor(devices, kind);
    const options: SelectOption[] = [
      { value: SYSTEM, label: t('system') },
      ...available.map((device) => ({ value: device.deviceId, label: deviceName(device) })),
    ];

    // Keep a chosen-but-absent device visible rather than silently resetting
    // the field to "Same as system", which reads as the app forgetting.
    const stored = choices[kind];
    if (
      stored &&
      !available.some((d) => d.deviceId === stored.deviceId || d.label === stored.label)
    ) {
      options.push({
        value: stored.deviceId,
        label: t('settings.notConnected', { name: stored.label || t('chosenDevice') }),
      });
    }
    return options;
  };

  const valueFor = (kind: DeviceKind): string => {
    const available = listFor(devices, kind);
    const stored = choices[kind];
    if (!stored) return SYSTEM;
    return (
      available.find((d) => d.deviceId === stored.deviceId)?.deviceId ??
      available.find((d) => d.label === stored.label)?.deviceId ??
      stored.deviceId
    );
  };

  return (
    <Card>
      <CardTitle>{t('settings.title')}</CardTitle>

      {/* Only ever shown once the connected devices are actually known: an
          empty list means "not enumerated yet", not "your headset is gone". */}
      {lost.length > 0 ? (
        <Alert tone="warning" className="mt-4">
          {t('settings.lost', {
            devices: format.list(lost.map((device) => device.label), { type: 'conjunction' }),
            count: lost.length,
          })}
        </Alert>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Select
          label={t('settings.microphone')}
          icon={<Mic size={16} />}
          options={optionsFor('audioinput')}
          value={valueFor('audioinput')}
          onChange={(event) =>
            choose('audioinput', event.target.value === SYSTEM ? null : event.target.value)
          }
        />
        <Select
          label={t('settings.camera')}
          icon={<Camera size={16} />}
          options={optionsFor('videoinput')}
          value={valueFor('videoinput')}
          onChange={(event) =>
            choose('videoinput', event.target.value === SYSTEM ? null : event.target.value)
          }
        />
        {canChooseSpeaker ? (
          <Select
            label={t('settings.speaker')}
            icon={<Volume2 size={16} />}
            options={optionsFor('audiooutput')}
            value={valueFor('audiooutput')}
            onChange={(event) =>
              choose('audiooutput', event.target.value === SYSTEM ? null : event.target.value)
            }
          />
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="w-full shrink-0 sm:w-64">
          <div className="aspect-video overflow-hidden rounded-xl border border-line bg-stage">
            {/* Mirrored, because a preview of your own face that is not
                mirrored looks like somebody else. */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label={t('settings.preview')}
              className={cn(
                'size-full -scale-x-100 object-cover',
                test.status === 'on' && test.hasVideo ? '' : 'hidden',
              )}
            />
            {test.status === 'on' && test.hasVideo ? null : (
              <div className="flex size-full items-center justify-center px-4 text-center">
                <span className="text-sm text-stage-ink-muted">
                  {test.status === 'starting'
                    ? t('settings.opening')
                    : test.status === 'on'
                      ? t('settings.noCamera')
                      : t('settings.previewOff')}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-ink-muted">{t('settings.level')}</p>
            {/* Opacity is the only thing written per frame: it is composited,
                so a block lighting up costs no layout and no repaint. The
                colours are fixed at render, which is what makes the scale
                readable — the red blocks sit in the same place every time. */}
            <div
              ref={meterBoxRef}
              data-lit="0"
              aria-hidden="true"
              className="mt-2 flex h-6 items-stretch gap-[3px] rounded-lg border border-line bg-muted px-1.5 py-1 dark:bg-canvas"
            >
              {Array.from({ length: SEGMENTS }, (_, index) => (
                <span
                  key={index}
                  ref={(element) => {
                    segmentsRef.current[index] = element;
                  }}
                  style={{ opacity: 0.16 }}
                  className={cn(
                    'min-w-0 flex-1 rounded-[2px] transition-opacity duration-75',
                    segmentTone(index),
                  )}
                />
              ))}
            </div>
            {test.status === 'on' && test.audioLabel ? (
              <p className="mt-1.5 text-xs text-ink-faint">
                {t('settings.using', { device: test.audioLabel })}
              </p>
            ) : null}
          </div>

          {/* Silence and "the operating system is not letting the browser
              listen" look identical on a meter, so the difference is spelled
              out rather than left as a bar that never moves. */}
          {test.status === 'on' && test.silent ? (
            <Alert tone="warning">{t('settings.silentTitle')}</Alert>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              variant={testing ? 'outline' : 'default'}
              onClick={() => (testing ? stopTest() : void startTest())}
              disabled={test.status === 'starting'}
            >
              {testing
                ? t('settings.stopTest')
                : test.status === 'starting'
                  ? t('settings.opening')
                  : t('settings.test')}
            </Button>
          </div>

          {test.status === 'failed' ? (
            <Alert>{t(test.reason === 'blocked' ? 'settings.blocked' : 'settings.openFailed')}</Alert>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
