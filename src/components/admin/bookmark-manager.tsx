'use client';

import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FolderTree,
  LayoutGrid,
  Link2,
  List,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  memo,
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
  bulkUpdateBookmarksAction,
  deleteBookmarkAction,
  reorderBookmarksAction,
  type BulkBookmarkInput,
} from '@/actions/bookmark';
import {
  BookmarkFormDialog,
  type BookmarkCategoryOption,
} from '@/components/admin/bookmark-form-dialog';
import { Favicon } from '@/components/nav/favicon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { colorSwatchClass } from '@/lib/category-color';
import { resolveCategoryIcon } from '@/lib/category-meta';
import { cn, formatDate, hostnameOf, truncate } from '@/lib/utils';

import type { AdminBookmark, AdminBookmarkGroup } from '@/db/queries/bookmarks';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { SortableList } from './dnd-list';
import { PageHeader } from './page-header';
import { RowAction } from './row-action';

/** Bookmark manager with list and card views, server-side search and drag-sorting. */

type EditingTarget =
  | { mode: 'new'; categoryId: string }
  | { mode: 'edit'; bookmark: AdminBookmark }
  | null;

type ViewMode = 'list' | 'cards';

const VIEW_STORAGE_KEY = 'origaminav.admin.bookmark-view';
const VIEW_EVENT = 'origaminav:viewchange';
const ALL_CATEGORIES = '__all__';
/** Typing pause before the search term is pushed to the URL. */
const SEARCH_DEBOUNCE_MS = 250;

/** Subscribes to the stored view preference. */
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
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'cards' ? 'cards' : 'list';
  } catch {
    return 'list';
  }
}

function readViewPreferenceOnServer(): ViewMode {
  return 'list';
}

export function BookmarkManager({
  groups,
  categories,
  query,
  truncated,
  aiEnabled,
}: {
  groups: AdminBookmarkGroup[];
  /** Every category, for the pickers; independent of the current search. */
  categories: BookmarkCategoryOption[];
  /** Search term the server filtered by; '' when browsing everything. */
  query: string;
  /** True when the search hit the server-side row cap. */
  truncated: boolean;
  /** Whether AI is configured; drives the form's fill button. */
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<EditingTarget>(null);
  const [deleting, setDeleting] = useState<AdminBookmark | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const view = useSyncExternalStore(
    subscribeToViewPreference,
    readViewPreference,
    readViewPreferenceOnServer,
  );
  const [pending, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  // Selection belongs to one result set: a new search term or category filter
  // replaces the rows on screen, so the old ids would be invisible but still act.
  const listKey = `${query}|${categoryFilter}`;
  const [lastListKey, setLastListKey] = useState(listKey);
  if (lastListKey !== listKey) {
    setLastListKey(listKey);
    setSelected(new Set());
  }

  function switchView(next: ViewMode) {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Storage blocked; applies to this tab only.
    }
    window.dispatchEvent(new Event(VIEW_EVENT));
  }

  // ── Deep link from the front-end context menu (?edit=<id>) ────────────────
  // Opens the edit dialog for the ?edit=<id> param during render.
  const editId = searchParams.get('edit');
  const [handledEditId, setHandledEditId] = useState<string | null>(null);
  if (editId && editId !== handledEditId) {
    setHandledEditId(editId);
    outer: for (const group of groups) {
      for (const bookmark of group.bookmarks) {
        if (bookmark.id === editId) {
          setEditing({ mode: 'edit', bookmark });
          break outer;
        }
      }
    }
  }

  // ── Search runs on the server, keyed off the URL ──────────────────────────
  // The input is uncontrolled on purpose. A controlled `value` gets rewritten to
  // the server's last echoed term, which drops keystrokes typed while a
  // navigation is in flight ("g" + "r" collapsing back to "g"). The URL stays
  // the source of truth for the filter; the DOM owns the caret.
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [hasSearchText, setHasSearchText] = useState(query !== '');
  const [pendingTerm, setPendingTerm] = useState(query);
  // Last keystroke, last query value this effect handled, and whether the user
  // has typed since the URL last matched the box.
  const typedTermRef = useRef(query);
  const seenQueryRef = useRef(query);
  const typedSinceSyncRef = useRef(false);

  useEffect(() => {
    if (seenQueryRef.current === query) return;
    seenQueryRef.current = query;
    // Never rewrite a box the user has typed into since the last sync: that is
    // our own navigation echoing back, and overwriting it drops keystrokes
    // ("g" + "r" collapsing to "g"). A change arriving after the typing has
    // settled is an external navigation, so the box follows it.
    if (typedSinceSyncRef.current) return;
    typedTermRef.current = query;
    setPendingTerm(query);
    setHasSearchText(query !== '');
    const input = searchInputRef.current;
    if (input) input.value = query;
  }, [query]);

  useEffect(() => {
    const trimmed = pendingTerm.trim();
    if (trimmed === query) return;
    const timer = setTimeout(() => {
      // Reads the live URL so the ?edit= deep link and any other param survive.
      const params = new URLSearchParams(window.location.search);
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      const suffix = params.toString();
      startTransition(() =>
        router.replace(suffix ? `?${suffix}` : '?', { scroll: false }),
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pendingTerm, query, router]);

  // The server already filtered; only the category filter is applied here.
  const filtering = query !== '';

  const visibleGroups = useMemo(() => {
    return groups.filter(
      (group) =>
        categoryFilter === ALL_CATEGORIES || group.category.id === categoryFilter,
    );
  }, [groups, categoryFilter]);

  const totalVisible = visibleGroups.reduce(
    (sum, group) => sum + group.bookmarks.length,
    0,
  );

  const makeReorderHandler = (categoryId: string) => async (orderedIds: string[]) => {
    const result = await reorderBookmarksAction(categoryId, orderedIds);
    if (result.ok) refresh();
    return result;
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const result = await deleteBookmarkAction(deleting.id);
    if (result.ok) {
      toast.success(result.message);
      setDeleting(null);
      refresh();
    } else {
      toast.error(result.message);
    }
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Clears the box and the filter; the DOM value is reset directly. */
  const clearSearch = useCallback(() => {
    if (searchInputRef.current) searchInputRef.current.value = '';
    typedTermRef.current = '';
    typedSinceSyncRef.current = false;
    setPendingTerm('');
    setHasSearchText(false);
  }, []);

  // Stable identities so the memoized rows skip re-rendering whenever this
  // component re-renders for an unrelated reason (typing, dialogs, collapse).
  const openEditor = useCallback((bookmark: AdminBookmark) => {
    setEditing({ mode: 'edit', bookmark });
  }, []);

  const requestDelete = useCallback((bookmark: AdminBookmark) => {
    setDeleting(bookmark);
  }, []);

  // ── Batch selection ───────────────────────────────────────────────────────
  // Stable identities: these reach the memoized rows, so an unstable callback
  // would re-render every row on any parent state change.
  const toggleSelect = useCallback((id: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }, []);

  const selectMany = useCallback((ids: string[], next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      for (const id of ids) {
        if (next) copy.add(id);
        else copy.delete(id);
      }
      return copy;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedIds = useMemo(() => [...selected], [selected]);

  /** Runs one batch operation, then reconciles with the server. */
  async function runBulk(input: BulkBookmarkInput) {
    setBulkBusy(true);
    try {
      const result = await bulkUpdateBookmarksAction(input);
      if (result.ok) {
        toast.success(result.message);
        clearSelection();
        refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      // Server actions reject on transport errors; keep the toast dismissible.
      console.error('[origaminav] bulk bookmark action failed', error);
      toast.error('批量操作失败，请检查网络后重试');
    } finally {
      setBulkBusy(false);
    }
  }

  // No category at all is the only case that has nothing to search either.
  if (categories.length === 0) {
    return (
      <div className="space-y-4">
        <ManagerHeader />
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          还没有分类。请先到「分类管理」创建分类，再添加书签。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ManagerHeader />

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border bg-card p-2.5 shadow-card">
        <div className="relative min-w-40 max-w-sm flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchInputRef}
            type="search"
            defaultValue={query}
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
            placeholder="搜索标题、链接、描述或标签…"
            aria-label="搜索书签"
            className="h-8 pr-7 pl-8 text-xs"
          />
          {pending ? (
            <LoaderCircle
              aria-hidden
              className="absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          ) : hasSearchText ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="清除搜索"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-auto min-w-32 gap-1.5 text-xs" aria-label="按分类筛选">
              <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>全部分类</SelectItem>
              {categories.map((category) => {
                // Counts come from the current result set, not the category row.
                const matched = groups.find(
                  (group) => group.category.id === category.id,
                );
                return (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                    {matched ? `（${matched.bookmarks.length}）` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <div className="flex items-center rounded-md border border-border p-0.5">
            <ViewButton
              active={view === 'list'}
              label="列表视图"
              onClick={() => switchView('list')}
            >
              <List className="size-3.5" />
            </ViewButton>
            <ViewButton
              active={view === 'cards'}
              label="卡片视图"
              onClick={() => switchView('cards')}
            >
              <LayoutGrid className="size-3.5" />
            </ViewButton>
          </div>

          <Button
            size="sm"
            className="h-8"
            onClick={() =>
              setEditing({
                mode: 'new',
                categoryId:
                  categoryFilter !== ALL_CATEGORIES
                    ? categoryFilter
                    : (categories[0]?.id ?? ''),
              })
            }
          >
            <Plus className="size-4" />
            添加书签
          </Button>
        </div>
      </div>

      {selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          busy={bulkBusy}
          categories={categories}
          onCategory={(categoryId) =>
            void runBulk({ op: 'category', ids: selectedIds, categoryId })
          }
          onTags={() => setBulkTagOpen(true)}
          onHidden={(hidden) =>
            void runBulk({ op: 'hidden', ids: selectedIds, hidden })
          }
          onDelete={() => setBulkDeleteOpen(true)}
          onClear={clearSelection}
        />
      ) : null}

      {filtering ? (
        <p className="text-xs text-muted-foreground" role="status">
          搜索「{query}」命中 {totalVisible} 条书签。
          {truncated
            ? '结果过多，仅显示前一部分，请补充关键词。'
            : '搜索状态下不可拖拽排序，清除搜索后恢复。'}
        </p>
      ) : null}

      {/* ── Category sections ────────────────────────────────────────────── */}
      {visibleGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          没有匹配的书签。
        </div>
      ) : (
        <div className="space-y-5">
          {visibleGroups.map((group) => {
            const isCollapsed = !filtering && collapsed.has(group.category.id);
            const Icon = resolveCategoryIcon(group.category.icon)?.Icon;
            const groupIds = group.bookmarks.map((bookmark) => bookmark.id);
            return (
              <section key={group.category.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <SelectAllCheckbox
                    ids={groupIds}
                    selected={selected}
                    onSelect={selectMany}
                    label={`选择「${group.category.name}」的全部书签`}
                  />
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(group.category.id)}
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `展开 ${group.category.name}` : `折叠 ${group.category.name}`}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        'size-4 transition-transform',
                        isCollapsed && '-rotate-90',
                      )}
                    />
                  </button>
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-md text-white',
                      colorSwatchClass(group.category.color),
                    )}
                  >
                    {Icon ? <Icon className="size-3.5" /> : null}
                  </span>
                  <h2 className="truncate text-sm font-medium">
                    {group.category.name}
                  </h2>
                  <Badge variant="secondary">{group.bookmarks.length}</Badge>
                  <div className="ml-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() =>
                        setEditing({ mode: 'new', categoryId: group.category.id })
                      }
                    >
                      <Plus className="size-3.5" />
                      添加
                    </Button>
                  </div>
                </div>

                {isCollapsed ? null : group.bookmarks.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                    该分类下还没有书签。
                  </div>
                ) : view === 'list' ? (
                  <SortableList
                    items={group.bookmarks}
                    onReorder={filtering ? undefined : makeReorderHandler(group.category.id)}
                    className="space-y-1.5"
                    // Skips layout and paint for offscreen rows; the intrinsic
                    // size must match BookmarkRow's height (padding + two text
                    // lines) or the list jitters while scrolling.
                    itemClassName="[content-visibility:auto] [contain-intrinsic-size:auto_3.375rem]"
                    renderItem={(bookmark, _index, handle) => (
                      <BookmarkRow
                        bookmark={bookmark}
                        handle={filtering ? null : handle}
                        selected={selected.has(bookmark.id)}
                        onToggleSelect={toggleSelect}
                        onEdit={openEditor}
                        onDelete={requestDelete}
                      />
                    )}
                  />
                ) : (
                  <SortableList
                    items={group.bookmarks}
                    onReorder={filtering ? undefined : makeReorderHandler(group.category.id)}
                    strategy="grid"
                    className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                    renderItem={(bookmark, _index, handle) => (
                      <BookmarkGridCard
                        bookmark={bookmark}
                        handle={filtering ? null : handle}
                        selected={selected.has(bookmark.id)}
                        onToggleSelect={toggleSelect}
                        onEdit={openEditor}
                        onDelete={requestDelete}
                      />
                    )}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}

      {editing ? (
        <BookmarkFormDialog
          categories={categories}
          categoryId={
            editing.mode === 'new' ? editing.categoryId : editing.bookmark.categoryId
          }
          bookmark={editing.mode === 'edit' ? editing.bookmark : null}
          aiEnabled={aiEnabled}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={<>删除书签「{deleting?.title}」？</>}
        description="书签会移入回收站，可在保留期内恢复。"
        confirmLabel="移入回收站"
        onConfirm={handleDelete}
      />

      <ConfirmDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => !open && setBulkDeleteOpen(false)}
        title={<>删除选中的 {selected.size} 条书签？</>}
        description="书签会移入回收站，标签关联一并保留，可在保留期内恢复。"
        confirmLabel="移入回收站"
        confirmDisabled={bulkBusy}
        onConfirm={() => {
          setBulkDeleteOpen(false);
          void runBulk({ op: 'delete', ids: selectedIds });
        }}
      />

      {bulkTagOpen ? (
        <BulkTagDialog
          count={selected.size}
          busy={bulkBusy}
          onClose={() => setBulkTagOpen(false)}
          onSubmit={(tagsInput) => {
            setBulkTagOpen(false);
            void runBulk({ op: 'tags', ids: selectedIds, tagsInput });
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Batch action bar. Appears only with a selection, and sticks to the top of the
 * viewport so the actions stay reachable while selecting further down.
 */
function BulkBar({
  count,
  busy,
  categories,
  onCategory,
  onTags,
  onHidden,
  onDelete,
  onClear,
}: {
  count: number;
  busy: boolean;
  categories: BookmarkCategoryOption[];
  onCategory: (categoryId: string) => void;
  onTags: () => void;
  onHidden: (hidden: boolean) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  // Remounts the picker after each pick, so it shows the placeholder again and
  // picking the same category twice still fires.
  const [pickerKey, setPickerKey] = useState(0);

  return (
    <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-card border border-primary/35 bg-primary/5 px-3 py-2 backdrop-blur lg:top-0">
      <span className="flex items-center gap-2 text-xs font-medium">
        <Check className="size-4 text-primary" aria-hidden />
        已选 <span className="tabular-nums">{count}</span> 条书签
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select
          key={pickerKey}
          disabled={busy}
          onValueChange={(value) => {
            setPickerKey((key) => key + 1);
            onCategory(value);
          }}
        >
          <SelectTrigger
            className="h-8 w-auto min-w-32 gap-1.5 text-xs"
            aria-label="批量改分类"
          >
            <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="改分类…" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={onTags}
        >
          <Tag className="size-3.5" aria-hidden />
          加标签
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={() => onHidden(true)}
        >
          <EyeOff className="size-3.5" aria-hidden />
          设为私有
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={() => onHidden(false)}
        >
          <Eye className="size-3.5" aria-hidden />
          设为公开
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-destructive hover:text-destructive"
          disabled={busy}
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

/** Comma-separated tag input for the batch "add tags" action. */
function BulkTagDialog({
  count,
  busy,
  onClose,
  onSubmit,
}: {
  count: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (tagsInput: string) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>为 {count} 条书签添加标签</DialogTitle>
          <DialogDescription>
            用逗号分隔多个标签，已有的标签会直接复用，不存在的会新建。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="bulk-tags">标签</Label>
          <Input
            id="bulk-tags"
            value={value}
            maxLength={500}
            autoFocus
            placeholder="例如：效率, 工具, 前端"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (value.trim()) onSubmit(value);
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            这些标签会追加到每条书签现有标签之后，不会替换它们。
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            disabled={busy || !value.trim()}
            onClick={() => onSubmit(value)}
          >
            {busy ? '添加中…' : '添加标签'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Tri-state checkbox for "select every bookmark in this category". */
function SelectAllCheckbox({
  ids,
  selected,
  onSelect,
  label,
}: {
  ids: string[];
  selected: ReadonlySet<string>;
  onSelect: (ids: string[], next: boolean) => void;
  label: string;
}) {
  const count = ids.reduce((sum, id) => sum + (selected.has(id) ? 1 : 0), 0);
  const all = ids.length > 0 && count === ids.length;
  const some = count > 0 && !all;

  return (
    <Checkbox
      checked={all ? true : some ? 'indeterminate' : false}
      onCheckedChange={(next) => onSelect(ids, next === true)}
      aria-label={label}
      title={label}
    />
  );
}

function ManagerHeader() {
  return (
    <PageHeader
      Icon={Link2}
      title="书签管理"
      description="按分类分组管理；拖动手柄调整分类内顺序，编辑时可更换所属分类。"
    />
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
  children: React.ReactNode;
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

// ── List row ─────────────────────────────────────────────────────────────────

function BookmarkRowImpl({
  bookmark,
  handle,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  bookmark: AdminBookmark;
  /** Null when drag-sorting is disabled. */
  handle: ReactNode;
  selected: boolean;
  onToggleSelect: (id: string, next: boolean) => void;
  onEdit: (bookmark: AdminBookmark) => void;
  onDelete: (bookmark: AdminBookmark) => void;
}) {
  const hostname = hostnameOf(bookmark.url);
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2',
        selected && 'border-primary/50 bg-primary/5',
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(next) => onToggleSelect(bookmark.id, next === true)}
        aria-label={`选择 ${bookmark.title}`}
      />
      {handle}
      <Favicon
        hostname={hostname}
        title={bookmark.title}
        iconUrl={bookmark.iconUrl}
        bookmarkId={bookmark.id}
        className="size-6"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {bookmark.title}
          </a>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {hostname}
          {bookmark.description ? ` · ${truncate(bookmark.description, 60)}` : ''}
        </p>
      </div>
      {bookmark.hidden ? (
        <Badge variant="outline" className="shrink-0">
          私有
        </Badge>
      ) : null}
      {bookmark.tags.length > 0 ? (
        <div className="hidden max-w-40 shrink-0 flex-wrap justify-end gap-1 md:flex">
          {bookmark.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              className="px-1.5 py-0 text-[11px] font-normal"
            >
              {tag.name}
            </Badge>
          ))}
          {bookmark.tags.length > 3 ? (
            <span className="text-[11px] text-muted-foreground">
              +{bookmark.tags.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}
      <span className="hidden shrink-0 text-xs text-muted-foreground/70 tabular-nums lg:inline">
        {formatDate(bookmark.createdAt)}
      </span>
      <RowAction
        label={`编辑 ${bookmark.title}`}
        hint="编辑书签"
        className="size-7 shrink-0"
        onClick={() => onEdit(bookmark)}
      >
        <Pencil className="size-3.5" />
      </RowAction>
      <RowAction
        label={`删除 ${bookmark.title}`}
        hint="移入回收站"
        destructive
        className="size-7 shrink-0"
        onClick={() => onDelete(bookmark)}
      >
        <Trash2 className="size-3.5" />
      </RowAction>
    </div>
  );
}

/** Memoized: parent state changes that leave this row's props untouched skip it. */
const BookmarkRow = memo(BookmarkRowImpl);

// ── Grid card ────────────────────────────────────────────────────────────────

function BookmarkGridCardImpl({
  bookmark,
  handle,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  bookmark: AdminBookmark;
  /** Null when drag-sorting is disabled. */
  handle: ReactNode;
  selected: boolean;
  onToggleSelect: (id: string, next: boolean) => void;
  onEdit: (bookmark: AdminBookmark) => void;
  onDelete: (bookmark: AdminBookmark) => void;
}) {
  const hostname = hostnameOf(bookmark.url);
  return (
    <div
      className={cn(
        'flex h-full flex-col gap-2 rounded-lg border bg-card p-3',
        selected && 'border-primary/50 bg-primary/5',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Checkbox
          className="mt-0.5"
          checked={selected}
          onCheckedChange={(next) => onToggleSelect(bookmark.id, next === true)}
          aria-label={`选择 ${bookmark.title}`}
        />
        {handle ? <span className="mt-0.5">{handle}</span> : null}
        <Favicon
          hostname={hostname}
          title={bookmark.title}
          iconUrl={bookmark.iconUrl}
          bookmarkId={bookmark.id}
          className="size-7"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{bookmark.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {hostname}
          </p>
        </div>
        {bookmark.hidden ? (
          <Badge variant="outline" className="shrink-0">
            私有
          </Badge>
        ) : null}
        <div className="flex shrink-0">
          <RowAction
            label={`编辑 ${bookmark.title}`}
            hint="编辑书签"
            className="size-7"
            onClick={() => onEdit(bookmark)}
          >
            <Pencil className="size-3.5" />
          </RowAction>
          <RowAction
            label={`删除 ${bookmark.title}`}
            hint="移入回收站"
            destructive
            className="size-7"
            onClick={() => onDelete(bookmark)}
          >
            <Trash2 className="size-3.5" />
          </RowAction>
        </div>
      </div>

      {bookmark.description ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {bookmark.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
        {bookmark.tags.slice(0, 4).map((tag) => (
          <Badge
            key={tag.id}
            variant="outline"
            className="px-1.5 py-0 text-[11px] font-normal"
          >
            {tag.name}
          </Badge>
        ))}
        {bookmark.tags.length > 4 ? (
          <span className="text-[11px] text-muted-foreground">
            +{bookmark.tags.length - 4}
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground/70 tabular-nums">
          {formatDate(bookmark.createdAt)}
        </span>
      </div>
    </div>
  );
}

/** Memoized: parent state changes that leave this card's props untouched skip it. */
const BookmarkGridCard = memo(BookmarkGridCardImpl);
