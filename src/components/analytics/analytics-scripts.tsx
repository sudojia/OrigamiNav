import Script from 'next/script';

import type { SiteSettings } from '@/types/nav';

/**
 * Analytics loaders for the public pages; the admin, login and setup pages stay
 * untracked. Every value is charset-validated by the settings action, so it is
 * safe to interpolate into the snippets below.
 */
export function AnalyticsScripts({ settings }: { settings: SiteSettings }) {
  return (
    <>
      {settings.analyticsGaId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${settings.analyticsGaId}`}
            strategy="afterInteractive"
          />
          <Script
            id="ga-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${settings.analyticsGaId}');`,
            }}
          />
        </>
      ) : null}

      {settings.analyticsBaiduId ? (
        <Script
          id="baidu-tongji"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `var _hmt=_hmt||[];(function(){var hm=document.createElement("script");hm.src="https://hm.baidu.com/hm.js?${settings.analyticsBaiduId}";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(hm,s);})();`,
          }}
        />
      ) : null}

      {settings.analyticsUmamiUrl && settings.analyticsUmamiId ? (
        <Script
          src={`${settings.analyticsUmamiUrl}/script.js`}
          data-website-id={settings.analyticsUmamiId}
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}
