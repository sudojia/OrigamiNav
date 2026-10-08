import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Toaster } from 'sonner';

import { Providers } from '@/components/providers';
import { getSiteSettings } from '@/db/queries/settings';
import {
  pageSocialMetadata,
  siteDescription,
  siteTitle,
  verificationMetadata,
} from '@/lib/seo';
import {
  buildAdminModeInitScript,
  buildSkinInitScript,
} from '@/lib/theme-init';

import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // First-paint theme color fallback.
  themeColor: '#f9fafc',
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const title = siteTitle(settings);
  // Tab title is site name plus tagline; sub-pages use the plain-name template.
  const defaultTitle = settings.tagline
    ? `${title} - ${settings.tagline}`
    : title;
  const description = siteDescription(settings);

  // Uploaded icon URL includes a version query.
  const faviconHref =
    settings.faviconMode === 'upload' && settings.faviconVersion
      ? `/api/site-icon?v=${encodeURIComponent(settings.faviconVersion)}`
      : settings.faviconMode === 'url' && settings.faviconUrl
        ? settings.faviconUrl
        : null;

  // No `path`: the layout covers every route, so canonical and og:url belong to
  // the pages that know their own URL.
  const social = pageSocialMetadata(settings, { title, description });

  return {
    metadataBase: settings.siteUrl ? new URL(settings.siteUrl) : undefined,
    title: {
      default: defaultTitle,
      template: `%s · ${title}`,
    },
    description,
    applicationName: title,
    keywords: ['书签', '导航', 'bookmark', 'navigation', 'self-hosted'],
    icons: faviconHref ? { icon: faviconHref, shortcut: faviconHref } : undefined,
    // Large image previews are the recommended default for the public pages.
    robots: settings.seoIndexing
      ? { index: true, follow: true, 'max-image-preview': 'large' }
      : { index: false, follow: false },
    verification: verificationMetadata(settings),
    openGraph: social.openGraph,
    twitter: social.twitter,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = await getSiteSettings();
  // Dark-only skins hide the admin light/dark toggle.
  const darkOnly = settings.defaultTheme === 'geek';

  return (
    // Suppresses hydration warnings for pre-hydration <html> mutations.
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* Injects the skin-init script with afterInteractive. */}
        <Script
          id="skin-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: buildSkinInitScript(settings.defaultTheme),
          }}
        />
      </head>
      {/* Suppresses hydration warnings for pre-hydration <body> mutations. */}
      <body
        className="min-h-dvh bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        <Providers
          forcedTheme={darkOnly ? 'dark' : undefined}
          skin={settings.defaultTheme}
        >
          {children}
        </Providers>
        {/* Pre-paint admin-shell mode; no-op outside /admin. The root layout
            mounts once per page load, so client navigations never re-create
            this script (a client-created <script> would error and not run). */}
        <script
          dangerouslySetInnerHTML={{ __html: buildAdminModeInitScript(darkOnly) }}
        />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
