'use client';

import { Check, LayoutGrid, Palette as PaletteIcon } from 'lucide-react';

import { SKINS } from '@/lib/theme-skins';
import { cn } from '@/lib/utils';
import type { SkinId } from '@/types/nav';

import { SettingsSelect } from '../form-primitives';
import { FieldSection } from './field-section';

const COLUMN_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

export interface AppearanceTabProps {
  active: boolean;
  defaultTheme: SkinId;
  cardColumns: string;
  onThemeChange: (value: SkinId) => void;
  onCardColumnsChange: (value: string) => void;
}

export function AppearanceTab({
  active,
  defaultTheme,
  cardColumns,
  onThemeChange,
  onCardColumnsChange,
}: AppearanceTabProps) {
  return (
    <div hidden={!active} role="tabpanel" aria-label="外观">
      <div className="space-y-6 px-5 py-5">
        <FieldSection
          Icon={PaletteIcon}
          title="主题皮肤"
          description="全站外观（配色、圆角、字体），对所有访客生效；前台仅提供深色/浅色切换。"
        >
          <div
            role="radiogroup"
            aria-label="主题皮肤"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {SKINS.map((skin) => {
              const isActive = defaultTheme === skin.id;
              return (
                <button
                  key={skin.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => onThemeChange(skin.id)}
                  className={cn(
                    'group overflow-hidden rounded-lg border text-left transition-all',
                    isActive
                      ? 'border-primary/50 bg-card shadow-card ring-1 ring-primary/30'
                      : 'border-border/70 bg-card/70 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-sm',
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-16 w-full flex-col justify-center gap-1.5 overflow-hidden border-b border-border/40 p-3"
                    style={{ backgroundColor: skin.swatch[0] }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-4 flex-1 rounded-sm opacity-70"
                        style={{ backgroundColor: skin.swatch[1] }}
                      />
                      <span
                        className="h-4 w-8 rounded-sm opacity-35"
                        style={{ backgroundColor: skin.swatch[1] }}
                      />
                    </span>
                    <span
                      className="h-2 w-3/4 rounded-sm opacity-20"
                      style={{ backgroundColor: skin.swatch[1] }}
                    />
                  </span>
                  <span className="block p-2.5">
                    <span className="flex items-center justify-between gap-1 text-xs font-medium">
                      {skin.name}
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded-full',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-border',
                        )}
                      >
                        {isActive ? <Check className="size-2.5" /> : null}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted-foreground">
                      {skin.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </FieldSection>

        <FieldSection
          divided
          Icon={LayoutGrid}
          title="书签布局"
          description="控制前台书签卡片的每行显示数量。屏幕较窄时会自动降列。"
        >
          <SettingsSelect
            value={cardColumns}
            onValueChange={onCardColumnsChange}
            options={COLUMN_OPTIONS.map((n) => ({
              value: String(n),
              label: `每行 ${n} 列`,
            }))}
            triggerClassName="w-full max-w-xs"
          />
        </FieldSection>
      </div>
    </div>
  );
}

/** Live mini-grid preview of the column count. */
export function LayoutRail({ columns }: { columns: number }) {
  const clamped = Math.max(1, Math.min(8, columns));
  return (
    <section className="rounded-card border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <LayoutGrid className="size-3.5" aria-hidden />
        </span>
        书签布局
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        前台每行显示{' '}
        <span className="font-semibold tabular-nums text-foreground">
          {clamped}
        </span>{' '}
        列书签卡片；屏幕较窄时自动降列。
      </p>
      <div
        aria-hidden
        className="mt-3 grid w-full gap-1 rounded-md border border-border/60 bg-background p-2"
        style={{ gridTemplateColumns: `repeat(${clamped}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: clamped * 2 }).map((_, i) => (
          <span
            key={i}
            className="h-3 rounded-sm bg-primary/25"
            style={{ opacity: i < clamped ? 0.85 : 0.35 }}
          />
        ))}
      </div>
    </section>
  );
}
