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
  useLayoutEffect,
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
import { buildHighlightRegex } from '@/lib/filter';
import { tokenize } from '@/lib/search-query';
import { categoryHref } from '@/lib/nav-links';
import { PROJECT_START_YEAR, PROJECT_URL } from '@/lib/project-links';
import { cn, truncate } from '@/lib/utils';
import type {
  NavBookmark,
  NavCategory,
  NavData,
  NavSearchResult,
  NavTagCount,
  SiteSettings,
} from '@/types/nav';

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

/** Typing pause before a search request goes out. */
const SEARCH_DEBOUNCE_MS = 200;

/** "2026" in the start year, then "2026 - 2027" once the year rolls over. */
function copyrightYearLabel(currentYear: number): string {
  return currentYear > PROJECT_START_YEAR
    ? `${PROJECT_START_YEAR} - ${currentYear}`
    : String(PROJECT_START_YEAR);
}

/** Owns all client-side state for the public pages; refreshes on tab re-activation. */
export function NavClient({
  initialNav,
  settings,
  pinnedSlug,
  pinnedTag,
}: {
  initialNav: NavData;
  settings: SiteSettings;
  /** Set by a category page; null on the nav page. */
  pinnedSlug: string | null;
  /** Set by a tag page, whose payload already holds only that tag's bookmarks. */
  pinnedTag: NavTagCount | null;
}) {
  const [nav, setNav] = useState<NavData>(initialNav);
  // Both start empty and are filled from the URL by the mount effect below:
  // reading `window.location` during the first render would render one thing on
  // the server and another on the client.
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
  // Category pinned by the server (category page) or by the ?category= deep
  // link (null = browse everything).
  const [selectedSlug, setSelectedSlug] = useState<string | null>(pinnedSlug);

  // ── Server-side search state ──────────────────────────────────────────────
  // The browser holds no search index, so any query or tag filter round-trips.
  // A null result set means "no filter is active, show the server snapshot".
  const [results, setResults] = useState<NavSearchResult | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Incremented by the retry button to re-run the search effect.
  const [searchAttempt, setSearchAttempt] = useState(0);
  // Bumped per request so a slow earlier response cannot overwrite a later one.
  const searchSeq = useRef(0);
  // True while a keystroke is still on its way into the URL.
  const typedSinceSyncRef = useRef(false);
  // Filter state as of the last write-back, so only a real change triggers one.
  const lastFilterRef = useRef<{ query: string; tags: string } | null>(null);
  // Current filter state for the URL helpers. Kept in refs so those helpers can
  // have a stable identity: a changing one would re-register the popstate
  // listener on every keystroke, and the sync must react to URL changes rather
  // than to state changes (a state-driven sync would undo a local clear).
  const queryRef = useRef('');
  const activeTagsRef = useRef<string[]>([]);
  // Last URL this component synced from, so only a real URL change syncs.
  const lastUrlRef = useRef<string | null>(null);
  const tagKey = activeTags.join(',');
  // The tag a tag page is pinned to. Sent as its own parameter because `tags`
  // is an OR group: a page whose title names one tag must AND it, not OR it.
  const pinId = pinnedTag?.id ?? null;

  // Layout effects run before passive effects, so the refs are current by the
  // time the URL sync below reads them.
  useLayoutEffect(() => {
    queryRef.current = query;
    activeTagsRef.current = activeTags;
  }, [query, activeTags]);

  const searchRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const router = useRouter();

  // ── Filters live in the URL ───────────────────────────────────────────────
  // `?q=` and `?tags=` make a search shareable and survive a reload. The input
  // stays a plain controlled value: nothing echoes the URL back into it, so
  // there is no path that can clobber what is being typed.
  //
  // The URL is read from `window.location` on mount and on popstate rather than
  // through `useSearchParams()`, which would force a CSR bailout and cost the
  // category pages their prerendered HTML.
  const syncFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const nextQuery = params.get('q') ?? '';
    const nextTags = (params.get('tags') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const currentTags = activeTagsRef.current;
    const tagsChanged =
      nextTags.length !== currentTags.length ||
      nextTags.some((id, index) => id !== currentTags[index]);
    // A category-only change is handled by the slug sync below.
    if (nextQuery === queryRef.current && !tagsChanged) return;
    setQuery(nextQuery);
    setActiveTags(nextTags);
    setResults(null);
    setSearchFailed(false);
    // The URL is now the source of the state, so the next URL change is external.
    typedSinceSyncRef.current = false;
  }, []);

  // Syncs from the URL on mount and whenever it actually changes (back/forward,
  // a shared link) — never as a reaction to filter state, which would undo a
  // local clear. Skipped while a keystroke is on its way into the URL.
  useEffect(() => {
    const sync = () => {
      if (!pinnedSlug) {
        setSelectedSlug(
          new URLSearchParams(window.location.search).get('category'),
        );
      }
      lastUrlRef.current = window.location.search;
      if (typedSinceSyncRef.current) return;
      syncFromUrl();
    };

    if (lastUrlRef.current === null) {
      sync();
    } else if (lastUrlRef.current !== window.location.search) {
      syncFromUrl();
      lastUrlRef.current = window.location.search;
    }

    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [pinnedSlug, syncFromUrl]);

  // Terms drive highlighting only; matching itself happens on the server.
  const deferredQuery = useDeferredValue(query);
  const terms = useMemo(() => tokenize(deferredQuery), [deferredQuery]);
  const highlightRegex = useMemo(() => buildHighlightRegex(terms), [terms]);

  // ── Freshness: re-syncs only when the tab becomes visible again ───────────
  // The server snapshot stays current through admin edits (revalidateSite),
  // so there is no mount-time refetch; returning to the tab catches up. A tag
  // page asks for its own slice: the unfiltered payload would widen the page.
  const tagQuery = pinnedTag ? `?tag=${encodeURIComponent(pinnedTag.slug)}` : '';
  const navUrl = `/api/nav${tagQuery}`;
  const meUrl = `/api/me${tagQuery}`;
  const refreshNav = useCallback(async () => {
    try {
      const response = await fetch(navUrl, { cache: 'no-store' });
      if (!response.ok) return;
      const fresh = (await response.json()) as NavData;
      // Ignores a malformed payload.
      if (Array.isArray(fresh.categories)) setNav(fresh);
    } catch {
      // Offline or a cold database: keeps the current snapshot.
    }
  }, [navUrl]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshNav();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshNav]);

  // ── Search request, debounced ─────────────────────────────────────────────
  // The controller lives in the effect, so a query change aborts the previous
  // request before the next one starts.
  useEffect(() => {
    const trimmed = query.trim();
    // Nothing to narrow down: the server snapshot is already on screen.
    if (!trimmed && tagKey === '') return;

    const seq = (searchSeq.current += 1);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (trimmed) params.set('q', trimmed);
        if (tagKey) params.set('tags', tagKey);
        if (pinId) params.set('pin', pinId);
        const response = await fetch(`/api/nav?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as NavSearchResult;
        // A newer request has already landed; drop this one.
        if (seq !== searchSeq.current) return;
        setResults(
          Array.isArray(payload.categories)
            ? payload
            : { categories: [], truncated: false, cursor: null },
        );
        setSearchFailed(false);
      } catch (error) {
        if (controller.signal.aborted || seq !== searchSeq.current) return;
        console.error('[origaminav] search request failed', error);
        setSearchFailed(true);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `tagKey` is the user's own filters; the pinned tag rides in `pinId`, and
    // reading it here would make a tag page search on mount.
  }, [query, tagKey, pinId, searchAttempt]);

  /**
   * Appends the next search page. The cursor and the `matched` total are
   * carried over from the current page, so the count never shrinks.
   */
  const loadMoreResults = useCallback(async () => {
    const current = results;
    if (!current?.cursor || loadingMore) return;

    setLoadingMore(true);
    // A cursor request is the same query, so it must not be treated as a new
    // search: bump the sequence only to invalidate any in-flight first page.
    const seq = (searchSeq.current += 1);
    try {
      const params = new URLSearchParams();
      const trimmed = query.trim();
      if (trimmed) params.set('q', trimmed);
      if (tagKey) params.set('tags', tagKey);
      if (pinId) params.set('pin', pinId);
      params.set('cursor', current.cursor);

      const response = await fetch(`/api/nav?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as NavSearchResult;
      if (seq !== searchSeq.current || !Array.isArray(page.categories)) return;

      // Merge into the categories already on screen instead of repeating them.
      const merged = current.categories.map((category) => ({
        ...category,
        bookmarks: [...category.bookmarks],
      }));
      const byId = new Map(merged.map((category) => [category.id, category]));
      for (const category of page.categories) {
        const existing = byId.get(category.id);
        if (existing) existing.bookmarks.push(...category.bookmarks);
        else {
          const added = { ...category, bookmarks: [...category.bookmarks] };
          byId.set(category.id, added);
          merged.push(added);
        }
      }

      setResults({
        categories: merged,
        truncated: page.truncated,
        cursor: page.cursor,
      });
    } catch (error) {
      if (seq !== searchSeq.current) return;
      console.error('[origaminav] load more failed', error);
      toast.error('加载更多失败，请重试');
    } finally {
      setLoadingMore(false);
    }
  }, [results, loadingMore, query, tagKey, pinId]);

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
  // The same `?tag=` as the refresh keeps a tag page narrowed.
  useEffect(() => {
    let cancelled = false;
    fetch(meUrl, { cache: 'no-store' })
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
  }, [meUrl]);

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
      // A pinned view renders one section; other jumps switch pages instead.
      if (!el) {
        const category = nav.categories.find((item) => item.slug === slug);
        if (category) router.push(categoryHref(category));
        return;
      }
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      setActiveId(el.dataset.categoryId ?? null);
    },
    [nav.categories, router],
  );

  // ── Scroll-spy ─────────────────────────────────────────────────────────────
  // Tracks the active section from scroll position. Measurements are
  // rAF-throttled: a burst of scroll events costs at most one pass per frame.
  const shownCategoryIds = useMemo(
    () =>
      (results?.categories ?? nav.categories).map((category) => ({
        id: category.id,
        slug: category.slug,
      })),
    [results, nav.categories],
  );

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
      for (const category of shownCategoryIds) {
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
        const last = shownCategoryIds[shownCategoryIds.length - 1];
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
  }, [shownCategoryIds]);

  // ── Filter handlers ───────────────────────────────────────────────────────
  // A filter change resets `results` to null, which is what puts the list back
  // into its "request outstanding" state until the next response lands.
  const applyQuery = useCallback((next: string) => {
    typedSinceSyncRef.current = true;
    setQuery(next);
    setResults(null);
  }, []);

  const applyTags = useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      typedSinceSyncRef.current = true;
      setActiveTags(next);
      setResults(null);
    },
    [],
  );

  /**
   * Leaves a tag page for the full site. Only an explicit "drop this tag" does
   * this: the chip's X and the back link. Clearing filters stays on the page,
   * so Escape can never navigate a visitor away.
   */
  const leaveTagPage = useCallback(() => {
    typedSinceSyncRef.current = false;
    setQuery('');
    setActiveTags([]);
    setResults(null);
    setSearchFailed(false);
    router.push('/');
  }, [router]);

  const toggleTag = useCallback(
    (id: string) => {
      if (pinnedTag && id === pinnedTag.id) {
        leaveTagPage();
        return;
      }
      applyTags((prev) =>
        prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
      );
    },
    [applyTags, pinnedTag, leaveTagPage],
  );

  /** The tag bar's clear button: drops the tag filters, not the search text. */
  const clearTags = useCallback(() => applyTags([]), [applyTags]);

  const clearFilters = useCallback(() => {
    typedSinceSyncRef.current = false;
    setQuery('');
    setActiveTags([]);
    setResults(null);
    setSearchFailed(false);
  }, []);

  // ── Write the filters back into the URL ───────────────────────────────────
  // replaceState rather than router.replace: a search must not stack history
  // entries, and the page content is already driven by the search request, so
  // there is nothing for the server to re-render.
  //
  // The first pass is skipped: it runs in the same commit as the mount read
  // above, where the state is still empty, and writing there would erase a
  // shared `?q=` link before that read could be applied.
  useEffect(() => {
    const previous = lastFilterRef.current;
    if (previous === null) {
      lastFilterRef.current = { query, tags: activeTags.join(',') };
      return;
    }
    if (previous.query === query && previous.tags === activeTags.join(',')) return;
    lastFilterRef.current = { query, tags: activeTags.join(',') };

    const params = new URLSearchParams(window.location.search);
    const trimmed = query.trim();
    const nextTags = activeTags.join(',');
    if ((params.get('q') ?? '') === trimmed && (params.get('tags') ?? '') === nextTags) {
      return;
    }

    if (trimmed) params.set('q', trimmed);
    else params.delete('q');
    if (nextTags) params.set('tags', nextTags);
    else params.delete('tags');

    const suffix = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${suffix ? `?${suffix}` : ''}${window.location.hash}`,
    );
    // This is our own write, so the sync effect must not treat it as external.
    lastUrlRef.current = window.location.search;
    // The URL now matches the state, so the next URL change is external.
    typedSinceSyncRef.current = false;
  }, [query, activeTags]);

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
        clearFilters();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearFilters]);

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
      const drop = (categories: NavCategory[]) =>
        categories.map((category) => ({
          ...category,
          bookmarks: category.bookmarks.filter((b) => b.id !== removedId),
        }));
      setNav((prev) => ({ ...prev, categories: drop(prev.categories) }));
      setResults((prev) =>
        prev ? { ...prev, categories: drop(prev.categories) } : prev,
      );
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

  // A pinned view (category or tag page) owns the page's h1, so the site name
  // in the header drops to plain text there.
  const pinnedView = pinnedSlug !== null || pinnedTag !== null;

  const hasFilters = query.trim().length > 0 || activeTags.length > 0;
  // Derived, not stored: a request is outstanding until results replace the
  // null placeholder that a filter change resets them to.
  const searching = hasFilters && results === null;

  // ── Which categories to render, and whether previews are capped ───────────
  // While filtering, the server result set is authoritative; otherwise the
  // server-rendered snapshot is.
  const listedCategories = results ? results.categories : nav.categories;
  const selectedCategory = useMemo(
    () =>
      selectedSlug
        ? (listedCategories.find((category) => category.slug === selectedSlug) ??
          null)
        : null,
    [listedCategories, selectedSlug],
  );
  const shownCategories = selectedCategory
    ? listedCategories.filter(
        (category) => category.id === selectedCategory.id,
      )
    : listedCategories;

  // Sidebar counts follow the current filter, matching what the list renders;
  // the total rides along because the header and the result line both need it.
  const { counts, listedTotal } = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const category of shownCategories) {
      map.set(category.id, category.bookmarks.length);
      total += category.bookmarks.length;
    }
    return { counts: map, listedTotal: total };
  }, [shownCategories]);

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
                {/* A pinned view's h1 is its own name, so the site name
                    drops to plain text there. */}
                {pinnedView ? (
                  <p className="truncate font-display text-base leading-tight font-semibold">
                    {settings.siteName}
                  </p>
                ) : (
                  <h1 className="truncate font-display text-base leading-tight font-semibold">
                    {settings.siteName}
                  </h1>
                )}
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
                onChange={(event) => applyQuery(event.target.value)}
                placeholder="搜索书签、分类或标签，支持拼音首字母"
                aria-label="搜索书签"
                className="h-11 rounded-full border-border/70 bg-muted/40 pr-24 pl-10 shadow-none transition-colors hover:border-border focus-visible:bg-background"
              />
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      applyQuery('');
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
            // A pinned tag reads as an active filter even though it lives in
            // the path, and the user's own picks stay visible next to it.
            active={pinnedTag ? [pinnedTag.id, ...activeTags] : activeTags}
            onToggle={toggleTag}
            onClear={clearTags}
          />
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        <aside className="hidden w-48 shrink-0 lg:block">
          {/* On the nav page a click scrolls in place; on a category page there
              is no section for the other categories, so the link navigates. */}
          <NavSidebar
            categories={shownCategories}
            activeId={activeId}
            onSelect={pinnedSlug ? undefined : scrollToCategory}
            counts={counts}
          />
        </aside>

        <main className="min-w-0 flex-1">
          <NavChipBar
            categories={shownCategories}
            activeId={activeId}
            onSelect={pinnedSlug ? undefined : scrollToCategory}
            counts={counts}
          />

          {/* A tag page always names its tag, including while searching or
              when nothing matched: it is the document's h1. */}
          {pinnedTag ? (
            <header className="mb-8">
              <h1 className="font-display text-lg font-semibold tracking-tight">
                {pinnedTag.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {listedTotal.toLocaleString('zh-CN')} 个书签，分布在{' '}
                {shownCategories.length} 个分类
              </p>
            </header>
          ) : null}

          {!nav.available ? (
            <Notice
              title="数据库未连接"
              body="无法读取书签数据。请检查 DATABASE_URL 是否正确，以及数据库是否可达。"
            />
          ) : nav.categories.length === 0 && !hasFilters ? (
            <Notice
              title="还没有任何书签"
              body="登录后台添加分类和书签。"
            />
          ) : selectedCategory && selectedCategory.bookmarks.length === 0 ? (
            <Notice
              title="这个分类还没有公开书签"
              body="它下面的书签都被设为私有，或还没有添加书签。"
            />
          ) : hasFilters && searching && results === null ? (
            <p
              className="py-14 text-center text-sm text-muted-foreground"
              role="status"
            >
              正在搜索…
            </p>
          ) : hasFilters && searchFailed ? (
            <Notice
              title="搜索失败"
              body="无法连接到服务器，请检查网络后重试。"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Re-runs the search effect.
                    setSearchFailed(false);
                    setSearchAttempt((n) => n + 1);
                  }}
                >
                  重试
                </Button>
              }
            />
          ) : shownCategories.length === 0 ? (
            <Notice
              title="没有匹配的结果"
              body={`没有书签匹配当前的搜索和标签条件。${hasFilters ? '按 Esc 可清除筛选。' : ''}`}
              action={
                hasFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                  >
                    清除筛选
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-10">
              {selectedCategory || pinnedTag ? (
                <Link
                  href="/"
                  onClick={() => setSelectedSlug(null)}
                  className="-mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                  返回全部
                </Link>
              ) : null}
              {hasFilters ? (
                <p
                  className={cn(
                    'text-xs text-muted-foreground transition-opacity',
                    searching && 'opacity-60',
                  )}
                  role="status"
                >
                  已显示{' '}
                  {listedTotal.toLocaleString('zh-CN')} 条结果
                  {activeTags.length > 0
                    ? `，已按 ${activeTags.length} 个标签筛选`
                    : ''}
                  {results?.cursor ? '，还有更多' : ''}
                </p>
              ) : null}

              {shownCategories.map((category) => {
                // Browsing caps the preview (0 = unlimited); the pinned
                // view and search always list all. A tag page is already its
                // tag's full list, so nothing there is capped either.
                const cap = settings.categoryPreviewCount;
                const capped =
                  cap > 0 &&
                  !hasFilters &&
                  !selectedCategory &&
                  pinnedTag === null &&
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
                      {/* A category page's single h1 is its own category name. */}
                      {pinnedSlug ? (
                        <h1 className="font-display text-lg font-semibold tracking-tight">
                          {category.name}
                        </h1>
                      ) : (
                        <h2 className="font-display text-lg font-semibold tracking-tight">
                          {category.name}
                        </h2>
                      )}
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
                          headingLevel={pinnedSlug ? 'h2' : 'h3'}
                          onEdit={editBookmark}
                          onDelete={setDeleting}
                          onRetag={requestRetag}
                          highlightRegex={highlightRegex}
                        />
                      ))}
                    </div>
                    {capped ? (
                      <Link
                        // Visible categories have a real page; hidden ones only
                        // exist as the admin-only in-page view.
                        href={categoryHref(category)}
                        onClick={
                          category.hidden
                            ? () => setSelectedSlug(category.slug)
                            : undefined
                        }
                        className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        查看「{category.name}」全部{' '}
                        {category.bookmarks.length.toLocaleString('zh-CN')} 个
                        <ChevronRight className="size-3.5" aria-hidden />
                      </Link>
                    ) : null}
                  </section>
                );
              })}

              {results?.cursor ? (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingMore}
                    onClick={() => void loadMoreResults()}
                  >
                    {loadingMore ? '加载中…' : '加载更多'}
                  </Button>
                </div>
              ) : null}
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
