'use client'

import { useEffect, useState } from 'react'

import { dayKey } from '@/lib/days'

import type { DayKey } from './dates'

/** Today in the browser's time zone: null on the server, and it moves on at midnight. */
export function useToday(): DayKey | null {
  const [today, setToday] = useState<DayKey | null>(null)
  useEffect(() => {
    const update = () => setToday(dayKey(new Date()))
    update()
    const id = setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return today
}
