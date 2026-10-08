import { getSiteSettings } from '@/db/queries/settings';

// Reached through the /<key>.txt rewrite in next.config.ts.
export const dynamic = 'force-dynamic';

/** IndexNow ownership file: the configured key and nothing else. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key: requested } = await params;
  const settings = await getSiteSettings();

  if (!settings.indexNowKey || requested !== settings.indexNowKey) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(settings.indexNowKey, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
