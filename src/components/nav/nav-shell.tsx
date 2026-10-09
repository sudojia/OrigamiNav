import { NavClient } from '@/components/nav/nav-client';
import { IconSettingsProvider } from '@/components/nav/icon-settings';
import type { NavData, NavTagCount, SiteSettings } from '@/types/nav';

/** Server boundary for the public pages; admin state is resolved client-side. */
export function NavShell({
  nav,
  settings,
  pinnedSlug,
  pinnedTag,
}: {
  nav: NavData;
  settings: SiteSettings;
  /** Category page: renders that category's full list instead of the overview. */
  pinnedSlug?: string | null;
  /** Tag page: the payload already holds only this tag's bookmarks. */
  pinnedTag?: NavTagCount | null;
}) {
  return (
    <IconSettingsProvider
      service={settings.iconService}
      customTemplate={settings.iconCustomTemplate}
    >
      <NavClient
        initialNav={nav}
        settings={settings}
        pinnedSlug={pinnedSlug ?? null}
        pinnedTag={pinnedTag ?? null}
      />
    </IconSettingsProvider>
  );
}
