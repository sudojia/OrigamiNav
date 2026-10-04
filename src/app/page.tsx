import { redirect } from 'next/navigation';

import { NavShell } from '@/components/nav/nav-shell';
import { getNavData } from '@/db/queries/nav';
import { getSiteSettings } from '@/db/queries/settings';

// Revalidate the page every 300 seconds.
export const revalidate = 300;

export default async function HomePage() {
  const settings = await getSiteSettings();

  // Redirect to the setup wizard before installation.
  if (!settings.installed) {
    redirect('/setup');
  }

  const nav = await getNavData();

  return <NavShell nav={nav} settings={settings} />;
}
