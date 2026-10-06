import { SettingsForm } from '@/components/admin/settings-form';
import {
  countUntaggedBookmarks,
  getAiConfigStatus,
} from '@/db/queries/ai';
import { getSecretValue, getSiteSettings, SECRET_KEYS } from '@/db/queries/settings';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '站点设置' };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  // AI status contains only a masked key hint.
  const [settings, aiStatus, extToken, untaggedCount] = await Promise.all([
    getSiteSettings(),
    getAiConfigStatus(),
    getSecretValue(SECRET_KEYS.extToken),
    countUntaggedBookmarks(),
  ]);
  return (
    <SettingsForm
      settings={settings}
      aiStatus={aiStatus}
      extToken={extToken}
      untaggedCount={untaggedCount}
    />
  );
}
