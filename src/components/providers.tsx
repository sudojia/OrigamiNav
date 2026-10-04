'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { ThemeColorSync } from '@/components/theme/theme-color-sync';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { SkinId } from '@/types/nav';

/**
 * next-themes owns the light/dark axis; the skin axis is `data-skin`.
 * `forcedTheme` pins dark-only skins.
 */
export function Providers({
  children,
  forcedTheme,
  skin,
}: {
  children: ReactNode;
  forcedTheme?: 'dark';
  skin: SkinId;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
      storageKey="origaminav.mode"
      forcedTheme={forcedTheme}
    >
      <TooltipProvider>{children}</TooltipProvider>
      <ThemeColorSync skin={skin} />
    </ThemeProvider>
  );
}
