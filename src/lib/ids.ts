import { createId } from '@paralleldrive/cuid2';

/** Generates an application-side id (no DB default). */
export function newId(): string {
  return createId();
}

/** Current time as an ISO string (app-written, no DB default). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Fresh id with createdAt and updatedAt set to the same instant. */
export function newRow(): {
  id: string;
  createdAt: string;
  updatedAt: string;
} {
  const stamp = nowIso();
  return { id: newId(), createdAt: stamp, updatedAt: stamp };
}
