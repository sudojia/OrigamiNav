'use client';

import { Pencil, Search, Tags, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { createTagAction, deleteTagAction, renameTagAction } from '@/actions/tag';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAdminDialogMode } from './admin-mode';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { SubmitButton, useActionFeedback } from './form-primitives';
import { PageHeader } from './page-header';

export type TagWithUsage = {
  id: string;
  name: string;
  slug: string;
  count: number;
};

/** Number of tag rows mounted per page. */
const TAGS_PAGE_SIZE = 50;

export function TagManager({ tags }: { tags: TagWithUsage[] }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<TagWithUsage | null>(null);
  const [deleting, setDeleting] = useState<TagWithUsage | null>(null);
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(TAGS_PAGE_SIZE);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tags;
    return tags.filter(
      (tag) =>
        tag.name.toLowerCase().includes(needle) ||
        tag.slug.toLowerCase().includes(needle),
    );
  }, [tags, query]);

  // Resets the visible count when the query changes.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setVisibleCount(TAGS_PAGE_SIZE);
  }

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  const refresh = () => startTransition(() => router.refresh());

  const handleDelete = async () => {
    if (!deleting) return;
    const result = await deleteTagAction(deleting.id);
    if (result.ok) {
      toast.success(result.message);
      setDeleting(null);
      refresh();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        Icon={Tags}
        title="标签管理"
        description="删除或重命名标签会同步更新受影响书签的搜索索引。"
      >
        <CreateTagForm onCreated={refresh} />
      </PageHeader>

      {tags.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/60"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称或 slug"
              aria-label="搜索标签"
              className="pl-8"
            />
          </div>
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {query.trim()
              ? `匹配 ${filtered.length} / ${tags.length}`
              : `共 ${tags.length} 个标签`}
          </p>
        </div>
      ) : null}

      {tags.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          还没有标签。可以在添加书签时直接输入新标签。
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          没有匹配「{query.trim()}」的标签。
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{tag.name}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {tag.count > 0 ? `${tag.count} 个书签` : '未使用'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/70">
                    /{tag.slug}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`重命名 ${tag.name}`}
                  onClick={() => setRenaming(tag)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`删除 ${tag.name}`}
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleting(tag)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          {remaining > 0 ? (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                onClick={() =>
                  setVisibleCount((count) => count + TAGS_PAGE_SIZE)
                }
              >
                显示更多（还有 {remaining} 个）
              </Button>
            </div>
          ) : null}
        </>
      )}

      {renaming ? (
        <RenameTagDialog tag={renaming} onClose={() => setRenaming(null)} />
      ) : null}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={<>删除标签「{deleting?.name}」？</>}
        description={
          <>
            {deleting?.count
              ? `${deleting.count} 个书签将失去该标签（书签本身不受影响），搜索索引会同步更新。`
              : '该标签当前未被任何书签使用。'}
            {' '}此操作不可撤销。
          </>
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}

function CreateTagForm({ onCreated }: { onCreated: () => void }) {
  const [state, formAction] = useActionState(createTagAction, null);
  const [name, setName] = useState('');

  useActionFeedback(state, () => {
    setName('');
    onCreated();
  });

  return (
    <form action={formAction} className="flex items-center gap-2">
      <Input
        id="tag-name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={30}
        placeholder="新标签名称"
        aria-label="新标签名称"
        className="w-40 sm:w-52"
        required
      />
      <SubmitButton pendingLabel="创建中…">创建</SubmitButton>
    </form>
  );
}

function RenameTagDialog({
  tag,
  onClose,
}: {
  tag: TagWithUsage;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(renameTagAction, null);
  const dialogMode = useAdminDialogMode();

  useActionFeedback(state, onClose);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn('sm:max-w-sm', dialogMode)}>
        <DialogHeader>
          <DialogTitle>重命名标签</DialogTitle>
          <DialogDescription>
            关联此标签的书签会保留关联，其搜索索引将自动更新。
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={tag.id} />
          <div className="space-y-1.5">
            <Label htmlFor="tag-rename">名称</Label>
            <Input
              id="tag-rename"
              name="name"
              defaultValue={tag.name}
              maxLength={30}
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <SubmitButton>保存</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
