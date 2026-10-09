import { ICON_TEMPLATE_PLACEHOLDER, type IconService } from '@/types/nav';

/**
 * Bookmark icon sources. The templates are shared by the server-side fetcher
 * (which caches the bytes) and by the client-side settings preview, which must
 * show an unsaved choice that has no cache entry yet.
 */

/** Per-provider URL templates; `{domain}` receives the hostname. */
const ICON_PROVIDER_TEMPLATES = {
  cccyun: `https://favicon.cccyun.cc/${ICON_TEMPLATE_PLACEHOLDER}`,
  xinac: `https://api.xinac.net/icon/?url=${ICON_TEMPLATE_PLACEHOLDER}`,
  faviconim: `https://favicon.im/${ICON_TEMPLATE_PLACEHOLDER}?larger=true`,
  duckduckgo: `https://icons.duckduckgo.com/ip3/${ICON_TEMPLATE_PLACEHOLDER}.ico`,
  google: `https://www.google.com/s2/favicons?domain=${ICON_TEMPLATE_PLACEHOLDER}&sz=64`,
} as const;

/**
 * Ordered source templates for the configured service; 'auto' pairs a fast CN
 * source with an independent fallback. Empty when no source can be built.
 */
export function iconSourceTemplates(
  service: IconService,
  customTemplate: string | null,
): string[] {
  switch (service) {
    case 'off':
      return [];
    case 'custom':
      return customTemplate?.includes(ICON_TEMPLATE_PLACEHOLDER)
        ? [customTemplate]
        : [];
    case 'auto':
      return [ICON_PROVIDER_TEMPLATES.cccyun, ICON_PROVIDER_TEMPLATES.faviconim];
    default:
      return [ICON_PROVIDER_TEMPLATES[service]];
  }
}
