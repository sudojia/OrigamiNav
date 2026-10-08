'use client';

import { useActionState, useRef, useState } from 'react';
import { toast } from 'sonner';

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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { isValidHttpUrl } from '@/lib/utils';

import { SubmitButton, useActionFeedback } from './form-primitives';

/** Bookmark fields the form can edit. */
export type EditableBookmark = {
  id: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  hidden: boolean;
  tags: Array<{ id: string; name: string }>;
};

export type BookmarkCategoryOption = {
  id: string;
  name: string;
};

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
  const [hidden, setHidden] = useState(bookmark?.hidden ?? false);
  // Controlled so the AI fill can write into it.
  const [tagsInput, setTagsInput] = useState(
    bookmark?.tags.map((tag) => tag.name).join(', ') ?? '',
  );
  // Auto fill on URL blur: scrape only. AI tags are generated server-side
  // after the save (aiTags flag), so the dialog never waits on the model.
  const [fillPhase, setFillPhase] = useState<'scrape' | null>(null);
  const lastFilledUrlRef = useRef(bookmark?.url ?? '');
  const [aiTagOnSave, setAiTagOnSave] = useState(false);
  // User-typed title/description are never overwritten by the auto fill.
  const [titleEdited, setTitleEdited] = useState(false);
  const [descriptionEdited, setDescriptionEdited] = useState(false);

  useActionFeedback(state, onClose);

  /**
   * Fires on URL blur: skips invalid/duplicate URLs and never runs while a
   * fill is already in progress. Title/description are only filled when the
   * user has not typed their own.
   */
  async function autoFillFromUrl() {
    const target = url.trim();
    if (fillPhase || !target || !isValidHttpUrl(target)) return;
    if (target === lastFilledUrlRef.current) return;
    lastFilledUrlRef.current = target;

    setFillPhase('scrape');
    try {
      const meta = await fetchUrlMetaAction(target);
      if (!meta.ok) {
        toast.error(meta.message);
        return;
      }
      if (!titleEdited && meta.title) setTitle(meta.title);
      if (!descriptionEdited && meta.description) setDescription(meta.description);
      if (meta.iconUrl && !iconUrl) setIconUrl(meta.iconUrl);
      if (aiEnabled) setAiTagOnSave(true);
      toast.success('已抓取网页信息');
    } catch {
      toast.error('抓取失败，请手动填写');
    } finally {
      setFillPhase(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
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
            <Input
              id="bookmark-url"
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onBlur={() => void autoFillFromUrl()}
              maxLength={2048}
              required
              autoFocus={!bookmark}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {fillPhase === 'scrape'
                ? '正在抓取网页信息…'
                : aiEnabled
                  ? '离开链接输入框后自动抓取；保存后 AI 在后台补全标签。'
                  : '离开链接输入框后自动抓取标题、描述与图标。'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bookmark-title">标题</Label>
            <Input
              id="bookmark-title"
              name="title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleEdited(true);
              }}
              maxLength={100}
              required
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
              onChange={(event) => {
                setDescription(event.target.value);
                setDescriptionEdited(true);
              }}
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
              placeholder="如：前端, 工具"
            />
            <p className="text-xs text-muted-foreground">
              用英文逗号（,）分隔，兼容中文逗号（，）；不存在的标签会自动创建，最多 10 个。
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

          <DialogFooter className="flex items-center justify-between gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label
              title="开启后前台仅登录管理员可见，访客不可见"
              className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
            >
              <Switch
                checked={hidden}
                onCheckedChange={setHidden}
                aria-label="私有化"
              />
              私有化
            </label>
            <input type="hidden" name="hidden" value={hidden ? '1' : '0'} />
            <input type="hidden" name="aiTags" value={aiTagOnSave ? '1' : '0'} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <SubmitButton>{bookmark ? '保存' : '创建'}</SubmitButton>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
