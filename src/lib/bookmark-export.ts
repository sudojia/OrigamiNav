import type { ExportPayload } from '@/db/queries/transfer';

/**
 * Renders the export payload as a Netscape bookmark file, the format browsers
 * import and export. Counterpart to `parseNetscapeBookmarks`: a file written
 * here reads back through the import wizard unchanged.
 */

/** Escapes the entities `decodeEntities` reads back; anything else is not symmetric. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Same, plus quotes: this value is an attribute value. */
function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Unix seconds, the only timestamp precision the format carries. */
function addDate(iso: string): string {
  return ` ADD_DATE="${Math.floor(Date.parse(iso) / 1000)}"`;
}

/**
 * One bookmark row. The `<DD>` is the line itself: the file's reader attaches a
 * description to the bookmark above it, never to a folder.
 */
function bookmarkLines(bookmark: {
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  createdAt: string;
  tags: string[];
}): string[] {
  // Tag names cannot contain commas, so the attribute splits back exactly.
  const tags = bookmark.tags.length
    ? ` TAGS="${escapeAttribute(bookmark.tags.join(','))}"`
    : '';
  const icon = bookmark.iconUrl
    ? ` ICON="${escapeAttribute(bookmark.iconUrl)}"`
    : '';

  const lines = [
    `        <DT><A HREF="${escapeAttribute(bookmark.url)}"${addDate(bookmark.createdAt)}${icon}${tags}>${escapeText(bookmark.title)}</A>`,
  ];
  if (bookmark.description) {
    lines.push(`        <DD>${escapeText(bookmark.description)}`);
  }
  return lines;
}

/** Whole file, CRLF-terminated the way browser exports are. */
export function toNetscapeBookmarks(payload: ExportPayload): string {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  for (const category of payload.categories) {
    // Categories carry no date of their own, so the folder has no ADD_DATE.
    lines.push(`    <DT><H3>${escapeText(category.name)}</H3>`);
    lines.push('    <DL><p>');
    for (const bookmark of category.bookmarks) {
      lines.push(...bookmarkLines(bookmark));
    }
    lines.push('    </DL><p>');
  }

  lines.push('</DL><p>');
  return `${lines.join('\r\n')}\r\n`;
}
