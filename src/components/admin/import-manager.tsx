'use client';

import { FileJson, FileUp, FolderTree, Import, Link2 } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BackupStatus } from '@/lib/backup-status';

import { ExportCard } from './import/export-card';
import { HtmlTab } from './import/html-tab';
import { JsonTab } from './import/json-tab';
import { TipsCard } from './import/tips-card';
import { UrlsTab } from './import/urls-tab';
import { PageHeader } from './page-header';
import { TileActiveCheck, TILE_TRIGGER } from './panel-ui';

/** Import/export page with three import tabs and a side export rail. */
export function ImportManager({
  categories,
  counts,
  backupStatus,
}: {
  categories: Array<{ id: string; name: string }>;
  counts: { categories: number; bookmarks: number };
  backupStatus: BackupStatus;
}) {
  return (
    <div className="space-y-5">
      <PageHeader
        Icon={Import}
        title="导入 / 导出"
        description="从浏览器书签文件、批量链接或 JSON 备份导入；导出完整备份用于迁移。"
      />

      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border/80 bg-card/60 px-6 py-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <FolderTree className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium">还没有分类</p>
            <p className="mt-1 text-xs text-muted-foreground">
              批量链接导入需要一个目标分类；HTML 与 JSON 导入会自动创建分类。
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/categories">去创建分类</Link>
          </Button>
        </div>
      ) : null}

      {/* Tab list rendered as method tiles. */}
      <Tabs defaultValue="urls">
        <TabsList className="grid h-auto w-full grid-cols-1 items-stretch gap-2.5 rounded-none bg-transparent p-0 sm:grid-cols-3 group-data-[orientation=horizontal]/tabs:h-auto">
          <TabsTrigger value="urls" className={TILE_TRIGGER}>
            <span className="flex w-full items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1">
                <Link2 className="size-4" aria-hidden />
              </span>
              <TileActiveCheck />
            </span>
            <span className="block text-sm font-medium text-foreground">
              批量链接
            </span>
            <span className="block text-xs leading-relaxed text-muted-foreground">
              粘贴 URL 清单，一次性批量导入
            </span>
          </TabsTrigger>
          <TabsTrigger value="html" className={TILE_TRIGGER}>
            <span className="flex w-full items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2">
                <FileUp className="size-4" aria-hidden />
              </span>
              <TileActiveCheck />
            </span>
            <span className="block text-sm font-medium text-foreground">
              书签 HTML
            </span>
            <span className="block text-xs leading-relaxed text-muted-foreground">
              浏览器导出的 Netscape 书签文件
            </span>
          </TabsTrigger>
          <TabsTrigger value="json" className={TILE_TRIGGER}>
            <span className="flex w-full items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-chart-5/10 text-chart-5">
                <FileJson className="size-4" aria-hidden />
              </span>
              <TileActiveCheck />
            </span>
            <span className="block text-sm font-medium text-foreground">
              JSON 备份
            </span>
            <span className="block text-xs leading-relaxed text-muted-foreground">
              从本应用导出的备份还原
            </span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_19.5rem] xl:items-start">
          <div className="min-w-0">
            <TabsContent value="urls">
              <UrlsTab categories={categories} />
            </TabsContent>
            <TabsContent value="html">
              <HtmlTab categories={categories} />
            </TabsContent>
            <TabsContent value="json">
              <JsonTab counts={counts} />
            </TabsContent>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <ExportCard counts={counts} status={backupStatus} />
            <TipsCard />
          </aside>
        </div>
      </Tabs>
    </div>
  );
}
