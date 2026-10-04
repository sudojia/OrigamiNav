'use client';

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Favicon } from '@/components/nav/favicon';
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
export function BookmarkCard({
  bookmark,
  isAdmin,
  onEdit,
  onDelete,
  highlight,
}: {
  bookmark: NavBookmark;
  isAdmin: boolean;
  onEdit?: (bookmark: NavBookmark) => void;
  onDelete?: (bookmark: NavBookmark) => void;
  highlight?: string[];
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
          <h3 className="truncate text-sm font-medium text-card-foreground">
            <Highlighted text={bookmark.title} terms={highlight} />
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {bookmark.hostname}
          </p>
        </div>
      </div>

      {bookmark.description ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          <Highlighted text={bookmark.description} terms={highlight} />
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

/** Wraps case-insensitive matches of the query terms in a <mark>. */
function Highlighted({
  text,
  terms,
}: {
  text: string;
  terms?: string[];
}) {
  if (!terms || terms.length === 0) return <>{text}</>;

  const escaped = terms
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return <>{text}</>;

  let parts: Array<string | { hit: string }>;
  try {
    parts = text
      .split(new RegExp(`(${escaped.join('|')})`, 'gi'))
      .map((part) =>
        escaped.some((t) => part.toLowerCase() === t.toLowerCase())
          ? { hit: part }
          : part,
      );
  } catch {
    // Falls back to plain text on a malformed pattern.
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <mark key={i} className="search-hit">
            {part.hit}
          </mark>
        ),
      )}
    </>
  );
}
