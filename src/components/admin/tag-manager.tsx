'use client';

import {
  ArrowUpDown,
  BrushCleaning,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Combine,
  LayoutGrid,
  List,
  LoaderCircle,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import {
  createTagAction,
  deleteTagAction,
  deleteTagsAction,
  deleteUnusedTagsAction,
  renameTagAction,
} from '@/actions/tag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TAG_PAGE_SIZES,
  TAG_SORT_OPTIONS,
  TAG_USAGE_FILTERS,
  applyTagListPatch,
  tagListHref,
  type TagListPatch,
  type TagListQuery,
  type TagSort,
  type TagUsageFilter,
} from '@/lib/tag-list';
import { cn } from '@/lib/utils';

import type { TagListRow, TagStats } from '@/db/queries/tags';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { SubmitButton, useActionFeedback } from './form-primitives';
import { PageHeader } from './page-header';
import { TagCard } from './tag-cards';
import { TagMergeDialog } from './tag-merge-dialog';
import { TagTable } from './tag-table';

/**
 * Tag manager. Paging, searching and sorting all run in SQL, so this renders
 * one bounded page of rows however large the tag table grows.
 */

type ViewMode = 'list' | 'grid';

const VIEW_STORAGE_KEY = 'origaminav.admin.tag-view';
const VIEW_EVENT = 'origaminav:tag-viewchange';
const SEARCH_DEBOUNCE_MS = 250;

function subscribeToViewPreference(onChange: () => void): () => void {
  window.addEventListener(VIEW_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(VIEW_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readViewPreference(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function readViewPreferenceOnServer(): ViewMode {
  return 'list';
}

export function TagManager({
  items,
  total,
  stats,
  query,
}: {
  items: TagListRow[];
  /** Rows matching the current filters, across all pages. */
  total: number;
  stats: TagStats;
  query: TagListQuery;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TagListRow[] | null>(null);
  const [merging, setMerging] = useState<TagListRow[] | null>(null);
  const [cleaningUnused, setCleaningUnused] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const view = useSyncExternalStore(
    subscribeToViewPreference,
    readViewPreference,
    readViewPreferenceOnServer,
  );

  // Selection and inline rename belong to one list state; both reset with it.
  const listKey = `${query.query}|${query.usage}|${query.sort}|${query.page}|${query.limit}`;
  const [lastListKey, setLastListKey] = useState(listKey);
  if (lastListKey !== listKey) {
    setLastListKey(listKey);
    setSelected(new Set());
    setRenamingId(null);
  }

  // Patches build on the last requested state, so an edit made while a previous
  // one is still in flight (typing, then clicking a filter) is never dropped.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const navigate = useCallback(
    (patch: TagListPatch) => {
      const next = applyTagListPatch(queryRef.current, patch);
      const href = tagListHref(next);
      if (href === tagListHref(queryRef.current)) return;
      queryRef.current = next;
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [router, startTransition],
  );

  // ── Search input ──────────────────────────────────────────────────────────
  // Uncontrolled on purpose: a controlled value gets rewritten to the server's
  // last echoed term, which drops keystrokes typed while a navigation is in
  // flight. The URL stays the source of truth; the DOM owns the caret.
  const searchRef = useRef<HTMLInputElement>(null);
  const [hasSearchText, setHasSearchText] = useState(query.query !== '');
  const [pendingTerm, setPendingTerm] = useState(query.query);
  // Last keystroke, last query value this effect handled, and whether the user
  // has typed since the URL last matched the box.
  const typedTermRef = useRef(query.query);
  const seenQueryRef = useRef(query.query);
  const typedSinceSyncRef = useRef(false);

  useEffect(() => {
    if (seenQueryRef.current === query.query) return;
    seenQueryRef.current = query.query;
    // Never rewrite a box the user has typed into since the last sync; a change
    // arriving after the typing settled is an external navigation.
    if (typedSinceSyncRef.current) return;
    typedTermRef.current = query.query;
    setPendingTerm(query.query);
    setHasSearchText(query.query !== '');
    const input = searchRef.current;
    if (input) input.value = query.query;
  }, [query.query]);

  useEffect(() => {
    const trimmed = pendingTerm.trim();
    if (trimmed === query.query) return;
    const timer = setTimeout(
      () => navigate({ query: trimmed }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [pendingTerm, query.query, navigate]);

  // `/` focuses the search box.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }
      if (!searchRef.current) return;
      event.preventDefault();
      searchRef.current.focus();
      searchRef.current.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedTags = useMemo(
    () => items.filter((tag) => selected.has(tag.id)),
    [items, selected],
  );
  const maxCount = useMemo(
    () => items.reduce((max, tag) => Math.max(max, tag.count), 0),
    [items],
  );
  const pageCount = Math.max(1, Math.ceil(total / query.limit));
  const filtering = query.query !== '' || query.usage !== 'all';

  const refresh = () => startTransition(() => router.refresh());

  const toggleSelected = (id: string, next: boolean) =>
    setSelected((previous) => {
      const copy = new Set(previous);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });

  const toggleAll = (next: boolean) =>
    setSelected(next ? new Set(items.map((tag) => tag.id)) : new Set());

  /** Clears the box and the filter; the DOM value is reset directly. */
  const clearSearch = useCallback(() => {
    if (searchRef.current) searchRef.current.value = '';
    typedTermRef.current = '';
    typedSinceSyncRef.current = false;
    setPendingTerm('');
    setHasSearchText(false);
  }, []);

  const handleRename = async (tag: TagListRow, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === tag.name) {
      setRenamingId(null);
      return;
    }

    const formData = new FormData();
    formData.set('id', tag.id);
    formData.set('name', trimmed);

    setBusyId(tag.id);
    try {
      const result = await renameTagAction(null, formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setRenamingId(null);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting?.length) return;
    const ids = deleting.map((tag) => tag.id);
    const only = ids.length === 1 ? ids[0] : undefined;

    setWriting(true);
    try {
      const result = only
        ? await deleteTagAction(only)
        : await deleteTagsAction(ids);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setDeleting(null);
      setSelected(new Set());
      refresh();
    } finally {
      setWriting(false);
    }
  };

  const handleMergeDone = () => {
    setMerging(null);
    setSelected(new Set());
    refresh();
  };

  const handleCleanupUnused = async () => {
    setWriting(true);
    try {
      const result = await deleteUnusedTagsAction();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setCleaningUnused(false);
      // Otherwise the filter would be left showing nothing but its own message.
      if (query.usage === 'unused') navigate({ usage: 'all' });
      refresh();
    } finally {
      setWriting(false);
    }
  };

  const switchView = (next: ViewMode) => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Storage blocked; applies to this tab only.
    }
    window.dispatchEvent(new Event(VIEW_EVENT));
  };

  if (stats.total === 0) {
    return (
      <div className="space-y-4">
        <ManagerHeader onCreated={refresh} />
        <EmptyState
          Icon={Tags}
          title="还没有标签"
          hint="用右上角的输入框创建，或在添加、编辑书签时直接输入新标签。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ManagerHeader onCreated={refresh} />

      {/* Sticky on tablet and up; on phones the wrapped toolbar would eat the viewport. */}
      <div className="z-20 -mx-1 space-y-2 bg-background/90 px-1 py-2 backdrop-blur md:sticky md:top-14 lg:top-0">
        <div className="flex flex-wrap items-center gap-2 rounded-card border bg-card p-2.5 shadow-card">
          <div className="relative min-w-52 max-w-sm flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              type="search"
              defaultValue={query.query}
              onChange={(event) => {
                typedTermRef.current = event.target.value;
                typedSinceSyncRef.current = true;
                setPendingTerm(event.target.value);
                setHasSearchText(event.target.value !== '');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && hasSearchText) {
                  event.preventDefault();
                  clearSearch();
                }
              }}
              placeholder="搜索名称或 slug，支持拼音"
              aria-label="搜索标签"
              aria-keyshortcuts="/"
              title="按 / 聚焦搜索框"
              className="h-9 pr-9 pl-8"
            />
            {pending ? (
              <LoaderCircle
                aria-hidden
                className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              />
            ) : hasSearchText ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="清除搜索"
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <UsageFilter
              stats={stats}
              value={query.usage}
              onChange={(usage) => navigate({ usage })}
            />

            <Select
              value={query.sort}
              onValueChange={(value) => navigate({ sort: value as TagSort })}
            >
              <SelectTrigger
                className="h-9 w-auto min-w-38 gap-1.5 text-xs"
                aria-label="排序方式"
              >
                <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAG_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Card view only pays off once several columns fit. */}
            <div className="hidden items-center rounded-md border border-border p-0.5 md:flex">
              <ViewButton
                active={view === 'list'}
                label="列表视图"
                onClick={() => switchView('list')}
              >
                <List className="size-4" />
              </ViewButton>
              <ViewButton
                active={view === 'grid'}
                label="卡片视图"
                onClick={() => switchView('grid')}
              >
                <LayoutGrid className="size-4" />
              </ViewButton>
            </div>

            {stats.unused > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setCleaningUnused(true)}
              >
                <BrushCleaning className="size-4" aria-hidden />
                清理未使用（{stats.unused.toLocaleString('zh-CN')}）
              </Button>
            ) : null}
          </div>
        </div>

        {selectedTags.length > 0 ? (
          <BulkBar
            count={selectedTags.length}
            onMerge={() => setMerging(selectedTags)}
            onDelete={() => setDeleting(selectedTags)}
            onClear={() => setSelected(new Set())}
          />
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState
          Icon={filtering ? Search : Tags}
          title={
            query.query
              ? `没有匹配「${query.query}」的标签`
              : query.usage === 'unused'
                ? '没有未使用的标签'
                : '没有被书签引用的标签'
          }
          hint={
            query.query
              ? '换个关键词，或清除筛选条件后查看全部标签。'
              : '切换到「全部」可以继续管理其他标签。'
          }
          action={
            filtering ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ query: '', usage: 'all' })}
              >
                清除筛选
              </Button>
            ) : null
          }
        />
      ) : (
        <div
          aria-busy={pending}
          className={cn(
            'transition-opacity duration-200',
            pending && 'pointer-events-none opacity-55',
          )}
        >
          {view === 'list' ? (
            <TagTable
              items={items}
              query={query}
              selected={selected}
              maxCount={maxCount}
              renamingId={renamingId}
              busyId={busyId}
              onSort={(sort) => navigate({ sort })}
              onToggle={toggleSelected}
              onToggleAll={toggleAll}
              onRename={handleRename}
              onStartRename={setRenamingId}
              onCancelRename={() => setRenamingId(null)}
              onMerge={(tag) => setMerging([tag])}
              onDelete={(tag) => setDeleting([tag])}
            />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((tag) => (
                <TagCard
                  key={tag.id}
                  tag={tag}
                  maxCount={maxCount}
                  selected={selected.has(tag.id)}
                  renaming={renamingId === tag.id}
                  busy={busyId === tag.id}
                  onToggle={(next) => toggleSelected(tag.id, next)}
                  onStartRename={() => setRenamingId(tag.id)}
                  onCancelRename={() => setRenamingId(null)}
                  onRename={(name) => handleRename(tag, name)}
                  onMerge={() => setMerging([tag])}
                  onDelete={() => setDeleting([tag])}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {total > 0 ? (
        <Pagination
          query={query}
          total={total}
          pageCount={pageCount}
          onNavigate={navigate}
        />
      ) : null}

      {merging?.length ? (
        <TagMergeDialog
          sources={merging}
          onClose={() => setMerging(null)}
          onMerged={handleMergeDone}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={
          deleting?.length === 1 ? (
            <>删除标签「{deleting[0]?.name}」？</>
          ) : (
            `删除选中的 ${deleting?.length ?? 0} 个标签？`
          )
        }
        description={
          <>
            {referencesLabel(deleting ?? [])} 此操作不可撤销。
          </>
        }
        confirmDisabled={writing}
        onConfirm={handleDelete}
      />

      <ConfirmDeleteDialog
        open={cleaningUnused}
        onOpenChange={(open) => !open && setCleaningUnused(false)}
        title={`清理 ${stats.unused.toLocaleString('zh-CN')} 个未使用标签？`}
        description="这些标签没有被任何书签使用，删除后不可恢复。"
        confirmLabel="清理"
        confirmDisabled={writing}
        onConfirm={handleCleanupUnused}
      />
    </div>
  );
}

function referencesLabel(tags: TagListRow[]): string {
  const refs = tags.reduce((sum, tag) => sum + tag.count, 0);
  if (refs === 0) return '这些标签当前未被任何书签使用。';
  return `${refs} 个书签将失去这些标签（书签本身不受影响），搜索索引会同步更新。`;
}

function ManagerHeader({ onCreated }: { onCreated: () => void }) {
  return (
    <PageHeader
      Icon={Tags}
      title="标签管理"
      description="重命名、合并或删除标签会同步更新受影响书签的搜索索引。"
    >
      <CreateTagForm onCreated={onCreated} />
    </PageHeader>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

function UsageFilter({
  stats,
  value,
  onChange,
}: {
  stats: TagStats;
  value: TagUsageFilter;
  onChange: (value: TagUsageFilter) => void;
}) {
  const counts: Record<TagUsageFilter, number> = {
    all: stats.total,
    used: stats.used,
    unused: stats.unused,
  };

  return (
    <div
      role="group"
      aria-label="按使用情况筛选"
      className="flex items-center rounded-md border border-border bg-muted/40 p-0.5"
    >
      {TAG_USAGE_FILTERS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs transition-colors',
              active
                ? 'bg-card font-medium text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
            <span className="tabular-nums opacity-60">
              {counts[option.value].toLocaleString('zh-CN')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'rounded p-1.5 transition-colors',
            active
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function BulkBar({
  count,
  onMerge,
  onDelete,
  onClear,
}: {
  count: number;
  onMerge: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-primary/35 bg-primary/5 px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-medium">
        <Check className="size-4 text-primary" aria-hidden />
        已选 <span className="tabular-nums">{count}</span> 个标签
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8" onClick={onMerge}>
          <Combine className="size-3.5" aria-hidden />
          合并到…
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden />
          删除
        </Button>
        <Button variant="ghost" size="sm" className="h-8" onClick={onClear}>
          取消选择
        </Button>
      </div>
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  query,
  total,
  pageCount,
  onNavigate,
}: {
  query: TagListQuery;
  total: number;
  pageCount: number;
  onNavigate: (patch: TagListPatch) => void;
}) {
  const start = (query.page - 1) * query.limit + 1;
  const end = Math.min(total, query.page * query.limit);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-xs text-muted-foreground tabular-nums" role="status">
        显示 {start.toLocaleString('zh-CN')}–{end.toLocaleString('zh-CN')} · 共{' '}
        {total.toLocaleString('zh-CN')} 个标签
      </p>

      <div className="flex items-center gap-2">
        <Select
          value={String(query.limit)}
          onValueChange={(value) => onNavigate({ limit: Number(value) })}
        >
          <SelectTrigger className="h-8 w-auto gap-1.5 text-xs" aria-label="每页显示数量">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAG_PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                每页 {size} 条
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <nav className="flex items-center gap-1" aria-label="分页">
          <PageButton
            label="第一页"
            disabled={query.page <= 1}
            onClick={() => onNavigate({ page: 1 })}
          >
            <ChevronsLeft className="size-3.5" />
          </PageButton>
          <PageButton
            label="上一页"
            disabled={query.page <= 1}
            onClick={() => onNavigate({ page: query.page - 1 })}
          >
            <ChevronLeft className="size-3.5" />
          </PageButton>

          <span className="px-1 text-xs text-muted-foreground tabular-nums sm:hidden">
            第 {query.page} / {pageCount} 页
          </span>

          <span className="hidden items-center gap-1 sm:flex">
            {pageWindow(query.page, pageCount).map((entry, index) =>
              entry === 'gap' ? (
                <span
                  key={`gap-${index}`}
                  aria-hidden
                  className="px-1 text-xs text-muted-foreground"
                >
                  …
                </span>
              ) : (
                <PageButton
                  key={entry}
                  label={`第 ${entry} 页`}
                  active={entry === query.page}
                  onClick={() => onNavigate({ page: entry })}
                >
                  {entry}
                </PageButton>
              ),
            )}
          </span>

          <PageButton
            label="下一页"
            disabled={query.page >= pageCount}
            onClick={() => onNavigate({ page: query.page + 1 })}
          >
            <ChevronRight className="size-3.5" />
          </PageButton>
          <PageButton
            label="最后一页"
            disabled={query.page >= pageCount}
            onClick={() => onNavigate({ page: pageCount })}
          >
            <ChevronsRight className="size-3.5" />
          </PageButton>
        </nav>
      </div>
    </div>
  );
}

/** First and last page, plus one either side of the current one. */
function pageWindow(current: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = [...new Set([1, current - 1, current, current + 1, pageCount])]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((a, b) => a - b);

  const entries: Array<number | 'gap'> = [];
  let previous = 0;
  for (const page of pages) {
    if (previous && page - previous > 1) entries.push('gap');
    entries.push(page);
    previous = page;
  }
  return entries;
}

function PageButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-xs tabular-nums transition-colors',
        active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </button>
  );
}

// ── Empty state + create form ────────────────────────────────────────────────

function EmptyState({
  Icon,
  title,
  hint,
  action,
}: {
  Icon: typeof Tags;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-card bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

function CreateTagForm({ onCreated }: { onCreated: () => void }) {
  const [state, formAction] = useActionState(createTagAction, null);
  const [name, setName] = useState('');

  useActionFeedback(state, () => {
    setName('');
    onCreated();
  });

  return (
    <form action={formAction} className="flex items-center gap-2">
      <Input
        id="tag-name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={30}
        placeholder="新标签名称"
        aria-label="新标签名称"
        className="w-36 sm:w-48"
        required
      />
      <SubmitButton pendingLabel="创建中…">创建</SubmitButton>
    </form>
  );
}
