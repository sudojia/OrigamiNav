'use client';

import {
  Bot,
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Tags,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { AI_TAG_COUNT_BOUNDS, type AiProtocol } from '@/types/nav';

import { SettingsField, SettingsSelect } from '../form-primitives';
import { FieldSection } from './field-section';

const TAG_COUNT_OPTIONS = Array.from(
  { length: AI_TAG_COUNT_BOUNDS.max - AI_TAG_COUNT_BOUNDS.min + 1 },
  (_, i) => AI_TAG_COUNT_BOUNDS.min + i,
);

const AI_PROTOCOL_OPTIONS: Array<{
  value: AiProtocol;
  label: string;
  hint: string;
}> = [
  {
    value: 'openai',
    label: 'OpenAI 兼容',
    hint: 'OpenAI、DeepSeek、Ollama 等',
  },
  {
    value: 'anthropic',
    label: 'Anthropic Messages',
    hint: 'Claude 官方 API 及兼容网关',
  },
];

/** Per-protocol Base URL placeholder and hint. */
const AI_BASE_HINTS: Record<AiProtocol, { placeholder: string; hint: string }> = {
  openai: {
    placeholder: 'https://api.openai.com/v1',
    hint: '需要包含版本路径，通常以 /v1 结尾。',
  },
  anthropic: {
    placeholder: 'https://api.anthropic.com',
    hint: '填到域名即可（自动拼接 /v1/messages），以 /v1 结尾也可以。',
  },
};

/** Client-safe view of the AI config. */
export type AiStatus = {
  protocol: AiProtocol;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  keyHint: string | null;
  /** Suggested tag-count range. */
  tagMin: number;
  tagMax: number;
};

export interface AiTabProps {
  active: boolean;
  status: AiStatus;
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  tagMin: string;
  tagMax: string;
  models: string[];
  modelOpen: boolean;
  modelSearch: string;
  loadingModels: boolean;
  onProtocolChange: (value: AiProtocol) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onModelSearchChange: (value: string) => void;
  onModelOpenChange: (open: boolean) => void;
  onPickModel: (name: string) => void;
  onFetchModels: () => void;
  onClearKey: () => void;
  onTagMinChange: (value: string) => void;
  onTagMaxChange: (value: string) => void;
}

export function AiTab({
  active,
  status,
  protocol,
  baseUrl,
  apiKey,
  model,
  tagMin,
  tagMax,
  models,
  modelOpen,
  modelSearch,
  loadingModels,
  onProtocolChange,
  onBaseUrlChange,
  onApiKeyChange,
  onModelSearchChange,
  onModelOpenChange,
  onPickModel,
  onFetchModels,
  onClearKey,
  onTagMinChange,
  onTagMaxChange,
}: AiTabProps) {
  // Includes the saved model in the options before a fetch.
  const modelOptions = Array.from(
    new Set([...(model ? [model] : []), ...models]),
  );
  // Hides the custom row when the search matches a listed model.
  const hasExactModelMatch = modelOptions.some(
    (name) => name.toLowerCase() === modelSearch.trim().toLowerCase(),
  );

  return (
    <div hidden={!active} role="tabpanel" aria-label="AI">
      <div className="space-y-6 px-5 py-5">
        <FieldSection
          Icon={Bot}
          title="模型服务"
          description="先选择接口协议，再填写地址与密钥。OpenAI 兼容覆盖官方 OpenAI、DeepSeek、OpenRouter 与自建的 Ollama / LM Studio / vLLM；Anthropic Messages 对接 Claude 官方 API 及兼容网关。"
        >
          <SettingsField label="接口协议">
            <div
              role="radiogroup"
              aria-label="接口协议"
              className="grid gap-2 sm:grid-cols-2"
            >
              {AI_PROTOCOL_OPTIONS.map((option) => {
                const isActive = protocol === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => onProtocolChange(option.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors',
                      isActive
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
          </SettingsField>

          <SettingsField
            htmlFor="settings-ai-base"
            label="Base URL"
            hint={AI_BASE_HINTS[protocol].hint}
          >
            <Input
              id="settings-ai-base"
              type="url"
              placeholder={AI_BASE_HINTS[protocol].placeholder}
              value={baseUrl}
              onChange={(event) => onBaseUrlChange(event.target.value)}
              maxLength={2048}
            />
          </SettingsField>

          <SettingsField
            htmlFor="settings-ai-key"
            label="API Key"
            labelExtra={
              status.hasApiKey ? (
                <span className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
                  已配置 {status.keyHint}
                  <button
                    type="button"
                    className="text-destructive underline-offset-2 hover:underline"
                    onClick={onClearKey}
                  >
                    清除
                  </button>
                </span>
              ) : null
            }
            hint="密钥只保存在服务端，不会下发到浏览器；留空表示不修改。"
          >
            <Input
              id="settings-ai-key"
              type="password"
              autoComplete="off"
              placeholder={status.hasApiKey ? '留空则保持已保存的密钥' : 'sk-…'}
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              maxLength={512}
            />
          </SettingsField>
        </FieldSection>

        <FieldSection
          divided
          Icon={Sparkles}
          title="模型"
          description="从服务端获取可用模型列表，也可以直接输入模型名。"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingModels}
              onClick={onFetchModels}
            >
              {loadingModels ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden />
              )}
              {loadingModels ? '获取中…' : '获取模型'}
            </Button>
          }
        >
          <div className="space-y-2">
            <Popover open={modelOpen} onOpenChange={onModelOpenChange}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={modelOpen}
                  aria-controls={
                    modelOpen ? 'settings-ai-model-list' : undefined
                  }
                  aria-label="选择模型"
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left outline-none transition-[color,box-shadow,border-color] hover:border-primary/40 hover:bg-accent/40 focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/25',
                    modelOpen && 'border-primary/45 ring-1 ring-primary/25',
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Sparkles className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.6875rem] leading-none text-muted-foreground">
                      当前模型
                    </span>
                    <span
                      className={cn(
                        'mt-1 block truncate font-mono text-sm',
                        !model && 'text-muted-foreground',
                      )}
                    >
                      {model || '未选择'}
                    </span>
                  </span>
                  <ChevronsUpDown
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                id="settings-ai-model-list"
                align="start"
                className="w-(--radix-popover-trigger-width) p-0"
              >
                <Command>
                  <CommandInput
                    value={modelSearch}
                    onValueChange={onModelSearchChange}
                    placeholder="搜索模型…"
                  />
                  <CommandList>
                    {modelOptions.length === 0 && !modelSearch.trim() ? (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                        还没有模型，先点「获取模型」。
                      </p>
                    ) : null}
                    {modelSearch.trim() && !hasExactModelMatch ? (
                      <CommandGroup heading="自定义">
                        <CommandItem
                          value={`custom ${modelSearch.trim()}`}
                          onSelect={() => onPickModel(modelSearch.trim())}
                        >
                          <Plus className="size-4" aria-hidden />
                          使用「{modelSearch.trim()}」
                        </CommandItem>
                      </CommandGroup>
                    ) : null}
                    <CommandGroup>
                      {modelOptions.map((name) => (
                        <CommandItem
                          key={name}
                          value={name}
                          onSelect={() => onPickModel(name)}
                        >
                          <Check
                            className={cn(
                              'size-4',
                              name === model ? 'opacity-100' : 'opacity-0',
                            )}
                            aria-hidden
                          />
                          {name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {models.length > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check
                  className="size-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                已获取 {models.length} 个模型
              </p>
            ) : null}
          </div>
        </FieldSection>

        <FieldSection
          divided
          Icon={Tags}
          title="标签数量"
          description="「AI 标签」生成的个数范围，保存后立即生效。"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsSelect
              id="settings-ai-tag-min"
              label="最少"
              value={tagMin}
              onValueChange={onTagMinChange}
              options={TAG_COUNT_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n} 个`,
              }))}
            />
            <SettingsSelect
              id="settings-ai-tag-max"
              label="最多"
              value={tagMax}
              onValueChange={onTagMaxChange}
              options={TAG_COUNT_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n} 个`,
              }))}
            />
          </div>
        </FieldSection>
      </div>
    </div>
  );
}

/** Side-rail summary of the AI configuration. */
export function AiRail({
  status,
  protocol,
  model,
  baseUrl,
  tagMin,
  tagMax,
}: {
  status: AiStatus;
  /** The form's live protocol choice. */
  protocol: AiProtocol;
  model: string;
  baseUrl: string;
  tagMin: number;
  tagMax: number;
}) {
  const rows: Array<[string, string]> = [
    ['协议', protocol === 'anthropic' ? 'Anthropic Messages' : 'OpenAI 兼容'],
    ['Base URL', baseUrl || '未填写'],
    ['API Key', status.hasApiKey ? `已配置 ${status.keyHint ?? ''}` : '未配置'],
    ['模型', model || '未选择'],
    ['标签数量', tagMin === tagMax ? `${tagMin} 个` : `${tagMin}-${tagMax} 个`],
  ];
  const ready = Boolean(baseUrl) && status.hasApiKey && Boolean(model);

  return (
    <section className="rounded-card border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Bot className="size-3.5" aria-hidden />
        </span>
        AI 状态
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
          ready
            ? 'bg-chart-3/10 text-chart-3'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {ready
          ? '配置完整，AI 会在后台自动根据书签内容补全标签。'
          : '三项都填好后，AI 标签才会启用。'}
      </p>
    </section>
  );
}
