'use client'

/**
 * The open day lives in the address: `?day=2026-09-29&tab=food`, so a reload
 * keeps it and Back closes it. Opening a day pushes one history entry; moving
 * between days and tabs replaces it.
 */
import type { DayKey } from './dates'
import type { Metric } from './metrics'

const MARK = 'habitsDay'

const marked = (): boolean => !!window.history.state?.[MARK]

function withParams(edit: (params: URLSearchParams) => void) {
  const url = new URL(window.location.href)
  edit(url.searchParams)
  return url.pathname + url.search + url.hash
}

/*
 * Plain objects on purpose: Next.js copies its own state into the entry and
 * syncs `useSearchParams`, which it skips for an entry that already has it.
 */
export function openDay(day: DayKey, tab?: Metric) {
  const open = new URL(window.location.href).searchParams.has('day')
  const url = withParams(params => {
    params.set('day', day)
    if (tab) params.set('tab', tab)
    else if (!open) params.delete('tab')
  })
  if (open) window.history.replaceState({ [MARK]: marked() }, '', url)
  else window.history.pushState({ [MARK]: true }, '', url)
}

export function setDayTab(tab: Metric) {
  window.history.replaceState({ [MARK]: marked() }, '', withParams(params => params.set('tab', tab)))
}

export function closeDay() {
  if (marked()) window.history.back()
  else
    window.history.replaceState(
      {},
      '',
      withParams(params => {
        params.delete('day')
        params.delete('tab')
      }),
    )
}

export function setMonthParam(month: string | null) {
  window.history.replaceState(
    { [MARK]: marked() },
    '',
    withParams(params => {
      if (month) params.set('month', month)
      else params.delete('month')
    }),
  )
}
