import { z } from 'zod';

import { markBackupExported } from '@/db/queries/settings';
import { exportAllData } from '@/db/queries/transfer';
import { toNetscapeBookmarks } from '@/lib/bookmark-export';
import { getCurrentAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' } as const;

/** `json` is the restorable backup; `html` is the browser bookmark format. */
const formatSchema = z.enum(['json', 'html']).default('json');

/** GET /api/export[?format=json|html] — admin only. */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const parsed = formatSchema.safeParse(
    new URL(request.url).searchParams.get('format') ?? undefined,
  );
  if (!parsed.success) {
    return Response.json(
      { error: '导出格式无效' },
      { status: 400, headers: NO_STORE },
    );
  }

  const payload = await exportAllData();
  if (!payload) {
    return Response.json(
      { error: '数据库不可用，无法导出' },
      { status: 503, headers: NO_STORE },
    );
  }

  const date = new Date().toISOString().slice(0, 10);

  if (parsed.data === 'html') {
    // No markBackupExported: the HTML loses every private flag, so treating it
    // as the backup would silence the reminder that a restorable one is due.
    return new Response(toNetscapeBookmarks(payload), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="origaminav-bookmarks-${date}.html"`,
        ...NO_STORE,
      },
    });
  }

  await markBackupExported();

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="origaminav-export-${date}.json"`,
      ...NO_STORE,
    },
  });
}
