'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/use-media-query'

const noop = () => () => {}
const useIsClient = () => useSyncExternalStore(noop, () => true, () => false)

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export type SheetVariant = 'side' | 'popover'

/**
 * A panel over the page. On a phone it rises from the bottom and a swipe down
 * closes it; on a wider screen `side` stands at the right edge and `popover`
 * opens under the button that opened it. Escape and the backdrop close it.
 */
export function Sheet({
  open,
  onClose,
  children,
  variant = 'side',
  label,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  variant?: SheetVariant
  label?: string
  labelledBy?: string
}) {
  const [mounted, setMounted] = useState(open)
  const [prevOpen, setPrevOpen] = useState(open)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setMounted(true)
      setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null)
    }
  }
  const closing = mounted && !open
  const isClient = useIsClient()
  if (!mounted || !isClient) return null
  return createPortal(
    <SheetPanel
      closing={closing}
      onClose={onClose}
      onExited={() => setMounted(false)}
      opener={opener}
      variant={variant}
      label={label}
      labelledBy={labelledBy}
    >
      {children}
    </SheetPanel>,
    document.body,
  )
}

/** Where a popover goes: under the header's Log button, their right edges in line. */
function anchor(): { top: number; right: number } | undefined {
  const target = document.querySelector<HTMLElement>('[data-log-anchor]')
  if (!target) return undefined
  const box = target.getBoundingClientRect()
  return { top: box.bottom + 8, right: Math.max(12, window.innerWidth - box.right) }
}

function SheetPanel({
  closing,
  onClose,
  onExited,
  opener,
  variant,
  label,
  labelledBy,
  children,
}: {
  closing: boolean
  onClose: () => void
  onExited: () => void
  opener: HTMLElement | null
  variant: SheetVariant
  label?: string
  labelledBy?: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const openerRef = useRef(opener)
  const wide = useMediaQuery('(min-width: 48rem)')
  const [place] = useState(() => (variant === 'popover' ? anchor() : undefined))

  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      // A dialog of the suite's own, opened over this one, closes first.
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!closing) return
    const target = openerRef.current
    if (target?.isConnected && panel.current?.contains(document.activeElement)) target.focus({ preventScroll: true })
    const timer = setTimeout(onExited, 420)
    return () => clearTimeout(timer)
  }, [closing, onExited])

  // The phone's keyboard covers the bottom of the screen: the sheet rides above it.
  useEffect(() => {
    const viewport = window.visualViewport
    const element = panel.current
    if (!viewport || !element) return
    const update = () => {
      const covered = window.innerHeight - (viewport.height + viewport.offsetTop)
      element.style.setProperty('--kb', `${covered > 60 ? Math.round(covered) : 0}px`)
      element.style.setProperty('--vvh', `${Math.round(viewport.height)}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  const trapTab = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(node => node.offsetParent !== null)
    if (!items.length) return
    const first = items[0]!
    const last = items[items.length - 1]!
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Swiping down from the handle or the header closes the sheet on a phone.
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; dy: number; active: boolean } | null>(null)
  const suppressClick = useRef(false)
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' || wide) return
    if (!(event.target as Element).closest('[data-drag-zone]')) return
    drag.current = { id: event.pointerId, x0: event.clientX, y0: event.clientY, t0: event.timeStamp, dy: 0, active: false }
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current
    const element = panel.current
    if (!d || !element || event.pointerId !== d.id) return
    const dy = event.clientY - d.y0
    const dx = event.clientX - d.x0
    if (!d.active) {
      if (dy > 8 && dy > Math.abs(dx)) {
        d.active = true
        element.setPointerCapture(event.pointerId)
      } else if (Math.abs(dx) > 10 || dy < -8) {
        drag.current = null
        return
      } else return
    }
    d.dy = Math.max(0, dy)
    element.style.transition = 'none'
    element.style.transform = `translate3d(0, ${d.dy}px, 0)`
    if (backdrop.current) backdrop.current.style.opacity = String(1 - Math.min(1, d.dy / element.offsetHeight) * 0.9)
  }
  const endDrag = useCallback((event: React.PointerEvent) => {
    const d = drag.current
    const element = panel.current
    drag.current = null
    if (!d?.active || !element) return
    suppressClick.current = true
    setTimeout(() => {
      suppressClick.current = false
    }, 80)
    const velocity = d.dy / Math.max(1, event.timeStamp - d.t0)
    if (d.dy > Math.min(160, element.offsetHeight * 0.3) || velocity > 0.6) {
      element.style.setProperty('--drag-y', `${d.dy}px`)
      onCloseRef.current()
    } else {
      element.style.transition = 'transform .28s cubic-bezier(.2,.9,.25,1)'
      element.style.transform = ''
      if (backdrop.current) backdrop.current.style.opacity = ''
    }
  }, [])

  const state = closing ? 'closing' : 'open'
  const desktop = {
    side: 'md:inset-auto md:top-3 md:right-3 md:bottom-3 md:max-h-none md:w-[25rem] md:rounded-2xl md:border md:animate-[habits-drawer-in_.22s_cubic-bezier(.16,1,.3,1)] md:data-[state=closing]:animate-[habits-drawer-out_.16s_ease-in_forwards]',
    popover:
      'md:inset-auto md:top-(--top) md:right-(--right) md:max-h-[calc(100dvh-var(--top)-1rem)] md:w-[23rem] md:rounded-2xl md:border md:animate-[habits-pop-in_.16s_cubic-bezier(.16,1,.3,1)] md:data-[state=closing]:animate-[habits-pop-out_.12s_ease-in_forwards]',
  }[variant]

  return (
    <div className="fixed inset-0 z-50" data-app="habits" data-state={state}>
      <div
        ref={backdrop}
        onClick={onClose}
        data-state={state}
        className={cn(
          'absolute inset-0 touch-none animate-[habits-fade-in_.2s_ease-out] bg-scrim data-[state=closing]:animate-[habits-fade-out_.2s_ease-in_forwards]',
          variant === 'popover' && 'md:bg-transparent',
        )}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-state={state}
        style={place ? ({ '--top': `${place.top}px`, '--right': `${place.right}px` } as CSSProperties) : ({ '--top': '5rem', '--right': '1.5rem' } as CSSProperties)}
        onKeyDown={trapTab}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={event => {
          if (suppressClick.current) {
            event.stopPropagation()
            event.preventDefault()
          }
        }}
        onAnimationEnd={event => {
          if (closing && event.target === event.currentTarget) onExited()
        }}
        className={cn(
          'absolute inset-x-0 bottom-(--kb,0px) flex max-h-[min(92dvh,calc(var(--vvh,100dvh)-12px))] flex-col overflow-hidden rounded-t-2xl border-t border-line-strong bg-surface text-ink shadow-[var(--shadow-pop)] outline-hidden',
          'animate-[habits-sheet-up_.34s_cubic-bezier(.16,1,.3,1)] data-[state=closing]:animate-[habits-sheet-down_.22s_ease-in_forwards]',
          desktop,
        )}
      >
        <div data-drag-zone className="flex h-5 shrink-0 touch-none items-end justify-center md:hidden" aria-hidden="true">
          <span className="h-[0.3125rem] w-10 rounded-full bg-line-strong" />
        </div>
        {children}
      </div>
    </div>
  )
}
