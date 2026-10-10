import { SearchX } from 'lucide-react';
import Link from 'next/link';

/**
 * Stand-in for a URL that matches nothing: an unknown path, or a category or
 * tag slug that no longer exists. Renders inside the root layout, so it picks
 * up the active skin. Deliberately free of database reads — a 404 must not
 * wait on Postgres, and must still render when the database is down.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-card border border-dashed border-border bg-card/50 px-6 py-12 text-center">
        <span
          aria-hidden
          className="mx-auto flex size-11 items-center justify-center rounded-card bg-muted text-muted-foreground"
        >
          <SearchX className="size-5" />
        </span>
        <p className="mt-4 font-mono text-xs tracking-widest text-muted-foreground/70">
          404
        </p>
        <h1 className="mt-1 font-display text-base font-semibold">
          页面不存在
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          链接可能拼错了，或者这个分类 / 标签已经被删除。
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-9 items-center rounded-md border border-border px-4 text-sm transition-colors hover:bg-accent"
        >
          返回首页
        </Link>
      </div>
    </main>
  );
}
