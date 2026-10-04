'use client';

import { Loader2, Share2, Trash2, Type, Upload } from 'lucide-react';

import { SiteMark } from '@/components/nav/site-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { FaviconMode } from '@/types/nav';

import { SettingsField } from '../form-primitives';
import { FieldSection } from './field-section';

const FAVICON_MODE_OPTIONS: Array<{
  value: FaviconMode;
  label: string;
  hint: string;
}> = [
  { value: 'none', label: '默认图标', hint: '使用内置的折纸图标' },
  { value: 'url', label: '图片链接', hint: '外链一个 .ico / .png' },
  { value: 'upload', label: '上传图片', hint: '存到本站，随站点一起备份' },
];

export interface GeneralTabProps {
  active: boolean;
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  faviconMode: FaviconMode;
  faviconUrl: string;
  faviconBusy: boolean;
  hasUploadedIcon: boolean;
  effectiveIcon: string | null;
  onSiteNameChange: (value: string) => void;
  onTaglineChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onLogoUrlChange: (value: string) => void;
  onFaviconModeChange: (value: FaviconMode) => void;
  onFaviconUrlChange: (value: string) => void;
  onIconFile: (file: File | undefined) => void;
  onIconRemove: () => void;
}

export function GeneralTab({
  active,
  siteName,
  tagline,
  description,
  logoUrl,
  faviconMode,
  faviconUrl,
  faviconBusy,
  hasUploadedIcon,
  effectiveIcon,
  onSiteNameChange,
  onTaglineChange,
  onDescriptionChange,
  onLogoUrlChange,
  onFaviconModeChange,
  onFaviconUrlChange,
  onIconFile,
  onIconRemove,
}: GeneralTabProps) {
  return (
    <div hidden={!active} role="tabpanel" aria-label="基本信息">
      <div className="space-y-6 px-5 py-5">
        <FieldSection
          Icon={Type}
          title="站点标识"
          description="显示在前台顶部、浏览器标签页与分享卡片上。"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField htmlFor="settings-site-name" label="站点名称">
              <Input
                id="settings-site-name"
                name="siteName"
                value={siteName}
                onChange={(event) => onSiteNameChange(event.target.value)}
                maxLength={60}
                required
              />
            </SettingsField>
            <SettingsField htmlFor="settings-tagline" label="副标题">
              <Input
                id="settings-tagline"
                name="tagline"
                value={tagline}
                onChange={(event) => onTaglineChange(event.target.value)}
                maxLength={120}
              />
            </SettingsField>
          </div>

          <SettingsField
            htmlFor="settings-description"
            label="站点描述"
            labelExtra={
              <span className="text-[0.6875rem] tabular-nums text-muted-foreground/70">
                {description.length}/300
              </span>
            }
            hint="用于 SEO 与社交分享摘要，建议 80 字以内。"
          >
            <Textarea
              id="settings-description"
              name="description"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              maxLength={300}
              rows={3}
            />
          </SettingsField>

          <SettingsField
            htmlFor="settings-logo-url-input"
            label="Logo 图片地址"
            hint="留空则使用默认折纸图标。"
          >
            <div className="flex items-center gap-3">
              <Input
                id="settings-logo-url-input"
                type="url"
                placeholder="https://"
                value={logoUrl}
                onChange={(event) => onLogoUrlChange(event.target.value)}
                maxLength={2048}
                className="flex-1"
              />
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/40"
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt=""
                    className="size-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <SiteMark />
                )}
              </span>
            </div>
          </SettingsField>
        </FieldSection>

        <FieldSection
          divided
          Icon={Share2}
          title="站点图标"
          description="浏览器标签页与收藏夹里显示的图标，不影响页面内的 Logo。"
        >
          <div
            role="radiogroup"
            aria-label="站点图标来源"
            className="grid gap-2 sm:grid-cols-3"
          >
            {FAVICON_MODE_OPTIONS.map((option) => {
              const activeMode = faviconMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={activeMode}
                  onClick={() => onFaviconModeChange(option.value)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    activeMode
                      ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/25'
                      : 'border-border/70 hover:border-primary/40 hover:bg-accent/40',
                  )}
                >
                  <span className="block text-xs font-medium">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {faviconMode === 'url' ? (
            <SettingsField
              htmlFor="settings-favicon-url"
              label="图标地址"
              hint="支持 .ico / .png / .svg，需为 http(s) 链接。"
            >
              <Input
                id="settings-favicon-url"
                type="url"
                placeholder="https://example.com/favicon.ico"
                value={faviconUrl}
                onChange={(event) => onFaviconUrlChange(event.target.value)}
                maxLength={2048}
              />
            </SettingsField>
          ) : null}

          {faviconMode === 'upload' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <label
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent',
                    faviconBusy && 'pointer-events-none opacity-60',
                  )}
                >
                  {faviconBusy ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="size-3.5" aria-hidden />
                  )}
                  选择图片
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/webp,image/gif,image/svg+xml,.ico"
                    onChange={(event) => {
                      onIconFile(event.target.files?.[0]);
                      // Resets the input so the same file can be re-picked.
                      event.target.value = '';
                    }}
                  />
                </label>
                {hasUploadedIcon ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={faviconBusy}
                    onClick={onIconRemove}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    移除已上传图标
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                上传后立即生效，图片存在数据库里（最大 1MB）。
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-background"
            >
              {effectiveIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={effectiveIcon}
                  alt=""
                  className="size-full object-contain p-1"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <SiteMark />
              )}
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {faviconMode === 'none'
                ? '未上传时使用内置的默认折纸图标。'
                : hasUploadedIcon
                  ? '当前使用已上传的图标。'
                  : faviconMode === 'url'
                    ? faviconUrl
                      ? '当前使用外部链接图标。'
                      : '填写地址后生效。'
                    : '尚未上传图标。'}
            </p>
          </div>
        </FieldSection>
      </div>
    </div>
  );
}

/** Live preview of the front-end header. */
export function IdentityPreview({
  siteName,
  tagline,
  description,
  logoUrl,
  faviconHref,
}: {
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  faviconHref: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-card border bg-card shadow-card">
      <div className="border-b border-border/60 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Share2 className="size-3.5" aria-hidden />
          </span>
          前台预览
        </h2>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="rounded-lg border border-border/60 bg-background p-3">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-8 shrink-0 rounded-md object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <SiteMark />
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold">
                {siteName || '站点名称'}
              </p>
              {tagline ? (
                <p className="truncate text-xs text-muted-foreground">
                  {tagline}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {description ? (
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/70">
            站点描述会出现在社交分享摘要里。
          </p>
        )}

        {/* Mock of the browser tab strip. */}
        <div className="rounded-lg border border-border/60 bg-background p-2">
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
            <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm">
              {faviconHref ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={faviconHref}
                  alt=""
                  className="size-full object-contain"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <span className="size-full rounded-sm bg-muted-foreground/30" />
              )}
            </span>
            <span className="truncate text-[0.6875rem] text-muted-foreground">
              {siteName || '站点名称'}
            </span>
          </div>
          <p className="mt-1.5 px-0.5 text-[0.6875rem] text-muted-foreground/70">
            标签页图标
          </p>
        </div>

        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground/70">
          上方为前台顶部与分享卡片的实时效果，保存后立即生效。
        </p>
      </div>
    </section>
  );
}
