import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Toaster } from 'sonner';

import { Providers } from '@/components/providers';
import { getSiteSettings } from '@/db/queries/settings';
import { buildSkinInitScript } from '@/lib/theme-init';

import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // First-paint theme color fallback.
  themeColor: '#f9fafc',
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const title = settings.siteName || 'OrigamiNav';
  // Tab title is site name plus tagline; sub-pages use the plain-name template.
  const defaultTitle = settings.tagline
    ? `${title} - ${settings.tagline}`
    : title;
  const description =
    settings.description ||
    settings.tagline ||
    '一个自托管的开源书签导航站，只依赖一个标准 Postgres 连接串。';

  // Uploaded icon URL includes a version query.
  const faviconHref =
    settings.faviconMode === 'upload' && settings.faviconVersion
      ? `/api/site-icon?v=${encodeURIComponent(settings.faviconVersion)}`
      : settings.faviconMode === 'url' && settings.faviconUrl
        ? settings.faviconUrl
        : null;

  return {
    metadataBase: process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
      : undefined,
    title: {
      default: defaultTitle,
      template: `%s · ${title}`,
    },
    description,
    applicationName: title,
    keywords: ['书签', '导航', 'bookmark', 'navigation', 'self-hosted'],
    icons: faviconHref ? { icon: faviconHref, shortcut: faviconHref } : undefined,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: title,
      ...(settings.logoUrl ? { images: [settings.logoUrl] } : {}),
    },
    twitter: {
      card: 'summary',
      title,
      description,
      ...(settings.logoUrl ? { images: [settings.logoUrl] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = await getSiteSettings();

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
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Providers
          forcedTheme={settings.defaultTheme === 'geek' ? 'dark' : undefined}
          skin={settings.defaultTheme}
        >
          {children}
        </Providers>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
