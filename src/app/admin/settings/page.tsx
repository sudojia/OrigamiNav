import { SettingsForm } from '@/components/admin/settings-form';
import {
  countUntaggedBookmarks,
  getAiConfigStatus,
} from '@/db/queries/ai';
import { getIconCacheStats } from '@/db/queries/icons';
import { getSecretValue, getSiteSettings, SECRET_KEYS } from '@/db/queries/settings';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '站点设置' };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  // AI status contains only a masked key hint; the push token is probed too.
  const [
    settings,
    aiStatus,
    extToken,
    baiduPushToken,
    untaggedCount,
    iconCache,
  ] = await Promise.all([
    getSiteSettings(),
    getAiConfigStatus(),
    getSecretValue(SECRET_KEYS.extToken),
    getSecretValue(SECRET_KEYS.baiduPushToken),
    countUntaggedBookmarks(),
    getIconCacheStats(),
  ]);
  return (
    <SettingsForm
      settings={settings}
      aiStatus={aiStatus}
      extToken={extToken}
      hasBaiduToken={Boolean(baiduPushToken)}
      untaggedCount={untaggedCount}
      iconCache={iconCache}
    />
  );
}
