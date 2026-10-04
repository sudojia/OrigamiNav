import type { SkinId } from '@/types/nav';

/** Skin metadata for the admin settings UI; tokens live in globals.css under `html[data-skin]`. */
export const SKINS: ReadonlyArray<{
  id: SkinId;
  name: string;
  description: string;
  /** Picker swatches: light surface + accent. */
  swatch: [string, string];
}> = [
  {
    id: 'blue',
    name: '清爽蓝',
    description: '冷灰底配克制蓝，默认皮肤',
    swatch: ['#f7f9fc', '#3b6fe0'],
  },
  {
    id: 'geek',
    name: '暗色极客',
    description: '钛灰碳底配皇家祖母绿，前台仅深色',
    swatch: ['#21272f', '#10b981'],
  },
  {
    id: 'paper',
    name: '温暖纸色',
    description: '米色纸张感，衬线标题',
    swatch: ['#f8f4ea', '#c2683a'],
  },
];
