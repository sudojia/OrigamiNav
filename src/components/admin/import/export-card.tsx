import { Download, FileJson, FolderTree, Globe, Link2, TriangleAlert } from 'lucide-react';

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

        <div className="space-y-2">
          <ExportTile
            href="/api/export"
            Icon={FileJson}
            title="JSON 备份"
            hint="完整数据，可在另一台实例还原"
          />
          <ExportTile
            href="/api/export?format=html"
            Icon={Globe}
            title="浏览器书签 HTML"
            hint="导入 Chrome / Edge / Firefox，私有标记会丢失"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * One export format. Both carry the same weight: neither is a fallback for the
 * other, they answer different questions ("restore this site" vs "take these
 * links to my browser").
 */
function ExportTile({
  href,
  Icon,
  title,
  hint,
}: {
  href: string;
  Icon: typeof Link2;
  title: string;
  hint: string;
}) {
  return (
    <a
      href={href}
      download
      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 transition-all hover:border-primary/40 hover:bg-accent/40 hover:shadow-sm focus-visible:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium group-hover:text-primary">
          {title}
        </span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted-foreground">
          {hint}
        </span>
      </span>
      <Download
        className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary"
        aria-hidden
      />
    </a>
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
