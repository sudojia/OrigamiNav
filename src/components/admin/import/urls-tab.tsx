'use client';

import { Link2, ListChecks, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';

import { importUrlsAction } from '@/actions/import';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { SubmitButton, useActionFeedback } from '../form-primitives';
import { TabCardHead } from '../panel-ui';
import { SummaryChip } from './summary-chip';

// ── 1. Bulk URLs ─────────────────────────────────────────────────────────────

export function UrlsTab({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(importUrlsAction, null);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [fetchMeta, setFetchMeta] = useState(true);
  const [urlCount, setUrlCount] = useState(0);

  useActionFeedback(state, () => router.refresh());

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-card border bg-card shadow-card motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <TabCardHead
        Icon={Link2}
        hue="bg-chart-1/10 text-chart-1"
        title="批量粘贴链接"
        description="适合从笔记、聊天记录、其它导航站一次性迁移。"
      />

      <div className="space-y-5 px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>目标分类</Label>
            <input type="hidden" name="categoryId" value={categoryId} />
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end justify-end pb-0.5">
            {urlCount > 0 ? (
              <SummaryChip Icon={ListChecks} tone="primary">
                已识别{' '}
                <span className="font-semibold tabular-nums">{urlCount}</span> 行
              </SummaryChip>
            ) : (
              <span className="text-xs text-muted-foreground">
                每行一个链接
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="import-urls">链接列表</Label>
          <Textarea
            id="import-urls"
            name="urls"
            rows={10}
            placeholder={'每行一个链接，可选地在链接后空格加标题：\nhttps://nextjs.org\nhttps://tailwindcss.com Tailwind CSS'}
            className="font-mono text-xs leading-relaxed"
            onChange={(event) => {
              const lines = event.target.value
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
              setUrlCount(lines.length);
            }}
            required
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-3">
          <div className="flex min-w-0 items-start gap-2.5 pr-3">
            <Sparkles
              className="mt-0.5 size-4 shrink-0 text-primary/70"
              aria-hidden
            />
            <div className="min-w-0">
              <Label htmlFor="import-fetch-meta" className="text-sm">
                抓取标题与描述
              </Label>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                访问每个链接读取网页信息，较慢；仅处理前 30 条，其余用域名作标题。
              </p>
            </div>
          </div>
          <input
            type="hidden"
            name="fetchMeta"
            value={fetchMeta ? 'on' : ''}
          />
          <Switch
            id="import-fetch-meta"
            checked={fetchMeta}
            onCheckedChange={setFetchMeta}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-5 py-3.5">
        <p className="text-xs text-muted-foreground">
          一次最多 500 条；库里已存在的链接会自动跳过。
        </p>
        <SubmitButton pendingLabel="导入中…">开始导入</SubmitButton>
      </div>
    </form>
  );
}
