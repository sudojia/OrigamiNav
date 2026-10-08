/**
 * Client-side search-term highlighting. Bookmark matching runs on the server
 * (see `searchBookmarks`), because shipping every `search_index` to the browser
 * costs ~3x the source text and dominated the nav payload.
 */

/**
 * Compiles query terms into one case-insensitive regex with a single capture
 * group, shared by every card's highlighter; null when there is nothing to
 * highlight. Escapes each term, so the pattern can never be malformed.
 */
export function buildHighlightRegex(terms: string[]): RegExp | null {
  const escaped = terms
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return null;
  return new RegExp(`(${escaped.join('|')})`, 'gi');
}
