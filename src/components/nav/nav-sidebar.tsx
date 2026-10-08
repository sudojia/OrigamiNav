'use client';

import { colorSwatchClass } from '@/lib/category-color';
import { cn } from '@/lib/utils';
import type { NavCategory } from '@/types/nav';

/** Sticky category rail for wide screens; scroll-spy state lives in the parent. */
export function NavSidebar({
  categories,
  activeId,
  onSelect,
  counts,
  hrefFor,
}: {
  categories: NavCategory[];
  activeId: string | null;
  onSelect: (slug: string) => void;
  /** Visible count after filtering. */
  counts: Map<string, number>;
  /** Set on a pinned view: entries become links to category pages. */
  hrefFor?: (category: NavCategory) => string;
}) {
  return (
    <nav
      aria-label="分类导航"
      className="sticky top-[calc(var(--header-h,9.5rem)+0.75rem)] hidden max-h-[calc(100dvh-var(--header-h,9.5rem)-2.5rem)] overflow-y-auto pb-4 lg:block [scrollbar-width:thin]"
    >
      <p className="px-3 pb-1.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground/70">
        分类
      </p>
      <ul className="space-y-0.5">
        {categories.map((category) => {
          const active = category.id === activeId;
          const count = counts.get(category.id) ?? category.bookmarks.length;
          return (
            <li key={category.id}>
              <a
                href={hrefFor ? hrefFor(category) : `#${category.slug}`}
                onClick={
                  hrefFor
                    ? undefined
                    : (event) => {
                        event.preventDefault();
                        onSelect(category.slug);
                      }
                }
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'group flex items-center gap-2.5 rounded-md py-1.5 pr-2 pl-2 text-sm transition-colors',
                  active
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md text-white transition-transform group-hover:scale-105',
                    colorSwatchClass(category.color),
                  )}
                  // Server-rendered from the fixed icon registry, never user text.
                  dangerouslySetInnerHTML={{ __html: category.iconSvg ?? '' }}
                />
                <span className="min-w-0 flex-1 truncate">{category.name}</span>
                <span
                  className={cn(
                    'shrink-0 text-xs tabular-nums',
                    active ? 'text-accent-foreground/70' : 'text-muted-foreground/70',
                  )}
                >
                  {count}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Horizontally scrollable category chips for narrow screens. */
export function NavChipBar({
  categories,
  activeId,
  onSelect,
  hrefFor,
}: {
  categories: NavCategory[];
  activeId: string | null;
  onSelect: (slug: string) => void;
  /** Set on a pinned view: entries become links to category pages. */
  hrefFor?: (category: NavCategory) => string;
}) {
  return (
    <nav
      aria-label="分类导航"
      className="-mx-4 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex gap-2">
        {categories.map((category) => {
          const active = category.id === activeId;
          return (
            <li key={category.id} className="shrink-0">
              <a
                href={hrefFor ? hrefFor(category) : `#${category.slug}`}
                onClick={
                  hrefFor
                    ? undefined
                    : (event) => {
                        event.preventDefault();
                        onSelect(category.slug);
                      }
                }
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  aria-hidden
                  className={cn('size-1.5 rounded-full', colorSwatchClass(category.color))}
                />
                {category.name}
                <span className="tabular-nums opacity-70">
                  {category.bookmarks.length}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
