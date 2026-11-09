'use client';

import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { Button, Modal, Spinner } from '@/components/ui';
import {
  AvatarError,
  type AvatarErrorReason,
  clampSelection,
  defaultSelection,
  encodeAvatar,
  fitRect,
  loadAvatarSource,
  moveSelection,
  resizeSelection,
  type AvatarSource,
  type Corner,
  type CropRect,
  type Point,
  type PreparedAvatar,
} from '@/lib/avatar-image';
import { cn } from '@/lib/cn';

/** How far one arrow key moves or resizes the selection, as a fraction. */
const NUDGE_FRACTION = 0.02;

const CORNERS: ReadonlyArray<{ corner: Corner; className: string; cursor: string }> = [
  { corner: 'nw', className: '-top-2 -left-2', cursor: 'cursor-nwse-resize' },
  { corner: 'ne', className: '-top-2 -right-2', cursor: 'cursor-nesw-resize' },
  { corner: 'sw', className: '-bottom-2 -left-2', cursor: 'cursor-nesw-resize' },
  { corner: 'se', className: '-right-2 -bottom-2', cursor: 'cursor-nwse-resize' },
];

interface GestureBase {
  pointerId: number;
  stage: { left: number; top: number };
  fit: { x: number; y: number; scale: number };
}

type Gesture =
  | (GestureBase & { kind: 'move'; grabX: number; grabY: number })
  | (GestureBase & { kind: 'resize'; corner: Corner });

/** Keys under `settings.avatarEditor.errors`. */
type EditorError = AvatarErrorReason | 'readFailed' | 'uploadFailed';

export interface AvatarEditorProps {
  file: File | null;
  onCancel(): void;
  onConfirm(prepared: PreparedAvatar): Promise<void> | void;
}

/**
 * Choose which square of a picture becomes the avatar.
 *
 * The whole picture is on screen with a square over the part that will be
 * kept: drag it to move, drag a corner to resize.
 *
 * A dragging square is not a React problem. Re-rendering on every pointermove
 * puts reconciliation — doubled again by StrictMode in development, and
 * instrumented on top of that if React DevTools is installed — between the
 * mouse and the screen, and a real mouse fires far faster than React can keep
 * up with. The events then queue, the square trails the cursor, and it catches
 * up in a jump.
 *
 * So a gesture writes to the DOM directly and never calls setState. React owns
 * the selection between gestures; the pointer owns it during one, and hands it
 * back on release.
 */
export function AvatarEditor({ file, onCancel, onConfirm }: AvatarEditorProps) {
  const t = useTranslations('settings.avatarEditor');
  const [source, setSource] = useState<AvatarSource | null>(null);
  const [selection, setSelection] = useState<CropRect>({ x: 0, y: 0, size: 0 });
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<EditorError | null>(null);
  const [saving, setSaving] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const scrimRefs = useRef<Array<HTMLDivElement | null>>([null, null, null, null]);

  /** The live selection. During a gesture this leads; state follows on release. */
  const live = useRef<CropRect>({ x: 0, y: 0, size: 0 });
  /** What was last written to each element, so identical writes are skipped. */
  const written = useRef<Record<string, string>>({});
  const gesture = useRef<Gesture | null>(null);
  const pending = useRef<Point | null>(null);
  const frame = useRef<number | null>(null);

  const fit = fitRect(source ?? { width: 0, height: 0 }, box);

  /* --- load --------------------------------------------------------- */

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let loaded: AvatarSource | null = null;

    void (async () => {
      try {
        loaded = await loadAvatarSource(file);
        if (cancelled) {
          loaded.release();
          return;
        }
        const initial = defaultSelection(loaded);
        live.current = initial;
        setSource(loaded);
        setSelection(initial);
        setError(null);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof AvatarError ? caught.reason : 'readFailed');
        }
      }
    })();

    return () => {
      cancelled = true;
      loaded?.release();
      setSource(null);
    };
  }, [file]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [source]);

  /* --- painting, without React -------------------------------------- */

  /**
   * Put a selection on screen: the square, the four dimmed rectangles around
   * it, the live preview and the readout.
   *
   * Every one of those writes is a `transform`, which the compositor applies to
   * a layer that is already rasterised. Nothing here changes the size of
   * anything that has to be repainted, so the cost does not grow with the size
   * of the window or the pixel density of the screen.
   */
  const paint = useCallback(
    (next: CropRect) => {
      live.current = next;
      if (!source || fit.scale === 0 || box.width === 0 || box.height === 0) return;

      const left = fit.x + next.x * fit.scale;
      const top = fit.y + next.y * fit.scale;
      const size = next.size * fit.scale;

      // Writing a style property, or a text node, invalidates layout even when
      // the value is unchanged — and during a move the square's width and the
      // readout never change. Skipping those writes is the difference between
      // one layout per frame and none at all.
      const set = (key: string, value: string, apply: (value: string) => void): void => {
        if (written.current[key] === value) return;
        written.current[key] = value;
        apply(value);
      };

      const square = boxRef.current;
      if (square) {
        set('box-t', `translate(${left}px, ${top}px)`, (v) => (square.style.transform = v));
        set('box-w', `${size}px`, (v) => {
          square.style.width = v;
          square.style.height = v;
        });
      }

      // Each dimmed rectangle is a stage-sized div of flat colour that is only
      // ever moved and squashed. Scaling a solid fill is invisible, so the four
      // of them can cover any geometry without a single repaint.
      const place = (index: number, x: number, y: number, width: number, height: number): void => {
        const element = scrimRefs.current[index];
        if (!element) return;
        const scaleX = Math.max(0, width) / box.width;
        const scaleY = Math.max(0, height) / box.height;
        set(
          `scrim-${index}`,
          `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`,
          (v) => (element.style.transform = v),
        );
      };
      place(0, 0, 0, box.width, top);
      place(1, 0, top + size, box.width, box.height - top - size);
      place(2, 0, top, left, size);
      place(3, left + size, top, box.width - left - size, size);

      // Drawn from the 256px copy, not the 1600px one: a narrow reduction the
      // GPU does for nothing, rather than a wide one Chrome does on the CPU.
      const canvas = previewRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context && next.size > 0) {
        const ratio = source.thumbWidth / source.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          source.thumb,
          next.x * ratio,
          next.y * ratio,
          next.size * ratio,
          next.size * ratio,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      }

      const readout = readoutRef.current;
      if (readout) {
        const whole = Math.round(next.size);
        set('readout', t('selected', { size: String(whole) }), (v) => (readout.textContent = v));
      }
    },
    [source, fit.x, fit.y, fit.scale, box.width, box.height, t],
  );

  // React only touches the DOM here: on load, on resize, and after a gesture
  // hands the selection back.
  useLayoutEffect(() => {
    written.current = {};
    paint(live.current);
  }, [paint, selection]);

  /** The picture: painted once, at device resolution, then left alone. */
  useEffect(() => {
    const canvas = pictureRef.current;
    if (!canvas || !source || fit.width === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(fit.width * dpr);
    const height = Math.round(fit.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(source.display, 0, 0, width, height);
  }, [source, fit.width, fit.height]);

  /* --- gestures ------------------------------------------------------ */

  const toImage = (event: { clientX: number; clientY: number }, context: GestureBase): Point => ({
    x: (event.clientX - context.stage.left - context.fit.x) / context.fit.scale,
    y: (event.clientY - context.stage.top - context.fit.y) / context.fit.scale,
  });

  const capturePointer = (element: Element, pointerId: number): void => {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // Pointer released between the event and this handler.
    }
  };

  const stageOrigin = (): { left: number; top: number } => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { left: rect?.left ?? 0, top: rect?.top ?? 0 };
  };

  /** Apply the newest pointer position once per frame, straight to the DOM. */
  const scheduleUpdate = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const current = gesture.current;
      const point = pending.current;
      if (!current || !point || !source) return;

      paint(
        current.kind === 'move'
          ? clampSelection(
              { ...live.current, x: point.x - current.grabX, y: point.y - current.grabY },
              source,
            )
          : resizeSelection(live.current, current.corner, point, source),
      );
    });
  }, [source, paint]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const startMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!source) return;
    event.preventDefault();
    capturePointer(event.currentTarget, event.pointerId);
    const base: GestureBase = { pointerId: event.pointerId, stage: stageOrigin(), fit };
    const point = toImage(event, base);
    gesture.current = {
      ...base,
      kind: 'move',
      grabX: point.x - live.current.x,
      grabY: point.y - live.current.y,
    };
  };

  const startResize = (event: PointerEvent<HTMLSpanElement>, corner: Corner): void => {
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    gesture.current = { pointerId: event.pointerId, stage: stageOrigin(), fit, kind: 'resize', corner };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>): void => {
    const current = gesture.current;
    if (!current || !source || current.pointerId !== event.pointerId) return;
    pending.current = toImage(event, current);
    scheduleUpdate();
  };

  const endGesture = (event: PointerEvent<HTMLElement>): void => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    pending.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Hand the selection back to React, once.
    setSelection(live.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!source) return;
    const step = Math.max(1, Math.round(Math.min(source.width, source.height) * NUDGE_FRACTION));
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };

    const by = moves[event.key];
    if (by) {
      event.preventDefault();
      const next = moveSelection(live.current, by, source);
      paint(next);
      setSelection(next);
      return;
    }
    if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_') {
      event.preventDefault();
      const delta = event.key === '-' || event.key === '_' ? -step : step;
      const next = clampSelection(
        {
          size: live.current.size + delta,
          x: live.current.x - delta / 2,
          y: live.current.y - delta / 2,
        },
        source,
      );
      paint(next);
      setSelection(next);
    }
  };

  /* --- confirm -------------------------------------------------------- */

  const confirm = async (): Promise<void> => {
    if (!source) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(await encodeAvatar(source, clampSelection(live.current, source)));
    } catch (caught) {
      setError(caught instanceof AvatarError ? caught.reason : 'uploadFailed');
    } finally {
      setSaving(false);
    }
  };

  const ready = source !== null && fit.scale > 0 && selection.size > 0;

  return (
    <Modal
      open={file !== null}
      size="lg"
      label={t('label')}
      title={t('title')}
      onClose={onCancel}
    >
      <div className="flex items-center justify-end gap-6">
        <div className={cn('shrink-0 text-center', ready ? '' : 'invisible')}>
          <canvas
            ref={previewRef}
            width={128}
            height={128}
            aria-hidden="true"
            className="size-16 rounded-full bg-stage ring-1 ring-line"
          />
          <p className="mt-1.5 text-xs text-ink-faint">{t('preview')}</p>
        </div>
      </div>

      <div
        ref={stageRef}
        role="application"
        aria-label={t('cropArea')}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className="relative mt-5 aspect-4/3 w-full touch-none overflow-hidden rounded-xl border border-line bg-stage select-none focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
      >
        <canvas
          ref={pictureRef}
          aria-hidden="true"
          className={cn('pointer-events-none absolute top-0 left-0', source ? '' : 'hidden')}
          style={{ transform: `translate(${fit.x}px, ${fit.y}px)`, width: fit.width, height: fit.height }}
        />
        {source ? null : (
          <div className="flex size-full items-center justify-center">
            {error ? null : <Spinner label={t('opening')} />}
          </div>
        )}

        {/* Positioned by `paint`, never by React. */}
        <div className={cn('absolute inset-0', ready ? '' : 'hidden')}>
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              ref={(element) => {
                scrimRefs.current[index] = element;
              }}
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 size-full origin-top-left bg-stage/75 will-change-transform"
            />
          ))}

          <div
            ref={boxRef}
            onPointerDown={startMove}
            className="absolute top-0 left-0 cursor-move will-change-transform"
            style={{
              outline: '2px solid var(--color-stage-ink)',
              outlineOffset: '-2px',
              boxShadow: 'inset 0 0 0 4px color-mix(in oklab, var(--color-stage) 45%, transparent)',
            }}
          >
            {/* The part that survives: avatars are round everywhere else. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-[3px] rounded-full border border-dashed border-stage-ink/70"
            />
            {CORNERS.map(({ corner, className, cursor }) => (
              <span
                key={corner}
                onPointerDown={(event) => startResize(event, corner)}
                className={cn(
                  'absolute size-4 rounded-sm border-2 border-stage-ink bg-accent shadow-sm',
                  className,
                  cursor,
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {t(`errors.${error}`)}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <span ref={readoutRef} className="text-xs text-ink-faint tabular-nums" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void confirm()} disabled={!ready || saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
