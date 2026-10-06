/**
 * Category colour tokens. Kept out of `category-meta.ts` so the public nav can
 * style a category without pulling in the 300+ icon registry.
 */

/** Colour tokens with static Tailwind classes. */
export const CATEGORY_COLOR_OPTIONS = [
  'violet',
  'teal',
  'orange',
  'blue',
  'purple',
  'rose',
  'red',
  'amber',
  'green',
  'cyan',
] as const;

export type CategoryColorToken = (typeof CATEGORY_COLOR_OPTIONS)[number];

const COLOR_SWATCH_CLASSES: Record<CategoryColorToken, string> = {
  violet: 'bg-violet-500',
  teal: 'bg-teal-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  rose: 'bg-rose-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
  cyan: 'bg-cyan-500',
};

export function colorSwatchClass(token: string | null | undefined): string {
  if (!token) return 'bg-muted-foreground/30';
  return COLOR_SWATCH_CLASSES[token as CategoryColorToken] ?? 'bg-muted-foreground/30';
}
