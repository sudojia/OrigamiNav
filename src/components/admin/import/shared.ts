import type { ParsedImportBookmark } from '@/lib/bookmark-import';

/** Per-bookmark target category override. */
export type ItemOverride =
  | { kind: 'existing'; categoryId: string }
  | { kind: 'new'; name: string };

export type WizardItem = ParsedImportBookmark & {
  key: string;
  selected: boolean;
  /** Duplicate URL; deselected by default. */
  duplicate: boolean;
  /** Target override; null follows the folder mapping. */
  override: ItemOverride | null;
};

export type WizardFolder = {
  /** Parser folder name; '' for root-level bookmarks. */
  key: string;
  name: string;
  items: WizardItem[];
};

export type MappingState =
  | { kind: 'new'; name: string }
  | { kind: 'existing'; categoryId: string }
  | { kind: 'custom'; name: string };
