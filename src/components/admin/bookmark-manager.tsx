'use client';

import {
  ChevronDown,
  FolderTree,
  LayoutGrid,
  Link2,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useMemo,
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
import { BookmarkFormDialog } from '@/components/admin/bookmark-form-dialog';
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
import { colorSwatchClass, resolveCategoryIcon } from '@/lib/category-meta';
import { tokenize } from '@/lib/filter';
import { cn, formatDate, hostnameOf, truncate } from '@/lib/utils';

import type { AdminBookmark, AdminBookmarkGroup } from '@/db/queries/bookmarks';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { SortableList } from './dnd-list';
import { PageHeader } from './page-header';

/** Bookmark manager with list and card views, filtering and drag-sorting. */

type EditingTarget =
  | { mode: 'new'; categoryId: string }
  | { mode: 'edit'; bookmark: AdminBookmark }
  | null;

type ViewMode = 'list' | 'cards';

const VIEW_STORAGE_KEY = 'origaminav.admin.bookmark-view';
const VIEW_EVENT = 'origaminav:viewchange';
const ALL_CATEGORIES = '__all__';

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
  aiEnabled,
}: {
  groups: AdminBookmarkGroup[];
  /** Whether AI is configured; drives the form's fill button. */
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<EditingTarget>(null);
  const [deleting, setDeleting] = useState<AdminBookmark | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const view = useSyncExternalStore(
    subscribeToViewPreference,
    readViewPreference,
    readViewPreferenceOnServer,
  );
  const [, startTransition] = useTransition();

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

  const terms = useMemo(() => tokenize(query), [query]);
  const filtering = terms.length > 0;

  const visibleGroups = useMemo(() => {
    return groups
      .filter(
        (group) =>
          categoryFilter === ALL_CATEGORIES || group.category.id === categoryFilter,
      )
      .map((group) => {
        if (!filtering) return group;
        return {
          ...group,
          bookmarks: group.bookmarks.filter((bookmark) =>
            terms.every((term) => bookmark.searchIndex.includes(term)),
          ),
        };
      })
      .filter((group) => !filtering || group.bookmarks.length > 0);
  }, [groups, categoryFilter, filtering, terms]);

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

  if (groups.length === 0) {
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
        <div className="relative min-w-40 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="筛选标题、链接、描述或标签…"
            aria-label="筛选书签"
            className="h-8 pr-7 pl-8 text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="清除筛选"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-auto min-w-32 gap-1.5 text-xs" aria-label="按分类筛选">
            <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>全部分类</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.category.id} value={group.category.id}>
                {group.category.name}（{group.bookmarks.length}）
              </SelectItem>
            ))}
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
                  : (groups[0]?.category.id ?? ''),
            })
          }
        >
          <Plus className="size-4" />
          添加书签
        </Button>
      </div>

      {filtering ? (
        <p className="text-xs text-muted-foreground" role="status">
          筛选出 {totalVisible} 条书签。筛选状态下不可拖拽排序，清除筛选后恢复。
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
                    renderItem={(bookmark, _index, handle) => (
                      <BookmarkRow
                        bookmark={bookmark}
                        handle={filtering ? null : handle}
                        onEdit={() => setEditing({ mode: 'edit', bookmark })}
                        onDelete={() => setDeleting(bookmark)}
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
                        onEdit={() => setEditing({ mode: 'edit', bookmark })}
                        onDelete={() => setDeleting(bookmark)}
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
          categories={groups.map((group) => ({
            id: group.category.id,
            name: group.category.name,
          }))}
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
        description="标签关联会一并移除，此操作不可撤销。"
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

function BookmarkRow({
  bookmark,
  handle,
  onEdit,
  onDelete,
}: {
  bookmark: AdminBookmark;
  /** Null when drag-sorting is disabled. */
  handle: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2">
      {handle}
      <Favicon
        hostname={hostnameOf(bookmark.url)}
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
          {hostnameOf(bookmark.url)}
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
        onClick={onEdit}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-destructive hover:text-destructive"
        aria-label={`删除 ${bookmark.title}`}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

// ── Grid card ────────────────────────────────────────────────────────────────

function BookmarkGridCard({
  bookmark,
  handle,
  onEdit,
  onDelete,
}: {
  bookmark: AdminBookmark;
  /** Null when drag-sorting is disabled. */
  handle: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2.5">
        {handle ? <span className="mt-0.5">{handle}</span> : null}
        <Favicon
          hostname={hostnameOf(bookmark.url)}
          title={bookmark.title}
          iconUrl={bookmark.iconUrl}
          className="size-7"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{bookmark.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {hostnameOf(bookmark.url)}
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
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            aria-label={`删除 ${bookmark.title}`}
            onClick={onDelete}
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
