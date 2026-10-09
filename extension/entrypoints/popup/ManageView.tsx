import {
  ArrowLeft,
  CircleAlert,
  Loader2,
  Pencil,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
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
  ApiError,
  deleteBookmark,
  searchBookmarks,
  updateBookmark,
  type ExtBookmark,
  type ExtCategoryOption,
} from '@/utils/api';
import { isConfigured, loadConfig, type ExtConfig } from '@/utils/config';

import { Centered, ConnectNotice } from './common';

/** Typing pause before a search is sent to the site. */
const SEARCH_DEBOUNCE_MS = 250;
/** Mirrors the site's per-bookmark limits. */
const TAGS_PER_BOOKMARK = 10;
const TITLE_LIMIT = 100;

/** Splits tag input on commas (`,` `，` `、`), the same rule the site uses. */
function splitTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,，、]/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ].slice(0, TAGS_PER_BOOKMARK);
}

function failureMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.failure.message : fallback;
}

/** Searches the site's bookmarks and edits or deletes them in place. */
export function ManageView({
  siteName,
  onBack,
}: {
  siteName: string;
  onBack: () => void;
}) {
  const [config, setConfig] = useState<ExtConfig | null>(null);
  const [query, setQuery] = useState('');
  // null until a search has run, so the empty state can differ from "no hits".
  const [items, setItems] = useState<ExtBookmark[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  // Shipped with every search result, so the editor always has the full list.
  const [categories, setCategories] = useState<ExtCategoryOption[]>([]);

  useEffect(() => {
    void (async () => {
      setConfig(await loadConfig());
    })();
  }, []);

  useEffect(() => {
    if (!config) return;
    const term = query.trim();
    if (!term) {
      setItems(null);
      setSearchError(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void searchBookmarks(config, term)
        .then((found) => {
          if (cancelled) return;
          setItems(found.bookmarks);
          setCategories(found.categories);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setItems([]);
          setSearchError(failureMessage(error, '搜索失败，请重试'));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [config, query]);

  function openEditor(bookmark: ExtBookmark) {
    setRowError(null);
    setConfirmId(null);
    setEditingId(editingId === bookmark.id ? null : bookmark.id);
  }

  async function handleSave(
    bookmark: ExtBookmark,
    input: { title: string; categoryId: string; tags: string[] },
  ) {
    if (!config) return;
    setBusyId(bookmark.id);
    setRowError(null);
    try {
      await updateBookmark(config, bookmark.id, input);
      const categoryName =
        categories.find((category) => category.id === input.categoryId)?.name ??
        bookmark.categoryName;
      setItems(
        (current) =>
          current?.map((item) =>
            item.id === bookmark.id
              ? {
                  ...item,
                  title: input.title,
                  categoryId: input.categoryId,
                  categoryName,
                  tags: input.tags,
                }
              : item,
          ) ?? current,
      );
      setEditingId(null);
    } catch (error) {
      setRowError({
        id: bookmark.id,
        message: failureMessage(error, '保存失败，请重试'),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(bookmark: ExtBookmark) {
    if (!config) return;
    setBusyId(bookmark.id);
    setRowError(null);
    try {
      await deleteBookmark(config, bookmark.id);
      setItems(
        (current) =>
          current?.filter((item) => item.id !== bookmark.id) ?? current,
      );
      setConfirmId(null);
    } catch (error) {
      setRowError({
        id: bookmark.id,
        message: failureMessage(error, '删除失败，请重试'),
      });
    } finally {
      setBusyId(null);
    }
  }

  if (!config) {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  if (!isConfigured(config)) {
    return <ConnectNotice />;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <header className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="返回收藏"
          title="返回收藏当前页"
          onClick={onBack}
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">已收藏的书签</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            {siteName || 'OrigamiNav'} · 可改标题、分类与标签
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="扩展设置"
          title="更换站点地址或令牌"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          <Settings className="size-4 text-muted-foreground" />
        </Button>
      </header>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          className="pl-8"
          placeholder="搜索标题、链接或标签"
          aria-label="搜索已收藏的书签"
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        {searching ? (
          <Loader2
            className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </div>

      {searchError ? (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {searchError}
        </p>
      ) : null}

      {items === null ? (
        <p className="px-1 py-6 text-center text-xs leading-relaxed text-muted-foreground">
          输入关键词搜索已收藏的书签，
          <br />
          支持标题、网址、描述与标签。
        </p>
      ) : items.length === 0 && !searching ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
          没有匹配的收藏。
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((bookmark) => (
            <li
              key={bookmark.id}
              className="rounded-lg border bg-card px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" title={bookmark.title}>
                    {bookmark.title}
                  </p>
                  <p
                    className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted-foreground"
                    title={bookmark.url}
                  >
                    {hostnameOf(bookmark.url)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] leading-none text-muted-foreground">
                      {bookmark.categoryName}
                    </span>
                    {bookmark.hidden ? (
                      <span className="rounded-full bg-chart-4/15 px-1.5 py-0.5 text-[0.625rem] leading-none text-chart-4">
                        私有
                      </span>
                    ) : null}
                    {bookmark.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.625rem] leading-none text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`编辑 ${bookmark.title}`}
                    title="编辑标题、分类与标签"
                    disabled={busyId === bookmark.id}
                    onClick={() => openEditor(bookmark)}
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`删除 ${bookmark.title}`}
                    title="移入回收站"
                    disabled={busyId === bookmark.id}
                    onClick={() => {
                      setRowError(null);
                      setEditingId(null);
                      setConfirmId(
                        confirmId === bookmark.id ? null : bookmark.id,
                      );
                    }}
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              {editingId === bookmark.id ? (
                <BookmarkEditor
                  bookmark={bookmark}
                  categories={categories}
                  busy={busyId === bookmark.id}
                  onCancel={() => setEditingId(null)}
                  onSave={(input) => void handleSave(bookmark, input)}
                />
              ) : null}

              {confirmId === bookmark.id ? (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                  <p className="min-w-0 flex-1 text-[0.6875rem] leading-relaxed text-destructive">
                    移入站点回收站，可在后台恢复。
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={busyId === bookmark.id}
                    onClick={() => setConfirmId(null)}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    disabled={busyId === bookmark.id}
                    onClick={() => void handleDelete(bookmark)}
                  >
                    {busyId === bookmark.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                    删除
                  </Button>
                </div>
              ) : null}

              {rowError?.id === bookmark.id ? (
                <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-destructive">
                  <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {rowError.message}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Inline editor for one bookmark; Enter saves, Escape cancels. */
function BookmarkEditor({
  bookmark,
  categories,
  busy,
  onCancel,
  onSave,
}: {
  bookmark: ExtBookmark;
  categories: ExtCategoryOption[];
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { title: string; categoryId: string; tags: string[] }) => void;
}) {
  const [title, setTitle] = useState(bookmark.title);
  const [categoryId, setCategoryId] = useState(bookmark.categoryId);
  const [tags, setTags] = useState(bookmark.tags.join(', '));

  // The list can predate a move by another admin; keep the current one selectable.
  const options = categories.some(
    (category) => category.id === bookmark.categoryId,
  )
    ? categories
    : [{ id: bookmark.categoryId, name: bookmark.categoryName }, ...categories];
  const canSave = title.trim().length > 0 && !busy;

  return (
    <div
      className="mt-2 space-y-2 rounded-md border bg-muted/40 p-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`ext-edit-title-${bookmark.id}`} className="text-xs">
          标题
        </Label>
        <Input
          id={`ext-edit-title-${bookmark.id}`}
          value={title}
          maxLength={TITLE_LIMIT}
          className="h-8 text-xs"
          autoFocus
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSave) {
                onSave({
                  title: title.trim(),
                  categoryId,
                  tags: splitTags(tags),
                });
              }
            }
          }}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`ext-edit-category-${bookmark.id}`} className="text-xs">
          分类
        </Label>
        <Select value={categoryId} onValueChange={setCategoryId} disabled={busy}>
          <SelectTrigger
            id={`ext-edit-category-${bookmark.id}`}
            className="h-8 w-full text-xs"
          >
            <SelectValue placeholder="选择分类" />
          </SelectTrigger>
          <SelectContent>
            {options.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`ext-edit-tags-${bookmark.id}`} className="text-xs">
          标签
        </Label>
        <Input
          id={`ext-edit-tags-${bookmark.id}`}
          value={tags}
          className="h-8 text-xs"
          placeholder="如：前端, 工具"
          disabled={busy}
          onChange={(event) => setTags(event.target.value)}
        />
        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          逗号分隔，最多 {TAGS_PER_BOOKMARK} 个；不存在的标签会自动创建。
        </p>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={onCancel}
        >
          取消
        </Button>
        <Button
          type="button"
          size="xs"
          disabled={!canSave}
          onClick={() =>
            onSave({ title: title.trim(), categoryId, tags: splitTags(tags) })
          }
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          保存
        </Button>
      </div>
    </div>
  );
}

/** Site host without the www prefix; the raw URL when it does not parse. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
