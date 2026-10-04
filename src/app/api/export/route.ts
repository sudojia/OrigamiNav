import { exportAllData } from '@/db/queries/transfer';
import { getCurrentAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** GET /api/export — full JSON backup download, admin only. */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const payload = await exportAllData();
  if (!payload) {
    return Response.json(
      { error: '数据库不可用，无法导出' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify(payload, null, 2);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="origaminav-export-${date}.json"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
