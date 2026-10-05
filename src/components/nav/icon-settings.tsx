'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { IconService } from '@/types/nav';

/**
 * Bookmark icon source settings, provided once per app shell (public page and
 * admin layout) and consumed by <Favicon> itself — no prop drilling.
 */

export type IconSettings = {
  service: IconService;
  customTemplate: string | null;
};

const DEFAULT_ICON_SETTINGS: IconSettings = {
  service: 'auto',
  customTemplate: null,
};

const IconSettingsContext = createContext<IconSettings>(DEFAULT_ICON_SETTINGS);

export function IconSettingsProvider({
  service,
  customTemplate,
  children,
}: IconSettings & { children: ReactNode }) {
  const value = useMemo<IconSettings>(
    () => ({ service, customTemplate }),
    [service, customTemplate],
  );
  return (
    <IconSettingsContext.Provider value={value}>
      {children}
    </IconSettingsContext.Provider>
  );
}

export function useIconSettings(): IconSettings {
  return useContext(IconSettingsContext);
}
