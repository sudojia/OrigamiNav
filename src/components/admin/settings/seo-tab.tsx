'use client';

import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  clearBaiduPushTokenAction,
  generateIndexNowKeyAction,
  pushToSearchEnginesAction,
  type PushState,
} from '@/actions/seo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { VERIFICATION_TARGETS, type VerificationId } from '@/types/nav';

import { SettingsField } from '../form-primitives';
import { FieldSection } from './field-section';

const ENGINE_LABELS: Record<string, string> = {
  indexnow: 'IndexNow',
  baidu: '百度',
};

export interface SeoTabProps {
  active: boolean;
  siteUrl: string;
  seoIndexing: boolean;
  verifications: Record<VerificationId, string>;
  analyticsGaId: string;
  analyticsBaiduId: string;
  analyticsUmamiUrl: string;
  analyticsUmamiId: string;
  baiduPushToken: string;
  /** Stored IndexNow key; owned by this tab because it is generated in place. */
  initialIndexNowKey: string;
  hasBaiduToken: boolean;
  onSiteUrlChange: (value: string) => void;
  onSeoIndexingChange: (value: boolean) => void;
  onVerificationChange: (id: VerificationId, value: string) => void;
  onAnalyticsGaIdChange: (value: string) => void;
  onAnalyticsBaiduIdChange: (value: string) => void;
  onAnalyticsUmamiUrlChange: (value: string) => void;
  onAnalyticsUmamiIdChange: (value: string) => void;
  onBaiduPushTokenChange: (value: string) => void;
}

/** Settings → SEO tab: indexing, ownership codes, analytics and URL submission. */
export function SeoTab({
  active,
  siteUrl,
  seoIndexing,
  verifications,
  analyticsGaId,
  analyticsBaiduId,
  analyticsUmamiUrl,
  analyticsUmamiId,
  baiduPushToken,
  initialIndexNowKey,
  hasBaiduToken,
  onSiteUrlChange,
  onSeoIndexingChange,
  onVerificationChange,
  onAnalyticsGaIdChange,
  onAnalyticsBaiduIdChange,
  onAnalyticsUmamiUrlChange,
  onAnalyticsUmamiIdChange,
  onBaiduPushTokenChange,
}: SeoTabProps) {
  const [indexNowKey, setIndexNowKey] = useState(initialIndexNowKey);
  const [copied, setCopied] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [tokenStored, setTokenStored] = useState(hasBaiduToken);
  const [confirming, setConfirming] = useState<'key' | 'token' | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushState | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  function armConfirm(kind: 'key' | 'token') {
    setConfirming(kind);
    confirmTimer.current = setTimeout(() => setConfirming(null), 4000);
  }

  async function handleCopyKey() {
    if (!indexNowKey) return;
    try {
      await navigator.clipboard.writeText(indexNowKey);
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  }

  async function handleGenerateKey() {
    setKeyBusy(true);
    setConfirming(null);
    try {
      const result = await generateIndexNowKeyAction();
      if (result.ok) {
        setIndexNowKey(result.key ?? '');
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setKeyBusy(false);
    }
  }

  async function handleClearToken() {
    setKeyBusy(true);
    setConfirming(null);
    try {
      const result = await clearBaiduPushTokenAction();
      if (result.ok) {
        setTokenStored(false);
        onBaiduPushTokenChange('');
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setKeyBusy(false);
    }
  }

  async function handlePush() {
    if (pushing) return;
    setPushing(true);
    try {
      const result = await pushToSearchEnginesAction();
      setPushResult(result);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setPushing(false);
    }
  }

  const configuredCodes = VERIFICATION_TARGETS.filter(
    (target) => verifications[target.id] !== '',
  ).length;

  return (
    <div hidden={!active} role="tabpanel" aria-label="SEO">
      <div className="space-y-6 px-5 py-5">
        <FieldSection
          Icon={Globe}
          title="站点与收录"
          description="站点地址用于 canonical、站点地图与推送；关闭收录后全站返回 noindex 并在 robots.txt 里禁止抓取。"
        >
          <SettingsField
            htmlFor="settings-site-url"
            label="站点地址"
            hint="公开访问的完整地址，可含子路径，例如 https://example.com/nav。留空则回退环境变量 NEXT_PUBLIC_SITE_URL。"
          >
            <Input
              id="settings-site-url"
              name="siteUrl"
              type="url"
              placeholder="https://example.com"
              value={siteUrl}
              onChange={(event) => onSiteUrlChange(event.target.value)}
              maxLength={2048}
            />
          </SettingsField>

          {!siteUrl ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-amber-600 dark:text-amber-500">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              未设置站点地址时不会输出 canonical、结构化数据与站点地图，推送也无法进行。
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-medium">允许搜索引擎收录</p>
              <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
                关闭后前台页面输出 noindex，robots.txt 全站禁止抓取。
              </p>
            </div>
            <Switch
              checked={seoIndexing}
              onCheckedChange={onSeoIndexingChange}
              aria-label="允许搜索引擎收录"
            />
          </div>

          {siteUrl ? (
            <div className="flex flex-wrap gap-3">
              {['/robots.txt', '/sitemap.xml'].map((path) => (
                <a
                  key={path}
                  href={path}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  查看 {path}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ))}
            </div>
          ) : null}
        </FieldSection>

        <FieldSection
          divided
          Icon={Search}
          title="搜索引擎验证"
          description={`留空即不配置。选各平台的 HTML 标记 / HTML 标签验证方式，粘贴其中的 content 值即可，整段 ${'<meta>'} 标签也能自动识别（已配置 ${configuredCodes}/${VERIFICATION_TARGETS.length}）。`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {VERIFICATION_TARGETS.map((target) => (
              <SettingsField
                key={target.id}
                htmlFor={`settings-verify-${target.id}`}
                label={target.label}
                hint={
                  <>
                    {target.method} ·{' '}
                    <a
                      href={target.consoleUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      前往官网获取验证码
                    </a>
                  </>
                }
              >
                <Input
                  id={`settings-verify-${target.id}`}
                  name={`verify_${target.id}`}
                  value={verifications[target.id]}
                  onChange={(event) =>
                    onVerificationChange(target.id, event.target.value)
                  }
                  maxLength={200}
                  placeholder="留空表示不配置"
                />
              </SettingsField>
            ))}
          </div>
        </FieldSection>

        <FieldSection
          divided
          Icon={Check}
          title="访问统计"
          description="仅注入前台页面，后台与登录页不统计。留空即关闭对应统计。"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField
              htmlFor="settings-analytics-ga"
              label="Google Analytics 4"
              hint="测量 ID，例如 G-XXXXXXXXXX。"
            >
              <Input
                id="settings-analytics-ga"
                name="analyticsGaId"
                value={analyticsGaId}
                onChange={(event) => onAnalyticsGaIdChange(event.target.value)}
                maxLength={64}
                placeholder="G-"
              />
            </SettingsField>
            <SettingsField
              htmlFor="settings-analytics-baidu"
              label="百度统计"
              hint="hm.js 的站点 ID（32 位十六进制）。"
            >
              <Input
                id="settings-analytics-baidu"
                name="analyticsBaiduId"
                value={analyticsBaiduId}
                onChange={(event) =>
                  onAnalyticsBaiduIdChange(event.target.value)
                }
                maxLength={64}
              />
            </SettingsField>
            <SettingsField
              htmlFor="settings-analytics-umami-url"
              label="自建统计脚本地址"
              hint="Umami / Plausible 等自部署服务地址，例如 https://umami.example.com。"
            >
              <Input
                id="settings-analytics-umami-url"
                name="analyticsUmamiUrl"
                type="url"
                value={analyticsUmamiUrl}
                onChange={(event) =>
                  onAnalyticsUmamiUrlChange(event.target.value)
                }
                maxLength={2048}
                placeholder="https://"
              />
            </SettingsField>
            <SettingsField
              htmlFor="settings-analytics-umami-id"
              label="自建统计站点 ID"
              hint="填写后需在构建环境设置 ANALYTICS_SCRIPT_ORIGIN，CSP 才允许加载该源。"
            >
              <Input
                id="settings-analytics-umami-id"
                name="analyticsUmamiId"
                value={analyticsUmamiId}
                onChange={(event) =>
                  onAnalyticsUmamiIdChange(event.target.value)
                }
                maxLength={64}
              />
            </SettingsField>
          </div>
        </FieldSection>

        <FieldSection
          divided
          Icon={Send}
          title="主动推送"
          description="把首页与全部分类页提交给 IndexNow（Bing、Yandex 等）与百度，加快收录。"
        >
          <SettingsField
            label="IndexNow 密钥"
            hint={
              siteUrl
                ? `密钥文件地址：${siteUrl}/${indexNowKey || '<key>'}.txt`
                : '设置站点地址后即可推送。'
            }
          >
            <div className="flex items-center gap-2">
              <code
                className={cn(
                  'min-w-0 flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs',
                  indexNowKey ? 'text-foreground' : 'text-muted-foreground',
                )}
                title={indexNowKey || undefined}
              >
                {indexNowKey || '尚未生成'}
              </code>
              {indexNowKey ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="复制密钥"
                  onClick={handleCopyKey}
                >
                  {copied ? (
                    <Check className="size-4 text-chart-3" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                </Button>
              ) : null}
            </div>
          </SettingsField>

          <div className="flex flex-wrap items-center gap-2">
            {confirming === 'key' ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={keyBusy}
                  onClick={handleGenerateKey}
                >
                  确认重新生成
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={keyBusy}
                  onClick={() => setConfirming(null)}
                >
                  取消
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={keyBusy}
                onClick={() =>
                  indexNowKey ? armConfirm('key') : handleGenerateKey()
                }
              >
                <RefreshCw className="size-3.5" aria-hidden />
                {indexNowKey ? '重新生成密钥' : '生成密钥'}
              </Button>
            )}
          </div>

          <SettingsField
            htmlFor="settings-baidu-token"
            label="百度推送 token"
            hint={
              tokenStored
                ? '已配置。留空保存则保持不变，填写新值会覆盖。'
                : '在百度搜索资源平台的「普通收录 / 快速收录」里获取。'
            }
          >
            <Input
              id="settings-baidu-token"
              name="baiduPushToken"
              type="password"
              value={baiduPushToken}
              onChange={(event) => onBaiduPushTokenChange(event.target.value)}
              maxLength={64}
              placeholder={tokenStored ? '••••••••（保持不变）' : '留空表示不配置'}
              autoComplete="off"
            />
          </SettingsField>

          {tokenStored ? (
            confirming === 'token' ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={keyBusy}
                  onClick={handleClearToken}
                >
                  确认清除 token
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={keyBusy}
                  onClick={() => setConfirming(null)}
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={keyBusy}
                onClick={() => armConfirm('token')}
              >
                <Trash2 className="size-3.5" aria-hidden />
                清除已保存的 token
              </Button>
            )
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pushing}
              onClick={handlePush}
            >
              {pushing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Send className="size-3.5" aria-hidden />
              )}
              立即推送全部页面
            </Button>
            <p className="text-[0.6875rem] text-muted-foreground">
              先保存设置再推送；每分钟最多 3 次。
            </p>
          </div>

          {pushResult?.outcomes?.length ? (
            <ul className="space-y-1.5">
              {pushResult.outcomes.map((outcome) => (
                <li
                  key={outcome.engine}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed',
                    outcome.ok
                      ? 'border-chart-3/30 bg-chart-3/5 text-chart-3'
                      : 'border-destructive/30 bg-destructive/5 text-destructive',
                  )}
                >
                  <span className="font-medium">
                    {ENGINE_LABELS[outcome.engine] ?? outcome.engine}
                  </span>
                  <span className="min-w-0 flex-1">{outcome.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </FieldSection>
      </div>
    </div>
  );
}

/** Side-rail summary of the SEO configuration. */
export function SeoRail({
  siteUrl,
  seoIndexing,
  verificationCount,
}: {
  siteUrl: string;
  seoIndexing: boolean;
  verificationCount: number;
}) {
  const rows: Array<[string, string]> = [
    ['收录状态', seoIndexing ? '已开启' : '已关闭'],
    ['站点地址', siteUrl || '未设置'],
    [
      '搜索验证',
      `${verificationCount}/${VERIFICATION_TARGETS.length} 个引擎`,
    ],
  ];

  return (
    <section className="rounded-card border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Search className="size-3.5" aria-hidden />
        </span>
        SEO 状态
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
          siteUrl && seoIndexing
            ? 'bg-chart-3/10 text-chart-3'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
        )}
      >
        {!siteUrl
          ? '设置站点地址后，canonical、站点地图与推送才会生效。'
          : seoIndexing
            ? '收录已开启，可在下方把页面主动推给搜索引擎。'
            : '收录已关闭，前台页面不会被搜索引擎索引。'}
      </p>
    </section>
  );
}
