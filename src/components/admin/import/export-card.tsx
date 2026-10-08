import { Download, FolderTree, Link2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { backupSummary, type BackupStatus } from '@/lib/backup-status';
import { cn } from '@/lib/utils';

// ── Side rail ────────────────────────────────────────────────────────────────

export function ExportCard({
  counts,
  status,
}: {
  counts: { categories: number; bookmarks: number };
  status: BackupStatus;
}) {
  return (
    <section className="rounded-card border bg-card shadow-card">
      <div className="flex items-center gap-3 px-5 pt-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
          <Download className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-medium">导出备份</h2>
          <p className="text-xs text-muted-foreground">随时带走全部内容</p>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-2 gap-2">
          <StatTile Icon={FolderTree} label="现有分类" value={counts.categories} />
          <StatTile Icon={Link2} label="现有书签" value={counts.bookmarks} />
        </div>

        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed',
            status.overdue
              ? 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-500'
              : 'border-border/60 bg-muted/40 text-muted-foreground',
          )}
        >
          {status.overdue ? (
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : null}
          <span>
            {backupSummary(status)}
            {status.overdue ? '，建议导出一份保存到本地。' : null}
          </span>
        </div>

        <Button asChild className="w-full shadow-sm">
          <a href="/api/export" download>
            <Download className="size-4" />
            下载 JSON 备份
          </a>
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          完整 JSON，包含分类、书签、标签与排序。用于迁移、备份或在另一台自托管实例上还原。
        </p>
      </div>
    </section>
  );
}

function StatTile({
  Icon,
  label,
  value,
}: {
  Icon: typeof Link2;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
        <Icon className="size-3.5 shrink-0 text-primary/70" aria-hidden />
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl leading-none font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}
