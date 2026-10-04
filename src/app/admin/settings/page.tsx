import { SettingsForm } from '@/components/admin/settings-form';
import { getAiConfigStatus } from '@/db/queries/ai';
import { getSiteSettings } from '@/db/queries/settings';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '站点设置' };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  // AI status contains only a masked key hint.
  const [settings, aiStatus] = await Promise.all([
    getSiteSettings(),
    getAiConfigStatus(),
  ]);
  return <SettingsForm settings={settings} aiStatus={aiStatus} />;
}
