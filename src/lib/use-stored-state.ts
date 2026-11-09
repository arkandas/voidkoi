'use client'

import { useCallback, useSyncExternalStore } from 'react'

const EVENT = 'voidkoi-stored-state'

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

/**
 * A small preference kept in this browser, like the list or grid view.
 * Read through useSyncExternalStore, so it's right from the first render
 * after hydration and the same in every tab.
 */
export function useStoredState<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (value: T) => void] {
  const read = useCallback((): T => {
    try {
      const value = localStorage.getItem(key)
      return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
    } catch {
      return fallback
    }
  }, [key, fallback, allowed])

  const value = useSyncExternalStore(subscribe, read, () => fallback)

  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next)
      } catch {}
      window.dispatchEvent(new Event(EVENT))
    },
    [key],
  )

  return [value, set]
}
