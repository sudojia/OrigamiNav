'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';

import { loginAction, type ActionState } from '@/actions/auth';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordToggle } from '@/components/auth/password-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const INITIAL: ActionState | null = null;

export function LoginForm({
  siteName,
  loggedOut,
  next,
}: {
  siteName: string;
  loggedOut: boolean;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    document.getElementById('username')?.focus();
  }, []);

  return (
    <AuthShell
      title={`登录 ${siteName}`}
      description="管理员登录后可编辑分类、书签和站点设置。"
      footer={
        <Link
          href="/"
          className="transition-colors hover:text-foreground hover:underline"
        >
          返回导航首页
        </Link>
      }
    >
      <form action={formAction} className="space-y-5" noValidate>
        {/* Same-origin path; the action re-validates it. */}
        <input type="hidden" name="next" value={next} />

        {loggedOut ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            已退出登录。
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="username">用户名</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            aria-invalid={state?.field === 'username' || undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="pr-11"
              aria-invalid={state?.field === 'password' || undefined}
            />
            <PasswordToggle
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </div>
        </div>

        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.message}
          </p>
        ) : null}

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? '正在登录…' : '登录'}
        </Button>
      </form>
    </AuthShell>
  );
}
