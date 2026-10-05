'use client';

import { useFormStatus } from 'react-dom';
import { useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';

import type { ActionState } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Shared admin form helpers. */

export function useActionFeedback(
  state: ActionState | null,
  onSuccess?: () => void,
) {
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      onSuccessRef.current?.();
    } else {
      toast.error(state.message);
    }
  }, [state]);
}

export function SubmitButton({
  children,
  className,
  pendingLabel = '保存中…',
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Labelled field block for the settings tabs. */
export function SettingsField({
  htmlFor,
  label,
  labelExtra,
  hint,
  hintClassName = 'text-xs text-muted-foreground',
  children,
}: {
  htmlFor?: string;
  label: string;
  /** Node rendered opposite the label. */
  labelExtra?: ReactNode;
  hint?: ReactNode;
  hintClassName?: string;
  children: ReactNode;
}) {
  const labelNode = <Label htmlFor={htmlFor}>{label}</Label>;
  return (
    <div className="space-y-1.5">
      {labelExtra ? (
        <div className="flex items-baseline justify-between gap-3">
          {labelNode}
          {labelExtra}
        </div>
      ) : (
        labelNode
      )}
      {children}
      {hint ? <p className={hintClassName}>{hint}</p> : null}
    </div>
  );
}

/** Controlled Select with an optional label and hint. */
export function SettingsSelect({
  id,
  label,
  hint,
  hintClassName,
  value,
  onValueChange,
  options,
  placeholder,
  triggerClassName,
}: {
  id?: string;
  label?: string;
  hint?: ReactNode;
  hintClassName?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: ReactNode }>;
  placeholder?: string;
  triggerClassName?: string;
}) {
  const control = (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className={cn('w-full', triggerClassName)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!label) return control;

  return (
    <SettingsField
      htmlFor={id}
      label={label}
      hint={hint}
      hintClassName={hintClassName}
    >
      {control}
    </SettingsField>
  );
}
