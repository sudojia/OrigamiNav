import { newId } from '@/lib/ids';

/** Finds the first free `base`, `base-2`, `base-3`, … slug; `taken` reports a
 * collision with any other row. Falls back to an id-suffixed slug. */
export async function ensureUniqueSlug(
  base: string,
  taken: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await taken(base))) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${base}-${newId().slice(-6)}`;
}
