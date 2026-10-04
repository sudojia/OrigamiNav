'use client';

import { Check, Search, Tags, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { NavTag } from '@/types/nav';

/** Single-row tag filter: selected tags, then a "+N" panel for the rest. */

const INLINE_LIMIT = 8;

export function TagFilterBar({
  tags,
  counts,
  active,
  onToggle,
  onClear,
}: {
  tags: NavTag[];
  /** Usage count per tag id from the full nav payload. */
  counts: Map<string, number>;
  active: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  const activeSet = useMemo(() => new Set(active), [active]);
  const selected = useMemo(
    () => tags.filter((tag) => activeSet.has(tag.id)),
    [tags, activeSet],
  );
  const unselected = useMemo(
    () => tags.filter((tag) => !activeSet.has(tag.id)),
    [tags, activeSet],
  );

  if (tags.length === 0) return null;

  const inline = unselected.slice(0, INLINE_LIMIT);
  const overflowCount = tags.length - selected.length - inline.length;

  return (
    <div className="flex items-center gap-1.5">
      <Tags
        aria-hidden
        className="ml-1 size-3.5 shrink-0 text-muted-foreground/70"
      />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {selected.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            count={counts.get(tag.id) ?? 0}
            active
            onToggle={onToggle}
          />
        ))}
        {inline.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            count={counts.get(tag.id) ?? 0}
            active={false}
            onToggle={onToggle}
          />
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {overflowCount > 0 ? (
          <Popover open={panelOpen} onOpenChange={setPanelOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`展开全部 ${tags.length} 个标签`}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  panelOpen
                    ? 'border-primary text-primary'
                    : 'border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                +{overflowCount}
              </button>
            </PopoverTrigger>
            <TagPanel
              tags={tags}
              counts={counts}
              activeSet={activeSet}
              onToggle={onToggle}
              onClear={onClear}
            />
          </Popover>
        ) : null}

        {active.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            清除
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TagChip({
  tag,
  count,
  active,
  onToggle,
}: {
  tag: NavTag;
  count: number;
  active: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      key={tag.id}
      type="button"
      onClick={() => onToggle(tag.id)}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {tag.name}
      {count > 0 ? (
        <span className={cn('tabular-nums', active ? 'opacity-70' : 'opacity-50')}>
          {count}
        </span>
      ) : null}
      {active ? <X className="size-3" aria-hidden /> : null}
    </button>
  );
}

function TagPanel({
  tags,
  counts,
  activeSet,
  onToggle,
  onClear,
}: {
  tags: NavTag[];
  counts: Map<string, number>;
  activeSet: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return tags;
    return tags.filter(
      (tag) =>
        tag.name.toLowerCase().includes(needle) ||
        tag.slug.toLowerCase().includes(needle),
    );
  }, [tags, filter]);

  const activeCount = activeSet.size;

  return (
    <PopoverContent align="end" className="w-80 p-2">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="筛选标签…"
          aria-label="筛选标签"
          className="h-8 pr-2 pl-8 text-xs"
          autoFocus
        />
      </div>

      <div className="mt-2 max-h-64 overflow-y-auto [scrollbar-width:thin]">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            没有匹配的标签
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-1">
            {visible.map((tag) => {
              const active = activeSet.has(tag.id);
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(tag.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    <span className="shrink-0 text-[0.625rem] tabular-nums opacity-60">
                      {counts.get(tag.id) ?? 0}
                    </span>
                    {active ? <Check className="size-3.5 shrink-0" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between border-t border-border px-2 pt-2 text-xs text-muted-foreground">
        <span>已选 {activeCount} 个</span>
        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClear}>
            清除全部
          </Button>
        ) : null}
      </div>
    </PopoverContent>
  );
}
