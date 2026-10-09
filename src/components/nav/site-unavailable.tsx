import { ServerCrash } from 'lucide-react';

/**
 * Stand-in for a page whose data could not be read. Callers pair it with
 * `unstable_noStore()`: a transient database failure must never be cached, or
 * the degraded page outlives the outage by the whole revalidate window.
 */
export function SiteUnavailable({
  title = '暂时无法连接',
  body = '站点数据读取失败，通常是数据库暂时不可用。稍后重试即可。',
  hint,
}: {
  title?: string;
  body?: string;
  /** Extra line for the setup and login screens, e.g. what to check. */
  hint?: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-card border border-dashed border-border bg-card/50 px-6 py-12 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-card bg-muted text-muted-foreground">
          <ServerCrash className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-base font-semibold">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          {body}
        </p>
        {hint ? (
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground/80">
            {hint}
          </p>
        ) : null}
        {/* An empty href reloads the current URL, which re-runs the read. */}
        <a
          href=""
          className="mt-5 inline-flex h-9 items-center rounded-md border border-border px-4 text-sm transition-colors hover:bg-accent"
        >
          重试
        </a>
      </div>
    </main>
  );
}
