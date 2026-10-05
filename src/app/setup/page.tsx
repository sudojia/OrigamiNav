import { redirect } from 'next/navigation';

import { SetupForm } from '@/components/auth/setup-form';
import { countAdmins } from '@/db/queries/admin';
import { getSiteSettings } from '@/db/queries/settings';

// Always render on request.
export const dynamic = 'force-dynamic';

export const metadata = { title: '初始化站点' };

export default async function SetupPage() {
  // Redirect if the site is installed or an admin exists.
  const [settings, adminCount] = await Promise.all([
    getSiteSettings(),
    countAdmins(),
  ]);

  if (settings.installed || adminCount > 0) {
    redirect('/login');
  }

  return (
    <SetupForm
      defaultSiteName={settings.siteName}
      defaultTagline={settings.tagline}
    />
  );
}
