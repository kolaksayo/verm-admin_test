import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merge conditional class names and de-dupe conflicting Tailwind utilities.
// Mirrors the `cn()` helper shadcn/ui ships with, so shadcn-style components
// port over unchanged.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
