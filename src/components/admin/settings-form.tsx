'use client';

import {
  Bot,
  Check,
  KeyRound,
  Palette as PaletteIcon,
  Puzzle,
  Search,
  Settings2,
  Type,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  aiTagUntaggedBatchAction,
  clearAiKeyAction,
  fetchAiModelsAction,
  testAiConnectionAction,
} from '@/actions/ai';
import { updateSettingsAction } from '@/actions/settings';
import {
  removeFaviconAction,
  uploadFaviconAction,
} from '@/actions/site-assets';
import { cn } from '@/lib/utils';
import {
  isAiProtocol,
  isCategoryDeleteMode,
  isFaviconMode,
  isIconService,
  isSkinId,
  VERIFICATION_TARGETS,
  type AiProtocol,
  type CategoryDeleteMode,
  type FaviconMode,
  type IconService,
  type SkinId,
  type VerificationId,
} from '@/types/nav';

import { SubmitButton, useActionFeedback } from './form-primitives';
import { PageHeader } from './page-header';
import { TabCardHead, TileActiveCheck, TILE_TRIGGER } from './panel-ui';
import { PasswordSection } from './password-form';
import {
  AppearanceTab,
  LayoutRail,
} from './settings/appearance-tab';
import {
  AiTab,
  AiRail,
  type AiStatus,
  type AiTestResult,
} from './settings/ai-tab';
import { ExtensionRail, ExtensionTab } from './settings/extension-tab';
import { GeneralTab, IdentityPreview } from './settings/general-tab';
import { SecurityTab, SecurityRail } from './settings/security-tab';
import { SeoRail, SeoTab } from './settings/seo-tab';

export type { AiStatus };

type TabId = 'general' | 'appearance' | 'ai' | 'security' | 'extension' | 'seo';

const TABS: Array<{
  id: TabId;
  label: string;
  hint: string;
  hue: string;
  Icon: typeof Type;
}> = [
  {
    id: 'general',
    label: '基本信息',
    hint: '名称、副标题、描述与图标',
    hue: 'bg-chart-1/10 text-chart-1',
    Icon: Type,
  },
  {
    id: 'appearance',
    label: '外观',
    hint: '主题皮肤与书签布局',
    hue: 'bg-chart-5/10 text-chart-5',
    Icon: PaletteIcon,
  },
  {
    id: 'ai',
    label: 'AI',
    hint: '模型服务与自动填充',
    hue: 'bg-chart-3/10 text-chart-3',
    Icon: Bot,
  },
  {
    id: 'security',
    label: '安全',
    hint: '密码保护与分类删除',
    hue: 'bg-chart-4/10 text-chart-4',
    Icon: KeyRound,
  },
  {
    id: 'extension',
    label: '浏览器扩展',
    hint: '快速收藏 API 令牌',
    hue: 'bg-chart-2/10 text-chart-2',
    Icon: Puzzle,
  },
  {
    id: 'seo',
    label: 'SEO',
    hint: '收录验证与站点地图',
    hue: 'bg-chart-1/10 text-chart-1',
    Icon: Search,
  },
];

/** Site settings as a tabbed form with a live preview rail. */
export function SettingsForm({
  settings,
  aiStatus,
  extToken,
  hasBaiduToken,
  untaggedCount,
}: {
  settings: {
    siteName: string;
    tagline: string;
    description: string;
    logoUrl: string | null;
    faviconMode: string;
    faviconUrl: string | null;
    faviconVersion: string | null;
    iconService: string;
    iconCustomTemplate: string | null;
    defaultTheme: string;
    cardColumns: number;
    categoryPreviewCount: number;
    categoryDeleteMode: string;
    sessionMaxDays: number;
    loginRateLimit: number;
    aiConcurrency: number;
    siteUrl: string | null;
    seoIndexing: boolean;
    verifications: Record<VerificationId, string>;
    analyticsGaId: string;
    analyticsBaiduId: string;
    analyticsUmamiUrl: string;
    analyticsUmamiId: string;
    indexNowKey: string;
  };
  aiStatus: AiStatus;
  extToken: string | null;
  hasBaiduToken: boolean;
  untaggedCount: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(updateSettingsAction, null);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? '');
  const [siteName, setSiteName] = useState(settings.siteName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [description, setDescription] = useState(settings.description);
  const [faviconMode, setFaviconMode] = useState<FaviconMode>(
    isFaviconMode(settings.faviconMode) ? settings.faviconMode : 'none',
  );
  const [faviconUrl, setFaviconUrl] = useState(settings.faviconUrl ?? '');
  const [iconService, setIconService] = useState<IconService>(
    isIconService(settings.iconService) ? settings.iconService : 'auto',
  );
  const [iconCustomTemplate, setIconCustomTemplate] = useState(
    settings.iconCustomTemplate ?? '',
  );
  const [defaultTheme, setDefaultTheme] = useState<SkinId>(
    isSkinId(settings.defaultTheme) ? settings.defaultTheme : 'blue',
  );
  const [cardColumns, setCardColumns] = useState(String(settings.cardColumns));
  const [categoryPreviewCount, setCategoryPreviewCount] = useState(
    String(settings.categoryPreviewCount),
  );
  const [categoryDeleteMode, setCategoryDeleteMode] =
    useState<CategoryDeleteMode>(
      isCategoryDeleteMode(settings.categoryDeleteMode)
        ? settings.categoryDeleteMode
        : 'protected',
    );
  const [sessionMaxDays, setSessionMaxDays] = useState(
    String(settings.sessionMaxDays),
  );
  const [loginRateLimit, setLoginRateLimit] = useState(
    String(settings.loginRateLimit),
  );

  const [siteUrl, setSiteUrl] = useState(settings.siteUrl ?? '');
  const [seoIndexing, setSeoIndexing] = useState(settings.seoIndexing);
  const [verifications, setVerifications] = useState(settings.verifications);
  const [analyticsGaId, setAnalyticsGaId] = useState(settings.analyticsGaId);
  const [analyticsBaiduId, setAnalyticsBaiduId] = useState(
    settings.analyticsBaiduId,
  );
  const [analyticsUmamiUrl, setAnalyticsUmamiUrl] = useState(
    settings.analyticsUmamiUrl,
  );
  const [analyticsUmamiId, setAnalyticsUmamiId] = useState(
    settings.analyticsUmamiId,
  );
  // Push token field starts empty; blank keeps the stored token.
  const [baiduPushToken, setBaiduPushToken] = useState('');

  // API key field starts empty; blank keeps the stored key.
  const [aiProtocol, setAiProtocol] = useState<AiProtocol>(
    isAiProtocol(aiStatus.protocol) ? aiStatus.protocol : 'openai',
  );
  const [aiBaseUrl, setAiBaseUrl] = useState(aiStatus.baseUrl);
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState(aiStatus.model);
  const [aiTagMin, setAiTagMin] = useState(String(aiStatus.tagMin));
  const [aiTagMax, setAiTagMax] = useState(String(aiStatus.tagMax));
  const [aiTagMaxLen, setAiTagMaxLen] = useState(
    String(aiStatus.tagMaxLen),
  );
  const [aiConcurrency, setAiConcurrency] = useState(
    String(settings.aiConcurrency),
  );
  const [batchRemaining, setBatchRemaining] = useState(untaggedCount);
  const [batchRunning, setBatchRunning] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [faviconBusy, setFaviconBusy] = useState(false);

  // Local icon version for the preview; updated after each upload.
  const [iconVersion, setIconVersion] = useState(settings.faviconVersion);

  const hasUploadedIcon = faviconMode === 'upload' && Boolean(iconVersion);

  const effectiveIcon =
    faviconMode === 'upload' && iconVersion
      ? `/api/site-icon?v=${encodeURIComponent(iconVersion)}`
      : faviconMode === 'url' && faviconUrl
        ? faviconUrl
        : null;

  async function handleIconFile(file: File | undefined) {
    if (!file) return;
    setFaviconBusy(true);
    try {
      const data = new FormData();
      data.append('favicon', file);
      const result = await uploadFaviconAction(null, data);
      if (result.ok) {
        toast.success(result.message);
        setFaviconMode('upload');
        setIconVersion(new Date().toISOString());
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } finally {
      setFaviconBusy(false);
    }
  }

  async function handleIconRemove() {
    setFaviconBusy(true);
    try {
      const result = await removeFaviconAction();
      if (result.ok) {
        toast.success(result.message);
        setIconVersion(null);
        setFaviconMode(faviconUrl ? 'url' : 'none');
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } finally {
      setFaviconBusy(false);
    }
  }

  async function handleFetchModels() {
    setLoadingModels(true);
    try {
      const result = await fetchAiModelsAction({
        protocol: aiProtocol,
        baseUrl: aiBaseUrl,
        apiKey: aiApiKey,
      });
      if (result.ok) {
        setModels(result.models);
        // Clears the model if the provider no longer lists it.
        if (!result.models.includes(aiModel)) setAiModel('');
        toast.success(`获取到 ${result.models.length} 个模型`);
      } else {
        toast.error(result.message);
      }
    } finally {
      setLoadingModels(false);
    }
  }

  // Clears the fetched model list when the protocol changes.
  function handleProtocolChange(next: AiProtocol) {
    if (next === aiProtocol) return;
    setAiProtocol(next);
    setModels([]);
    setTestResult(null);
  }

  // Editing anything the test used invalidates its result.
  function handleBaseUrlChange(next: string) {
    setAiBaseUrl(next);
    setTestResult(null);
  }

  function handleApiKeyChange(next: string) {
    setAiApiKey(next);
    setTestResult(null);
  }

  async function handleTestConnection() {
    if (testingConnection) return;
    setTestingConnection(true);
    try {
      setTestResult(
        await testAiConnectionAction({
          protocol: aiProtocol,
          baseUrl: aiBaseUrl,
          apiKey: aiApiKey,
          model: aiModel,
        }),
      );
    } finally {
      setTestingConnection(false);
    }
  }

  function handleModelOpenChange(open: boolean) {
    setModelOpen(open);
    // Clears the model search on close.
    if (!open) setModelSearch('');
  }

  function pickModel(name: string) {
    setAiModel(name);
    setTestResult(null);
    handleModelOpenChange(false);
  }

  // Keeps the tag min/max pair ordered.
  function handleTagMinChange(next: string) {
    setAiTagMin(next);
    if (Number(next) > Number(aiTagMax)) setAiTagMax(next);
  }

  function handleTagMaxChange(next: string) {
    setAiTagMax(next);
    if (Number(next) < Number(aiTagMin)) setAiTagMin(next);
  }

  function handleVerificationChange(id: VerificationId, value: string) {
    setVerifications((current) => ({ ...current, [id]: value }));
  }

  async function handleClearKey() {
    const result = await clearAiKeyAction();
    if (result.ok) {
      setAiApiKey('');
      setTestResult(null);
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function handleBatchRetag() {
    if (batchRunning) return;
    setBatchRunning(true);
    try {
      const result = await aiTagUntaggedBatchAction();
      if (result.ok) {
        toast.success(result.message);
        setBatchRemaining(Math.max(result.remaining, 0));
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('[origaminav] batch retag request failed', error);
      toast.error('批量补打标签请求失败，请检查网络后重试');
    } finally {
      setBatchRunning(false);
    }
  }

  // Stops the native form reset from reaching Radix Select.
  useEffect(() => {
    const blockReset = (event: Event) => {
      if (event.target === formRef.current) event.stopImmediatePropagation();
    };
    document.addEventListener('reset', blockReset, true);
    return () => document.removeEventListener('reset', blockReset, true);
  }, []);

  useActionFeedback(state, () => {
    // Applies the new skin before the refresh.
    document.documentElement.setAttribute('data-skin', defaultTheme);
    router.refresh();
  });

  const HEADS: Record<
    TabId,
    { Icon: typeof Type; hue: string; title: string; description: string }
  > = {
    general: {
      Icon: Type,
      hue: 'bg-chart-1/10 text-chart-1',
      title: '基本信息',
      description: '站点名称、副标题、描述、Logo 与浏览器图标。',
    },
    appearance: {
      Icon: PaletteIcon,
      hue: 'bg-chart-5/10 text-chart-5',
      title: '外观',
      description: '全站主题皮肤与前台书签布局。',
    },
    ai: {
      Icon: Bot,
      hue: 'bg-chart-3/10 text-chart-3',
      title: 'AI',
      description:
        '配置 OpenAI 兼容或 Anthropic Messages 协议的模型服务，用来给书签自动打标签。',
    },
    security: {
      Icon: KeyRound,
      hue: 'bg-chart-4/10 text-chart-4',
      title: '安全',
      description: '管理员密码、登录限流与分类删除策略。',
    },
    extension: {
      Icon: Puzzle,
      hue: 'bg-chart-2/10 text-chart-2',
      title: '浏览器扩展',
      description: '为浏览器扩展生成访问令牌，在任意网页一键收藏。',
    },
    seo: {
      Icon: Search,
      hue: 'bg-chart-1/10 text-chart-1',
      title: 'SEO',
      description:
        '站点地址、搜索引擎收录与验证、站点地图、访问统计与主动推送。',
    },
  };
  const head = HEADS[activeTab];

  return (
    <div className="space-y-5">
      <PageHeader
        Icon={Settings2}
        title="站点设置"
        description="站点信息、外观、AI 服务、安全策略与浏览器扩展的集中管理。"
      />

      {/* Tab list using the shared tile classes. */}
      <div
        role="tablist"
        aria-label="站点设置分类"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6"
      >
        {TABS.map(({ id, label, hint, hue, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              data-state={active ? 'active' : 'inactive'}
              onClick={() => setActiveTab(id)}
              className={TILE_TRIGGER}
            >
              <span className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-lg',
                    hue,
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <TileActiveCheck active={active} />
              </span>
              <span className="block text-sm font-medium text-foreground">
                {label}
              </span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                {hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19.5rem] xl:items-start">
          <form
            ref={formRef}
            action={formAction}
            className="min-w-0 overflow-hidden rounded-card border bg-card shadow-card"
          >
            {/* Hidden mirrors for fields driven by controlled widgets. */}
            <input type="hidden" name="defaultTheme" value={defaultTheme} />
            <input type="hidden" name="cardColumns" value={cardColumns} />
            <input
              type="hidden"
              name="categoryPreviewCount"
              value={categoryPreviewCount}
            />
            <input
              type="hidden"
              name="categoryDeleteMode"
              value={categoryDeleteMode}
            />
            <input type="hidden" name="sessionMaxDays" value={sessionMaxDays} />
            <input
              type="hidden"
              name="loginRateLimit"
              value={loginRateLimit}
            />
            <input type="hidden" name="logoUrl" value={logoUrl} />
            <input type="hidden" name="faviconMode" value={faviconMode} />
            <input type="hidden" name="faviconUrl" value={faviconUrl} />
            <input type="hidden" name="iconService" value={iconService} />
            <input
              type="hidden"
              name="iconCustomTemplate"
              value={iconCustomTemplate}
            />
            <input type="hidden" name="aiProtocol" value={aiProtocol} />
            <input type="hidden" name="aiBaseUrl" value={aiBaseUrl} />
            <input type="hidden" name="aiApiKey" value={aiApiKey} />
            <input type="hidden" name="aiModel" value={aiModel} />
            <input type="hidden" name="aiTagMin" value={aiTagMin} />
            <input type="hidden" name="aiTagMax" value={aiTagMax} />
            <input
              type="hidden"
              name="aiTagMaxLen"
              value={aiTagMaxLen}
            />
            <input
              type="hidden"
              name="aiConcurrency"
              value={aiConcurrency}
            />
            <input
              type="hidden"
              name="seoIndexing"
              value={seoIndexing ? '1' : '0'}
            />

            <TabCardHead {...head} />

            <GeneralTab
              active={activeTab === 'general'}
              siteName={siteName}
              tagline={tagline}
              description={description}
              logoUrl={logoUrl}
              faviconMode={faviconMode}
              faviconUrl={faviconUrl}
              iconService={iconService}
              iconCustomTemplate={iconCustomTemplate}
              faviconBusy={faviconBusy}
              hasUploadedIcon={hasUploadedIcon}
              effectiveIcon={effectiveIcon}
              onSiteNameChange={setSiteName}
              onTaglineChange={setTagline}
              onDescriptionChange={setDescription}
              onLogoUrlChange={setLogoUrl}
              onFaviconModeChange={setFaviconMode}
              onFaviconUrlChange={setFaviconUrl}
              onIconServiceChange={setIconService}
              onIconCustomTemplateChange={setIconCustomTemplate}
              onIconFile={handleIconFile}
              onIconRemove={handleIconRemove}
            />

            <AppearanceTab
              active={activeTab === 'appearance'}
              defaultTheme={defaultTheme}
              cardColumns={cardColumns}
              categoryPreviewCount={categoryPreviewCount}
              onThemeChange={setDefaultTheme}
              onCardColumnsChange={setCardColumns}
              onCategoryPreviewCountChange={setCategoryPreviewCount}
            />

            <AiTab
              active={activeTab === 'ai'}
              status={aiStatus}
              protocol={aiProtocol}
              baseUrl={aiBaseUrl}
              apiKey={aiApiKey}
              model={aiModel}
              tagMin={aiTagMin}
              tagMax={aiTagMax}
              tagMaxLen={aiTagMaxLen}
              aiConcurrency={aiConcurrency}
              untaggedCount={batchRemaining}
              batchRunning={batchRunning}
              testingConnection={testingConnection}
              testResult={testResult}
              models={models}
              modelOpen={modelOpen}
              modelSearch={modelSearch}
              loadingModels={loadingModels}
              onProtocolChange={handleProtocolChange}
              onBaseUrlChange={handleBaseUrlChange}
              onApiKeyChange={handleApiKeyChange}
              onModelSearchChange={setModelSearch}
              onModelOpenChange={handleModelOpenChange}
              onPickModel={pickModel}
              onFetchModels={handleFetchModels}
              onTestConnection={() => void handleTestConnection()}
              onClearKey={handleClearKey}
              onTagMinChange={handleTagMinChange}
              onTagMaxChange={handleTagMaxChange}
              onTagMaxLenChange={setAiTagMaxLen}
              onAiConcurrencyChange={setAiConcurrency}
              onBatchRetag={() => void handleBatchRetag()}
            />

            <SecurityTab
              active={activeTab === 'security'}
              deleteMode={categoryDeleteMode}
              sessionMaxDays={sessionMaxDays}
              loginRateLimit={loginRateLimit}
              onDeleteModeChange={setCategoryDeleteMode}
              onSessionMaxDaysChange={setSessionMaxDays}
              onLoginRateLimitChange={setLoginRateLimit}
            />

            <ExtensionTab
              active={activeTab === 'extension'}
              initialToken={extToken}
            />

            <SeoTab
              active={activeTab === 'seo'}
              siteUrl={siteUrl}
              seoIndexing={seoIndexing}
              verifications={verifications}
              analyticsGaId={analyticsGaId}
              analyticsBaiduId={analyticsBaiduId}
              analyticsUmamiUrl={analyticsUmamiUrl}
              analyticsUmamiId={analyticsUmamiId}
              baiduPushToken={baiduPushToken}
              initialIndexNowKey={settings.indexNowKey}
              hasBaiduToken={hasBaiduToken}
              onSiteUrlChange={setSiteUrl}
              onSeoIndexingChange={setSeoIndexing}
              onVerificationChange={handleVerificationChange}
              onAnalyticsGaIdChange={setAnalyticsGaId}
              onAnalyticsBaiduIdChange={setAnalyticsBaiduId}
              onAnalyticsUmamiUrlChange={setAnalyticsUmamiUrl}
              onAnalyticsUmamiIdChange={setAnalyticsUmamiId}
              onBaiduPushTokenChange={setBaiduPushToken}
            />

            {/* ── Footer action bar ──────────────────────────────────── */}
            <div className="flex items-center justify-end border-t border-border/60 bg-muted/30 px-5 py-3.5">
              <SubmitButton className="shrink-0">
                <Check className="size-4" aria-hidden />
                保存设置
              </SubmitButton>
            </div>
          </form>

          <aside className="space-y-4 xl:sticky xl:top-6">
            {activeTab === 'general' ? (
              <IdentityPreview
                siteName={siteName}
                tagline={tagline}
                description={description}
                logoUrl={logoUrl}
                faviconHref={effectiveIcon}
              />
            ) : activeTab === 'ai' ? (
              <AiRail
                status={aiStatus}
                protocol={aiProtocol}
                model={aiModel}
                baseUrl={aiBaseUrl}
                tagMin={Number(aiTagMin)}
                tagMax={Number(aiTagMax)}
                tagMaxLen={Number(aiTagMaxLen)}
                aiConcurrency={Number(aiConcurrency)}
                untaggedCount={batchRemaining}
              />
            ) : activeTab === 'appearance' ? (
              <LayoutRail columns={Number(cardColumns)} />
            ) : activeTab === 'extension' ? (
              <ExtensionRail token={extToken} />
            ) : activeTab === 'seo' ? (
              <SeoRail
                siteUrl={siteUrl}
                seoIndexing={seoIndexing}
                verificationCount={
                  VERIFICATION_TARGETS.filter(
                    (target) => verifications[target.id] !== '',
                  ).length
                }
              />
            ) : (
              <SecurityRail
                deleteMode={categoryDeleteMode}
                sessionMaxDays={Number(sessionMaxDays)}
                loginRateLimit={Number(loginRateLimit)}
              />
            )}
          </aside>

          {activeTab === 'security' ? <PasswordSection /> : null}
        </div>
      </div>
    </div>
  );
}
