import { NavClient } from '@/components/nav/nav-client';
import type { NavData, SiteSettings } from '@/types/nav';

/** Server boundary for the public page; admin state is resolved client-side. */
export function NavShell({
  nav,
  settings,
}: {
  nav: NavData;
  settings: SiteSettings;
}) {
  return <NavClient initialNav={nav} settings={settings} />;
}
