import { getNavData } from '@/db/queries/nav';
import { isAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Navigation payload for the client-side refetch. Signed-in admins receive
 * hidden rows as well; public callers get only visible data. `no-store` plus
 * `Vary: Cookie` keeps a CDN from serving one visitor's payload to another.
 */
export async function GET() {
  const nav = await getNavData({ includeHidden: await isAdmin() });

  return Response.json(nav, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      Vary: 'Cookie',
    },
  });
}
