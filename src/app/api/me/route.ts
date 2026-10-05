import { getNavData } from '@/db/queries/nav';
import { getCurrentAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Session probe for the public page. A signed-in admin also receives the full
 * nav payload (hidden rows included) in the same response, so the page can
 * render hidden rows without a second round trip; anonymous callers get the
 * flag only and no bookmark data. `no-store` plus `Vary: Cookie` keeps a CDN
 * from serving one visitor's payload to another.
 */
export async function GET() {
  let admin: { adminId: string; username: string } | null = null;

  try {
    admin = await getCurrentAdmin();
  } catch {
    // Fall back to null on error.
    admin = null;
  }

  const nav = admin ? await getNavData({ includeHidden: true }) : null;

  return Response.json(
    {
      isAdmin: admin !== null,
      username: admin?.username ?? null,
      ...(nav ? { nav } : {}),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        Vary: 'Cookie',
      },
    },
  );
}
