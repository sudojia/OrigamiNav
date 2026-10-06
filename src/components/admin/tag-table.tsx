'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import type { TagListQuery, TagSort } from '@/lib/tag-list';
import { cn, formatDate } from '@/lib/utils';

import type { TagListRow } from '@/db/queries/tags';
import {
  InlineRename,
  RowActions,
  UsageMeter,
  type TagRowProps,
} from './tag-row-parts';

/** Dense table view: the default way to work through a large tag table. */

/** Sortable columns, and the sort value each direction stands for. */
const SORT_COLUMNS = {
  name: { asc: 'name', desc: 'name-desc', first: 'name' },
  count: { asc: 'count-asc', desc: 'count', first: 'count' },
  created: { asc: 'oldest', desc: 'newest', first: 'newest' },
} as const;

type SortColumn = keyof typeof SORT_COLUMNS;
type SortDirection = 'asc' | 'desc' | null;

function sortDirection(column: SortColumn, sort: TagSort): SortDirection {
  const pair = SORT_COLUMNS[column];
  if (sort === pair.asc) return 'asc';
  if (sort === pair.desc) return 'desc';
  return null;
}

/** Clicking the active column flips it; a new column starts at its default. */
function toggleSort(column: SortColumn, sort: TagSort): TagSort {
  const pair = SORT_COLUMNS[column];
  const direction = sortDirection(column, sort);
  if (direction === null) return pair.first;
  return direction === 'asc' ? pair.desc : pair.asc;
}

function ariaSort(direction: SortDirection) {
  if (direction === 'asc') return 'ascending' as const;
  if (direction === 'desc') return 'descending' as const;
  return 'none' as const;
}

export function TagTable({
  items,
  query,
  selected,
  maxCount,
  renamingId,
  busyId,
  onSort,
  onToggle,
  onToggleAll,
  onRename,
  onStartRename,
  onCancelRename,
  onMerge,
  onDelete,
}: {
  items: TagListRow[];
  query: TagListQuery;
  selected: ReadonlySet<string>;
  maxCount: number;
  renamingId: string | null;
  busyId: string | null;
  onSort: (sort: TagSort) => void;
  onToggle: (id: string, next: boolean) => void;
  onToggleAll: (next: boolean) => void;
  onRename: (tag: TagListRow, name: string) => void | Promise<void>;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onMerge: (tag: TagListRow) => void;
  onDelete: (tag: TagListRow) => void;
}) {
  const allSelected = items.every((tag) => selected.has(tag.id));
  const someSelected = !allSelected && items.some((tag) => selected.has(tag.id));

  return (
    <div className="overflow-hidden rounded-card border bg-card shadow-card">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">标签列表，本页 {items.length} 行</caption>
        <thead>
          <tr className="border-b border-border/70 bg-muted/40 text-xs text-muted-foreground">
            <th scope="col" className="w-10 px-3 py-2.5">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(checked) => onToggleAll(checked === true)}
                aria-label="选择本页全部标签"
              />
            </th>
            <th
              scope="col"
              aria-sort={ariaSort(sortDirection('name', query.sort))}
              className="px-2 py-2.5 text-left font-medium"
            >
              <SortHeader column="name" label="标签" sort={query.sort} onSort={onSort} />
            </th>
            <th
              scope="col"
              aria-sort={ariaSort(sortDirection('count', query.sort))}
              className="w-20 px-2 py-2.5 text-right font-medium sm:w-36"
            >
              <SortHeader
                column="count"
                label="引用"
                sort={query.sort}
                align="right"
                onSort={onSort}
              />
            </th>
            <th
              scope="col"
              aria-sort={ariaSort(sortDirection('created', query.sort))}
              className="hidden w-24 px-2 py-2.5 text-right font-medium xl:table-cell"
            >
              <SortHeader
                column="created"
                label="创建"
                sort={query.sort}
                align="right"
                onSort={onSort}
              />
            </th>
            <th scope="col" className="w-24 px-3 py-2.5 text-right font-medium md:w-28">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {items.map((tag) => (
            <TagTableRow
              key={tag.id}
              tag={tag}
              selected={selected.has(tag.id)}
              maxCount={maxCount}
              renaming={renamingId === tag.id}
              busy={busyId === tag.id}
              onToggle={(next) => onToggle(tag.id, next)}
              onStartRename={() => onStartRename(tag.id)}
              onCancelRename={onCancelRename}
              onRename={(name) => onRename(tag, name)}
              onMerge={() => onMerge(tag)}
              onDelete={() => onDelete(tag)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TagTableRow({
  tag,
  selected,
  maxCount,
  renaming,
  busy,
  onToggle,
  onStartRename,
  onCancelRename,
  onRename,
  onMerge,
  onDelete,
}: TagRowProps) {
  return (
    <tr
      className={cn(
        'group/row transition-colors',
        selected ? 'bg-primary/5' : 'hover:bg-accent/40',
        busy && 'opacity-60',
      )}
    >
      <td className="px-3 py-2">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={`选择 ${tag.name}`}
        />
      </td>
      <td className="px-2 py-2">
        {renaming ? (
          <InlineRename
            tag={tag}
            busy={busy}
            onSave={onRename}
            onCancel={onCancelRename}
          />
        ) : (
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-medium">{tag.name}</span>
            <span className="hidden truncate font-mono text-[11px] text-muted-foreground md:inline">
              /{tag.slug}
            </span>
          </div>
        )}
      </td>
      <td className="px-2 py-2">
        <UsageMeter count={tag.count} max={maxCount} />
      </td>
      <td className="hidden px-2 py-2 text-right text-xs text-muted-foreground tabular-nums xl:table-cell">
        {formatDate(tag.createdAt)}
      </td>
      <td className="px-3 py-2">
        <RowActions
          tag={tag}
          renaming={renaming}
          onStartRename={onStartRename}
          onMerge={onMerge}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

function SortHeader({
  column,
  label,
  sort,
  align = 'left',
  onSort,
}: {
  column: SortColumn;
  label: string;
  sort: TagSort;
  align?: 'left' | 'right';
  onSort: (sort: TagSort) => void;
}) {
  const direction = sortDirection(column, sort);
  const Icon =
    direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(toggleSort(column, sort))}
      className={cn(
        'group/sort inline-flex w-full items-center gap-1 rounded-sm transition-colors hover:text-foreground',
        align === 'right' && 'flex-row-reverse',
        direction && 'text-foreground',
      )}
    >
      {label}
      <Icon
        aria-hidden
        className={cn(
          'size-3 transition-opacity',
          direction ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-50',
        )}
      />
    </button>
  );
}
