import {
  BookmarkCheck,
  Check,
  CircleAlert,
  FolderPlus,
  Globe,
  Library,
  Loader2,
  Plus,
  Settings,
  X,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  ApiError,
  createBookmark,
  createCategory,
  fetchContext,
  type ExistingBookmark,
  type ExtContext,
} from '@/utils/api';
import { isConfigured, lastCategoryItem, loadConfig } from '@/utils/config';
import { getActivePageMeta, type PageMeta } from '@/utils/page';
import { cn } from '@/utils/cn';

import { ManageView } from './ManageView';
import { Centered, ConnectNotice } from './common';

const TITLE_LIMIT = 100;
const DESCRIPTION_LIMIT = 300;
const CATEGORY_NAME_LIMIT = 40;
/** Sentinel select value for the "new category" item. */
const NEW_CATEGORY = '__new__';

type Phase = 'loading' | 'unsupported' | 'unconfigured' | 'error' | 'ready';

interface BootError {
  message: string;
  /** Whether to offer opening the options page. */
  settingsHint: boolean;
}

/** Detect page → pick category → save. */
export function App() {
  const [view, setView] = useState<'save' | 'manage'>('save');
  const [phase, setPhase] = useState<Phase>('loading');
  const [bootError, setBootError] = useState<BootError | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [context, setContext] = useState<ExtContext | null>(null);
  const [siteName, setSiteName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [duplicate, setDuplicate] = useState<ExistingBookmark | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(
    null,
  );
  const [favIconFailed, setFavIconFailed] = useState(false);

  const boot = useCallback(async () => {
    // No setState before the first await (react-hooks/set-state-in-effect).
    const pageMeta = await getActivePageMeta();
    setBootError(null);
    setDuplicate(null);
    setSaveError(null);
    setContext(null);
    setFavIconFailed(false);

    if (!pageMeta) {
      setMeta(null);
      setPhase('unsupported');
      return;
    }
    setMeta(pageMeta);
    setTitle(pageMeta.title.slice(0, TITLE_LIMIT));
    setDescription(pageMeta.description.slice(0, DESCRIPTION_LIMIT));

    const config = await loadConfig();
    if (!isConfigured(config)) {
      setPhase('unconfigured');
      return;
    }
    try {
      const next = await fetchContext(config, pageMeta.url);
      setContext(next);
      setSiteName(next.siteName);
      const lastId = await lastCategoryItem.getValue();
      setCategoryId(
        next.categories.some((category) => category.id === lastId)
          ? (lastId as string)
          : (next.categories[0]?.id ?? ''),
      );
      setDuplicate(next.existing);
      setPhase('ready');
    } catch (error) {
      setBootError({
        message:
          error instanceof ApiError
            ? error.failure.message
            : '加载失败，请重试',
        settingsHint:
          error instanceof ApiError && error.failure.kind === 'unauthorized',
      });
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  /** Back-to-loading reset for manual retries. */
  function retry() {
    setPhase('loading');
    setBootError(null);
    void boot();
  }

  async function handleSave(force: boolean) {
    if (!meta || !categoryId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createBookmark(await loadConfig(), {
        title: title.trim(),
        url: meta.url,
        description: description.trim(),
        iconUrl: meta.favIconUrl,
        categoryId,
        hidden: isPrivate,
        force,
      });
      await lastCategoryItem.setValue(categoryId);
      const name = context?.categories.find(
        (category) => category.id === categoryId,
      )?.name;
      setSavedTo(name ?? null);
      setTimeout(() => window.close(), 1500);
    } catch (error) {
      if (error instanceof ApiError && error.failure.kind === 'duplicate') {
        setDuplicate(error.failure.existing);
      } else {
        setSaveError(
          error instanceof ApiError ? error.failure.message : '保存失败，请重试',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCategoryChange(value: string) {
    if (value === NEW_CATEGORY) {
      setCreateCategoryError(null);
      setCreateMode(true);
      return;
    }
    setCategoryId(value);
  }

  function exitCreateMode() {
    setCreateMode(false);
    setNewCategoryName('');
    setCreateCategoryError(null);
  }

  async function confirmCreateCategory() {
    const name = newCategoryName.trim();
    if (!name || creatingCategory) return;
    setCreatingCategory(true);
    setCreateCategoryError(null);
    try {
      const { category } = await createCategory(await loadConfig(), { name });
      setContext((current) => {
        if (!current) return current;
        const exists = current.categories.some(
          (item) => item.id === category.id,
        );
        return exists
          ? current
          : { ...current, categories: [...current.categories, category] };
      });
      setCategoryId(category.id);
      exitCreateMode();
    } catch (error) {
      setCreateCategoryError(
        error instanceof ApiError ? error.failure.message : '创建失败，请重试',
      );
    } finally {
      setCreatingCategory(false);
    }
  }

  // ── Bookmark manager ───────────────────────────────────────────────────

  if (view === 'manage') {
    return <ManageView siteName={siteName} onBack={() => setView('save')} />;
  }

  // ── Non-form states ────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">正在识别页面…</p>
      </Centered>
    );
  }

  if (phase === 'unsupported') {
    return (
      <Centered>
        <CircleAlert className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">此页面无法收藏</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          只支持收藏 http(s) 网页，浏览器内置页面除外。
        </p>
        <Button size="sm" variant="outline" onClick={() => setView('manage')}>
          <Library className="size-4" />
          管理已收藏
        </Button>
      </Centered>
    );
  }

  if (phase === 'unconfigured') {
    return <ConnectNotice />;
  }

  if (phase === 'error' && bootError) {
    return (
      <Centered>
        <CircleAlert className="size-8 text-destructive/80" />
        <p className="text-sm font-medium">加载失败</p>
        <p className="max-w-[16rem] text-center text-xs leading-relaxed text-muted-foreground">
          {bootError.message}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={retry}>
            重试
          </Button>
          {bootError.settingsHint ? (
            <Button
              size="sm"
              onClick={() => void browser.runtime.openOptionsPage()}
            >
              打开选项页
            </Button>
          ) : null}
        </div>
      </Centered>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────

  if (savedTo !== null) {
    return (
      <Centered>
        <span className="animate-pop-in flex size-12 items-center justify-center rounded-full bg-chart-3/15">
          <BookmarkCheck className="size-6 text-chart-3" />
        </span>
        <p className="text-sm font-medium">已添加</p>
        {savedTo ? (
          <p className="text-xs text-muted-foreground">
            收入分类「{savedTo}」，窗口即将关闭…
          </p>
        ) : null}
      </Centered>
    );
  }

  const hostname = meta ? new URL(meta.url).hostname : '';
  const activeCategory = context?.categories.find(
    (category) => category.id === categoryId,
  );

  // ── Ready / form state ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3.5 p-4">
      {/* Page header: favicon + hostname + site identity. */}
      <header className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-card">
          {meta?.favIconUrl && !favIconFailed ? (
            <img
              src={meta.favIconUrl}
              alt=""
              aria-hidden
              className="size-full rounded-[inherit] object-contain p-0.5"
              onError={() => setFavIconFailed(true)}
            />
          ) : (
            <Globe className="size-4 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{hostname}</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            收藏到 {siteName || 'OrigamiNav'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="管理已收藏"
          title="搜索、改标签或删除已收藏"
          className="shrink-0"
          onClick={() => setView('manage')}
        >
          <Library className="size-4 text-muted-foreground" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="扩展设置"
          title="更换站点地址或令牌"
          className="shrink-0"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          <Settings className="size-4 text-muted-foreground" />
        </Button>
      </header>

      {duplicate ? (
        <div className="animate-fade-up flex items-start gap-2.5 rounded-lg border border-chart-4/40 bg-chart-4/10 px-3 py-2.5">
          <BookmarkCheck className="mt-0.5 size-4 shrink-0 text-chart-4" />
          <div className="min-w-0 flex-1 text-xs leading-relaxed">
            <p className="font-medium">
              已收藏于「{duplicate.categoryName}」
            </p>
            <p className="mt-0.5 line-clamp-1 text-muted-foreground">
              {duplicate.title}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="shrink-0"
            disabled={saving}
            onClick={() => void handleSave(true)}
          >
            仍然添加
          </Button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="ext-title">标题</Label>
          <span
            className={cn(
              'text-[0.6875rem] tabular-nums',
              title.length >= TITLE_LIMIT
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {title.length}/{TITLE_LIMIT}
          </span>
        </div>
        <Input
          id="ext-title"
          value={title}
          maxLength={TITLE_LIMIT}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void handleSave(Boolean(duplicate));
            }
          }}
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label>链接</Label>
        <p
          className="truncate rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground"
          title={meta?.url}
        >
          {meta?.url}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="ext-description">描述</Label>
          <span
            className={cn(
              'text-[0.6875rem] tabular-nums',
              description.length >= DESCRIPTION_LIMIT
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {description.length}/{DESCRIPTION_LIMIT}
          </span>
        </div>
        <Textarea
          id="ext-description"
          value={description}
          maxLength={DESCRIPTION_LIMIT}
          rows={2}
          className="max-h-32"
          placeholder="页面描述（自动读取，可修改）"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ext-category">分类</Label>
        {createMode ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input
                id="ext-new-category"
                value={newCategoryName}
                maxLength={CATEGORY_NAME_LIMIT}
                placeholder="分类名称"
                autoFocus
                disabled={creatingCategory}
                onChange={(event) => setNewCategoryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void confirmCreateCategory();
                  } else if (event.key === 'Escape') {
                    exitCreateMode();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="创建分类"
                className="shrink-0"
                disabled={creatingCategory || !newCategoryName.trim()}
                onClick={() => void confirmCreateCategory()}
              >
                {creatingCategory ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="取消创建分类"
                className="shrink-0"
                disabled={creatingCategory}
                onClick={exitCreateMode}
              >
                <X className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              回车确认，Esc 取消；重名将直接复用已有分类。
            </p>
            {createCategoryError ? (
              <p className="text-xs leading-relaxed text-destructive">
                {createCategoryError}
              </p>
            ) : null}
          </div>
        ) : context && context.categories.length > 0 ? (
          <Select
            value={categoryId}
            onValueChange={handleCategoryChange}
            disabled={saving}
          >
            <SelectTrigger id="ext-category" className="w-full">
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {context.categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
              <SelectItem value={NEW_CATEGORY} className="text-primary">
                <span className="flex items-center gap-1.5">
                  <Plus className="size-3.5" aria-hidden />
                  新建分类…
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={saving}
            onClick={() => {
              setCreateCategoryError(null);
              setCreateMode(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            新建分类
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium">设为私有</p>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
            私有书签不会出现在公开导航页，仅登录管理员可见。
          </p>
        </div>
        <Switch
          checked={isPrivate}
          onCheckedChange={setIsPrivate}
          disabled={saving}
          aria-label="设为私有"
        />
      </div>

      {saveError ? (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {saveError}
        </p>
      ) : null}

      <Button
        type="button"
        className="w-full"
        disabled={saving || !categoryId}
        onClick={() => void handleSave(Boolean(duplicate))}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FolderPlus className="size-4" />
        )}
        {duplicate ? '仍然添加' : '添加收藏'}
      </Button>

      {activeCategory && !duplicate ? (
        <p className="text-center text-[0.6875rem] text-muted-foreground">
          将保存到「{activeCategory.name}」{isPrivate ? '（私有）' : ''}
          ，可在管理后台调整。
        </p>
      ) : null}
    </div>
  );
}
