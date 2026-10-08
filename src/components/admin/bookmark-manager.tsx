'use client';

import {
  ChevronDown,
  FolderTree,
  LayoutGrid,
  Link2,
  List,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
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
  deleteBookmarkAction,
  reorderBookmarksAction,
} from '@/actions/bookmark';
import {
  BookmarkFormDialog,
  type BookmarkCategoryOption,
} from '@/components/admin/bookmark-form-dialog';
import { Favicon } from '@/components/nav/favicon';
import { Badge } from '@/components/ui/badge';
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
import { colorSwatchClass } from '@/lib/category-color';
import { resolveCategoryIcon } from '@/lib/category-meta';
import { cn, formatDate, hostnameOf, truncate } from '@/lib/utils';

import type { AdminBookmark, AdminBookmarkGroup } from '@/db/queries/bookmarks';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { SortableList } from './dnd-list';
import { PageHeader } from './page-header';

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
  const view = useSyncExternalStore(
    subscribeToViewPreference,
    readViewPreference,
    readViewPreferenceOnServer,
  );
  const [pending, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

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
            return (
              <section key={group.category.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(group.category.id)}
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `展开 ${group.category.name}` : `折叠 ${group.category.name}`}
                    className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
    </div>
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
  onEdit,
  onDelete,
}: {
  bookmark: AdminBookmark;
  /** Null when drag-sorting is disabled. */
  handle: ReactNode;
  onEdit: (bookmark: AdminBookmark) => void;
  onDelete: (bookmark: AdminBookmark) => void;
}) {
  const hostname = hostnameOf(bookmark.url);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2">
      {handle}
      <Favicon
        hostname={hostname}
        title={bookmark.title}
        iconUrl={bookmark.iconUrl}
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
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={`编辑 ${bookmark.title}`}
        onClick={() => onEdit(bookmark)}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-destructive hover:text-destructive"
        aria-label={`删除 ${bookmark.title}`}
        onClick={() => onDelete(bookmark)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

/** Memoized: parent state changes that leave this row's props untouched skip it. */
const BookmarkRow = memo(BookmarkRowImpl);

// ── Grid card ────────────────────────────────────────────────────────────────

function BookmarkGridCardImpl({
  bookmark,
  handle,
  onEdit,
  onDelete,
}: {
  bookmark: AdminBookmark;
  /** Null when drag-sorting is disabled. */
  handle: ReactNode;
  onEdit: (bookmark: AdminBookmark) => void;
  onDelete: (bookmark: AdminBookmark) => void;
}) {
  const hostname = hostnameOf(bookmark.url);
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2.5">
        {handle ? <span className="mt-0.5">{handle}</span> : null}
        <Favicon
          hostname={hostname}
          title={bookmark.title}
          iconUrl={bookmark.iconUrl}
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
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`编辑 ${bookmark.title}`}
            onClick={() => onEdit(bookmark)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            aria-label={`删除 ${bookmark.title}`}
            onClick={() => onDelete(bookmark)}
          >
            <Trash2 className="size-3.5" />
          </Button>
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
