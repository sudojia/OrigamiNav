import 'server-only';

import { pinyin } from 'pinyin-pro';

import { SLUG_BASE_MAX } from '@/types/nav';

/**
 * Server-only pinyin helpers; the pinyin-pro dictionary stays off the client
 * bundle. Scripts reusing this module must run with `--conditions=react-server`.
 */

const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export function containsCjk(text: string): boolean {
  return CJK_CHAR.test(text);
}

type Segment = { text: string; cjk: boolean };

/** Splits text into single CJK characters and maximal non-CJK runs, in order. */
function segment(text: string): Segment[] {
  const out: Segment[] = [];
  let run = '';
  for (const char of text) {
    const cjk = CJK_CHAR.test(char);
    if (cjk) {
      if (run) {
        out.push({ text: run, cjk: false });
        run = '';
      }
      out.push({ text: char, cjk: true });
    } else {
      run += char;
    }
  }
  if (run) out.push({ text: run, cjk: false });
  return out;
}

export type PinyinParts = {
  /** Full syllables for CJK characters only, in order. 百度 -> ['bai','du'] */
  syllables: string[];
  /** Initial letters for CJK characters only, in order. 百度 -> ['b','d'] */
  initials: string[];
};

const EMPTY: PinyinParts = { syllables: [], initials: [] };

/** Returns syllables and initials for CJK characters, passing the whole string to pinyin-pro. */
export function pinyinParts(text: string): PinyinParts {
  if (!text || !containsCjk(text)) return EMPTY;

  const segments = segment(text);
  const full = pinyin(text, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
  }) as string[];
  const first = pinyin(text, {
    pattern: 'first',
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
  }) as string[];

  // On segment/entry mismatch, return empty.
  if (full.length !== segments.length || first.length !== segments.length) {
    console.warn(
      `[origaminav] pinyin segment alignment failed for ${JSON.stringify(text)} ` +
        `(${segments.length} segments, ${full.length}/${first.length} entries)`,
    );
    return EMPTY;
  }

  const syllables: string[] = [];
  const initials: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (!segments[i]?.cjk) continue;
    const s = full[i];
    const f = first[i];
    if (s) syllables.push(s);
    if (f) initials.push(f);
  }
  return { syllables, initials };
}

// ── ASCII slugs ──────────────────────────────────────────────────────────────

/**
 * Shared normalization for slug output: NFKC fold, lowercase, strip quotes,
 * collapse every non letter/number run into `-`, trim, cap at SLUG_BASE_MAX.
 */
function normalizeSlug(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/['"’“”]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_BASE_MAX);
}

/**
 * ASCII-only slug for anchors and URLs. CJK characters are transliterated to
 * pinyin syllables ("学习充电" -> "xue-xi-chong-dian", "AI 工具" -> "ai-gong-ju")
 * so slugs stay copy-paste clean without percent encoding. Returns an empty
 * string when nothing survives (e.g. emoji-only names) for the caller to
 * fall back on.
 */
export function slugify(input: string): string {
  const source = containsCjk(input)
    ? (pinyin(input, { toneType: 'none', type: 'string', nonZh: 'consecutive' }) as string)
    : input;
  return normalizeSlug(source);
}

/** Falls back to an id-derived slug when the name slugs to empty. */
export function slugifyUnique(input: string, id: string): string {
  const base = slugify(input);
  if (base) return base;
  return `item-${id.slice(-6)}`;
}
