'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import type { SkinId } from '@/types/nav';

/** Visitor-facing light/dark toggle; dark-only skins render nothing. */

/** "Has React hydrated?" as an external store. */
function subscribeToNothing(): () => void {
  return () => {};
}

export function ModeToggle({ skin }: { skin: SkinId }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  // Renders a same-sized placeholder before hydration.
  if (skin === 'geek') {
    return null;
  }

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="切换深浅色" disabled>
        <span className="size-4" />
      </Button>
    );
  }

  const dark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
      title={dark ? '切换到浅色模式' : '切换到深色模式'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
