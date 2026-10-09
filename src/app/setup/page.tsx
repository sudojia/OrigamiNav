import { redirect } from 'next/navigation';

import { SetupForm } from '@/components/auth/setup-form';
import { SiteUnavailable } from '@/components/nav/site-unavailable';
import { countAdmins } from '@/db/queries/admin';
import { getSiteSettings } from '@/db/queries/settings';

// Always render on request.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '初始化站点',
  robots: { index: false, follow: false },
};

export default async function SetupPage() {
  // Redirect if the site is installed or an admin exists.
  const [settings, adminCount] = await Promise.all([
    getSiteSettings(),
    countAdmins(),
  ]);

  // Unreadable settings mean "unknown", so the wizard must not be shown: it
  // could not create an admin, and on a live site it would be misleading.
  if (!settings.available) {
    return (
      <SiteUnavailable
        body="无法读取站点数据，初始化向导暂时不可用。"
        hint="请检查 DATABASE_URL 是否正确、数据库是否可达；首次启动会自动建表。"
      />
    );
  }

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
