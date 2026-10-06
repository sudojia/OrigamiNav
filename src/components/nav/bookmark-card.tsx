'use client';

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Favicon } from '@/components/nav/favicon';
import { EyeOff } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { NavBookmark } from '@/types/nav';

/** Fire-and-forget click counter; never blocks the navigation. */
function reportClick(id: string) {
  void fetch('/api/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    keepalive: true,
  }).catch(() => {});
}

/** A single bookmark card; wires the admin context menu when `isAdmin`. */
function BookmarkCardImpl({
  bookmark,
  isAdmin,
  aiEnabled,
  onEdit,
  onDelete,
  onRetag,
  highlightRegex,
}: {
  bookmark: NavBookmark;
  isAdmin: boolean;
  /** Shows the retag entry only when the AI service is configured. */
  aiEnabled?: boolean;
  onEdit?: (bookmark: NavBookmark) => void;
  onDelete?: (bookmark: NavBookmark) => void;
  onRetag?: (bookmark: NavBookmark) => void;
  highlightRegex?: RegExp | null;
}) {
  const card = (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={() => reportClick(bookmark.id)}
      className={cn(
        'group flex h-full flex-col gap-2 rounded-card border border-border bg-card p-3 shadow-card',
        'transition-[transform,box-shadow,border-color] duration-150 ease-out',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raised',
        'focus-visible:-translate-y-0.5 focus-visible:border-primary/40',
        bookmark.hidden && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Favicon
          hostname={bookmark.hostname}
          title={bookmark.title}
          iconUrl={bookmark.iconUrl}
          className="size-8"
        />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 truncate text-sm font-medium text-card-foreground">
            <span className="truncate">
              <Highlighted text={bookmark.title} regex={highlightRegex} />
            </span>
            {bookmark.hidden ? (
              <EyeOff
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label="私有"
              />
            ) : null}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {bookmark.hostname}
          </p>
        </div>
      </div>

      {bookmark.description ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          <Highlighted text={bookmark.description} regex={highlightRegex} />
        </p>
      ) : null}

      {bookmark.tags.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {bookmark.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-sm bg-secondary px-1.5 py-0.5 text-[0.625rem] text-secondary-foreground"
            >
              {tag.name}
            </span>
          ))}
        </div>
      ) : null}
    </a>
  );

  if (!isAdmin) return card;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem onSelect={() => onEdit?.(bookmark)}>
          编辑书签
        </ContextMenuItem>
        {aiEnabled ? (
          <ContextMenuItem onSelect={() => onRetag?.(bookmark)}>
            重打标签
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDelete?.(bookmark)}
        >
          删除书签
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Memoized so parent state changes that leave the card's props untouched
 * (scroll-spy, dialogs, palette) skip every card re-render.
 */
export const BookmarkCard = memo(BookmarkCardImpl);

/** Wraps case-insensitive regex matches of the query in a <mark>. */
function Highlighted({
  text,
  regex,
}: {
  text: string;
  regex?: RegExp | null;
}) {
  if (!regex) return <>{text}</>;

  // One capture group: split places matches at odd indices.
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="search-hit">
            {part}
          </mark>
        ) : part ? (
          <span key={i}>{part}</span>
        ) : null,
      )}
    </>
  );
}
