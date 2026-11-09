'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type Tone = 'weight' | 'food' | 'exercise' | 'streak'

const TONES: Record<Tone, string> = {
  weight: 'tone-weight',
  food: 'tone-food',
  exercise: 'tone-exercise',
  streak: 'tone-streak',
}

export const toneClass = (tone: Tone) => TONES[tone]

/** A card of the overview or the templates: its head tinted with what it tracks. */
export function Card({
  label,
  title,
  icon: Icon,
  tone,
  head,
  foot,
  className,
  children,
}: {
  label: string
  title?: ReactNode
  icon: LucideIcon
  tone: Tone
  head?: ReactNode
  foot?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-label={label} className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-card shadow-xs', toneClass(tone), className)}>
      <CardHead>
        <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-(--tone-ink)">
          <Icon size={16} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0">{title ?? label}</span>
        </h2>
        {head}
      </CardHead>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {foot ? <div className="flex items-center gap-2 border-t border-line bg-surface px-5 py-3">{foot}</div> : null}
    </section>
  )
}

/** A card's head, tinted with the tone around it. */
export function CardHead({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex min-h-13 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-(--tone-line,var(--line)) bg-(--tone-head,var(--card)) py-2 pr-3 pl-4 sm:pl-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** A small rounded label: in a tone's colours, or plain. */
export function Pill({ tone, className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-none font-medium whitespace-nowrap',
        tone ? cn(toneClass(tone), 'bg-(--tone-soft) text-(--tone-ink)') : 'bg-muted text-ink-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A number set in the monospaced figures Habits writes its values in. */
export function Num({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('font-mono tracking-[-0.01em] tabular-nums', className)}>{children}</span>
}

/** For `t.rich`: a value inside a sentence, in the figures and in the ink colour. */
export const value = (chunks: ReactNode) => <Num className="text-ink">{chunks}</Num>

/** A labelled figure in a sunken box. */
export function Stat({ label, value: shown, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={cn('min-w-0 rounded-[10px] border border-line bg-surface px-3 py-2.5', tone && toneClass(tone))}>
      <div className={cn('text-xs', tone ? 'text-(--tone-ink)' : 'text-ink-muted')}>{label}</div>
      <Num className="block truncate text-[15px] text-ink">{shown}</Num>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} />
}

/** An error message under a form. */
export function FormError({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="text-sm font-medium text-danger">
      {children}
    </p>
  ) : null
}

/** The heading of a part of a panel, with something on the right. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-[13px] font-semibold text-ink">{children}</h3>
      {right}
    </div>
  )
}

/**
 * Choices of equal width in a sunken strip, as the kit's segmented control
 * draws them: tabs that switch a panel, or a group of pressed buttons.
 */
export function TabStrip<T extends string>({
  label,
  value: current,
  onChange,
  items,
  controls,
  group = false,
  className,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  items: { value: T; label: string; detail?: ReactNode }[]
  /** The id of the panel the tabs switch. */
  controls?: string
  /** Pressed buttons rather than tabs, for a choice that switches no panel. */
  group?: boolean
  className?: string
}) {
  return (
    <div
      role={group ? 'group' : 'tablist'}
      aria-label={label}
      className={cn('grid gap-0.5 rounded-lg border border-line bg-muted p-0.5 dark:bg-canvas', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(item => {
        const active = item.value === current
        const tall = item.detail !== undefined
        return (
          <button
            key={item.value}
            type="button"
            role={group ? undefined : 'tab'}
            aria-selected={group ? undefined : active}
            aria-pressed={group ? active : undefined}
            aria-controls={group ? undefined : controls}
            onClick={() => onChange(item.value)}
            className={cn(
              'min-w-0 rounded-md px-1.5 text-center transition-colors',
              tall ? 'py-1.5' : 'h-9 sm:h-8',
              active ? 'bg-raised shadow-sm ring-1 ring-line dark:bg-line-strong dark:ring-0' : 'hover:text-ink',
            )}
          >
            <span className={cn('block truncate', tall ? 'text-xs' : 'text-[13px]', active ? 'font-semibold text-ink' : 'font-medium text-ink-muted')}>
              {item.label}
            </span>
            {item.detail}
          </button>
        )
      })}
    </div>
  )
}
