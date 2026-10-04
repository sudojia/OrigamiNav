import 'server-only';

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/** Hashes passwords with node:crypto scrypt. */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const ALGORITHM = 'scrypt';
/** 128 * N * r = 32MB of work memory. */
const N = 32768;
const r = 8;
const p = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** scrypt maxmem; the 32MB default is below what N=32768, r=8 needs. */
const MAXMEM = 128 * 1024 * 1024;

export type PasswordHash = string;

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(normalize(password), salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: MAXMEM,
  });
  return [ALGORITHM, N, r, p, salt.toString('hex'), derived.toString('hex')].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;

  const derived = await scrypt(
    normalize(password),
    Buffer.from(parsed.salt, 'hex'),
    parsed.keyLength,
    { N: parsed.N, r: parsed.r, p: parsed.p, maxmem: MAXMEM },
  );

  const expected = Buffer.from(parsed.hash, 'hex');
  // timingSafeEqual requires equal lengths; mismatched parameters return false.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** True when a stored hash used weaker parameters than the current ones. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  if (!parsed) return true;
  return (
    parsed.algorithm !== ALGORITHM ||
    parsed.N < N ||
    parsed.r < r ||
    parsed.p < p ||
    parsed.keyLength < KEY_LENGTH
  );
}

type ParsedHash = {
  algorithm: string;
  N: number;
  r: number;
  p: number;
  salt: string;
  hash: string;
  keyLength: number;
};

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6) return null;
  const [algorithm, n, rr, pp, salt, hash] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (algorithm !== ALGORITHM) return null;

  const params = [n, rr, pp].map((v) => Number.parseInt(v, 10));
  if (params.some((v) => !Number.isInteger(v) || v <= 0)) return null;
  if (!/^[0-9a-f]+$/i.test(salt) || !/^[0-9a-f]+$/i.test(hash)) return null;

  return {
    algorithm,
    N: params[0] as number,
    r: params[1] as number,
    p: params[2] as number,
    salt,
    hash,
    keyLength: hash.length / 2,
  };
}

/** NFKC-normalizes a password and strips NUL bytes. */
function normalize(password: string): string {
  return password.normalize('NFKC').replace(/\u0000/g, '');
}

// Re-exports from ./constants for server-side importers.
export {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validatePasswordFormat as validatePasswordStrength,
  validateUsernameFormat as validateUsername,
} from './constants';
