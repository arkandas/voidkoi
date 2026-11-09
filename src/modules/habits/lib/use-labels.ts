'use client'

import { useTranslations } from 'next-intl'

import { EXERCISE_TYPES, MEAL_TYPES } from './metrics'

const isIn = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value)

/** The names of meals and workout types; anything else as it was typed. */
export function useLabels() {
  const tMeal = useTranslations('habits.meals')
  const tType = useTranslations('habits.exerciseTypes')
  return {
    meal: (type: string) => (isIn(MEAL_TYPES, type) ? tMeal(type) : type),
    exerciseType: (type: string) => (isIn(EXERCISE_TYPES, type) ? tType(type) : type),
  }
}
