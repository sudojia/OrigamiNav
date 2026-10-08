import { MS_PER_DAY, formatDate } from '@/lib/utils';

/** Days a backup may age before the admin is nudged to export a new one. */
export const BACKUP_REMINDER_DAYS = 7;

export type BackupStatus = {
  lastBackupAt: string | null;
  /** Whole days since the last export; null when there is none. */
  daysSince: number | null;
  /** Never exported, or the last export has reached BACKUP_REMINDER_DAYS. */
  overdue: boolean;
};

/** Ages the last export timestamp for the admin reminder. */
export function backupStatus(lastBackupAt: string | null): BackupStatus {
  const time = lastBackupAt ? new Date(lastBackupAt).getTime() : Number.NaN;
  if (Number.isNaN(time)) {
    return { lastBackupAt: null, daysSince: null, overdue: true };
  }
  const daysSince = Math.floor((Date.now() - time) / MS_PER_DAY);
  return {
    lastBackupAt,
    // A future stamp (clock skew) reads as "today", never as negative days.
    daysSince: Math.max(0, daysSince),
    overdue: daysSince >= BACKUP_REMINDER_DAYS,
  };
}

/** One-line age of the last export, e.g.「上次导出：3 天前（2026-10-05）」. */
export function backupSummary(status: BackupStatus): string {
  if (!status.lastBackupAt) return '还没有导出过备份';
  if (status.daysSince === 0) {
    return `上次导出：今天（${formatDate(status.lastBackupAt)}）`;
  }
  return `上次导出：${status.daysSince} 天前（${formatDate(status.lastBackupAt)}）`;
}
