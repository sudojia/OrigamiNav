/** Validates the `?next=` redirect target for the login flow. */

/** Default login redirect target. */
export const DEFAULT_NEXT_PATH = '/admin';

/** Longest accepted target. */
const MAX_NEXT_LENGTH = 200;

/** Returns a safe same-origin relative path, otherwise `fallback`. */
export function sanitizeNext(
  value: unknown,
  fallback: string = DEFAULT_NEXT_PATH,
): string {
  if (typeof value !== 'string') return fallback;

  // Trim first; browsers strip leading/trailing spaces and C0 controls.
  const candidate = value.trim();

  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;

  // Reject backslashes and control chars; browsers normalize them to leave the origin.
  if (/[\\\u0000-\u001F\u007F]/.test(candidate)) return fallback;

  return candidate.slice(0, MAX_NEXT_LENGTH);
}
