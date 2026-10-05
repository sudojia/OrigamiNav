'use client';

import { CornerDownLeft, ExternalLink, Hash } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Favicon } from '@/components/nav/favicon';
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  buildPaletteItems,
  rankPaletteItems,
} from '@/lib/filter';
import type { NavData } from '@/types/nav';

/** Cmd/Ctrl+K jump menu; ranks against the server-precomputed searchIndex. */
export function CommandPalette({
  nav,
  open,
  onOpenChange,
  onJumpToCategory,
}: {
  nav: NavData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJumpToCategory: (slug: string) => void;
}) {
  const [query, setQuery] = useState('');

  const allItems = useMemo(() => buildPaletteItems(nav), [nav]);
  const results = useMemo(
    () => rankPaletteItems(allItems, nav, query, 40),
    [allItems, nav, query],
  );

  const categories = results.filter((r) => r.kind === 'category');
  const bookmarks = results.filter((r) => r.kind === 'bookmark');

  function handleSelect(href: string, kind: 'category' | 'bookmark') {
    onOpenChange(false);
    setQuery('');
    if (kind === 'category') {
      onJumpToCategory(href.replace(/^#/, ''));
      return;
    }
    // Opens in a new tab.
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  return (
    // Disables cmdk's own filtering; ranking is done by rankPaletteItems.
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="跳转到书签或分类"
      description="输入关键词搜索，支持拼音首字母"
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput
        placeholder="搜索书签或分类，支持拼音首字母…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {results.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {query.trim() ? '没有匹配的结果' : '输入以搜索'}
          </div>
        ) : null}

        {categories.length > 0 ? (
          <CommandGroup heading="分类">
            {categories.map((item) => (
              <CommandItem
                key={item.id}
                value={`cat-${item.id}`}
                onSelect={() => handleSelect(item.href, 'category')}
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
                onSelect={() => handleSelect(item.href, 'bookmark')}
              >
                <Favicon
                  hostname={item.sublabel}
                  title={item.label}
                  iconUrl={item.iconUrl}
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
