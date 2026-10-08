import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/login-form';
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
