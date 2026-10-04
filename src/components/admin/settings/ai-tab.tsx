'use client';

import {
  Bot,
  Check,
  ChevronsUpDown,
  Link as LinkIcon,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Tags,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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

        <FieldSection divided Icon={Sparkles} title="模型">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={loadingModels}
              onClick={onFetchModels}
            >
              {loadingModels ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden />
              )}
              获取模型
            </Button>

            <Popover open={modelOpen} onOpenChange={onModelOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={modelOpen}
                  className={cn(
                    'min-w-0 flex-1 basis-56 justify-between font-normal',
                    !model && 'text-muted-foreground',
                  )}
                >
                  <span className="truncate">{model || '选择模型'}</span>
                  <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent
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
          </div>

          {models.length > 0 ? (
            <Badge className="gap-1.5 border-emerald-500/25 bg-emerald-500/10 py-1 pl-2.5 pr-3 font-normal text-emerald-700 dark:text-emerald-400">
              <Check aria-hidden />
              已获取 {models.length} 个模型
            </Badge>
          ) : model ? (
            <Badge
              variant="outline"
              className="max-w-full gap-1.5 border-primary/20 bg-primary/5 py-1 pl-2.5 pr-3 font-normal"
            >
              <Sparkles className="text-primary" aria-hidden />
              <span className="text-muted-foreground">当前</span>
              <span className="min-w-0 truncate font-mono">{model}</span>
            </Badge>
          ) : null}

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <LinkIcon className="size-3.5 text-primary/70" aria-hidden />
              自动填充
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              配置完成后，在「新增书签」里粘贴链接并点「AI
              填充」，即可自动生成标题、描述与标签建议。
            </p>
          </div>
        </FieldSection>

        <FieldSection
          divided
          Icon={Tags}
          title="标签数量"
          description="「AI 填充」建议生成的标签个数范围，保存后立即生效。"
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
          ? '配置完整，书签表单里的「AI 填充」已可用。'
          : '三项都填好后，「AI 填充」才会启用。'}
      </p>
    </section>
  );
}
