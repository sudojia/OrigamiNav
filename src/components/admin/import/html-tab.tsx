'use client';

import {
  CircleCheck,
  CopyX,
  FileStack,
  FileUp,
  FolderInput,
  FolderTree,
  ListChecks,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  importMappedBookmarksAction,
} from '@/actions/import';
import type {
  FolderMapping,
  MappedImportItem,
} from '@/actions/import';
import { Button } from '@/components/ui/button';
import {
  parseNetscapeBookmarks,
} from '@/lib/bookmark-import';
import { cn } from '@/lib/utils';

import { FileDropzone } from './file-dropzone';
import { FolderMappingRow } from './folder-mapping-row';
import { TabCardHead } from '../panel-ui';
import { SummaryChip } from './summary-chip';
import type {
  ItemOverride,
  MappingState,
  WizardFolder,
  WizardItem,
} from './shared';

// ── 2. Netscape HTML: parse → review & map → import ─────────────────────────

const MAX_HTML_FILE_BYTES = 2 * 1024 * 1024;
const MAX_HTML_BOOKMARKS = 5_000;

const WIZARD_STEPS = ['选择文件', '确认映射', '完成'] as const;

function WizardSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol
      className="flex items-center gap-1.5 sm:gap-2"
      aria-label={`导入向导：第 ${current} 步，共 3 步`}
    >
      {WIZARD_STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <Fragment key={label}>
            {i > 0 ? (
              <li
                aria-hidden
                className={cn(
                  'h-0.5 w-4 rounded-full transition-colors sm:w-8',
                  step <= current ? 'bg-primary/60' : 'bg-border',
                )}
              />
            ) : null}
            <li className="flex shrink-0 items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-[0.6875rem] font-semibold transition-all',
                  done && 'bg-primary/15 text-primary ring-1 ring-primary/25',
                  active &&
                    'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/25',
                  !done &&
                    !active &&
                    'border border-border bg-muted/60 text-muted-foreground',
                )}
              >
                {done ? <CircleCheck className="size-3.5" /> : step}
              </span>
              <span
                className={cn(
                  'text-xs',
                  active
                    ? 'font-medium text-foreground'
                    : done
                      ? 'text-foreground/70'
                      : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

export function HtmlTab({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [folders, setFolders] = useState<WizardFolder[]>([]);
  const [mappings, setMappings] = useState<Record<string, MappingState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [totalParsed, setTotalParsed] = useState(0);
  const [dupCount, setDupCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    categories: number;
  } | null>(null);

  /** Parses the chosen file and moves to the mapping step. */
  async function parseFile(file: File) {
    setParseError(null);
    if (file.size > MAX_HTML_FILE_BYTES) {
      setParseError('文件超过 2MB 限制');
      return;
    }

    setParsing(true);
    try {
      const html = await file.text();
      const parsed = parseNetscapeBookmarks(html);
      if (parsed.length === 0) {
        setParseError('文件里没有解析到有效书签（需要 Netscape 书签格式）');
        return;
      }
      if (parsed.length > MAX_HTML_BOOKMARKS) {
        setParseError(`一次最多导入 ${MAX_HTML_BOOKMARKS} 条书签（当前 ${parsed.length} 条）`);
        return;
      }

      // Groups by folder and de-duplicates URLs.
      const seen = new Set<string>();
      let duplicates = 0;
      const byFolder = new Map<string, WizardItem[]>();
      for (const [index, row] of parsed.entries()) {
        const duplicate = seen.has(row.url);
        if (!duplicate) seen.add(row.url);
        else duplicates += 1;
        const item: WizardItem = {
          ...row,
          key: `i${index}`,
          selected: !duplicate,
          duplicate,
          override: null,
        };
        const list = byFolder.get(row.folder);
        if (list) list.push(item);
        else byFolder.set(row.folder, [item]);
      }

      const list = [...byFolder.entries()]
        .map(([key, items]) => ({
          key,
          name: key || '根目录书签',
          items,
        }))
        .sort((a, b) => b.items.length - a.items.length);

      // Defaults each folder to a new category; root to 导入书签.
      const defaultMappings: Record<string, MappingState> = {};
      for (const folder of list) {
        defaultMappings[folder.key] = {
          kind: 'new',
          name: folder.key || '导入书签',
        };
      }

      setFolders(list);
      setMappings(defaultMappings);
      setTotalParsed(parsed.length);
      setDupCount(duplicates);
      setExpanded(new Set());
      setStep(2);
    } catch {
      setParseError('文件读取或解析失败，请重试');
    } finally {
      setParsing(false);
    }
  }

  function toggleItem(folderKey: string, itemKey: string) {
    setFolders((prev) =>
      prev.map((folder) =>
        folder.key !== folderKey
          ? folder
          : {
              ...folder,
              items: folder.items.map((item) =>
                item.key === itemKey
                  ? { ...item, selected: !item.selected }
                  : item,
              ),
            },
      ),
    );
  }

  function toggleFolderAll(folderKey: string, selected: boolean) {
    setFolders((prev) =>
      prev.map((folder) =>
        folder.key !== folderKey
          ? folder
          : {
              ...folder,
              items: folder.items.map((item) => ({ ...item, selected })),
            },
      ),
    );
  }

  function setMapping(folderKey: string, mapping: MappingState) {
    setMappings((prev) => ({ ...prev, [folderKey]: mapping }));
  }

  function setItemOverride(
    folderKey: string,
    itemKey: string,
    override: ItemOverride | null,
  ) {
    setFolders((prev) =>
      prev.map((folder) =>
        folder.key !== folderKey
          ? folder
          : {
              ...folder,
              items: folder.items.map((item) =>
                item.key === itemKey ? { ...item, override } : item,
              ),
            },
      ),
    );
  }

  function toggleExpanded(folderKey: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderKey)) next.delete(folderKey);
      else next.add(folderKey);
      return next;
    });
  }

  const totalSelected = folders.reduce(
    (sum, folder) => sum + folder.items.filter((item) => item.selected).length,
    0,
  );

  /** Counts distinct import targets in the current selection. */
  const targetCount = (() => {
    const targets = new Set<string>();
    for (const folder of folders) {
      const mapping =
        mappings[folder.key] ?? { kind: 'new' as const, name: folder.key || '导入书签' };
      for (const item of folder.items) {
        if (!item.selected) continue;
        if (item.override) {
          targets.add(
            item.override.kind === 'existing'
              ? `id:${item.override.categoryId}`
              : `name:${item.override.name.trim()}`,
          );
        } else if (mapping.kind === 'existing') {
          targets.add(`id:${mapping.categoryId}`);
        } else {
          targets.add(`name:${mapping.name.trim()}`);
        }
      }
    }
    return targets.size;
  })();

  const mappingValid = folders.every((folder) => {
    // Skips folders with no bookmark following the mapping.
    if (!folder.items.some((item) => item.selected && !item.override)) {
      return true;
    }
    const mapping = mappings[folder.key];
    if (!mapping) return false;
    return mapping.kind !== 'custom' || mapping.name.trim().length > 0;
  });

  async function startImport() {
    const items: MappedImportItem[] = folders.flatMap((folder) =>
      folder.items
        .filter((item) => item.selected)
        .map((item) => ({
          folderKey: folder.key,
          title: item.title,
          url: item.url,
          description: item.description,
          iconUrl: item.iconUrl,
          createdAt: item.createdAt,
          tags: item.tags,
          categoryId: item.override?.kind === 'existing' ? item.override.categoryId : null,
          newCategoryName:
            item.override?.kind === 'new' ? item.override.name.trim() : null,
        })),
    );
    // Includes only folders still followed by selected bookmarks.
    const mappingList = folders
      .filter((folder) =>
        folder.items.some((item) => item.selected && !item.override))
      .map((folder) => {
        const mapping =
          mappings[folder.key] ?? { kind: 'new', name: folder.key || '导入书签' };
        const serverMapping: FolderMapping =
          mapping.kind === 'existing'
            ? { kind: 'existing', categoryId: mapping.categoryId }
            : { kind: 'new', name: mapping.name.trim() };
        return { folderKey: folder.key, mapping: serverMapping };
      });

    setImporting(true);
    try {
      const outcome = await importMappedBookmarksAction({
        items,
        mappings: mappingList,
      });
      if (outcome.ok) {
        setResult(outcome);
        setStep(3);
        router.refresh();
      } else {
        // Shows the error without resetting the review state.
        toast.error(outcome.message);
      }
    } catch {
      toast.error('导入请求失败，请重试');
    } finally {
      setImporting(false);
    }
  }

  function resetWizard() {
    if (fileRef.current) fileRef.current.value = '';
    setFileName('');
    setFolders([]);
    setMappings({});
    setExpanded(new Set());
    setTotalParsed(0);
    setDupCount(0);
    setResult(null);
    setParseError(null);
    setStep(1);
  }

  return (
    <div className="overflow-hidden rounded-card border bg-card shadow-card motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-2 duration-300">
      <TabCardHead
        Icon={FileUp}
        hue="bg-chart-2/10 text-chart-2"
        title="浏览器书签 HTML"
        description="Chrome / Edge / Firefox / Safari 导出的 Netscape 格式；文件在本地解析，确认后才上传。"
      >
        <WizardSteps current={step} />
      </TabCardHead>

      {step === 1 ? (
        <div className="space-y-4 px-5 py-5">
          <FileDropzone
            id="import-html"
            name="file"
            label="书签 HTML 文件"
            accept=".html,.htm,text/html"
            placeholder="点击选择文件，或将 .html 拖到这里"
            hints={['Netscape 格式', '≤ 2MB', '≤ 5000 条']}
            hint={
              parsing
                ? '正在解析…'
                : '解析在本地完成，确认映射后才会上传。'
            }
            fileRef={fileRef}
            fileName={fileName}
            setFileName={setFileName}
            dragging={dragging}
            setDragging={setDragging}
            onFileSelected={parseFile}
          />
          {parseError ? <ParseErrorAlert message={parseError} /> : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <SummaryChip Icon={FileStack}>
              共解析{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {totalParsed}
              </span>{' '}
              条书签
            </SummaryChip>
            <SummaryChip Icon={FolderTree}>
              <span className="font-semibold tabular-nums text-foreground">
                {folders.length}
              </span>{' '}
              个文件夹
            </SummaryChip>
            <SummaryChip Icon={ListChecks} tone="primary">
              已选{' '}
              <span className="font-semibold tabular-nums">{totalSelected}</span>{' '}
              条
            </SummaryChip>
            {dupCount > 0 ? (
              <SummaryChip Icon={CopyX} tone="warn">
                文件内重复 {dupCount} 条已默认排除
              </SummaryChip>
            ) : null}
          </div>

          <div className="space-y-2.5">
            {folders.map((folder) => (
              <FolderMappingRow
                key={folder.key || '__root__'}
                folder={folder}
                categories={categories}
                mapping={
                  mappings[folder.key] ?? { kind: 'new', name: folder.name }
                }
                expanded={expanded.has(folder.key)}
                onToggleItem={(itemKey) => toggleItem(folder.key, itemKey)}
                onToggleAll={(selected) => toggleFolderAll(folder.key, selected)}
                onMappingChange={(mapping) => setMapping(folder.key, mapping)}
                onToggleExpanded={() => toggleExpanded(folder.key)}
                onSetOverride={(itemKey, override) =>
                  setItemOverride(folder.key, itemKey, override)
                }
              />
            ))}
          </div>

          {parseError ? <ParseErrorAlert message={parseError} /> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep(1)}
              disabled={importing}
            >
              上一步
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                将导入{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {totalSelected}
                </span>{' '}
                条到{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {targetCount}
                </span>{' '}
                个分类
              </span>
              <Button
                type="button"
                size="sm"
                onClick={startImport}
                disabled={importing || totalSelected === 0 || !mappingValid}
              >
                {importing ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FolderInput className="size-4" aria-hidden />
                )}
                {importing ? '导入中…' : '开始导入'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="flex flex-col items-center px-6 py-10 text-center motion-reduce:animate-none animate-in fade-in zoom-in-95 duration-300">
          <span className="relative flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full ring-1 ring-primary/20"
            />
            <span
              aria-hidden
              className="absolute -inset-2 rounded-full ring-1 ring-primary/10"
            />
            <CircleCheck className="size-7" aria-hidden />
          </span>
          <h3 className="mt-4 font-display text-xl font-semibold">导入完成</h3>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            成功导入 {result.created} 条书签到 {result.categories} 个分类
            {result.skipped > 0 ? `，跳过已存在 ${result.skipped} 条` : ''}。
          </p>
          <div className="mt-6 grid w-full max-w-sm grid-cols-3 gap-2">
            <ResultTile label="新导入" value={result.created} />
            <ResultTile label="跳过" value={result.skipped} />
            <ResultTile label="分类" value={result.categories} />
          </div>
          <div className="mt-6 flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetWizard}>
              再导入一个文件
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/bookmarks">查看书签管理</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ParseErrorAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

function ResultTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
      <p className="font-display text-xl leading-none font-semibold tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[0.6875rem] text-muted-foreground">{label}</p>
    </div>
  );
}
