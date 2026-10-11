'use client';

import {
  ArrowLeft,
  CircleCheck,
  Link2,
  ListChecks,
  ListX,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  confirmUrlImportAction,
  previewUrlImportAction,
  type UrlPreviewItem,
} from '@/actions/import';
import { analyzePastedUrls } from '@/lib/bookmark-import';
import { MAX_URL_LINES } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

import { TabCardHead } from '../panel-ui';
import { SummaryChip } from './summary-chip';

// ── 1. Bulk URLs: paste → preview → import ───────────────────────────────────

export function UrlsTab({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  // The pasted text lives in React state, so a failed request can never wipe it.
  const [urlsText, setUrlsText] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [fetchMeta, setFetchMeta] = useState(true);
  const [items, setItems] = useState<UrlPreviewItem[]>([]);
  const [previewStats, setPreviewStats] = useState<{
    skippedExisting: number;
    fetchedCount: number;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  // Mirrors the server-side parse, so these counts are exactly what imports.
  const stats = useMemo(() => analyzePastedUrls(urlsText), [urlsText]);
  const overLimit = stats.items.length > MAX_URL_LINES;

  async function handlePreview() {
    if (!categoryId) {
      toast.error('请选择目标分类');
      return;
    }
    if (stats.items.length === 0) {
      toast.error('没有解析到有效的 http(s):// 链接，每行一个');
      return;
    }
    if (overLimit) {
      toast.error(
        `一次最多导入 ${MAX_URL_LINES} 条链接（当前 ${stats.items.length} 条）`,
      );
      return;
    }
    setPreviewing(true);
    try {
      const result = await previewUrlImportAction({ urlsText, fetchMeta });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setItems(result.items);
      setPreviewStats({
        skippedExisting: result.skippedExisting,
        fetchedCount: result.fetchedCount,
      });
      setStep('preview');
    } catch {
      toast.error('解析请求失败，请重试');
    } finally {
      setPreviewing(false);
    }
  }

  function updateTitle(index: number, title: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, title } : item)),
    );
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    setImporting(true);
    try {
      const result = await confirmUrlImportAction({ categoryId, items });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        result.skipped > 0
          ? `成功导入 ${result.created} 条，跳过已存在 ${result.skipped} 条`
          : `成功导入 ${result.created} 条`,
      );
      router.refresh();
      setUrlsText('');
      setItems([]);
      setPreviewStats(null);
      setStep('edit');
    } catch {
      toast.error('导入请求失败，请重试');
    } finally {
      setImporting(false);
    }
  }

  const unfetchedCount = fetchMeta
    ? (previewStats?.fetchedCount ?? 0)
    : 0;

  return (
    <div className="overflow-hidden rounded-card border bg-card shadow-card motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-2 duration-300">
      <TabCardHead
        Icon={Link2}
        hue="bg-chart-1/10 text-chart-1"
        title="批量粘贴链接"
        description={
          step === 'edit'
            ? '适合从笔记、聊天记录、其它导航站一次性迁移。'
            : '确认标题与链接：可编辑标题、剔除不需要的行，再确认导入。'
        }
      />

      {step === 'edit' ? (
        <>
          <div className="space-y-5 px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>目标分类</Label>
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
              <div className="flex flex-wrap items-end justify-end gap-1.5 pb-0.5">
                {stats.items.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    每行一个链接
                  </span>
                ) : (
                  <>
                    <SummaryChip Icon={ListChecks} tone="primary">
                      有效{' '}
                      <span className="font-semibold tabular-nums">
                        {stats.items.length}
                      </span>{' '}
                      条
                    </SummaryChip>
                    {stats.duplicates > 0 ? (
                      <SummaryChip Icon={CircleCheck} tone="default">
                        重复{' '}
                        <span className="font-semibold tabular-nums">
                          {stats.duplicates}
                        </span>
                      </SummaryChip>
                    ) : null}
                    {stats.invalidLines > 0 ? (
                      <SummaryChip Icon={TriangleAlert} tone="warn">
                        无效{' '}
                        <span className="font-semibold tabular-nums">
                          {stats.invalidLines}
                        </span>{' '}
                        行
                      </SummaryChip>
                    ) : null}
                    {overLimit ? (
                      <SummaryChip Icon={ListX} tone="warn">
                        超出 {MAX_URL_LINES} 条上限
                      </SummaryChip>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-urls">链接列表</Label>
              <Textarea
                id="import-urls"
                rows={10}
                placeholder={
                  '每行一个链接，可选地在链接后空格加标题：\nhttps://nextjs.org\nhttps://tailwindcss.com Tailwind CSS'
                }
                className="font-mono text-xs leading-relaxed"
                value={urlsText}
                onChange={(event) => setUrlsText(event.target.value)}
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
                    生成预览时访问每个链接读取网页信息，较慢；仅处理前 30
                    条，其余用域名作标题。
                  </p>
                </div>
              </div>
              <Switch
                id="import-fetch-meta"
                checked={fetchMeta}
                onCheckedChange={setFetchMeta}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-5 py-3.5">
            <p className="text-xs text-muted-foreground">
              一次最多 {MAX_URL_LINES} 条；库里已存在的链接会在预览中跳过。
            </p>
            <Button onClick={handlePreview} disabled={previewing}>
              {previewing ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  正在解析与抓取…
                </>
              ) : (
                '生成预览'
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 px-5 py-4">
            <SummaryChip Icon={ListChecks} tone="primary">
              将导入{' '}
              <span className="font-semibold tabular-nums">{items.length}</span>{' '}
              条
            </SummaryChip>
            {fetchMeta ? (
              <SummaryChip Icon={CircleCheck} tone="default">
                抓取成功 {previewStats?.fetchedCount ?? 0}
              </SummaryChip>
            ) : null}
            {fetchMeta &&
            items.length - unfetchedCount > 0 ? (
              <SummaryChip Icon={TriangleAlert} tone="warn">
                未抓到 {items.length - unfetchedCount} 条，用域名命名
              </SummaryChip>
            ) : null}
            {previewStats && previewStats.skippedExisting > 0 ? (
              <SummaryChip Icon={ListX} tone="default">
                跳过已存在 {previewStats.skippedExisting}
              </SummaryChip>
            ) : null}
          </div>

          <div className="max-h-[26rem] overflow-y-auto border-y border-border/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-10 px-4 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">链接</th>
                  <th className="px-2 py-2 font-medium">标题（可编辑）</th>
                  <th className="w-10 px-3 py-2">
                    <span className="sr-only">移除</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {items.map((item, index) => (
                  <tr key={item.url} className="align-middle">
                    <td className="px-4 py-1.5 text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </td>
                    <td
                      className="max-w-56 truncate px-2 py-1.5 font-mono text-xs text-muted-foreground"
                      title={item.url}
                    >
                      {item.url}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={item.title}
                        onChange={(event) =>
                          updateTitle(index, event.target.value)
                        }
                        aria-label={`第 ${index + 1} 条的标题`}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeRow(index)}
                        aria-label={`移除第 ${index + 1} 条`}
                      >
                        <X className="size-3.5" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-5 py-3.5">
            <p className="text-xs text-muted-foreground">
              确认后立即入库；如需重新抓取，返回修改后再次生成预览。
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('edit')}
                disabled={importing}
              >
                <ArrowLeft className="size-4" aria-hidden />
                返回修改
              </Button>
              <Button onClick={handleConfirm} disabled={importing}>
                {importing ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    导入中…
                  </>
                ) : (
                  `确认导入 ${items.length} 条`
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
