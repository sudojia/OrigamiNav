import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { newId, nowIso } from '@/lib/ids';

import { db, safeQuery } from '../client';
import { admins, type Admin } from '../schema';

export async function getAdminByUsername(username: string): Promise<Admin | null> {
  return safeQuery(
    'getAdminByUsername',
    async (database) => {
      const rows = await database
        .select()
        .from(admins)
        .where(eq(admins.username, username.toLowerCase()))
        .limit(1);
      return rows[0] ?? null;
    },
    null,
  );
}

export async function countAdmins(): Promise<number> {
  return safeQuery(
    'countAdmins',
    async (database) => {
      const rows = await database
        .select({ n: sql<number>`count(*)::int` })
        .from(admins);
      return rows[0]?.n ?? 0;
    },
    0,
  );
}

export async function createAdmin(input: {
  username: string;
  passwordHash: string;
}): Promise<Admin> {
  const stamp = nowIso();
  const rows = await db
    .insert(admins)
    .values({
      id: newId(),
      username: input.username.toLowerCase(),
      passwordHash: input.passwordHash,
      createdAt: stamp,
    })
    .returning();
  const created = rows[0];
  if (!created) throw new Error('Failed to create admin');
  return created;
}

export async function updatePassword(
  adminId: string,
  passwordHash: string,
): Promise<void> {
  await db
    .update(admins)
    .set({ passwordHash })
    .where(eq(admins.id, adminId));
}

/** Session-revocation counter, or null when unavailable. */
export async function getAdminTokenVersion(
  adminId: string,
): Promise<number | null> {
  return safeQuery(
    'getAdminTokenVersion',
    async (database) => {
      const rows = await database
        .select({ tokenVersion: admins.tokenVersion })
        .from(admins)
        .where(eq(admins.id, adminId))
        .limit(1);
      return rows[0]?.tokenVersion ?? null;
    },
    null,
  );
}

/** Increments the token version and returns the new value. */
export async function bumpAdminTokenVersion(adminId: string): Promise<number> {
  const rows = await db
    .update(admins)
    .set({ tokenVersion: sql`${admins.tokenVersion} + 1` })
    .where(eq(admins.id, adminId))
    .returning({ tokenVersion: admins.tokenVersion });
  const bumped = rows[0];
  if (!bumped) throw new Error('Failed to bump token version');
  return bumped.tokenVersion;
}
