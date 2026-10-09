import { getBookmarkIconTarget } from '@/db/queries/bookmarks';
import { resolveIcon } from '@/lib/icon-cache';
import { hostnameOf } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** The site may publish a favicon at any time, so a miss is cached briefly. */
const MISS_CACHE_CONTROL = 'public, max-age=1800';

/** The server row expires long before this; browsers revalidate daily. */
const HIT_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=2592000';

/** Sandboxed like the uploaded site icon: an SVG is a document, not an image. */
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

function miss(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': MISS_CACHE_CONTROL },
  });
}

/**
 * Serves a bookmark favicon from the local cache, fetching it on first use.
 * The bookmark decides what may be fetched: `b` must name a live bookmark whose
 * own host is the one requested, so a caller cannot make the server fetch and
 * store an icon for a host it names. The manual icon URL therefore comes from
 * the database rather than from the request.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const host = (await params).host.toLowerCase();
  const bookmarkId = new URL(request.url).searchParams.get('b');
  const bookmark = bookmarkId ? await getBookmarkIconTarget(bookmarkId) : null;

  if (!bookmark || hostnameOf(bookmark.url) !== host) return miss();

  const icon = await resolveIcon(host, bookmark.iconUrl);
  if (!icon) return miss();

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
