import { NavClient } from '@/components/nav/nav-client';
import { IconSettingsProvider } from '@/components/nav/icon-settings';
import type { NavData, SiteSettings } from '@/types/nav';

/** Server boundary for the public pages; admin state is resolved client-side. */
export function NavShell({
  nav,
  settings,
  pinnedSlug,
}: {
  nav: NavData;
  settings: SiteSettings;
  /** Category page: renders that category's full list instead of the overview. */
  pinnedSlug?: string | null;
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
      />
    </IconSettingsProvider>
  );
}
