import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `clsx` for conditionals, `tailwind-merge` so a caller's class wins over a
 * component's default instead of fighting it in the cascade.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
