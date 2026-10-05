import { BootstrapRedirect } from '@/components/auth/bootstrap-redirect';
import { NavShell } from '@/components/nav/nav-shell';
import { getNavData } from '@/db/queries/nav';
import { getSiteSettings } from '@/db/queries/settings';

// Revalidate the page every 300 seconds.
export const revalidate = 300;

export default async function HomePage() {
  const settings = await getSiteSettings();

  // Hop to the setup wizard before installation. Rendered as content rather
  // than returned as a `redirect()`: this page is prerendered, and EdgeOne
  // Pages corrupts the `Location` header of a prerendered redirect, which
  // would 404 the site before it is installed.
  if (!settings.installed) {
    return <BootstrapRedirect to="/setup" />;
  }

  const nav = await getNavData();

  return <NavShell nav={nav} settings={settings} />;
}
