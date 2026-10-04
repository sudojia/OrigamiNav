'use client';

import { Check, Circle, KeyRound } from 'lucide-react';
import { useActionState, useRef, useState } from 'react';

import { changePasswordAction } from '@/actions/auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/lib/auth/constants';
import { cn } from '@/lib/utils';

import { SubmitButton, useActionFeedback } from './form-primitives';
import { TabCardHead } from './panel-ui';

/** Password-change card for the settings security tab. */
export function PasswordSection() {
  const [state, formAction] = useActionState(changePasswordAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useActionFeedback(state, () => {
    formRef.current?.reset();
    setNewPassword('');
    setConfirmPassword('');
  });

  const requirements = [
    {
      label: `至少 ${PASSWORD_MIN_LENGTH} 位`,
      met: newPassword.length >= PASSWORD_MIN_LENGTH,
    },
    { label: '包含字母', met: /[a-zA-Z]/.test(newPassword) },
    { label: '包含数字', met: /\d/.test(newPassword) },
  ];

  return (
    <form
      ref={formRef}
      action={formAction}
      className="min-w-0 overflow-hidden rounded-card border bg-card shadow-card"
    >
      <TabCardHead
        Icon={KeyRound}
        hue="bg-chart-4/10 text-chart-4"
        title="修改密码"
        description="修改后当前登录保持有效，其他设备下次操作时需重新登录。"
      />

      <div className="grid gap-6 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password-current">当前密码</Label>
            <Input
              id="password-current"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className="h-10"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password-new">新密码</Label>
            <Input
              id="password-new"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-10"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password-confirm">确认新密码</Label>
            <Input
              id="password-confirm"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-10"
              required
            />
            {confirmPassword.length > 0 ? (
              <p
                className={cn(
                  'flex items-center gap-1 text-xs',
                  confirmPassword === newPassword
                    ? 'text-primary'
                    : 'text-destructive',
                )}
                role="status"
              >
                {confirmPassword === newPassword
                  ? '两次输入一致'
                  : '两次输入不一致'}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="h-fit rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="text-xs font-medium">密码要求</p>
          <ul className="mt-3 space-y-2.5">
            {requirements.map((req) => (
              <li
                key={req.label}
                className={cn(
                  'flex items-center gap-2 text-xs transition-colors',
                  req.met ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {req.met ? (
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <Circle
                    className="size-3.5 shrink-0 text-muted-foreground/40"
                    aria-hidden
                  />
                )}
                {req.label}
              </li>
            ))}
            <li className="flex items-center gap-2 text-xs text-muted-foreground/70">
              <span className="size-3.5 shrink-0" aria-hidden />
              最长 {PASSWORD_MAX_LENGTH} 位
            </li>
          </ul>
        </aside>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border/60 bg-muted/30 px-5 py-3.5">
        <SubmitButton>更新密码</SubmitButton>
      </div>
    </form>
  );
}
