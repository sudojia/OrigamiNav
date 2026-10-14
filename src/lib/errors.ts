import 'server-only';

import { errorMessage } from '@/db/client';

/**
 * Failure messages that cross the server boundary. A driver error carries
 * table names, hosts and credentials, so only a deliberate `BusinessError`
 * may be shown; everything else is logged in full and replaced.
 */

/** A failure written for the admin: its message is safe to show as-is. */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

/** Message safe to return to the caller, falling back to `fallback`. */
export function userMessage(error: unknown, fallback: string): string {
  if (error instanceof BusinessError) return error.message;
  // Keeps the internal detail diagnosable without shipping it to the browser.
  console.error(`[origaminav] ${fallback}: ${errorMessage(error)}`);
  return fallback;
}
