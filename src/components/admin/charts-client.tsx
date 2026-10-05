'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import type { DonutSlice } from './charts';

/** Segment palette; one list for the ring and the legend so they always match. */
const DONUT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--muted-foreground)',
];

export function CategoryDonut({
  slices,
  total,
}: {
  slices: DonutSlice[];
  total: number;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const R = 38;
  const C = 2 * Math.PI * R;
  const gap = slices.length > 1 ? 2 : 0;

  const fracs = slices.map((slice) => (total > 0 ? slice.count / total : 0));
  const segments = slices.map((slice, i) => {
    const frac = fracs[i]!;
    const start = fracs.slice(0, i).reduce((sum, f) => sum + f, 0);
    return {
      ...slice,
      color: DONUT_COLORS[i % DONUT_COLORS.length]!,
      dash: Math.max(0.6, frac * C - gap),
      offset: C * (1 - start) + C / 4,
    };
  });

  const active = slices.find((slice) => slice.id === activeId);

  return (
    <div className="mt-4 flex items-center gap-4">
      <div className="relative size-28 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="10"
          />
          {segments.map((seg) => {
            const on = activeId === seg.id;
            return (
              <circle
                key={seg.id}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={on ? 13 : 10}
                strokeDasharray={`${seg.dash} ${C}`}
                strokeDashoffset={seg.offset}
                strokeLinecap="butt"
                opacity={activeId && !on ? 0.35 : 1}
                className="cursor-pointer transition-[stroke-width,opacity] duration-200"
                onPointerEnter={() => setActiveId(seg.id)}
                onPointerLeave={() => setActiveId(null)}
              >
                <title>{`${seg.name}: ${seg.count} (${seg.share}%)`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          {active ? (
            <>
              <span className="font-display text-xl leading-none font-semibold tabular-nums">
                {active.count}
              </span>
              <span className="mt-0.5 line-clamp-2 text-[0.625rem] leading-tight text-muted-foreground">
                {active.name}
              </span>
              <span className="text-[0.625rem] leading-tight tabular-nums text-muted-foreground/70">
                {active.share}%
              </span>
            </>
          ) : (
            <>
              <span className="font-display text-xl leading-none font-semibold tabular-nums">
                {total}
              </span>
              <span className="mt-0.5 text-[0.625rem] text-muted-foreground">
                书签总数
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-0.5">
        {segments.map((seg) => {
          const on = activeId === seg.id;
          return (
            <li
              key={seg.id}
              onPointerEnter={() => setActiveId(seg.id)}
              onPointerLeave={() => setActiveId(null)}
              className={cn(
                'flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors',
                on ? 'bg-accent/60' : 'hover:bg-accent/30',
              )}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate',
                  on ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {seg.name}
              </span>
              <span className="shrink-0 tabular-nums text-foreground/80">
                {seg.count}
              </span>
              <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground/70">
                {seg.share}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
