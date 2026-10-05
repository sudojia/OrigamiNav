import { FolderTree } from 'lucide-react';
import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';

// ── Donut slices ─────────────────────────────────────────────────────────────

export type DonutSlice = {
  id: string;
  name: string;
  color: string | null;
  count: number;
  share: number;
};

/** Keeps the top 5 categories and folds the rest into "other". */
export function buildDonutSlices(
  distribution: Array<{ id: string; name: string; color: string | null; count: number }>,
): DonutSlice[] {
  const sorted = [...distribution].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, d) => s + d.count, 0) || 1;
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const slices: DonutSlice[] = top.map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color,
    count: d.count,
    share: Math.round((d.count / total) * 100),
  }));
  if (rest.length > 0) {
    const restCount = rest.reduce((s, d) => s + d.count, 0);
    slices.push({
      id: '__other',
      name: `其他 ${rest.length} 个`,
      color: null,
      count: restCount,
      share: Math.round((restCount / total) * 100),
    });
  }
  return slices;
}

// ── Rank bars ────────────────────────────────────────────────────────────────

export type RankBarProps = {
  rank: number;
  name: string;
  count: number;
  /** Denominator for the share label. */
  total: number;
  /** Largest count in the list, used to scale the bar. */
  max: number;
  barClassName: string;
  /** Prefixes the name with `#`, for tags. */
  hash?: boolean;
  delayMs?: number;
};

/** One row of a ranking list: label, count, share and a proportional bar. */
export function RankBar({
  rank,
  name,
  count,
  total,
  max,
  barClassName,
  hash = false,
  delayMs = 0,
}: RankBarProps) {
  const scale = Math.max(0.02, count / Math.max(1, max));
  const share = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <li className="group">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="w-4 shrink-0 text-right font-mono text-[0.625rem] text-muted-foreground/60 tabular-nums">
            {String(rank).padStart(2, '0')}
          </span>
          <span className="truncate">
            {hash ? (
              <span aria-hidden className="mr-1 text-muted-foreground/50">
                #
              </span>
            ) : null}
            <span
              className="font-medium text-foreground/90 transition-colors group-hover:text-primary"
              title={name}
            >
              {name}
            </span>
          </span>
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground transition-colors group-hover:text-foreground">
          {count}
          <span className="ml-1.5 text-muted-foreground/60">{share}%</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/70 transition-colors group-hover:bg-muted">
        <div
          className={cn(
            'bar-fill h-full rounded-full motion-safe:bar-grow',
            barClassName,
          )}
          style={
            {
              '--bar-scale': scale,
              animationDelay: `${delayMs}ms`,
            } as CSSProperties
          }
        />
      </div>
    </li>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

export type StatCardProps = {
  label: string;
  value: number;
  href: string;
  hint: string;
  Icon: typeof FolderTree;
};

export function StatCard({
  label,
  value,
  href,
  hint,
  Icon,
}: StatCardProps) {
  return (
    <a
      href={href}
      className="group relative flex items-center gap-3 overflow-hidden rounded-card border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raised"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-primary/5 blur-xl transition-opacity group-hover:bg-primary/10"
      />
      <span className="relative flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-105">
        <Icon className="size-4.5" />
      </span>
      <span className="relative min-w-0">
        <span className="block font-display text-2xl leading-tight font-semibold tabular-nums">
          {value}
        </span>
        <span className="block text-xs text-muted-foreground">
          {label} ·{' '}
          <span className="underline-offset-2 group-hover:underline">
            {hint}
          </span>
        </span>
      </span>
    </a>
  );
}
