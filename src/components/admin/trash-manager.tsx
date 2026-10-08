'use client';

import {
  CalendarClock,
  FolderTree,
  Link2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  emptyTrashAction,
  purgeBookmarkAction,
  purgeCategoryAction,
  purgeExpiredTrashAction,
  restoreBookmarkAction,
  restoreCategoryAction,
} from '@/actions/trash';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/actions/auth';
import type {
  TrashCategory,
  TrashCategoryBookmark,
  TrashLooseBookmark,
} from '@/db/queries/trash';
import { colorSwatchClass } from '@/lib/category-color';
import { cn, formatDate, hostnameOf } from '@/lib/utils';

import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { PageHeader } from './page-header';

/** What a pending confirm dialog applies to. */
type PurgeTarget =
  | { kind: 'bookmark'; id: string; title: string }
  | { kind: 'category'; id: string; name: string; count: number }
  | { kind: 'expired' }
  | { kind: 'all' };

export function TrashManager({
  categories,
  bookmarks,
  retentionDays,
}: {
  categories: TrashCategory[];
  bookmarks: TrashLooseBookmark[];
  retentionDays: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [target, setTarget] = useState<PurgeTarget | null>(null);

  const total =
    categories.length +
    bookmarks.length +
    categories.reduce((sum, category) => sum + category.bookmarks.length, 0);

  const refresh = () => startTransition(() => router.refresh());

  const run = async (action: () => Promise<ActionState>) => {
    const result = await action();
    if (result.ok) {
      toast.success(result.message);
      refresh();
    } else {
      toast.error(result.message);
    }
  };

  const confirmPurge = async () => {
    if (!target) return;
    const current = target;
    setTarget(null);
    if (current.kind === 'bookmark') {
      await run(() => purgeBookmarkAction(current.id));
    } else if (current.kind === 'category') {
      await run(() => purgeCategoryAction(current.id));
    } else if (current.kind === 'expired') {
      await run(purgeExpiredTrashAction);
    } else {
      await run(emptyTrashAction);
    }
  };

  const dialogCopy = purgeDialogCopy(target);

  return (
    <div className="space-y-5">
      <PageHeader
        Icon={Trash2}
        title="回收站"
        description="删除的分类与书签会先移到这里。恢复即可回到前台，彻底清除则无法挽回。"
      />

      <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border bg-card px-5 py-4 shadow-card">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <CalendarClock className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            回收站中有 {total} 项
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {retentionDays > 0
              ? `保留 ${retentionDays} 天，过期的内容在打开本页时自动清理。`
              : '当前为永久保留，只有手动清理才会删除。'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {retentionDays > 0 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={total === 0}
              onClick={() => setTarget({ kind: 'expired' })}
            >
              <CalendarClock className="size-4" />
              清理过期
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={total === 0}
            className="text-destructive hover:text-destructive"
            onClick={() => setTarget({ kind: 'all' })}
          >
            <Trash2 className="size-4" />
            清空回收站
          </Button>
        </div>
      </section>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border/80 bg-card/60 px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Trash2 className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium">回收站是空的</p>
          <p className="text-xs text-muted-foreground">
            在分类或书签管理里删除的内容会先出现在这里。
          </p>
        </div>
      ) : null}

      {categories.map((category) => (
        <section
          key={category.id}
          className="overflow-hidden rounded-card border bg-card shadow-card"
        >
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 bg-muted/30 px-5 py-3">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                colorSwatchClass(category.color),
              )}
              aria-hidden
            />
            <FolderTree className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {category.name}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                分类删除于 {formatDate(category.deletedAt)} · 连带{' '}
                {category.bookmarks.length} 个书签
              </span>
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => run(() => restoreCategoryAction(category.id))}
              >
                <RotateCcw className="size-4" />
                恢复分类
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() =>
                  setTarget({
                    kind: 'category',
                    id: category.id,
                    name: category.name,
                    count: category.bookmarks.length,
                  })
                }
              >
                彻底清除
              </Button>
            </div>
          </header>

          {category.bookmarks.length === 0 ? (
            <p className="px-5 py-4 text-xs text-muted-foreground">
              这个分类下没有书签。
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {category.bookmarks.map((bookmark) => (
                <li key={bookmark.id} className="flex items-center gap-3 px-5 py-2.5">
                  <TrashedBookmarkInfo bookmark={bookmark} />
                  {bookmark.earlierThanCategory ? (
                    <Badge variant="secondary" className="shrink-0 font-normal">
                      更早单独删除
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {bookmarks.length > 0 ? (
        <section className="overflow-hidden rounded-card border bg-card shadow-card">
          <header className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-5 py-3">
            <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-medium">
              单独删除的书签
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {bookmarks.length} 个
            </span>
          </header>
          <ul className="divide-y divide-border/50">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className="flex items-center gap-3 px-5 py-2.5">
                <TrashedBookmarkInfo bookmark={bookmark} />
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {bookmark.categoryName}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => run(() => restoreBookmarkAction(bookmark.id))}
                  >
                    <RotateCcw className="size-4" />
                    恢复
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`彻底清除 ${bookmark.title}`}
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      setTarget({
                        kind: 'bookmark',
                        id: bookmark.id,
                        title: bookmark.title,
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConfirmDeleteDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={dialogCopy.title}
        description={dialogCopy.description}
        confirmLabel="彻底删除"
        onConfirm={confirmPurge}
      />
    </div>
  );
}

/** Title and host of one trashed bookmark; the actions differ per section. */
function TrashedBookmarkInfo({
  bookmark,
}: {
  bookmark: TrashCategoryBookmark | TrashLooseBookmark;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm">{bookmark.title}</span>
      <span className="mt-0.5 block truncate font-mono text-[0.6875rem] text-muted-foreground">
        {hostnameOf(bookmark.url)} · 删除于 {formatDate(bookmark.deletedAt)}
      </span>
    </span>
  );
}

function purgeDialogCopy(target: PurgeTarget | null): {
  title: string;
  description: string;
} {
  switch (target?.kind) {
    case 'bookmark':
      return {
        title: `彻底删除「${target.title}」？`,
        description: '删除后无法恢复。',
      };
    case 'category':
      return {
        title: `彻底删除分类「${target.name}」？`,
        description: `该分类及其中的 ${target.count} 个书签会被永久删除，删除后无法恢复。`,
      };
    case 'expired':
      return {
        title: '清理过期内容？',
        description: '超出保留天数、一直在回收站里的内容会被永久删除。',
      };
    case 'all':
      return {
        title: '清空回收站？',
        description: '回收站里的分类与书签会被全部永久删除，无法恢复。',
      };
    default:
      return { title: '', description: '' };
  }
}
