'use client';

import { Eye, EyeOff } from 'lucide-react';

/** Show/hide toggle for password fields. */
export function PasswordToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      aria-label={visible ? '隐藏密码' : '显示密码'}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
