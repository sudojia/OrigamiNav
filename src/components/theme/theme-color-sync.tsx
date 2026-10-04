'use client';

import { useTheme } from 'next-themes';
import { useEffect } from 'react';

import type { SkinId } from '@/types/nav';

const ADMIN_MODE_EVENT = 'origaminav:admin-mode';

/**
 * Syncs the <html> data-skin attribute and the meta theme-color to the page's
 * actual appearance. Hex values mirror the skins' --background tokens.
 */
export function ThemeColorSync({ skin }: { skin: SkinId }) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // Writes data-skin before the meta update reads it.
    document.documentElement.setAttribute('data-skin', skin);

    const update = () => {
      const skin = document.documentElement.getAttribute('data-skin');
      // The admin shell carries its own mode.
      const shell = document.querySelector<HTMLElement>('.admin-shell');
      const dark = shell
        ? shell.classList.contains('dark')
        : skin === 'geek' || resolvedTheme === 'dark';
      const meta = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]',
      );
      if (meta) {
        meta.content = dark ? (skin === 'geek' ? '#14171c' : '#0e1319') : '#f9fafc';
      }
    };

    update();
    window.addEventListener(ADMIN_MODE_EVENT, update);
    return () => window.removeEventListener(ADMIN_MODE_EVENT, update);
  }, [resolvedTheme, skin]);

  return null;
}
