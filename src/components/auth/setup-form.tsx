'use client';

import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  Fragment,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';

import { installAction, type ActionState } from '@/actions/auth';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordToggle } from '@/components/auth/password-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PASSWORD_MIN_LENGTH,
  USERNAME_MIN_LENGTH,
  validatePasswordFormat,
  validateUsernameFormat,
} from '@/lib/auth/constants';
import { DEFAULT_SETTINGS } from '@/types/nav';
import { cn } from '@/lib/utils';

const INITIAL: ActionState | null = null;

const STEPS = [
  { title: '管理员账号', hint: '必填' },
  { title: '站点信息', hint: '可选' },
] as const;

/** Server-side field names that belong to step 1. */
const STEP1_FIELDS = new Set(['username', 'password', 'confirmPassword']);

/** Client-side heuristic for the password strength meter. */
function passwordStrength(pw: string): { level: 1 | 2 | 3; label: string; color: string } {
  let score = 0;
  if (pw.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-zA-Z]/.test(pw) && /\d/.test(pw)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 1;

  if (score >= 3) return { level: 3, label: '强', color: 'bg-chart-3' };
  if (score === 2) return { level: 2, label: '中', color: 'bg-chart-4' };
  return { level: 1, label: '弱', color: 'bg-destructive' };
}

export function SetupForm({
  defaultSiteName,
  defaultTagline,
}: {
  defaultSiteName: string;
  defaultTagline: string;
}) {
  const [state, formAction, pending] = useActionState(installAction, INITIAL);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'forward' | 'back'>('forward');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [siteName, setSiteName] = useState(defaultSiteName);
  const [tagline, setTagline] = useState(defaultTagline);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // Consumes server results during render; a step-1 field error walks back to step 1.
  const [handledResult, setHandledResult] = useState<ActionState | null>(null);
  const [dismissedResult, setDismissedResult] = useState<ActionState | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  // Focuses the first field on mount.
  useEffect(() => {
    document.getElementById('username')?.focus();
  }, []);

  if (state && !state.ok && state !== handledResult) {
    setHandledResult(state);
    if (state.field && STEP1_FIELDS.has(state.field)) {
      setDir('back');
      setStep(0);
    }
  }

  const serverError =
    state && !state.ok && state !== dismissedResult ? state.message : null;

  /** Gate for leaving step 1; reads the live DOM and re-validates the fields. */
  function goNext() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const usernameValue = String(data.get('username') ?? '');
    const passwordValue = String(data.get('password') ?? '');
    const confirmValue = String(data.get('confirmPassword') ?? '');

    const usernameCheck = validateUsernameFormat(usernameValue);
    if (!usernameCheck.ok) {
      setUsernameError(usernameCheck.message);
      return;
    }
    setUsernameError(null);

    const passwordCheck = validatePasswordFormat(passwordValue);
    if (!passwordCheck.ok) {
      setPasswordError(passwordCheck.message);
      return;
    }
    setPasswordError(null);

    if (passwordValue !== confirmValue) {
      // Refuses to advance on a password mismatch.
      return;
    }

    // Clears the last failed submission's message.
    if (state && !state.ok) setDismissedResult(state);
    setDir('forward');
    setStep(1);
  }

  function goBack() {
    setDir('back');
    setStep(0);
  }

  const strength = passwordStrength(password);
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

  // Both panels stay mounted and toggle `hidden`; display toggling replays the animation.
  const panelAnim = cn(
    'space-y-5 motion-reduce:animate-none animate-in fade-in duration-300 [animation-timing-function:cubic-bezier(0.16,1,0.3,1)]',
    dir === 'forward' ? 'slide-in-from-right-3' : 'slide-in-from-left-3',
  );

  return (
    <AuthShell title="初始化 OrigamiNav">
      <form
        ref={formRef}
        action={formAction}
        className="space-y-5"
        noValidate
        onKeyDown={(event) => {
          // On step 1, Enter advances to the next step.
          if (
            event.key === 'Enter' &&
            step === 0 &&
            event.target instanceof HTMLInputElement
          ) {
            event.preventDefault();
            goNext();
          }
        }}
      >
        {/* ── Stepper ─────────────────────────────────────────────────────── */}
        <ol className="mb-1 flex items-start" aria-label="安装步骤，共 2 步">
          {STEPS.map((s, i) => (
            <Fragment key={s.title}>
              {i > 0 ? (
                <li
                  aria-hidden
                  className={cn(
                    'mt-4 h-px flex-1 transition-colors duration-300',
                    step >= i ? 'bg-primary' : 'bg-border',
                  )}
                />
              ) : null}
              <li className="flex flex-1 flex-col items-center gap-1.5">
                <button
                  type="button"
                  disabled={i >= step}
                  onClick={goBack}
                  aria-current={i === step ? 'step' : undefined}
                  aria-label={`第 ${i + 1} 步：${s.title}${i < step ? '，点击返回' : ''}`}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border text-xs font-semibold transition-all',
                    i < step &&
                      'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                    i === step &&
                      'border-primary bg-primary text-primary-foreground ring-4 ring-primary/15',
                    i > step && 'border-border bg-muted text-muted-foreground',
                  )}
                >
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </button>
                <span className="text-center leading-tight">
                  <span
                    className={cn(
                      'block text-xs font-medium',
                      i === step ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-[0.625rem] text-muted-foreground/70">
                    {s.hint}
                  </span>
                </span>
              </li>
            </Fragment>
          ))}
        </ol>

        {serverError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        ) : null}

        {/* ── Step 1: admin account ───────────────────────────────────────── */}
        <div hidden={step !== 0} className={panelAnim}>
          <div className="space-y-2">
            <Label htmlFor="username">管理员用户名</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              minLength={USERNAME_MIN_LENGTH}
              maxLength={32}
              placeholder="请输入用户名"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setUsernameError(null);
              }}
              aria-invalid={
                (Boolean(usernameError) || state?.field === 'username') || undefined
              }
              className={cn(usernameError && 'border-destructive')}
            />
            {usernameError ? (
              <p role="alert" className="text-xs text-destructive">
                {usernameError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                小写字母、数字和 . _ - ，至少 {USERNAME_MIN_LENGTH} 位。
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={128}
                className="pr-11"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setPasswordError(null);
                }}
                aria-invalid={
                  (Boolean(passwordError) || state?.field === 'password') || undefined
                }
              />
              <PasswordToggle
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </div>
            {passwordError ? (
              <p role="alert" className="text-xs text-destructive">
                {passwordError}
              </p>
            ) : password ? (
              <div className="flex items-center gap-2 pt-0.5" aria-live="polite">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-colors',
                        i < strength.level ? strength.color : 'bg-border',
                      )}
                    />
                  ))}
                </div>
                <span className="w-6 text-right text-xs text-muted-foreground">
                  {strength.label}
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                至少 {PASSWORD_MIN_LENGTH} 位，混合字母、数字和符号更安全。
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认密码</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
                maxLength={128}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-invalid={state?.field === 'confirmPassword' || mismatch || undefined}
                className="pr-11"
              />
              <PasswordToggle
                visible={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
              />
            </div>
            {/* Shows an error only on a mismatch. */}
            {mismatch ? (
              <p className="text-xs text-destructive">两次输入的密码不一致</p>
            ) : null}
          </div>
        </div>

        {/* ── Step 2: site identity ───────────────────────────────────────── */}
        <div hidden={step !== 1} className={panelAnim}>
          <div className="space-y-2">
            <Label htmlFor="siteName">站点名称</Label>
            <Input
              id="siteName"
              name="siteName"
              placeholder="OrigamiNav"
              maxLength={60}
              value={siteName}
              onChange={(event) => setSiteName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">副标题</Label>
            <Input
              id="tagline"
              name="tagline"
              placeholder="把散落的书签折进一张纸"
              maxLength={120}
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
            />
          </div>

          {/* Live preview of the public header. */}
          <div className="rounded-lg border border-dashed bg-muted/30 p-3" aria-hidden>
            <p className="text-[0.625rem] font-medium tracking-wide text-muted-foreground/70 uppercase">
              前台预览
            </p>
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <svg viewBox="0 0 24 24" className="size-5" fill="none">
                  <path
                    d="M12 3 3 12l9 3 9-3-9-9Z"
                    fill="currentColor"
                    fillOpacity="0.95"
                  />
                  <path
                    d="m3 12 9 9 9-9-9 3-9-3Z"
                    fill="currentColor"
                    fillOpacity="0.6"
                  />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-sm leading-tight font-semibold">
                  {siteName.trim() || defaultSiteName.trim() || DEFAULT_SETTINGS.siteName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {tagline.trim() || defaultTagline.trim() || DEFAULT_SETTINGS.tagline}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            可选项，留空使用默认值；稍后可在后台「站点设置」修改。
          </p>
        </div>

        {/* ── Footer actions ──────────────────────────────────────────────── */}
        {step === 0 ? (
          <Button type="button" size="lg" className="w-full" onClick={goNext}>
            下一步：站点信息
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="shrink-0"
              onClick={goBack}
              disabled={pending}
            >
              <ArrowLeft className="size-4" />
              上一步
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  正在初始化…
                </>
              ) : (
                '创建管理员并进入站点'
              )}
            </Button>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
