import 'server-only';

import { pinyinInitials, pinyinJoined, pinyinSpaced } from './pinyin';

/** Builds the lowercase, space-joined `bookmarks.search_index` used for client-side filtering. */

export type SearchIndexInput = {
  title: string;
  url: string;
  description?: string | null;
  tagNames?: string[] | null;
};

/** Returns the hostname with and without a leading www. */
function hostVariants(url: string): string[] {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const bare = host.replace(/^www\./, '');
    return host === bare ? [host] : [host, bare];
  } catch {
    return [];
  }
}

function pinyinVariants(text: string): string[] {
  if (!text) return [];
  const joined = pinyinJoined(text);
  if (!joined) return [];
  const spaced = pinyinSpaced(text);
  const initials = pinyinInitials(text);
  return [joined, spaced, initials].filter(Boolean);
}

export function buildSearchIndex(input: SearchIndexInput): string {
  const title = input.title.trim();
  const description = (input.description ?? '').trim();
  const tagNames = input.tagNames ?? [];

  const parts: string[] = [];

  if (title) {
    parts.push(title);
    // Whitespace-collapsed form.
    parts.push(title.replace(/\s+/g, ''));
    parts.push(...pinyinVariants(title));
  }

  if (description) {
    parts.push(description);
    parts.push(...pinyinVariants(description));
  }

  parts.push(...hostVariants(input.url));

  for (const tag of tagNames) {
    const name = tag.trim();
    if (!name) continue;
    parts.push(name);
    parts.push(...pinyinVariants(name));
  }

  const unique = [...new Set(parts.filter(Boolean).map((p) => p.toLowerCase()))];
  return unique.join(' ');
}
