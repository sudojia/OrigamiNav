import { getBookmarkIconUrl } from '@/db/queries/bookmarks';
import { resolveIcon } from '@/lib/icon-cache';

export const dynamic = 'force-dynamic';

/** Misses are cached briefly: the site may publish a favicon at any time. */
const MISS_CACHE_CONTROL = 'public, max-age=1800';

/** The server row expires long before this; browsers revalidate daily. */
const HIT_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=2592000';

/** Sandboxed like the uploaded site icon: an SVG is a document, not an image. */
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * Serves a bookmark favicon from the local cache, fetching it on first use.
 * `b` names the bookmark, so a manual icon URL is taken from the database
 * rather than from the request.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const { host } = await params;
  const bookmarkId = new URL(request.url).searchParams.get('b');
  const manualUrl = bookmarkId ? await getBookmarkIconUrl(bookmarkId) : null;
  const icon = await resolveIcon(host.toLowerCase(), manualUrl);

  if (!icon) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': MISS_CACHE_CONTROL },
    });
  }

  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      'Content-Type': icon.mimeType,
      'Content-Length': String(icon.bytes.byteLength),
      'Cache-Control': HIT_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
      ...(icon.mimeType === 'image/svg+xml'
        ? { 'Content-Security-Policy': SVG_CSP }
        : {}),
    },
  });
}
