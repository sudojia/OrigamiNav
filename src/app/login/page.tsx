import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/login-form';
import { SiteUnavailable } from '@/components/nav/site-unavailable';
import { getSiteSettings } from '@/db/queries/settings';
import { sanitizeNext } from '@/lib/safe-redirect';
import { isAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '登录',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; loggedOut?: string }>;
}) {
  const params = await searchParams;
  const [settings, signedIn] = await Promise.all([getSiteSettings(), isAdmin()]);

  // Unreadable settings mean "unknown": bouncing to the setup wizard would be
  // wrong, and signing in needs the database anyway.
  if (!settings.available) {
    return <SiteUnavailable body="无法读取站点数据，暂时无法登录。" />;
  }

  // Nothing to sign into yet.
  if (!settings.installed) {
    redirect('/setup');
  }
  if (signedIn) {
    redirect('/admin');
  }

  return (
    <LoginForm
      siteName={settings.siteName}
      loggedOut={params.loggedOut === '1'}
      next={sanitizeNext(params.next)}
    />
  );
}
