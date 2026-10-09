'use client';

import { FolderTree, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  aiCategoryDescriptionAction,
  aiFillCategoryDescriptionsAction,
} from '@/actions/ai';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  aiEnabled,
}: {
  categories: CategoryWithCount[];
  deleteMode: CategoryDeleteMode;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CategoryWithCount | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CategoryWithCount | null>(null);
  const [filling, setFilling] = useState(false);
  // Category whose description is being generated right now.
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Both paths share one provider queue, so they must not run at the same time.
  const aiBusy = filling || generatingId !== null;
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

  const handleFillDescriptions = async () => {
    setFilling(true);
    const toastId = toast.loading('正在根据各分类下的书签生成描述…');
    try {
      const result = await aiFillCategoryDescriptionsAction();
      if (!result.ok) {
        toast.error(result.message, { id: toastId });
        return;
      }
      const suffix =
        result.remaining > 0
          ? `，还有 ${result.remaining} 个待生成，可再次点击`
          : '';
      toast.success(`${result.message}${suffix}`, { id: toastId });
      refresh();
    } catch (error) {
      console.error('[origaminav] ai category descriptions failed', error);
      toast.error('生成失败，请检查网络后重试', { id: toastId });
    } finally {
      setFilling(false);
    }
  };

  const handleGenerateDescription = async (category: CategoryWithCount) => {
    setGeneratingId(category.id);
    const toastId = toast.loading(`正在生成「${category.name}」的描述…`);
    try {
      const result = await aiCategoryDescriptionAction(category.id);
      if (!result.ok) {
        toast.error(result.message, { id: toastId });
        return;
      }
      toast.success(result.message, { id: toastId });
      refresh();
    } catch (error) {
      console.error('[origaminav] ai category description failed', error);
      toast.error('生成失败，请检查网络后重试', { id: toastId });
    } finally {
      setGeneratingId(null);
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
        {aiEnabled ? (
          <Button
            variant="outline"
            onClick={handleFillDescriptions}
            disabled={aiBusy}
          >
            <Sparkles className="size-4" />
            {filling ? '生成中…' : 'AI 补全描述'}
          </Button>
        ) : null}
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
                {aiEnabled ? (
                  <RowAction
                    label={`AI 生成 ${category.name} 的描述`}
                    hint="AI 生成描述"
                    disabled={aiBusy}
                    onClick={() => handleGenerateDescription(category)}
                  >
                    {generatingId === category.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                  </RowAction>
                ) : null}
                <RowAction
                  label={`编辑 ${category.name}`}
                  hint="编辑分类"
                  onClick={() => setEditing(category)}
                >
                  <Pencil className="size-4" />
                </RowAction>
                <RowAction
                  label={`删除 ${category.name}`}
                  hint="移入回收站"
                  destructive
                  onClick={() => setDeleting(category)}
                >
                  <Trash2 className="size-4" />
                </RowAction>
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

/** Icon-only row action: a hover hint for sighted users, `label` for screen readers. */
function RowAction({
  label,
  hint,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={
            destructive ? 'text-destructive hover:text-destructive' : undefined
          }
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
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
                rows={3}
                placeholder="一句话说明这个分类收录什么（可选）"
              />
              <p className="text-xs text-muted-foreground">
                显示在分类页顶部，并作为该页的搜索摘要；留空则使用通用文案。
              </p>
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
