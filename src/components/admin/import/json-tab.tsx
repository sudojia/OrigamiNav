'use client';

import { Check, FileJson, FileText, Sparkles, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useRef, useState } from 'react';

import { importJsonAction } from '@/actions/import';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { FileDropzone } from './file-dropzone';
import { SubmitButton, useActionFeedback } from '../form-primitives';
import { TabCardHead } from '../panel-ui';

// ── 3. JSON backup restore ───────────────────────────────────────────────────

export function JsonTab({
  counts,
}: {
  counts: { categories: number; bookmarks: number };
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(importJsonAction, null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useActionFeedback(state, () => router.refresh());

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-card border bg-card shadow-card motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <TabCardHead
        Icon={FileJson}
        hue="bg-chart-5/10 text-chart-5"
        title="从 JSON 备份恢复"
        description="仅接受本应用导出的 JSON 格式。"
      />

      <div className="space-y-5 px-5 py-5">
        <FileDropzone
          id="import-json"
          name="file"
          label="备份文件"
          accept=".json,application/json"
          placeholder="点击选择 .json 文件，或拖到这里"
          hints={['本应用导出的 JSON', '≤ 2MB']}
          fileRef={fileRef}
          fileName={fileName}
          setFileName={setFileName}
          dragging={dragging}
          setDragging={setDragging}
        />

        <div className="space-y-2">
          <Label>导入方式</Label>
          <input type="hidden" name="mode" value={mode} />
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeCard
              active={mode === 'merge'}
              onClick={() => setMode('merge')}
              title="合并"
              description="保留现有数据，按分类名合并"
              Icon={Sparkles}
            />
            <ModeCard
              active={mode === 'replace'}
              onClick={() => setMode('replace')}
              title="替换"
              description="清空现有内容后导入"
              Icon={TriangleAlert}
              danger
            />
          </div>
        </div>

        {mode === 'replace' ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs leading-relaxed text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              替换模式会先删除现有的 {counts.categories} 个分类和{' '}
              {counts.bookmarks} 条书签（含标签关联），再写入备份内容。
              管理员账号与站点设置不受影响。此操作不可撤销，建议先在右侧导出一份当前备份。
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-muted/30 px-5 py-3.5">
        {fileName ? (
          <span className="mr-auto inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{fileName}</span>
          </span>
        ) : null}
        <SubmitButton pendingLabel="导入中…">开始导入</SubmitButton>
      </div>
    </form>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  description,
  Icon,
  danger,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
  Icon: typeof Sparkles;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border p-3.5 text-left transition-all',
        active
          ? danger
            ? 'border-destructive/60 bg-destructive/5 ring-1 ring-destructive/30'
            : 'border-primary bg-primary/5 ring-1 ring-primary/30'
          : 'border-border hover:border-primary/40 hover:bg-accent/30',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
          active
            ? danger
              ? 'bg-destructive/15 text-destructive'
              : 'bg-primary/15 text-primary'
            : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'ml-auto mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          active
            ? danger
              ? 'border-destructive bg-destructive text-destructive-foreground'
              : 'border-primary bg-primary text-primary-foreground'
            : 'border-border',
        )}
      >
        {active ? <Check className="size-2.5" /> : null}
      </span>
    </button>
  );
}
