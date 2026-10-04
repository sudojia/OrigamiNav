'use client';

import { Sparkles, Wand2 } from 'lucide-react';
import { useActionState, useState } from 'react';
import { toast } from 'sonner';

import { suggestBookmarkAction } from '@/actions/ai';
import { createBookmarkAction, updateBookmarkAction } from '@/actions/bookmark';
import { fetchUrlMetaAction } from '@/actions/fetch-meta';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { useAdminDialogMode } from './admin-mode';
import { SubmitButton, useActionFeedback } from './form-primitives';

/** Bookmark fields the form can edit. */
export type EditableBookmark = {
  id: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  tags: Array<{ id: string; name: string }>;
};

export type BookmarkCategoryOption = {
  id: string;
  name: string;
};

/** Tag input limit; mirrors TAGS_MAX in actions/bookmark.ts. */
const TAG_INPUT_MAX = 10;

/** Appends AI tag suggestions to the current input, capped at the tag limit. */
function mergeTagInput(current: string, suggestions: string[]): string {
  const split = (value: string) =>
    value
      .split(/[,，、]/)
      .map((part) => part.trim())
      .filter(Boolean);
  const merged = split(current);
  const seen = new Set(merged);
  for (const suggestion of suggestions) {
    const name = suggestion.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      merged.push(name);
    }
  }
  return merged.slice(0, TAG_INPUT_MAX).join('，');
}

export function BookmarkFormDialog({
  categories,
  categoryId,
  bookmark,
  aiEnabled,
  onClose,
}: {
  categories: BookmarkCategoryOption[];
  /** Initial category id. */
  categoryId: string;
  /** Null creates a new bookmark. */
  bookmark: EditableBookmark | null;
  /** Whether the site has a complete AI config. */
  aiEnabled: boolean;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(
    bookmark ? updateBookmarkAction : createBookmarkAction,
    null,
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState(categoryId);
  const [url, setUrl] = useState(bookmark?.url ?? '');
  const [title, setTitle] = useState(bookmark?.title ?? '');
  const [description, setDescription] = useState(bookmark?.description ?? '');
  const [iconUrl, setIconUrl] = useState(bookmark?.iconUrl ?? '');
  // Controlled so the AI fill can write into it.
  const [tagsInput, setTagsInput] = useState(
    bookmark?.tags.map((tag) => tag.name).join('，') ?? '',
  );
  const [filling, setFilling] = useState(false);

  useActionFeedback(state, onClose);

  // Dialog mode class; undefined on the public page.
  const dialogMode = useAdminDialogMode();

  /** Fills title, description, icon and tags from the URL. */
  async function fillFromUrl() {
    const target = url.trim();
    if (!target) {
      toast.error('请先填写 URL');
      return;
    }
    setFilling(true);
    try {
      if (aiEnabled) {
        const result = await suggestBookmarkAction(target);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        if (result.title) setTitle(result.title);
        if (result.description) setDescription(result.description);
        if (result.iconUrl && !iconUrl) setIconUrl(result.iconUrl);
        if (result.tags.length > 0) {
          setTagsInput((current) => mergeTagInput(current, result.tags));
        }
        toast.success('AI 已填充，可继续修改');
      } else {
        const result = await fetchUrlMetaAction(target);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        if (result.title) setTitle(result.title);
        if (result.description) setDescription(result.description);
        if (result.iconUrl && !iconUrl) setIconUrl(result.iconUrl);
        toast.success('已抓取网页信息，可继续修改');
      }
    } catch {
      toast.error(
        aiEnabled ? 'AI 填充失败，请重试或手动填写' : '抓取失败，请手动填写',
      );
    } finally {
      setFilling(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn('max-h-[85dvh] overflow-y-auto sm:max-w-lg', dialogMode)}
      >
        <DialogHeader>
          <DialogTitle>{bookmark ? '编辑书签' : '添加书签'}</DialogTitle>
          <DialogDescription>
            保存后会立即重建搜索索引并刷新前台。
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {bookmark ? <input type="hidden" name="id" value={bookmark.id} /> : null}
          <input type="hidden" name="categoryId" value={selectedCategoryId} />

          <div className="space-y-1.5">
            <Label htmlFor="bookmark-url">URL</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="bookmark-url"
                name="url"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                maxLength={2048}
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={fillFromUrl}
                disabled={filling}
                className="shrink-0"
              >
                {aiEnabled ? (
                  <Sparkles className={cn('size-4', filling && 'animate-spin')} />
                ) : (
                  <Wand2 className={cn('size-4', filling && 'animate-spin')} />
                )}
                {filling
                  ? aiEnabled
                    ? 'AI 生成中…'
                    : '抓取中…'
                  : aiEnabled
                    ? 'AI 填充'
                    : '抓取信息'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {aiEnabled
                ? '粘贴链接后点「AI 填充」，自动生成标题、描述、标签与图标。'
                : '粘贴链接后点「抓取信息」，自动填充标题、描述与图标。'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bookmark-title">标题</Label>
            <Input
              id="bookmark-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
              required
              autoFocus={!bookmark}
            />
          </div>

          <div className="space-y-1.5">
            <Label>所属分类</Label>
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
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
            <p className="text-xs text-muted-foreground">
              更换分类后，书签会排到目标分类的末尾。
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bookmark-description">描述</Label>
            <Textarea
              id="bookmark-description"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bookmark-tags">标签</Label>
            <Input
              id="bookmark-tags"
              name="tagsInput"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="如：前端，工具"
            />
            <p className="text-xs text-muted-foreground">
              用逗号（，或,）分隔，不存在的标签会自动创建，最多 10 个。
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bookmark-icon-url">自定义图标地址（可选）</Label>
            <Input
              id="bookmark-icon-url"
              name="iconUrl"
              type="url"
              placeholder="https://example.com/favicon.ico"
              value={iconUrl}
              onChange={(event) => setIconUrl(event.target.value)}
              maxLength={2048}
            />
            <p className="text-xs text-muted-foreground">
              留空时前台会自动使用站点 favicon，失败则显示首字母色块。
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <SubmitButton>{bookmark ? '保存' : '创建'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
