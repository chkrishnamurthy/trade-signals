import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class-name composer used by every component in the design system.
 *
 * `clsx` handles conditionals; `twMerge` resolves Tailwind conflicts so a
 * caller's `className` always wins over a variant default — that is what makes
 * the components extensible without prop explosions.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
