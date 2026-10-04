import 'server-only';

import { pinyin } from 'pinyin-pro';

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

/** "百度" -> "bai du" */
export function pinyinSpaced(text: string): string {
  return pinyinParts(text).syllables.join(' ');
}

/** "百度" -> "baidu" */
export function pinyinJoined(text: string): string {
  return pinyinParts(text).syllables.join('');
}

/** "百度" -> "bd" */
export function pinyinInitials(text: string): string {
  return pinyinParts(text).initials.join('');
}
