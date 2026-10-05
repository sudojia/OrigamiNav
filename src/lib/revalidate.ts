import 'server-only';

import { revalidatePath } from 'next/cache';

/** Revalidates the whole site via the root layout. */
export function revalidateSite(): void {
  revalidatePath('/', 'layout');
}
