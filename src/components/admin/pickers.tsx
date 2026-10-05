'use client';

import { Ban, Folder, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_GROUPS,
  CATEGORY_ICON_OPTIONS,
  colorSwatchClass,
  resolveCategoryIcon,
} from '@/lib/category-meta';
import { cn } from '@/lib/utils';

/** Square-grid icon and color pickers for the category form. */

/** Shared cell styles for the picker grid. */
const CELL_BASE =
  'flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors';

/**
 * Icon picker rendered as a preview square that opens a searchable popover,
 * keeping the category form short enough to show every field at once.
 */
export function IconPicker({
  value,
  onChange,
  id,
}: {
  /** Lucide icon name; '' means no icon. */
  value: string;
  onChange: (name: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  // Radix Dialog locks page scroll via react-remove-scroll, which blocks wheel
  // events for anything outside the dialog node — including this portaled
  // popover. A window-capture listener runs before that lock, so wheel over
  // the grid is claimed here (stopPropagation) and scrolled manually.
  useEffect(() => {
    if (!open) return;
    const onWheel = (event: WheelEvent) => {
      const el = gridRef.current;
      if (!el || !(event.target instanceof Node) || !el.contains(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Firefox reports line deltas; scale them to pixels.
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      el.scrollTop += delta;
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () =>
      window.removeEventListener('wheel', onWheel, { capture: true });
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORY_ICON_OPTIONS;
    return CATEGORY_ICON_OPTIONS.filter(
      (option) =>
        option.name.toLowerCase().includes(q) ||
        option.label.toLowerCase().includes(q),
    );
  }, [query]);

  const groupsToRender = useMemo(() => {
    if (query.trim()) {
      return [
        {
          id: '__search',
          label: `搜索“${query.trim()}” · ${filtered.length} 个结果`,
          options: filtered,
        },
      ];
    }
    return CATEGORY_ICON_GROUPS.map((g) => ({
      id: g.id,
      label: g.label,
      options: CATEGORY_ICON_OPTIONS.filter((o) => o.group === g.id),
    }));
  }, [query, filtered]);

  const Icon = resolveCategoryIcon(value || null)?.Icon ?? null;

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          title="选择图标"
          aria-label="选择图标"
          className="flex size-10 items-center justify-center rounded-md border border-border bg-background transition-colors hover:border-ring/60 hover:bg-accent"
        >
          {Icon ? (
            <Icon className="size-5" />
          ) : (
            <Ban className="size-4 text-muted-foreground/60" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 overflow-hidden p-0">
        {/* Search box and no-icon clear button. */}
        <div className="flex items-center gap-1.5 border-b border-border p-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索图标（中 / 英）…"
              aria-label="搜索图标"
              className="h-8 w-full rounded-md border border-transparent bg-muted/50 pr-2 pl-7 text-xs transition-colors outline-none placeholder:text-muted-foreground/70 hover:bg-muted focus:border-ring/60 focus:bg-background focus:ring-2 focus:ring-ring/25"
            />
          </div>
          <button
            type="button"
            role="radio"
            aria-checked={value === ''}
            aria-label="无图标"
            title="无图标"
            onClick={() => pick('')}
            className={cn(
              CELL_BASE,
              'text-muted-foreground/60',
              value === ''
                ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                : 'border-border hover:bg-accent',
            )}
          >
            <Ban className="size-4" />
          </button>
        </div>

        <div
          ref={gridRef}
          role="radiogroup"
          aria-label="分类图标"
          className="max-h-64 space-y-3 overflow-y-auto p-2 [scrollbar-width:thin]"
        >
          {groupsToRender.map((group) =>
            group.options.length === 0 ? null : (
              <div key={group.id}>
                <p className="px-0.5 pb-1 text-[0.6875rem] font-medium tracking-wide text-muted-foreground/70">
                  {group.label}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {group.options.map((option) => (
                    <PickerCell
                      key={option.name}
                      role="radio"
                      aria-checked={value === option.name}
                      aria-label={option.label}
                      title={`${option.label} · ${option.name}`}
                      selected={value === option.name}
                      onClick={() => pick(option.name)}
                    >
                      <option.Icon className="size-4" />
                    </PickerCell>
                  ))}
                </div>
              </div>
            ),
          )}

          {filtered.length === 0 && query.trim() ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              没有匹配的图标。试试其它关键词。
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  /** Colour token; '' means the default neutral. */
  value: string;
  onChange: (token: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="分类颜色"
      className="flex flex-1 flex-wrap items-center justify-between gap-1"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === ''}
        aria-label="默认颜色"
        title="默认颜色"
        onClick={() => onChange('')}
        className={cn(
          'flex size-6 items-center justify-center rounded-md border border-border bg-muted text-[0.625rem] text-muted-foreground transition-transform hover:scale-110 active:scale-95',
          value === '' && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
        )}
      >
        无
      </button>
      {CATEGORY_COLOR_OPTIONS.map((token) => (
        <button
          key={token}
          type="button"
          role="radio"
          aria-checked={value === token}
          aria-label={token}
          title={token}
          onClick={() => onChange(token)}
          className={cn(
            'size-6 rounded-md transition-transform hover:scale-110 active:scale-95',
            colorSwatchClass(token),
            value === token && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
          )}
        />
      ))}
    </div>
  );
}

function PickerCell({
  selected,
  onClick,
  title,
  children,
  ...rest
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      {...rest}
      className={cn(
        'flex aspect-square items-center justify-center rounded-md border text-foreground transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
          : 'border-transparent hover:border-border hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

/** Read-only preview of the selected icon and color. */
export function IconPreviewSquare({
  icon,
  color,
  className,
  hint,
}: {
  icon: string;
  color: string;
  className?: string;
  /** First character used as the fallback glyph. */
  hint?: string;
}) {
  const Icon = resolveCategoryIcon(icon || null)?.Icon ?? null;
  const fallback = hint ? Array.from(hint.trim())[0] ?? null : null;
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-md text-sm font-medium',
        Icon || color
          ? cn('text-white', colorSwatchClass(color || null))
          : 'border border-dashed border-border bg-muted/50 text-muted-foreground',
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-4.5" />
      ) : fallback ? (
        fallback
      ) : (
        <Folder className="size-4 opacity-60" />
      )}
    </span>
  );
}
