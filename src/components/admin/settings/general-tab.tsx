'use client';

import { Loader2, Share2, Shapes, Trash2, Type, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Favicon } from '@/components/nav/favicon';
import { SiteMark } from '@/components/nav/site-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ICON_TEMPLATE_PLACEHOLDER,
  type FaviconMode,
  type IconService,
} from '@/types/nav';

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

const ICON_SERVICE_OPTIONS: Array<{
  value: IconService;
  label: string;
  hint: string;
}> = [
  { value: 'auto', label: '智能（推荐）', hint: '国内快源优先，不可达时自动换下一个' },
  { value: 'cccyun', label: '彩虹 API', hint: 'favicon.cccyun.cc · 国内直连最快' },
  { value: 'xinac', label: 'xinac API', hint: 'api.xinac.net · 国内直连快' },
  { value: 'faviconim', label: 'favicon.im', hint: '独立服务 · 国内访问稍慢' },
  { value: 'duckduckgo', label: 'DuckDuckGo', hint: '国内直连不可达' },
  { value: 'google', label: 'Google', hint: '国内直连不可达' },
  { value: 'custom', label: '自定义源', hint: `填写含 ${ICON_TEMPLATE_PLACEHOLDER} 的地址模板` },
  { value: 'off', label: '关闭', hint: '不请求外部图标，显示字母色块' },
];

/** Sample hostnames rendered through the current selection in the preview strip. */
const ICON_PREVIEW_HOSTS = ['bilibili.com', 'github.com', 'zhihu.com', 'juejin.cn'];

/** Idle time before the preview commits the latest selection and reloads. */
const ICON_PREVIEW_DEBOUNCE_MS = 2000;

export interface GeneralTabProps {
  active: boolean;
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  faviconMode: FaviconMode;
  faviconUrl: string;
  iconService: IconService;
  iconCustomTemplate: string;
  faviconBusy: boolean;
  hasUploadedIcon: boolean;
  effectiveIcon: string | null;
  onSiteNameChange: (value: string) => void;
  onTaglineChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onLogoUrlChange: (value: string) => void;
  onFaviconModeChange: (value: FaviconMode) => void;
  onFaviconUrlChange: (value: string) => void;
  onIconServiceChange: (value: IconService) => void;
  onIconCustomTemplateChange: (value: string) => void;
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
  iconService,
  iconCustomTemplate,
  faviconBusy,
  hasUploadedIcon,
  effectiveIcon,
  onSiteNameChange,
  onTaglineChange,
  onDescriptionChange,
  onLogoUrlChange,
  onFaviconModeChange,
  onFaviconUrlChange,
  onIconServiceChange,
  onIconCustomTemplateChange,
  onIconFile,
  onIconRemove,
}: GeneralTabProps) {
  // The preview reloads from a debounced commit: rapid switching fires no
  // requests until the selection settles, then one load with the final source.
  const [previewSource, setPreviewSource] = useState({
    service: iconService,
    template: iconCustomTemplate,
  });
  const previewPending =
    previewSource.service !== iconService ||
    previewSource.template !== iconCustomTemplate;

  useEffect(() => {
    if (!previewPending) return;
    const timer = setTimeout(
      () =>
        setPreviewSource({
          service: iconService,
          template: iconCustomTemplate,
        }),
      ICON_PREVIEW_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [iconService, iconCustomTemplate, previewPending]);

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

        <FieldSection
          divided
          Icon={Shapes}
          title="书签图标"
          description="书签卡片左侧的小图标来源。选择适合访客网络环境的服务，避免图标长时间加载失败。"
        >
          <div
            role="radiogroup"
            aria-label="书签图标来源"
            className="grid gap-2 sm:grid-cols-2"
          >
            {ICON_SERVICE_OPTIONS.map((option) => (
              <IconOptionRow
                key={option.value}
                option={option}
                selected={iconService === option.value}
                onSelect={onIconServiceChange}
              />
            ))}
          </div>

          {iconService === 'custom' ? (
            <SettingsField
              htmlFor="settings-icon-template"
              label="图标地址模板"
              hint={`用 ${ICON_TEMPLATE_PLACEHOLDER} 代表书签域名，例如 https://api.example.com/favicon/${ICON_TEMPLATE_PLACEHOLDER}.png。`}
            >
              <Input
                id="settings-icon-template"
                type="url"
                placeholder={`https://api.example.com/favicon/${ICON_TEMPLATE_PLACEHOLDER}.png`}
                value={iconCustomTemplate}
                onChange={(event) => onIconCustomTemplateChange(event.target.value)}
                maxLength={2048}
              />
            </SettingsField>
          ) : null}

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-1.5">
              <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground/80">
                实时预览 ·{' '}
                {previewPending ? '停止切换后自动加载' : '按当前选择加载'}
              </p>
              {previewPending ? (
                <Loader2
                  className="size-3 animate-spin text-muted-foreground/70"
                  aria-hidden
                />
              ) : null}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-4">
              {ICON_PREVIEW_HOSTS.map((host) => (
                <div
                  key={host}
                  className={cn(
                    'flex w-16 flex-col items-center gap-1.5 transition-[opacity,filter] duration-300',
                    previewPending && 'opacity-60 saturate-50',
                  )}
                >
                  <Favicon
                    hostname={host}
                    title={host}
                    service={previewSource.service}
                    customTemplate={previewSource.template || null}
                    className="size-8"
                  />
                  <span className="w-full truncate text-center text-[0.625rem] text-muted-foreground">
                    {host}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            手动填写过图标地址的书签不受影响；单个服务最多等待 2
            秒，失败自动换下一个或回退为字母色块。
          </p>
        </FieldSection>
      </div>
    </div>
  );
}

/** One selectable icon-source row with a radio-style indicator. */
function IconOptionRow({
  option,
  selected,
  onSelect,
}: {
  option: { value: IconService; label: string; hint: string };
  selected: boolean;
  onSelect: (value: IconService) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(option.value)}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/25'
          : 'border-border/70 hover:border-primary/40 hover:bg-accent/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-primary' : 'border-muted-foreground/40',
        )}
      >
        {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{option.label}</span>
        <span className="mt-0.5 block truncate text-[0.6875rem] leading-snug text-muted-foreground">
          {option.hint}
        </span>
      </span>
    </button>
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
