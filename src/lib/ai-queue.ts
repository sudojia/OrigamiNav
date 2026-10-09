import 'server-only';

import { getSiteSettings } from '@/db/queries/settings';
import { clampAiConcurrency } from '@/types/nav';

/**
 * In-process FIFO semaphore for provider calls, so bulk work never exceeds the
 * admin's aiConcurrency. The limit is read once per job, so a long batch keeps
 * the value it started with.
 */

let active = 0;
const waiters: Array<() => void> = [];

/** Concurrency limit for one AI job; clamped to the configured bounds. */
export async function getAiConcurrencyLimit(): Promise<number> {
  return clampAiConcurrency((await getSiteSettings()).aiConcurrency);
}

async function acquire(limit: number): Promise<void> {
  if (active < limit) {
    active += 1;
    return;
  }
  // The releasing task hands its slot straight over, so `active` stays put.
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) next();
  else active -= 1;
}

/** Runs one provider-bound task through the queue. */
export async function withAiQueue<T>(
  task: () => Promise<T>,
  limit: number,
): Promise<T> {
  await acquire(limit);
  try {
    return await task();
  } finally {
    release();
  }
}
