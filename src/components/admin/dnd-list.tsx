'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

export type ReorderResult = { ok: boolean; message?: string };

/** Returns true once React has hydrated. */
function subscribeToNothing(): () => void {
  return () => {};
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/** Generic drag-and-drop sortable list backed by dnd-kit. */
export function SortableList<T extends { id: string }>({
  items,
  renderItem,
  onReorder,
  className,
  itemClassName,
  handleClassName,
  strategy = 'vertical',
}: {
  items: T[];
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  onReorder?: (orderedIds: string[]) => Promise<ReorderResult | void>;
  className?: string;
  itemClassName?: string;
  handleClassName?: string;
  strategy?: 'vertical' | 'grid';
}) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    items.map((item) => item.id),
  );

  // Resets local order when the server data changes.
  const serverIds = useMemo(() => items.map((item) => item.id), [items]);
  const [lastServerIds, setLastServerIds] = useState(serverIds);
  if (lastServerIds !== serverIds) {
    setLastServerIds(serverIds);
    setOrderedIds(serverIds);
  }

  const sensors = useSensors(
    // Pointer drag activation distance.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const hydrated = useHydrated();

  const byId = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  // Pre-hydration render: plain list without drag handles.
  if (!hydrated) {
    return (
      <ul className={className}>
        {items.map((item, index) => (
          <li key={item.id} className={itemClassName}>
            {renderItem(item, index, null)}
          </li>
        ))}
      </ul>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const previous = orderedIds;
    const from = previous.indexOf(String(active.id));
    const to = previous.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    const next = arrayMove(previous, from, to);
    setOrderedIds(next);

    onReorder?.(next).then((result) => {
      if (result && result.ok === false) {
        setOrderedIds(previous);
        if (result.message) toast.error(result.message);
      }
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={orderedIds}
        strategy={
          strategy === 'grid' ? rectSortingStrategy : verticalListSortingStrategy
        }
      >
        <ul className={className}>
          {orderedIds.map((id, index) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <SortableItem
                key={id}
                id={id}
                className={itemClassName}
                handleClassName={handleClassName}
              >
                {(handle) => renderItem(item, index, handle)}
              </SortableItem>
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  className,
  handleClassName,
  children,
}: {
  id: string;
  className?: string;
  handleClassName?: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // Drag handle element built by the hook's owner. Memoized because dnd-kit
  // memoizes attributes/listeners and returns a stable ref callback: without
  // this the element is new on every parent render, which would defeat the
  // memoized rows that receive it. If those identities ever stop being stable,
  // this simply degrades to the previous behaviour.
  const handle = useMemo(
    () => (
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={cn(
          'shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing',
          handleClassName,
        )}
        aria-label="拖拽调整顺序"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
    ),
    [attributes, listeners, setActivatorNodeRef, handleClassName],
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        isDragging && 'relative z-10 rounded-lg opacity-90 shadow-lg ring-1 ring-primary/30',
        className,
      )}
    >
      {children(handle)}
    </li>
  );
}
