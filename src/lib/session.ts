import 'server-only';

import { randomBytes } from 'node:crypto';
import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getAdminTokenVersion } from '@/db/queries/admin';
import { getOrCreateSessionSecret, getSiteSettings } from '@/db/queries/settings';
import { clampSessionMaxDays } from '@/types/nav';

/**
 * Stateless encrypted session cookie (iron-session). Do not read it from
 * middleware: the edge runtime lacks node:crypto.
 */

export type SessionData = {
  adminId?: string;
  username?: string;
  /**
   * `admins.token_version` this cookie was minted against; a mismatch rejects
   * it. Read as 0 when absent, matching the column default.
   */
  tokenVersion?: number;
};

export const SESSION_COOKIE_NAME = 'origaminav_session';

// Admin-configurable session lifetime (settings 安全 → 登录会话), cached for 60s.
const globalForSessionMaxDays = globalThis as unknown as {
  origaminavSessionMaxDays?: { value: number; resolvedAt: number };
};

async function resolveSessionMaxAgeSeconds(): Promise<number> {
  const cached = globalForSessionMaxDays.origaminavSessionMaxDays;
  if (cached && Date.now() - cached.resolvedAt < 60_000) {
    return cached.value * 24 * 60 * 60;
  }
  const settings = await getSiteSettings();
  const value = clampSessionMaxDays(settings.sessionMaxDays);
  globalForSessionMaxDays.origaminavSessionMaxDays = {
    value,
    resolvedAt: Date.now(),
  };
  return value * 24 * 60 * 60;
}

// ─── Session secret ──────────────────────────────────────────────────────────
//
// No SESSION_SECRET env var: the key is persisted in the database `secrets`
// table. Cached on globalThis; returns null when the DB is unreachable.

const globalForSecret = globalThis as unknown as {
  origaminavSessionSecret?: string;
};

let ephemeralWarningShown = false;

/** Returns the session cookie key, or null when no trustworthy key is available. */
export async function resolveSessionSecret(): Promise<string | null> {
  if (globalForSecret.origaminavSessionSecret) {
    return globalForSecret.origaminavSessionSecret;
  }

  const persisted = await getOrCreateSessionSecret(randomBytes(32).toString('hex'));
  if (persisted) {
    globalForSecret.origaminavSessionSecret = persisted;
    return persisted;
  }

  if (!process.env.DATABASE_URL) {
    if (!ephemeralWarningShown) {
      ephemeralWarningShown = true;
      console.warn(
        '[origaminav] DATABASE_URL is not configured — using an ephemeral\n' +
          '  session key. Admin login is non-functional until it is set.',
      );
    }
    return randomBytes(32).toString('hex');
  }

  return null;
}

export function sessionOptions(
  secret: string,
  maxAgeSeconds: number,
): SessionOptions {
  return {
    password: secret,
    cookieName: SESSION_COOKIE_NAME,
    // iron-session's own ttl; cookieOptions.maxAge does not affect sealing.
    ttl: maxAgeSeconds,
    cookieOptions: {
      // Prevents page scripts from reading the cookie.
      httpOnly: true,
      // Keeps the admin signed in after returning from an external link.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: maxAgeSeconds,
      path: '/',
    },
  };
}

/** Session accessor for write paths (login/logout); throws when no key exists. */
export async function getSession() {
  const secret = await resolveSessionSecret();
  if (!secret) {
    throw new Error(
      'The database is unreachable — sessions cannot be verified or issued.',
    );
  }
  const maxAgeSeconds = await resolveSessionMaxAgeSeconds();
  const cookieStore = await cookies();
  return getIronSession<SessionData>(
    cookieStore,
    sessionOptions(secret, maxAgeSeconds),
  );
}

/**
 * Read path; returns null when signed out, the DB is down, or the token
 * version mismatches. Request-scoped memoization: the admin layout and the
 * rendered page both verify, sharing one cookie decrypt and one DB roundtrip.
 */
export const getCurrentAdmin = cache(
  async (): Promise<{ adminId: string; username: string } | null> => {
    try {
      const session = await getSession();
      if (!session.adminId) return null;
      const storedVersion = await getAdminTokenVersion(session.adminId);
      // null covers a deleted row or unreachable database; both are unauthenticated.
      if (storedVersion === null || storedVersion !== (session.tokenVersion ?? 0)) {
        return null;
      }
      return { adminId: session.adminId, username: session.username ?? '' };
    } catch {
      return null;
    }
  },
);

export async function isAdmin(): Promise<boolean> {
  return (await getCurrentAdmin()) !== null;
}

/** Throws `UnauthorizedError` when the caller is not an admin. */
export async function requireAdminAction(): Promise<{
  adminId: string;
  username: string;
}> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new UnauthorizedError();
  }
  return admin;
}

/** Redirects to login when the caller is not an admin. For server components. */
export async function requireAdminPage(): Promise<{
  adminId: string;
  username: string;
}> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login?next=/admin');
  }
  return admin;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'UnauthorizedError';
  }
}
