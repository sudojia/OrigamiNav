import 'server-only';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';

import { db, isDatabaseAvailable, errorMessage } from './client';

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

/** Retry delays (ms) for a database that is still starting. */
const RETRY_DELAYS_MS = [0, 5_000, 15_000];

/** Applies pending migrations from ./drizzle at boot. */
export function runMigrationsAtBoot(): void {
  if (!isDatabaseAvailable()) return;

  void (async () => {
    for (const [attempt, delay] of RETRY_DELAYS_MS.entries()) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      try {
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
        console.log('[origaminav] database schema is up to date.');
        return;
      } catch (error) {
        const last = attempt === RETRY_DELAYS_MS.length - 1;
        console.error(
          `[origaminav] schema migration failed (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length}): ${errorMessage(error)}${last ? '\n  The site will render its empty state until the database is reachable and the app is restarted.' : ''}`,
        );
      }
    }
  })();
}
