'use client';

import {
  ExternalLink,
  FolderTree,
  Import,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Moon,
  Settings2,
  Sun,
  Tags,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

import { logoutAction } from '@/actions/auth';
import { BrandMark } from '@/components/nav/site-mark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ADMIN_MODE_EVENT, ADMIN_MODE_STORAGE_KEY, useAdminMode } from './admin-mode';

/** Mirrors the persisted mode onto the .admin-shell element. */
function applyAdminMode(mode: 'dark' | 'light') {
  const shell = document.querySelector('.admin-shell');
  if (!shell) return;
  shell.classList.remove('dark', 'light', 'admin-light');
  shell.classList.add(mode);
}

/** Sidebar navigation for the /admin subtree. */

type NavItem = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  exact?: boolean;
};

type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: '内容',
    items: [
      { href: '/admin', label: '总览', Icon: LayoutDashboard, exact: true },
      { href: '/admin/categories', label: '分类管理', Icon: FolderTree },
      { href: '/admin/bookmarks', label: '书签管理', Icon: Link2 },
      { href: '/admin/tags', label: '标签管理', Icon: Tags },
    ],
  },
  {
    title: '数据与系统',
    items: [
      { href: '/admin/import', label: '导入 / 导出', Icon: Import },
      { href: '/admin/settings', label: '站点设置', Icon: Settings2 },
    ],
  },
];

export function AdminSidebar({
  username,
  darkOnly = false,
  logoUrl = null,
}: {
  username: string;
  /** Hides the mode toggle for dark-only skins. */
  darkOnly?: boolean;
  /** Admin-configured site logo. */
  logoUrl?: string | null;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Closes the drawer on route change.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const nav = <SidebarNav pathname={pathname} />;
  const footer = <SidebarFooter username={username} darkOnly={darkOnly} />;

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label={drawerOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          {drawerOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
        <Brand compact logoUrl={logoUrl} />
        <div className="ml-auto">
          <Button variant="ghost" size="icon" asChild aria-label="查看前台">
            <Link href="/" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Mobile drawer ──────────────────────────────────────────────── */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-border bg-background shadow-raised">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Brand logoUrl={logoUrl} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="关闭菜单"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">{nav}</div>
            <div className="border-t border-border p-3">{footer}</div>
          </div>
        </div>
      ) : null}

      {/* ── Desktop rail ───────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card/40 lg:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          <Brand logoUrl={logoUrl} />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">{nav}</nav>
        <div className="shrink-0 border-t border-border p-3">{footer}</div>
      </aside>
    </>
  );
}

function Brand({
  compact,
  logoUrl,
}: {
  compact?: boolean;
  logoUrl?: string | null;
}) {
  return (
    <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
      <BrandMark logoUrl={logoUrl} className="size-7" />
      <span className="min-w-0">
        <span className="block truncate font-display text-sm leading-tight font-semibold">
          OrigamiNav
        </span>
        {compact ? null : (
          <span className="block text-[0.6875rem] leading-tight text-muted-foreground">
            管理后台
          </span>
        )}
      </span>
    </Link>
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <p className="px-3 text-[0.6875rem] font-medium tracking-wide text-muted-foreground/70">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map(({ href, label, Icon, exact }) => {
              const active = exact
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Toggles the admin's own light/dark mode. */
function AdminModeToggle() {
  const mode = useAdminMode();

  useLayoutEffect(() => {
    applyAdminMode(mode);
  }, [mode]);

  function toggle() {
    const next = mode === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(ADMIN_MODE_STORAGE_KEY, next);
    } catch {
      // Storage blocked; applies to this session only.
    }
    applyAdminMode(next);
    window.dispatchEvent(new Event(ADMIN_MODE_EVENT));
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label={mode === 'light' ? '切换到深色模式' : '切换到浅色模式'}
      title={mode === 'light' ? '切换到深色模式' : '切换到浅色模式'}
      onClick={toggle}
    >
      {mode === 'light' ? (
        <Sun className="size-3.5" />
      ) : (
        <Moon className="size-3.5" />
      )}
    </Button>
  );
}

function SidebarFooter({
  username,
  darkOnly,
}: {
  username: string;
  darkOnly?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Link
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ExternalLink className="size-4 shrink-0" />
        查看前台
      </Link>
      <div className="flex items-center gap-2 rounded-md bg-accent/50 px-3 py-2">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[0.6875rem] font-semibold text-primary"
        >
          {username.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {username}
        </span>
        {darkOnly ? null : <AdminModeToggle />}
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="退出登录"
            title="退出登录"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
          >
            <LogOut className="size-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
