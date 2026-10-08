'use client';

import {
  Clock,
  FolderLock,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Type,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  TRASH_RETENTION_DAYS,
  type CategoryDeleteMode,
} from '@/types/nav';

import { SettingsSelect } from '../form-primitives';
import { FieldSection } from './field-section';

const CATEGORY_DELETE_MODE_OPTIONS: Array<{
  value: CategoryDeleteMode;
  label: string;
  hint: string;
  Icon: typeof Type;
}> = [
  {
    value: 'protected',
    label: '存在书签不可删除',
    hint: '分类下还有书签时，删除请求会被拒绝，需要先移出这些书签。',
    Icon: ShieldCheck,
  },
  {
    value: 'cascade',
    label: '书签一并删除',
    hint: '删除分类时，其中的书签跟着一起进入回收站。',
    Icon: Trash2,
  },
];

/** Recycle-bin lifetimes, derived from the accepted setting values. */
const TRASH_RETENTION_OPTIONS = TRASH_RETENTION_DAYS.map((days) => ({
  value: String(days),
  label: days === 0 ? '永久保留' : `${days} 天`,
}));

/** Session-lifetime choices in days. */
const SESSION_MAX_DAY_OPTIONS = [1, 7, 14, 30];

/** Login rate-limit choices, attempts per minute. */
const LOGIN_RATE_LIMIT_OPTIONS = [5, 10, 20, 50];

export interface SecurityTabProps {
  active: boolean;
  deleteMode: CategoryDeleteMode;
  trashRetentionDays: string;
  sessionMaxDays: string;
  loginRateLimit: string;
  onDeleteModeChange: (value: CategoryDeleteMode) => void;
  onTrashRetentionDaysChange: (value: string) => void;
  onSessionMaxDaysChange: (value: string) => void;
  onLoginRateLimitChange: (value: string) => void;
}

export function SecurityTab({
  active,
  deleteMode,
  trashRetentionDays,
  sessionMaxDays,
  loginRateLimit,
  onDeleteModeChange,
  onTrashRetentionDaysChange,
  onSessionMaxDaysChange,
  onLoginRateLimitChange,
}: SecurityTabProps) {
  return (
    <div hidden={!active} role="tabpanel" aria-label="安全">
      <div className="space-y-6 px-5 py-5">
        <FieldSection
          Icon={FolderLock}
          title="分类删除"
          description="控制删除仍有书签的分类时的行为，保存后立即生效。"
        >
          <div
            role="radiogroup"
            aria-label="分类删除策略"
            className="grid gap-2.5 sm:grid-cols-2"
          >
            {CATEGORY_DELETE_MODE_OPTIONS.map((option) => {
              const isActive = deleteMode === option.value;
              const Icon = option.Icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => onDeleteModeChange(option.value)}
                  className={cn(
                    'rounded-lg border p-3.5 text-left transition-all',
                    isActive
                      ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/25'
                      : 'border-border/70 hover:border-primary/40 hover:bg-accent/40',
                  )}
                >
                  <span className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-md',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {option.label}
                        {isActive ? (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-medium leading-none text-primary">
                            当前
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {option.hint}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {deleteMode === 'cascade' ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs leading-relaxed text-destructive">
              <TriangleAlert
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden
              />
              书签会随分类一起进入回收站；在保留期内可以恢复，彻底清除后不可挽回。
            </p>
          ) : null}
        </FieldSection>

        <FieldSection
          divided
          Icon={Clock}
          title="回收站保留"
          description="删除的分类与书签在这里暂存多久，超期内容会被自动清理。"
        >
          <SettingsSelect
            id="settings-trash-retention"
            label="保留时长"
            hint="没有常驻定时任务，超期内容在你打开回收站时清理，也可以手动触发。"
            hintClassName="text-xs leading-relaxed text-muted-foreground"
            value={trashRetentionDays}
            onValueChange={onTrashRetentionDaysChange}
            options={TRASH_RETENTION_OPTIONS}
          />
        </FieldSection>

        <FieldSection
          divided
          Icon={ShieldCheck}
          title="登录防护"
          description="登录尝试的频率上限与登录状态的有效时长。"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsSelect
              id="settings-login-rate"
              label="登录限流"
              hint="同一来源或同一账号的失败登录超出上限直接拒绝，约 1 分钟内生效。"
              hintClassName="text-xs leading-relaxed text-muted-foreground"
              value={loginRateLimit}
              onValueChange={onLoginRateLimitChange}
              options={LOGIN_RATE_LIMIT_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n} 次 / 分钟`,
              }))}
            />
            <SettingsSelect
              id="settings-session-days"
              label="登录会话"
              hint="保存后下次登录时生效。"
              hintClassName="text-xs leading-relaxed text-muted-foreground"
              value={sessionMaxDays}
              onValueChange={onSessionMaxDaysChange}
              options={SESSION_MAX_DAY_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n} 天`,
              }))}
            />
          </div>
        </FieldSection>
      </div>
    </div>
  );
}

/** Side-rail summary of the security settings. */
export function SecurityRail({
  deleteMode,
  trashRetentionDays,
  sessionMaxDays,
  loginRateLimit,
}: {
  deleteMode: CategoryDeleteMode;
  trashRetentionDays: number;
  sessionMaxDays: number;
  loginRateLimit: number;
}) {
  const rows: Array<[string, string]> = [
    ['登录限流', `每分钟 ${loginRateLimit} 次`],
    ['密码存储', 'scrypt 加盐哈希'],
    ['登录会话', `${sessionMaxDays} 天`],
    ['分类删除', deleteMode === 'cascade' ? '书签一并删除' : '存在书签不可删除'],
    [
      '回收站保留',
      trashRetentionDays > 0 ? `${trashRetentionDays} 天` : '永久保留',
    ],
  ];

  return (
    <section className="rounded-card border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ShieldCheck className="size-3.5" aria-hidden />
        </span>
        安全状态
      </h2>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-right text-xs font-medium">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p
        className={cn(
          'mt-3 rounded-md px-2.5 py-1.5 text-[0.6875rem] leading-relaxed',
          deleteMode === 'protected'
            ? 'bg-chart-3/10 text-chart-3'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
        )}
      >
        {deleteMode === 'protected'
          ? '分类删除保护已开启，误删不会波及书签。'
          : '级联删除已开启：删分类会连同其中的书签一起移入回收站。'}
      </p>
    </section>
  );
}
