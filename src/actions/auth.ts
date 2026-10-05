'use server';

import { isIP } from 'node:net';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { guardActionWithAdmin } from '@/lib/action-guard';
import { bumpAdminTokenVersion, countAdmins, createAdmin, getAdminByUsername, updatePassword } from '@/db/queries/admin';
import {
  claimInstallLock,
  getSiteSettings,
  releaseInstallLock,
  SETTING_KEYS,
  setSettings,
} from '@/db/queries/settings';
import { errorMessage } from '@/db/client';
import {
  hashPassword,
  needsRehash,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePasswordStrength,
  validateUsername,
  verifyPassword,
} from '@/lib/auth/password';
import { nowIso } from '@/lib/ids';
import { revalidateSite } from '@/lib/revalidate';
import { sanitizeNext } from '@/lib/safe-redirect';
import { getSession } from '@/lib/session';
import { LIMITS } from '@/lib/validation';

export type ActionState = {
  ok: boolean;
  message: string;
  field?: string;
};

// ─── Login rate limit ────────────────────────────────────────────────────────

/** Login attempt window and per-key attempt buckets. */
const LOGIN_RATE_WINDOW_MS = 60_000;
const loginBuckets = new Map<string, number[]>();

/** Max size of the login bucket map. */
const LOGIN_BUCKETS_MAX = 1_000;

/** Token bucket for scrypt work: burst 30, refill 2/s. */
const LOGIN_HASH_BURST = 30;
const LOGIN_HASH_REFILL_PER_MS = 2 / 1000;
const loginHashBudget = { tokens: LOGIN_HASH_BURST, updatedAt: Date.now() };

/** Consumes one budget token; false means refuse. */
function consumeLoginHashBudget(): boolean {
  const now = Date.now();
  const elapsed = now - loginHashBudget.updatedAt;
  if (elapsed > 0) {
    loginHashBudget.tokens = Math.min(
      LOGIN_HASH_BURST,
      loginHashBudget.tokens + elapsed * LOGIN_HASH_REFILL_PER_MS,
    );
    loginHashBudget.updatedAt = now;
  }
  if (loginHashBudget.tokens < 1) return false;
  loginHashBudget.tokens -= 1;
  return true;
}

// Caches the admin-configurable login limit for 60 seconds.
let loginRateLimitCache: { value: number; resolvedAt: number } | null = null;

async function resolveLoginRateLimit(): Promise<number> {
  const cached = loginRateLimitCache;
  if (cached && Date.now() - cached.resolvedAt < 60_000) {
    return cached.value;
  }
  const settings = await getSiteSettings();
  loginRateLimitCache = {
    value: settings.loginRateLimit,
    resolvedAt: Date.now(),
  };
  return settings.loginRateLimit;
}

/** Returns whether `key` is over the limit this window; records nothing. */
async function loginThrottled(key: string): Promise<boolean> {
  const max = await resolveLoginRateLimit();
  const times = loginBuckets.get(key);
  if (!times?.length) return false;
  const now = Date.now();
  const fresh = times.filter((t) => now - t < LOGIN_RATE_WINDOW_MS);
  if (fresh.length !== times.length) {
    if (fresh.length) loginBuckets.set(key, fresh);
    else loginBuckets.delete(key);
  }
  return fresh.length >= max;
}

/** Records one attempt against `key`. */
function recordLoginAttempt(key: string): void {
  const now = Date.now();
  const bucket = (loginBuckets.get(key) ?? []).filter(
    (t) => now - t < LOGIN_RATE_WINDOW_MS,
  );
  bucket.push(now);
  loginBuckets.set(key, bucket);

  if (loginBuckets.size > LOGIN_BUCKETS_MAX) {
    // Evicts the least recently seen keys down to half capacity.
    const byOldest = [...loginBuckets.entries()].sort(
      (a, b) => (a[1][a[1].length - 1] ?? 0) - (b[1][b[1].length - 1] ?? 0),
    );
    const excess = loginBuckets.size - Math.floor(LOGIN_BUCKETS_MAX / 2);
    for (const [oldest] of byOldest.slice(0, excess)) {
      loginBuckets.delete(oldest);
    }
  }
}

/** Returns `ip:<addr>` from x-real-ip when TRUSTED_PROXY=true, else null. */
async function loginClientKey(): Promise<string | null> {
  if (process.env.TRUSTED_PROXY !== 'true') return null;
  const headerList = await headers();
  // Accepts only a bare IP address.
  const real = headerList.get('x-real-ip')?.trim();
  if (!real || isIP(real) === 0) return null;
  return `ip:${real}`;
}

const installSchema = z.object({
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH, `用户名至少 ${USERNAME_MIN_LENGTH} 位`)
    .max(USERNAME_MAX_LENGTH, `用户名最多 ${USERNAME_MAX_LENGTH} 位`),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `密码至少 ${PASSWORD_MIN_LENGTH} 位`)
    .max(PASSWORD_MAX_LENGTH, `密码最多 ${PASSWORD_MAX_LENGTH} 位`),
  confirmPassword: z.string(),
  siteName: z.string().trim().max(LIMITS.siteName).optional().default(''),
  tagline: z.string().trim().max(LIMITS.tagline).optional().default(''),
});

/** First-run install; creates the admin account and sets the install flag. */
export async function installAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = installSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    siteName: formData.get('siteName') ?? '',
    tagline: formData.get('tagline') ?? '',
  });

  if (!parsed.success) {
    return {
      ok: false,
      field: parsed.error.issues[0]?.path[0]?.toString(),
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }

  const { username, password, confirmPassword, siteName, tagline } = parsed.data;

  if (password !== confirmPassword) {
    return { ok: false, field: 'confirmPassword', message: '两次输入的密码不一致' };
  }

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.ok) {
    return { ok: false, field: 'username', message: usernameCheck.message };
  }
  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.ok) {
    return { ok: false, field: 'password', message: passwordCheck.message };
  }

  // Refuses install when an admin already exists.
  if ((await countAdmins()) > 0) {
    return {
      ok: false,
      message: '站点已初始化。如需重设密码，请直接登录或清空 admins 表。',
    };
  }

  let claimed = false;
  try {
    claimed = await claimInstallLock();
  } catch (error) {
    return {
      ok: false,
      message: `无法连接数据库：${errorMessage(error)}`,
    };
  }

  if (!claimed) {
    return {
      ok: false,
      message: '站点刚刚已被初始化，请直接登录。',
    };
  }

  let adminCreated = false;
  try {
    const passwordHash = await hashPassword(password);
    const admin = await createAdmin({
      username: usernameCheck.normalized,
      passwordHash,
    });
    adminCreated = true;

    const settings: Record<string, string> = {
      [SETTING_KEYS.installedAt]: nowIso(),
    };
    if (siteName) settings[SETTING_KEYS.siteName] = siteName;
    if (tagline) settings[SETTING_KEYS.tagline] = tagline;
    await setSettings(settings);

    const session = await getSession();
    session.adminId = admin.id;
    session.username = admin.username;
    session.tokenVersion = admin.tokenVersion;
    await session.save();

    revalidateSite();
  } catch (error) {
    // Releases the install lock only when no admin was created.
    if (!adminCreated) {
      await releaseInstallLock().catch(() => {});
    }
    return { ok: false, message: `初始化失败：${errorMessage(error)}` };
  }

  redirect('/admin?installed=1');
}

const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

export async function loginAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      field: parsed.error.issues[0]?.path[0]?.toString(),
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }

  const username = parsed.data.username;
  const normalized = username.toLowerCase();
  // One generic message for every failure path.
  const invalid = '用户名或密码不正确';

  // Throttles before any database or scrypt work.
  const clientKey = await loginClientKey();
  if (clientKey) {
    if (await loginThrottled(clientKey)) {
      return { ok: false, message: '尝试过于频繁，请稍后再试' };
    }
    recordLoginAttempt(clientKey);
  }

  const userKey = `user:${normalized}`;
  if (await loginThrottled(userKey)) {
    return { ok: false, message: '尝试过于频繁，请稍后再试' };
  }

  // Checks the global hash budget before the database read and scrypt round.
  if (!consumeLoginHashBudget()) {
    return { ok: false, message: '尝试过于频繁，请稍后再试' };
  }

  const admin = await getAdminByUsername(normalized);

  if (!admin) {
    // Burns a hashing round to keep timing uniform.
    await verifyPassword(parsed.data.password, DUMMY_HASH);
    recordLoginAttempt(userKey);
    return { ok: false, message: invalid };
  }

  const passwordValid = await verifyPassword(parsed.data.password, admin.passwordHash);
  if (!passwordValid) {
    recordLoginAttempt(userKey);
    return { ok: false, message: invalid };
  }

  // Rehashes when the stored hash predates the current parameters.
  if (needsRehash(admin.passwordHash)) {
    try {
      await updatePassword(admin.id, await hashPassword(parsed.data.password));
    } catch {
      // Ignores a failed rehash.
    }
  }

  try {
    const session = await getSession();
    session.adminId = admin.id;
    session.username = admin.username;
    // Stores the account's current token version in the session.
    session.tokenVersion = admin.tokenVersion;
    await session.save();
  } catch {
    // Refuses login when the session cannot be saved.
    return { ok: false, message: '数据库暂时不可用，请稍后重新登录' };
  }

  revalidateSite();

  // Sanitises the `next` redirect target.
  redirect(sanitizeNext(formData.get('next')));
}

/** Precomputed scrypt hash used to keep login timing uniform. */
const DUMMY_HASH =
  'scrypt$32768$8$1$00000000000000000000000000000000$' +
  '0'.repeat(128);

export async function logoutAction(): Promise<void> {
  try {
    const session = await getSession();
    session.destroy();
  } catch {
    // Database unreachable; the session is inert. Redirects anyway.
  }
  revalidateSite();
  redirect('/login?loggedOut=1');
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `新密码至少 ${PASSWORD_MIN_LENGTH} 位`)
    .max(PASSWORD_MAX_LENGTH, `新密码最多 ${PASSWORD_MAX_LENGTH} 位`),
  confirmPassword: z.string(),
});

export async function changePasswordAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const auth = await guardActionWithAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      field: parsed.error.issues[0]?.path[0]?.toString(),
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }

  const { currentPassword, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return { ok: false, field: 'confirmPassword', message: '两次输入的新密码不一致' };
  }
  if (newPassword === currentPassword) {
    return { ok: false, field: 'newPassword', message: '新密码不能与当前密码相同' };
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) {
    return { ok: false, field: 'newPassword', message: strength.message };
  }

  try {
    const record = await getAdminByUsername(auth.username);
    if (!record) {
      return { ok: false, message: '账号不存在，可能已被删除' };
    }
    const valid = await verifyPassword(currentPassword, record.passwordHash);
    if (!valid) {
      return { ok: false, field: 'currentPassword', message: '当前密码不正确' };
    }
    await updatePassword(record.id, await hashPassword(newPassword));

    // Bumps the token version and re-saves this session with the new one.
    const tokenVersion = await bumpAdminTokenVersion(record.id);
    const session = await getSession();
    session.tokenVersion = tokenVersion;
    await session.save();
  } catch (error) {
    return { ok: false, message: `修改失败：${errorMessage(error)}` };
  }

  return { ok: true, message: '密码已更新' };
}
