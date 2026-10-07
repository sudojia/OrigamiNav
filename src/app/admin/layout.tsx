import type { ReactNode } from 'react';

import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { IconSettingsProvider } from '@/components/nav/icon-settings';
import { getSiteSettings } from '@/db/queries/settings';
import { requireAdminPage } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: '管理后台' };

/** Guards the whole /admin subtree and renders the admin shell. */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [admin, settings] = await Promise.all([
    requireAdminPage(),
    getSiteSettings(),
  ]);
  // Dark-only skins hide the light/dark toggle.
  const darkOnly = settings.defaultTheme === 'geek';

  return (
    <div
      className="admin-shell dark min-h-dvh bg-background lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]"
      suppressHydrationWarning
    >
      <AdminSidebar
        username={admin.username}
        darkOnly={darkOnly}
        logoUrl={settings.logoUrl}
      />
      <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-10">
        <IconSettingsProvider
          service={settings.iconService}
          customTemplate={settings.iconCustomTemplate}
        >
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </IconSettingsProvider>
      </main>
    </div>
  );
}
