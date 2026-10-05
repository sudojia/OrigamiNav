'use client';

import {
  ChevronDown,
  ChevronsUpDown,
  FolderInput,
  FolderTree,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Favicon } from '@/components/nav/favicon';
import { cn, hostnameOf } from '@/lib/utils';

import type { ItemOverride, MappingState, WizardFolder } from './shared';

export function FolderMappingRow({
  folder,
  categories,
  mapping,
  expanded,
  onToggleItem,
  onToggleAll,
  onMappingChange,
  onToggleExpanded,
  onSetOverride,
}: {
  folder: WizardFolder;
  categories: Array<{ id: string; name: string }>;
  mapping: MappingState;
  expanded: boolean;
  onToggleItem: (itemKey: string) => void;
  onToggleAll: (selected: boolean) => void;
  onMappingChange: (mapping: MappingState) => void;
  onToggleExpanded: () => void;
  onSetOverride: (itemKey: string, override: ItemOverride | null) => void;
}) {
  const selectedCount = folder.items.filter((item) => item.selected).length;
  const allSelected = selectedCount === folder.items.length;
  const noneSelected = selectedCount === 0;
  const selectedRatio =
    folder.items.length > 0 ? selectedCount / folder.items.length : 0;

  const selectValue =
    mapping.kind === 'existing'
      ? `existing:${mapping.categoryId}`
      : mapping.kind === 'custom'
        ? 'custom'
        : 'new';

  // Display name of the folder's current target.
  const folderTargetLabel =
    mapping.kind === 'existing'
      ? (categories.find((c) => c.id === mapping.categoryId)?.name ?? '现有分类')
      : mapping.name.trim() || folder.name;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-card transition-all',
        noneSelected
          ? 'border-border/50 opacity-60'
          : 'border-border/70',
        expanded && 'shadow-card',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-2.5 pb-2">
        <Checkbox
          checked={allSelected ? true : noneSelected ? false : 'indeterminate'}
          onCheckedChange={(checked) => onToggleAll(checked === true)}
          aria-label={`选择「${folder.name}」的全部书签`}
          disabled={folder.items.length === 0}
        />
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary/80">
          <FolderTree aria-hidden className="size-4" />
        </span>
        <span
          className="min-w-0 max-w-52 truncate text-sm font-medium"
          title={folder.name}
        >
          {folder.name}
        </span>
        <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">
          {selectedCount}/{folder.items.length} 条
        </span>

        <div className="ml-auto w-full sm:w-60">
          <Select
            value={selectValue}
            onValueChange={(value) => {
              if (value === 'new') {
                onMappingChange({ kind: 'new', name: folder.key || '导入书签' });
              } else if (value === 'custom') {
                onMappingChange({
                  kind: 'custom',
                  name: mapping.kind === 'custom' ? mapping.name : folder.key || '导入书签',
                });
              } else {
                onMappingChange({ kind: 'existing', categoryId: value.slice('existing:'.length) });
              }
            }}
          >
            <SelectTrigger
              className="h-8 rounded-md bg-muted/40 text-xs"
              aria-label={`「${folder.name}」映射到`}
            >
              <FolderInput
                className="size-3.5 shrink-0 text-primary/70"
                aria-hidden
              />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Label shows the name a new mapping will use. */}
              <SelectItem value="new">
                新建分类「
                {mapping.kind === 'existing' ? folder.name : mapping.name}
                」
              </SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={`existing:${category.id}`}>
                  {category.name}
                </SelectItem>
              ))}
              <SelectItem value="custom">自定义新分类…</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Selection ratio bar. */}
      <div className="px-3 pb-2.5">
        <div
          aria-hidden
          className="h-0.5 overflow-hidden rounded-full bg-muted/70"
        >
          <div
            className="h-full rounded-full bg-primary/50 transition-all duration-300"
            style={{ width: `${selectedRatio * 100}%` }}
          />
        </div>
      </div>

      {mapping.kind === 'custom' ? (
        <div className="px-3 pb-3">
          <Input
            value={mapping.name}
            onChange={(event) => onMappingChange({ kind: 'custom', name: event.target.value })}
            placeholder="新分类名称"
            maxLength={40}
            aria-label="新分类名称"
            className="h-8 max-w-xs text-xs"
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 border-t border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
        {expanded ? '收起书签列表' : `查看 ${folder.items.length} 条书签`}
      </button>

      {expanded ? (
        <ul className="max-h-80 divide-y divide-border/40 overflow-y-auto border-t border-border/50 [scrollbar-width:thin]">
          {folder.items.map((item) => {
            const override = item.override;
            const overrideName = override
              ? override.kind === 'existing'
                ? (categories.find((c) => c.id === override.categoryId)?.name ??
                  '已移除的分类')
                : override.name
              : null;
            return (
              <li
                key={item.key}
                className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-accent/30"
              >
                <Checkbox
                  checked={item.selected}
                  onCheckedChange={() => onToggleItem(item.key)}
                  aria-label={`导入「${item.title}」`}
                  className="size-3.5"
                />
                <Favicon
                  hostname={hostnameOf(item.url)}
                  title={item.title}
                  iconUrl={item.iconUrl}
                  className="size-4 rounded-[3px]"
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-xs',
                    !item.selected && 'text-muted-foreground/60',
                  )}
                  title={item.title}
                >
                  {item.title}
                </span>
                {item.duplicate ? (
                  <span className="hidden shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[0.625rem] text-destructive/80 md:inline">
                    重复
                  </span>
                ) : null}
                <span className="hidden max-w-36 shrink-0 truncate rounded bg-muted/60 px-1.5 py-0.5 text-[0.625rem] text-muted-foreground/70 lg:block">
                  {hostnameOf(item.url)}
                </span>
                <ItemTargetMenu
                  categories={categories}
                  folderTargetLabel={folderTargetLabel}
                  overrideName={overrideName}
                  disabled={!item.selected}
                  onFollow={() => onSetOverride(item.key, null)}
                  onPick={(categoryId) =>
                    onSetOverride(item.key, { kind: 'existing', categoryId })
                  }
                  onNew={(name) => onSetOverride(item.key, { kind: 'new', name })}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Per-bookmark target category picker. */
function ItemTargetMenu({
  categories,
  folderTargetLabel,
  overrideName,
  disabled,
  onFollow,
  onPick,
  onNew,
}: {
  categories: Array<{ id: string; name: string }>;
  folderTargetLabel: string;
  overrideName: string | null;
  disabled: boolean;
  onFollow: () => void;
  onPick: (categoryId: string) => void;
  onNew: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');

  function closeAndReset() {
    setOpen(false);
    setCreating(false);
    setDraft('');
  }

  function submitDraft() {
    const name = draft.trim();
    if (!name) return;
    onNew(name);
    closeAndReset();
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) closeAndReset();
      }}
    >
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="更改目标分类"
          title="更改目标分类"
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
            overrideName
              ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
              : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          <FolderInput className="size-3 shrink-0" aria-hidden />
          <span className="max-w-28 truncate">{overrideName ?? '跟随文件夹'}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
        {creating ? (
          <div
            className="p-1"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitDraft();
              }
            }}
          >
            <p className="px-1 pb-1.5 text-xs font-normal text-muted-foreground">
              新分类名称（重名将并入现有分类）
            </p>
            <Input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="如：阅读与学习"
              maxLength={40}
              aria-label="新分类名称"
              className="h-8 text-xs"
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setDraft('');
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                size="xs"
                onClick={submitDraft}
                disabled={!draft.trim()}
              >
                创建并移入
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              移动到
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={onFollow}>
              跟随文件夹（{folderTargetLabel}）
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {categories.map((category) => (
              <DropdownMenuItem
                key={category.id}
                onSelect={() => onPick(category.id)}
              >
                {category.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                // Keeps the menu open and swaps to the inline name form.
                event.preventDefault();
                setCreating(true);
              }}
            >
              ＋ 新建分类…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
