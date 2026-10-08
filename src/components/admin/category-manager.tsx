'use client';

import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
} from '@/actions/category';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import type { CategoryWithCount } from '@/db/queries/categories';
import type { CategoryDeleteMode } from '@/types/nav';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { SortableList } from './dnd-list';
import { SubmitButton, useActionFeedback } from './form-primitives';
import { ColorPicker, IconPicker, IconPreviewSquare } from './pickers';
import { PageHeader } from './page-header';

export function CategoryManager({
  categories,
  deleteMode,
}: {
  categories: CategoryWithCount[];
  deleteMode: CategoryDeleteMode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CategoryWithCount | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CategoryWithCount | null>(null);
  const [, startTransition] = useTransition();
  // Disables the confirm when the category still has bookmarks.
  const deleteBlocked =
    deleteMode === 'protected' && (deleting?.bookmarkCount ?? 0) > 0;

  const refresh = () => startTransition(() => router.refresh());

  const handleReorder = async (orderedIds: string[]) => {
    const result = await reorderCategoriesAction(orderedIds);
    if (result.ok) refresh();
    return result;
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const result = await deleteCategoryAction(deleting.id);
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
        Icon={FolderTree}
        title="分类管理"
        description={
          deleteMode === 'cascade'
            ? '拖动手柄调整前台显示顺序。删除分类会把其中的书签一起移入回收站。'
            : '拖动手柄调整前台显示顺序。分类下存在书签时不可删除。'
        }
      >
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          新建分类
        </Button>
      </PageHeader>

      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          还没有分类。创建第一个分类后即可添加书签。
        </div>
      ) : (
        <SortableList
          items={categories}
          onReorder={handleReorder}
          className="space-y-2"
          renderItem={(category, _index, handle) => {
            return (
              <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
                {handle}
                <IconPreviewSquare
                  icon={category.icon ?? ''}
                  color={category.color ?? ''}
                  className="size-8"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {category.name}
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {category.bookmarkCount} 个书签
                    </Badge>
                    {category.hidden ? (
                      <Badge variant="outline" className="shrink-0">
                        私有
                      </Badge>
                    ) : null}
                  </div>
                  {category.description ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {category.description}
                    </p>
                  ) : null}
                </div>
                <span className="hidden font-mono text-xs text-muted-foreground/70 md:inline">
                  /{category.slug}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`编辑 ${category.name}`}
                  onClick={() => setEditing(category)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`删除 ${category.name}`}
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleting(category)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          }}
        />
      )}

      {editing ? (
        <CategoryFormDialog
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={<>删除分类「{deleting?.name}」？</>}
        description={
          deleteBlocked
            ? `该分类下还有 ${deleting?.bookmarkCount ?? 0} 个书签。已开启「存在书签不可删除」，请先移出或删除这些书签。`
            : `该分类及其中的 ${deleting?.bookmarkCount ?? 0} 个书签会一起移入回收站，可在保留期内恢复。`
        }
        confirmLabel="移入回收站"
        confirmDisabled={deleteBlocked}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function CategoryFormDialog({
  category,
  onClose,
}: {
  category: CategoryWithCount | null;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(
    category ? updateCategoryAction : createCategoryAction,
    null,
  );
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [color, setColor] = useState(category?.color ?? '');
  const [hidden, setHidden] = useState(category?.hidden ?? false);

  useActionFeedback(state, onClose);

  const editing = category !== null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* Pinned header: identity preview + title. */}
        <DialogHeader className="gap-3 border-b p-5 text-left sm:text-left">
          <div className="flex items-center gap-3">
            <IconPreviewSquare
              icon={icon}
              color={color}
              className="size-11 rounded-lg"
              hint={editing ? category.name : '新分类'}
            />
            <div className="min-w-0">
              <DialogTitle className="text-base">
                {editing ? `编辑「${category.name}」` : '新建分类'}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed">
                保存后展示在前台侧边栏。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="id" value={category?.id ?? ''} />
          <input type="hidden" name="icon" value={icon} />
          <input type="hidden" name="color" value={color} />
          <input type="hidden" name="hidden" value={hidden ? '1' : '0'} />

          {/* Scrollable body. */}
          <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto p-5 [scrollbar-width:thin]">
            <div className="space-y-1.5">
              <Label htmlFor="category-name">名称</Label>
              <Input
                id="category-name"
                name="name"
                defaultValue={category?.name ?? ''}
                maxLength={40}
                placeholder="例如：AI 工具"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category-description">描述</Label>
              <Textarea
                id="category-description"
                name="description"
                defaultValue={category?.description ?? ''}
                maxLength={200}
                rows={2}
                placeholder="一句话说明这个分类收录什么（可选）"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label className="shrink-0">图标</Label>
              <IconPicker value={icon} onChange={setIcon} />
            </div>

            <div className="flex items-center gap-3">
              <Label className="shrink-0">颜色</Label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            <div className="mt-auto flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5 pr-3">
                <Label htmlFor="category-hidden">私有化</Label>
                <p className="text-xs text-muted-foreground">
                  开启后整个分类连同其书签对访客不可见，仅登录管理员可见。
                </p>
              </div>
              <Switch
                id="category-hidden"
                checked={hidden}
                onCheckedChange={setHidden}
              />
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/30 p-4 sm:px-5">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <SubmitButton>{editing ? '保存' : '创建'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
