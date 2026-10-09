'use client';

import { CornerDownLeft, ExternalLink, Hash, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Favicon } from '@/components/nav/favicon';
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { NavSearchResult } from '@/types/nav';

/** Typing pause before a search request goes out. */
const SEARCH_DEBOUNCE_MS = 180;
/** Rows rendered per group; the server caps the total at SEARCH_LIMIT. */
const GROUP_LIMIT = 20;

type CategoryEntry = {
  kind: 'category';
  id: string;
  label: string;
  sublabel: string;
  slug: string;
};

type BookmarkEntry = {
  kind: 'bookmark';
  id: string;
  label: string;
  sublabel: string;
  href: string;
  iconUrl: string | null;
};

type Entry = CategoryEntry | BookmarkEntry;

/**
 * Cmd/Ctrl+K jump menu. Matching and ranking run on the server over
 * `search_index`, which is no longer shipped to the browser; cmdk's own filter
 * stays disabled because the result set is already filtered.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onJumpToCategory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJumpToCategory: (slug: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<NavSearchResult | null>(null);
  // Bumped per request so a slow earlier response cannot overwrite a later one.
  const seqRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const seq = (seqRef.current += 1);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/nav?${new URLSearchParams({ q: trimmed })}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as NavSearchResult;
        if (seq !== seqRef.current) return;
        setResult(
          Array.isArray(payload.categories)
            ? payload
            : { categories: [], truncated: false, cursor: null },
        );
      } catch (error) {
        if (controller.signal.aborted || seq !== seqRef.current) return;
        console.error('[origaminav] palette search failed', error);
        setResult({ categories: [], truncated: false, cursor: null });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  /** A query change resets the result set, which restores the loading state. */
  const handleQueryChange = useCallback((next: string) => {
    setQuery(next);
    setResult(null);
  }, []);

  // The server already ordered categories by display order and bookmarks by
  // their in-category order, so a flat read preserves relevance.
  const { categories, bookmarks } = useMemo(() => {
    const cats: CategoryEntry[] = [];
    const marks: BookmarkEntry[] = [];
    for (const category of result?.categories ?? []) {
      cats.push({
        kind: 'category',
        id: category.id,
        label: category.name,
        sublabel: `${category.bookmarks.length} 个匹配`,
        slug: category.slug,
      });
      for (const bookmark of category.bookmarks) {
        marks.push({
          kind: 'bookmark',
          id: bookmark.id,
          label: bookmark.title,
          sublabel: bookmark.hostname || category.name,
          href: bookmark.url,
          iconUrl: bookmark.iconUrl,
        });
      }
    }
    return {
      categories: cats.slice(0, GROUP_LIMIT),
      bookmarks: marks.slice(0, GROUP_LIMIT),
    };
  }, [result]);

  /** Closing the palette discards the query and its result set. */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery('');
        setResult(null);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  function handleSelect(entry: Entry) {
    onOpenChange(false);
    setQuery('');
    setResult(null);
    if (entry.kind === 'category') {
      onJumpToCategory(entry.slug);
      return;
    }
    // Opens in a new tab.
    window.open(entry.href, '_blank', 'noopener,noreferrer');
  }

  const hasQuery = query.trim().length > 0;
  // Derived: a query with no result yet means a request is outstanding.
  const loading = hasQuery && result === null;
  const empty = !loading && categories.length === 0 && bookmarks.length === 0;

  return (
    // Disables cmdk's own filtering; ranking is done by the server.
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="跳转到书签或分类"
      description="输入关键词搜索，支持拼音首字母"
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput
        placeholder="搜索书签或分类，支持拼音首字母…"
        value={query}
        onValueChange={handleQueryChange}
      />
      <CommandList>
        {!hasQuery ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            输入以搜索
          </div>
        ) : null}

        {hasQuery && loading && empty ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            正在搜索…
          </div>
        ) : null}

        {empty && !loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            没有匹配的结果
          </div>
        ) : null}

        {categories.length > 0 ? (
          <CommandGroup heading="分类">
            {categories.map((item) => (
              <CommandItem
                key={item.id}
                value={`cat-${item.id}`}
                onSelect={() => handleSelect(item)}
              >
                <Hash className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-xs text-muted-foreground">
                  {item.sublabel}
                </span>
                <CornerDownLeft className="size-3 text-muted-foreground/60" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {bookmarks.length > 0 ? (
          <CommandGroup heading="书签">
            {bookmarks.map((item) => (
              <CommandItem
                key={item.id}
                value={`bm-${item.id}`}
                onSelect={() => handleSelect(item)}
              >
                <Favicon
                  hostname={item.sublabel}
                  title={item.label}
                  iconUrl={item.iconUrl}
                  bookmarkId={item.id}
                  className="size-4"
                />
                <span className="flex-1 truncate">{item.label}</span>
                <span className="max-w-32 truncate text-xs text-muted-foreground">
                  {item.sublabel}
                </span>
                <ExternalLink className="size-3 text-muted-foreground/60" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
