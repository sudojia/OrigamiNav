'use client';

import {
  ArrowLeft,
  ChevronRight,
  EyeOff,
  Github,
  Plus,
  Search,
  Settings2,
  XCircle,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { aiTagBookmarkAction } from '@/actions/ai';
import { deleteBookmarkAction } from '@/actions/bookmark';
import { BookmarkCard } from '@/components/nav/bookmark-card';
import { CommandPalette } from '@/components/nav/command-palette';
import { NavChipBar, NavSidebar } from '@/components/nav/nav-sidebar';
import { BrandMark } from '@/components/nav/site-mark';
import { TagFilterBar } from '@/components/nav/tag-filter-bar';
import { ModeToggle } from '@/components/theme/theme-controls';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildHighlightRegex, filterNav, tokenize } from '@/lib/filter';
import { PROJECT_START_YEAR, PROJECT_URL } from '@/lib/project-links';
import { cn, truncate } from '@/lib/utils';
import type { NavBookmark, NavData, SiteSettings } from '@/types/nav';

/**
 * Admin-only edit form, split out of the public bundle. It renders only after
 * a signed-in admin opens it, so nothing is lost by loading it on demand.
 */
const BookmarkFormDialog = dynamic(
  () =>
    import('@/components/admin/bookmark-form-dialog').then(
      (mod) => mod.BookmarkFormDialog,
    ),
  { ssr: false },
);

/** "2026" in the start year, then "2026 - 2027" once the year rolls over. */
function copyrightYearLabel(currentYear: number): string {
  return currentYear > PROJECT_START_YEAR
    ? `${PROJECT_START_YEAR} - ${currentYear}`
    : String(PROJECT_START_YEAR);
}

/** Owns all client-side state for the public page; refreshes on tab re-activation. */
export function NavClient({
  initialNav,
  settings,
}: {
  initialNav: NavData;
  settings: SiteSettings;
}) {
  const [nav, setNav] = useState<NavData>(initialNav);
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState<NavBookmark | null>(null);
  const [retagging, setRetagging] = useState<NavBookmark | null>(null);
  const [retagBusy, setRetagBusy] = useState(false);
  const [editing, setEditing] = useState<NavBookmark | null>(null);
  const [creating, setCreating] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Category pinned by the ?category= deep link (null = browse everything).
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const router = useRouter();

  // Filtering runs against the deferred query: typing stays responsive while
  // the (memoized) card list updates at a lower priority.
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () => filterNav(nav, deferredQuery, activeTags),
    [nav, deferredQuery, activeTags],
  );
  const terms = useMemo(() => tokenize(deferredQuery), [deferredQuery]);
  const highlightRegex = useMemo(() => buildHighlightRegex(terms), [terms]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const category of filtered.categories) {
      map.set(category.id, category.bookmarks.length);
    }
    return map;
  }, [filtered.categories]);

  // ?category=<slug> deep link: read on mount and on back/forward; Link
  // clicks set state directly, so no router subscription is needed.
  useEffect(() => {
    const sync = () =>
      setSelectedSlug(
        new URLSearchParams(window.location.search).get('category'),
      );
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  /** Category pinned by ?category=; null when browsing everything. */
  const selectedCategory = useMemo(
    () =>
      selectedSlug
        ? (nav.categories.find((category) => category.slug === selectedSlug) ??
          null)
        : null,
    [nav.categories, selectedSlug],
  );

  const shownCategories = selectedCategory
    ? filtered.categories.filter(
        (category) => category.id === selectedCategory.id,
      )
    : filtered.categories;

  /** Usage count per tag over the unfiltered payload. */
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const category of nav.categories) {
      for (const bookmark of category.bookmarks) {
        for (const tag of bookmark.tags) {
          map.set(tag.id, (map.get(tag.id) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [nav]);

  // ── Freshness: re-syncs only when the tab becomes visible again ───────────
  // The server snapshot stays current through admin edits (revalidateSite),
  // so there is no mount-time refetch; returning to the tab catches up.
  const refreshNav = useCallback(async () => {
    try {
      const response = await fetch('/api/nav', { cache: 'no-store' });
      if (!response.ok) return;
      const fresh = (await response.json()) as NavData;
      // Ignores a malformed payload.
      if (Array.isArray(fresh.categories)) setNav(fresh);
    } catch {
      // Offline or a cold database: keeps the current snapshot.
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshNav();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshNav]);

  // ── Header height as a CSS variable ───────────────────────────────────────
  // Measures the sticky header and writes --header-h on resize.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => {
      document.documentElement.style.setProperty(
        '--header-h',
        `${el.offsetHeight}px`,
      );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Admin state, then the admin's hidden rows ─────────────────────────────
  // The HTML is shared and public-only, so a signed-in admin pulls the full
  // payload (hidden rows included) in this single response instead of waiting
  // for the next tab re-activation. Anonymous callers only get the flag.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || data?.isAdmin !== true) return;
        setIsAdmin(true);
        if (Array.isArray(data.nav?.categories)) setNav(data.nav as NavData);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Warms the lazily-imported admin dialog once the visitor turns out to be an
  // admin, so the first open is instant without putting it in the shared
  // anonymous bundle.
  useEffect(() => {
    if (!isAdmin) return;
    void import('@/components/admin/bookmark-form-dialog');
  }, [isAdmin]);

  const scrollToCategory = useCallback(
    (slug: string) => {
      const el = sectionRefs.current.get(slug);
      // Category view renders one section; other jumps switch views instead.
      if (!el) {
        router.push(`/?category=${slug}`);
        return;
      }
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      setActiveId(el.dataset.categoryId ?? null);
    },
    [router],
  );

  // ── Scroll-spy ─────────────────────────────────────────────────────────────
  // Tracks the active section from scroll position. Measurements are
  // rAF-throttled: a burst of scroll events costs at most one pass per frame.
  useEffect(() => {
    function update() {
      // Active section: the last one whose top has scrolled past the reader
      // line, read from scroll-padding-block-start.
      const parkedOffset =
        Number.parseFloat(
          getComputedStyle(document.documentElement).scrollPaddingBlockStart,
        ) || 0;
      const readerLine = Math.max(window.innerHeight * 0.25, parkedOffset + 8);
      let current: string | null = null;
      for (const category of filtered.categories) {
        const el = sectionRefs.current.get(category.slug);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= readerLine) {
          current = category.id;
        } else {
          break;
        }
      }
      // At the bottom of a scrollable page, the last section is active.
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight > 2;
      const atBottom =
        scrollable &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2;
      if (atBottom) {
        const last = filtered.categories[filtered.categories.length - 1];
        const lastEl = last ? sectionRefs.current.get(last.slug) : null;
        if (last && lastEl) current = last.id;
      }
      // No section is active above the first section.
      setActiveId(current);
      setScrolled(window.scrollY > 8);
    }

    let frame = 0;
    const scheduleUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    // Defers the first measurement to a frame.
    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [filtered.categories]);

  // ── Keyboard: "/" focuses search, Cmd/Ctrl+K opens the palette ────────────
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }

      if (event.key === 'Escape' && !typing) {
        setQuery('');
        setActiveTags([]);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // One stable ref callback keyed off the element's own id; the React 19
  // cleanup removes the map entry, so re-renders never detach/attach refs.
  const registerSection = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const slug = el.id;
    sectionRefs.current.set(slug, el);
    return () => {
      sectionRefs.current.delete(slug);
    };
  }, []);

  const toggleTag = (id: string) =>
    setActiveTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  // ── Admin context-menu intents (cards only wire these when isAdmin) ───────
  // Opens the edit dialog; `refreshNav` reconciles after save.
  const editBookmark = useCallback((bookmark: NavBookmark) => {
    setEditing(bookmark);
  }, []);

  const closeEditing = useCallback(() => {
    setEditing(null);
    void refreshNav();
  }, [refreshNav]);

  // Quick-add from the public page: the same dialog in create mode.
  const openCreate = useCallback(() => setCreating(true), []);

  const closeCreate = useCallback(() => {
    setCreating(false);
    void refreshNav();
  }, [refreshNav]);

  /** Active category; quick-add defaults to it, falling back to the first. */
  const activeCategory = useMemo(
    () => nav.categories.find((category) => category.id === activeId) ?? null,
    [nav.categories, activeId],
  );
  const createCategoryId = activeCategory?.id ?? nav.categories[0]?.id ?? '';

  /** Finds the category that owns a bookmark. */
  const editingCategoryId = useMemo(() => {
    if (!editing) return '';
    for (const category of nav.categories) {
      if (category.bookmarks.some((b) => b.id === editing.id)) {
        return category.id;
      }
    }
    return nav.categories[0]?.id ?? '';
  }, [editing, nav.categories]);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    const result = await deleteBookmarkAction(deleting.id);
    if (result.ok) {
      toast.success(result.message);
      const removedId = deleting.id;
      setDeleting(null);
      // Drops the card, then reconciles with the server.
      setNav((prev) => ({
        ...prev,
        categories: prev.categories.map((category) => ({
          ...category,
          bookmarks: category.bookmarks.filter((b) => b.id !== removedId),
        })),
      }));
      void refreshNav();
    } else {
      toast.error(result.message);
    }
  }, [deleting, refreshNav]);

  // Regenerates one bookmark's tags; replaces whatever it has now.
  const runRetag = useCallback(
    async (bookmark: NavBookmark) => {
      setRetagBusy(true);
      const toastId = toast.loading(
        `正在为「${truncate(bookmark.title, 24)}」重打标签…`,
      );
      try {
        const result = await aiTagBookmarkAction(bookmark.id);
        if (result.ok) {
          toast.success(result.message, { id: toastId });
          await refreshNav();
        } else {
          toast.error(result.message, { id: toastId });
        }
      } catch (error) {
        // Server actions reject on transport errors; keep the toast dismissible.
        console.error('[origaminav] retag request failed', error);
        toast.error('重打标签请求失败，请检查网络后重试', { id: toastId });
      } finally {
        setRetagBusy(false);
        setRetagging(null);
      }
    },
    [refreshNav],
  );

  // Retag replaces tags, so bookmarks that already have some ask first.
  const requestRetag = useCallback(
    (bookmark: NavBookmark) => {
      if (bookmark.tags.length === 0) {
        void runRetag(bookmark);
        return;
      }
      setRetagging(bookmark);
    },
    [runRetag],
  );

  const hasFilters = deferredQuery.trim().length > 0 || activeTags.length > 0;
  const searching = hasFilters;

  return (
    <div className="min-h-dvh bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        ref={headerRef}
        className={cn(
          'sticky top-0 z-30 border-b border-border backdrop-blur transition-[background-color,box-shadow] duration-200',
          scrolled
            ? 'bg-background/95 shadow-card'
            : 'bg-background/85 supports-[backdrop-filter]:bg-background/70',
        )}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark logoUrl={settings.logoUrl} />
              <div className="min-w-0">
                <h1 className="truncate font-display text-base leading-tight font-semibold">
                  {settings.siteName}
                </h1>
                {settings.tagline ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {settings.tagline}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="GitHub 仓库"
                title="GitHub 仓库"
              >
                <a href={PROJECT_URL} target="_blank" rel="noopener noreferrer">
                  <Github className="size-4" />
                </a>
              </Button>
              <ModeToggle skin={settings.defaultTheme} />
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="后台管理"
                title="后台管理"
              >
                <Link href="/admin">
                  <Settings2 className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="group relative flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
              />
              <Input
                ref={searchRef}
                type="text"
                inputMode="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索书签、分类或标签，支持拼音首字母"
                aria-label="搜索书签"
                className="h-11 rounded-full border-border/70 bg-muted/40 pr-24 pl-10 shadow-none transition-colors hover:border-border focus-visible:bg-background"
              />
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      searchRef.current?.focus();
                    }}
                    aria-label="清除搜索"
                    title="清除搜索"
                    className="rounded-full p-1 text-muted-foreground/70 transition-all hover:bg-muted hover:text-foreground active:scale-90"
                  >
                    <XCircle className="size-4 fill-muted/60" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  aria-label="打开命令面板（Ctrl+K）"
                  title="命令面板（Ctrl+K）"
                  className="hidden items-center gap-0.5 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:text-primary sm:inline-flex"
                >
                  <span className="font-sans">⌘</span>K
                </button>
              </div>
            </div>
          </div>

          <TagFilterBar
            tags={nav.tags}
            counts={tagCounts}
            active={activeTags}
            onToggle={toggleTag}
            onClear={() => setActiveTags([])}
          />
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        {!selectedCategory ? (
          <aside className="hidden w-48 shrink-0 lg:block">
            <NavSidebar
              categories={filtered.categories}
              activeId={activeId}
              onSelect={scrollToCategory}
              counts={counts}
            />
          </aside>
        ) : null}

        <main className="min-w-0 flex-1">
          <NavChipBar
            categories={filtered.categories}
            activeId={activeId}
            onSelect={scrollToCategory}
          />

          {!nav.available ? (
            <Notice
              title="数据库未连接"
              body="无法读取书签数据。请检查 DATABASE_URL 是否正确，以及数据库是否可达。"
            />
          ) : filtered.categories.length === 0 && nav.categories.length === 0 ? (
            <Notice
              title="还没有任何书签"
              body="登录后台添加分类和书签。"
            />
          ) : filtered.categories.length === 0 ? (
            <Notice
              title="没有匹配的结果"
              body={`没有书签匹配当前的搜索和标签条件。${hasFilters ? '按 Esc 可清除筛选。' : ''}`}
              action={
                hasFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery('');
                      setActiveTags([]);
                    }}
                  >
                    清除筛选
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-10">
              {selectedCategory ? (
                <Link
                  href="/"
                  onClick={() => setSelectedSlug(null)}
                  className="-mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                  返回全部
                </Link>
              ) : null}
              {searching ? (
                <p className="text-xs text-muted-foreground" role="status">
                  找到 {filtered.matched} / {filtered.total} 个书签
                  {activeTags.length > 0 ? `，已按 ${activeTags.length} 个标签筛选` : ''}
                </p>
              ) : null}

              {shownCategories.map((category) => {
                // Browsing caps the preview (0 = unlimited); the pinned view
                // and search always list all.
                const cap = settings.categoryPreviewCount;
                const capped =
                  cap > 0 &&
                  !searching &&
                  !selectedCategory &&
                  category.bookmarks.length > cap;
                const visible = capped
                  ? category.bookmarks.slice(0, cap)
                  : category.bookmarks;
                return (
                  <section
                    key={category.id}
                    id={category.slug}
                    ref={registerSection}
                    data-category-id={category.id}
                  >
                    <div className="mb-3 flex items-baseline gap-2">
                      <h2 className="font-display text-lg font-semibold tracking-tight">
                        {category.name}
                      </h2>
                      {category.hidden ? (
                        <EyeOff
                          className="size-4 self-center text-muted-foreground"
                          aria-label="私有分类"
                        />
                      ) : null}
                    </div>
                    {category.description ? (
                      <p className="mb-4 text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    ) : null}

                    <div
                      className="bookmark-grid"
                      style={
                        {
                          '--card-columns': settings.cardColumns,
                        } as React.CSSProperties
                      }
                    >
                      {visible.map((bookmark) => (
                        <BookmarkCard
                          key={bookmark.id}
                          bookmark={bookmark}
                          isAdmin={isAdmin}
                          aiEnabled={settings.aiEnabled}
                          onEdit={editBookmark}
                          onDelete={setDeleting}
                          onRetag={requestRetag}
                          highlightRegex={highlightRegex}
                        />
                      ))}
                    </div>
                    {capped ? (
                      <Link
                        href={`/?category=${category.slug}`}
                        onClick={() => setSelectedSlug(category.slug)}
                        className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        查看全部{' '}
                        {category.bookmarks.length.toLocaleString('zh-CN')} 个
                        <ChevronRight className="size-3.5" aria-hidden />
                      </Link>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          © {copyrightYearLabel(new Date().getFullYear())} Powered by{' '}
          <a
            href={PROJECT_URL}
            className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            OrigamiNav
          </a>
          .
        </div>
      </footer>

      <CommandPalette
        nav={nav}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onJumpToCategory={scrollToCategory}
      />

      {/* In-place edit dialog; rendered only when editing. */}
      {editing ? (
        <BookmarkFormDialog
          categories={nav.categories.map((category) => ({
            id: category.id,
            name: category.name,
          }))}
          categoryId={editingCategoryId}
          bookmark={editing}
          aiEnabled={settings.aiEnabled}
          onClose={closeEditing}
        />
      ) : null}

      {/* Quick-add button for admins; hidden when there is no category. */}
      {isAdmin && nav.categories.length > 0 ? (
        <button
          type="button"
          onClick={openCreate}
          aria-label="快速新增书签"
          title={
            activeCategory
              ? `在「${activeCategory.name}」下新增书签`
              : '快速新增书签'
          }
          className="fixed right-4 bottom-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 sm:right-6 sm:bottom-6"
        >
          <Plus className="size-6" aria-hidden />
        </button>
      ) : null}

      {creating ? (
        <BookmarkFormDialog
          categories={nav.categories.map((category) => ({
            id: category.id,
            name: category.name,
          }))}
          categoryId={createCategoryId}
          bookmark={null}
          aiEnabled={settings.aiEnabled}
          onClose={closeCreate}
        />
      ) : null}

      {/* Retag confirmation; only for bookmarks that already have tags. */}
      <AlertDialog
        open={retagging !== null}
        onOpenChange={(open) => {
          if (!open && !retagBusy) setRetagging(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重打「{retagging?.title}」的标签？</AlertDialogTitle>
            <AlertDialogDescription>
              会用 AI 重新生成标签，替换现有的 {retagging?.tags.length ?? 0}{' '}
              个标签。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retagBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={retagBusy}
              onClick={(event) => {
                event.preventDefault();
                if (retagging) void runRetag(retagging);
              }}
            >
              {retagBusy ? '重打中…' : '重打标签'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation. */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除书签「{deleting?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              标签关联会一并移除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Notice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

