import { Download, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { backupSummary, type BackupStatus } from '@/lib/backup-status';

/** Dashboard nudge; renders nothing while the last export is fresh. */
export function BackupReminder({ status }: { status: BackupStatus }) {
  if (!status.overdue) return null;

  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-amber-500/30 bg-amber-500/5 px-5 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
        <TriangleAlert className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
          备份提醒
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {backupSummary(status)}
          ，建议导出一份保存到本地，避免误删或数据库故障后无法恢复。
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/import">导入 / 导出</Link>
        </Button>
        <Button asChild size="sm">
          <a href="/api/export" download>
            <Download className="size-4" />
            立即导出
          </a>
        </Button>
      </div>
    </section>
  );
}
