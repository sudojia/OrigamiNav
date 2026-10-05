import { requireAdminAction, UnauthorizedError } from '@/lib/session';

import type { ActionState } from '@/actions/auth';

/**
 * Auth guards for Server Actions: return a login-expired result on
 * `UnauthorizedError`, rethrow anything else.
 */

/** Returns null when authorized, otherwise the `ActionState` to return. */
export async function guardAction(): Promise<ActionState | null> {
  try {
    await requireAdminAction();
    return null;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ok: false, message: '登录已过期，请重新登录' };
    }
    throw error;
  }
}

/** For actions that also need the caller's identity. */
export async function guardActionWithAdmin(): Promise<
  { ok: true; adminId: string; username: string } | { ok: false; message: string }
> {
  try {
    const admin = await requireAdminAction();
    return { ok: true, adminId: admin.adminId, username: admin.username };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ok: false, message: '登录已过期，请重新登录' };
    }
    throw error;
  }
}
