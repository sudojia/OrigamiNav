import { getCurrentAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Reports whether the caller is a signed-in admin. Response is no-store. */
export async function GET() {
  let admin: { adminId: string; username: string } | null = null;

  try {
    admin = await getCurrentAdmin();
  } catch {
    // Fall back to null on error.
    admin = null;
  }

  return Response.json(
    { isAdmin: admin !== null, username: admin?.username ?? null },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
