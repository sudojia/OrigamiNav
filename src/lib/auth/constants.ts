/** Validation limits shared by server enforcement and client form hints. Client-safe. */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

export function validateUsernameFormat(
  username: string,
): { ok: true; normalized: string } | { ok: false; message: string } {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < USERNAME_MIN_LENGTH) {
    return { ok: false, message: `用户名至少 ${USERNAME_MIN_LENGTH} 位` };
  }
  if (normalized.length > USERNAME_MAX_LENGTH) {
    return { ok: false, message: `用户名最多 ${USERNAME_MAX_LENGTH} 位` };
  }
  if (!/^[a-z0-9._-]+$/.test(normalized)) {
    return { ok: false, message: '用户名只能包含小写字母、数字和 . _ -' };
  }
  return { ok: true, normalized };
}

export function validatePasswordFormat(
  password: string,
): { ok: true } | { ok: false; message: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `密码至少 ${PASSWORD_MIN_LENGTH} 位` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: `密码最多 ${PASSWORD_MAX_LENGTH} 位` };
  }
  if (password.includes('\u0000')) {
    return { ok: false, message: '密码不能包含空字符' };
  }
  return { ok: true };
}
