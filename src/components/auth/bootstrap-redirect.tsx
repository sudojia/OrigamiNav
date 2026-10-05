'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Sends visitors to the setup wizard while the site is not installed yet.
 *
 * The home page is prerendered so it can be cached at the edge, and EdgeOne
 * Pages duplicates the `Location` header of a *prerendered* redirect — the
 * cached 307 comes back as `Location: /setup, /setup`, and that path 404s.
 * Returning this hop as content instead keeps `Location` out of the response
 * entirely. The meta refresh handles a cold load with JavaScript disabled; the
 * router handles client-side navigations, which never act on a meta refresh.
 */
export function BootstrapRedirect({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(to);
  }, [router, to]);

  return (
    <>
      <meta httpEquiv="refresh" content={`0; url=${to}`} />
      <main className="flex min-h-dvh items-center justify-center px-4">
        <a
          href={to}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          正在进入初始化向导…
        </a>
      </main>
    </>
  );
}
