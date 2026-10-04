import { decodeEntities, isValidHttpUrl, sanitizeScrapedText } from '@/lib/utils';

/**
 * Parses the Netscape bookmark HTML format (`<H3>` folders, `<A HREF>` links,
 * `<DD>` descriptions). Client-safe: runs in the browser import wizard.
 */

export type ParsedImportBookmark = {
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  /** Nearest enclosing folder name; '' for the root level. */
  folder: string;
  /** ISO date from ADD_DATE, or null. */
  createdAt: string | null;
  tags: string[];
};

const TOKEN_RE =
  /<DL\b[^>]*>|<\/DL\b[^>]*>|<H3\b([^>]*)>([\s\S]*?)<\/H3>|<A\b([^>]*)>([\s\S]*?)<\/A>|<DD\b[^>]*>([\s\S]*?)(?=\s*<|$)/gi;

function attributeOf(attrs: string, name: string): string | null {
  const match = attrs.match(
    new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  );
  if (!match) return null;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '').trim();
}

function addDateToIso(raw: string | null): string | null {
  if (!raw) return null;
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseNetscapeBookmarks(html: string): ParsedImportBookmark[] {
  const results: ParsedImportBookmark[] = [];
  // Folder names per <DL> depth; a pending <H3> names the next <DL>.
  const stack: string[] = [];
  let pendingFolder = '';
  let lastBookmark: ParsedImportBookmark | null = null;

  for (const match of html.matchAll(TOKEN_RE)) {
    const [token, , h3Text, aAttrs, aText, ddText] = match;
    const upper = token.slice(0, 3).toUpperCase();

    if (upper === '<DL') {
      stack.push(pendingFolder);
      pendingFolder = '';
      lastBookmark = null;
    } else if (upper === '</D') {
      stack.pop();
      lastBookmark = null;
    } else if (upper === '<H3') {
      pendingFolder = sanitizeScrapedText(decodeEntities(h3Text ?? ''), 40);
    } else if (upper.startsWith('<A')) {
      const href = attributeOf(aAttrs ?? '', 'HREF');
      const rawTitle = sanitizeScrapedText(decodeEntities(aText ?? ''), 100);
      if (!href || !isValidHttpUrl(href)) {
        // place:/javascript:/about: links and malformed rows are skipped.
        lastBookmark = null;
        continue;
      }
      const icon = attributeOf(aAttrs ?? '', 'ICON');
      let iconUrl: string | null = null;
      if (icon && isValidHttpUrl(icon)) {
        // Rejects data: URIs.
        iconUrl = icon.slice(0, 2048);
      }
      const tagsAttr = attributeOf(aAttrs ?? '', 'TAGS');
      const bookmark: ParsedImportBookmark = {
        title: rawTitle || new URL(href).hostname,
        url: href.slice(0, 2048),
        description: '',
        iconUrl,
        folder: stack[stack.length - 1] ?? '',
        createdAt: addDateToIso(attributeOf(aAttrs ?? '', 'ADD_DATE')),
        tags: (tagsAttr ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
      };
      results.push(bookmark);
      lastBookmark = bookmark;
    } else if (upper === '<DD') {
      // A <DD> describes the bookmark that precedes it.
      if (lastBookmark && ddText) {
        lastBookmark.description = sanitizeScrapedText(
          decodeEntities(ddText),
          300,
        );
      }
    }
  }

  return results;
}

/** Splits pasted text into unique http(s) URLs; remainder of each line becomes the title. */
export function parsePastedUrls(
  text: string,
): Array<{ url: string; title: string }> {
  const seen = new Set<string>();
  const results: Array<{ url: string; title: string }> = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [head, ...rest] = line.split(/[\s,，]+/);
    const candidate = head ?? '';
    if (!isValidHttpUrl(candidate)) continue;
    const url = candidate.slice(0, 2048);
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({
      url,
      title: sanitizeScrapedText(rest.join(' '), 100),
    });
  }

  return results;
}
