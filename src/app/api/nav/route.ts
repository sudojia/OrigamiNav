import { getNavData } from '@/db/queries/nav';

export const dynamic = 'force-dynamic';

/** Navigation payload for the client-side refetch. Response is no-store. */
export async function GET() {
  const nav = await getNavData();

  return Response.json(nav, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
