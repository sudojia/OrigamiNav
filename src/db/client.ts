import 'server-only';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

/** Transaction handle; same query surface, minus the ability to nest. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Cached on globalThis so dev hot reloads reuse one pool. */
const globalForDb = globalThis as unknown as {
  origamiNavPool?: pg.Pool;
  origamiNavDb?: Database;
};

function buildPoolConfig(connectionString: string): pg.PoolConfig {
  return {
    connectionString,
    max: 5,
    // Keep idle connections warm; a cold reconnect to a remote DB
    // costs TCP + TLS + auth round trips.
    idleTimeoutMillis: 300_000,
    connectionTimeoutMillis: 10_000,
    // Lets the process exit with idle connections still open.
    allowExitOnIdle: true,
  };
}

/** Creates the database handle from a connection string. */
export function createDb(connectionString: string): Database {
  const pool = new pg.Pool(buildPoolConfig(connectionString));
  // Logs idle-connection errors from the pool.
  pool.on('error', (error) => {
    console.warn(
      `[origaminav] idle database connection lost: ${rootCauseMessage(error)}`,
    );
  });
  return drizzle(pool, { schema, logger: process.env.DRIZZLE_LOG === 'true' });
}

function getDb(): Database | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Returns null when DATABASE_URL is unset; callers degrade to empty results.
    warnOnce(
      'DATABASE_URL is not set. Pages will render empty until it is configured.',
    );
    return null;
  }

  if (!globalForDb.origamiNavDb) {
    globalForDb.origamiNavDb = createDb(connectionString);
  }
  return globalForDb.origamiNavDb;
}

let warned = false;
function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(`[origaminav] ${message}`);
}

/** Database handle resolved lazily on each access. */
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    const instance = getDb();
    if (!instance) {
      // Returns a throwing stub when no database is configured.
      return () => {
        throw new DatabaseUnavailableError();
      };
    }
    const value = Reflect.get(instance, prop, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export class DatabaseUnavailableError extends Error {
  constructor() {
    super(
      'DATABASE_URL is not configured. Copy .env.example to .env and set it.',
    );
    this.name = 'DatabaseUnavailableError';
  }
}

/** True when a database handle is usable. */
export function isDatabaseAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL) && getDb() !== null;
}

/** Runs a query, returning the fallback on any failure. */
export async function safeQuery<T>(
  label: string,
  fn: (db: Database) => Promise<T>,
  fallback: T,
): Promise<T> {
  const instance = getDb();
  if (!instance) return fallback;
  try {
    return await fn(instance);
  } catch (error) {
    logQueryFailure(label, error);
    return fallback;
  }
}

/** Tracks recent failures to dedupe logs within a 10s window. */
const recentFailures = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;

function logQueryFailure(label: string, error: unknown) {
  const detail = rootCauseMessage(error);
  const key = `${label}:${detail}`;
  const now = Date.now();
  const last = recentFailures.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recentFailures.set(key, now);
  if (recentFailures.size > 100) recentFailures.clear();
  console.error(`[origaminav] ${label} failed: ${detail}`);
}

function rootCauseMessage(error: unknown): string {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (
    current instanceof Error &&
    current.cause &&
    !seen.has(current.cause) &&
    seen.size < 5
  ) {
    seen.add(current.cause);
    current = current.cause;
  }
  if (current instanceof Error) {
    // Strips Drizzle's SQL/params wrapper from the message.
    return current.message.split('\n')[0]?.trim() || current.name;
  }
  return String(current);
}

export function errorMessage(error: unknown): string {
  return rootCauseMessage(error);
}

/** Postgres error code (e.g. "23503" FK violation) from the error chain. */
export function pgErrorCode(error: unknown): string | null {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = current.cause;
  }
  return null;
}
