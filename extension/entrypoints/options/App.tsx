import {
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
  Puzzle,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ApiError,
  fetchContext,
  type ExtContext,
} from '@/utils/api';
import {
  isConfigured,
  loadConfig,
  serverUrlItem,
  tokenItem,
} from '@/utils/config';
import { cn } from '@/utils/cn';

type TestStatus =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; context: ExtContext }
  | { state: 'fail'; message: string };

export function App() {
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [test, setTest] = useState<TestStatus>({ state: 'idle' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadConfig().then((config) => {
      setServerUrl(config.serverUrl);
      setToken(config.token);
    });
  }, []);

  function normalizeUrl(raw: string): string {
    return raw.trim().replace(/\/+$/, '');
  }

  const configured = isConfigured({
    serverUrl: normalizeUrl(serverUrl),
    token: token.trim(),
  });

  async function handleTest() {
    if (test.state === 'testing') return;
    setTest({ state: 'testing' });
    try {
      const context = await fetchContext(
        { serverUrl: normalizeUrl(serverUrl), token: token.trim() },
        serverUrl,
      );
      setTest({ state: 'ok', context });
    } catch (error) {
      setTest({
        state: 'fail',
        message:
          error instanceof ApiError ? error.failure.message : '连接失败，请重试',
      });
    }
  }

  async function handleSave() {
    await serverUrlItem.setValue(normalizeUrl(serverUrl));
    await tokenItem.setValue(token.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md space-y-5">
        <header className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
            <Puzzle className="size-5 text-primary" />
          </span>
          <div>
            <h1 className="text-base font-semibold">OrigamiNav</h1>
            <p className="text-xs text-muted-foreground">
              连接到你的 OrigamiNav 站点，即可在任意网页一键收藏。
            </p>
          </div>
        </header>

        <div className="space-y-4 rounded-card border bg-card p-5 shadow-card">
          <div className="space-y-1.5">
            <Label htmlFor="opt-server">站点地址</Label>
            <Input
              id="opt-server"
              type="url"
              inputMode="url"
              placeholder="https://nav.example.com"
              value={serverUrl}
              onChange={(event) => {
                setServerUrl(event.target.value);
                setTest({ state: 'idle' });
              }}
            />
            <p className="text-xs text-muted-foreground">
              例如 <code className="font-mono">https://nav.example.com</code>
              ，无需以斜杠结尾。
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="opt-token">访问令牌</Label>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setRevealed((value) => !value)}
              >
                {revealed ? (
                  <EyeOff className="size-3.5" />
                ) : (
                  <Eye className="size-3.5" />
                )}
                {revealed ? '隐藏' : '显示'}
              </button>
            </div>
            <Input
              id="opt-token"
              type={revealed ? 'text' : 'password'}
              placeholder="在管理后台「设置 → 浏览器扩展」生成"
              value={token}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              onChange={(event) => {
                setToken(event.target.value);
                setTest({ state: 'idle' });
              }}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={
                test.state === 'testing' || !normalizeUrl(serverUrl) || !token.trim()
              }
              onClick={() => void handleTest()}
            >
              {test.state === 'testing' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              测试连接
            </Button>
            <Button
              type="button"
              disabled={!configured}
              onClick={() => void handleSave()}
            >
              保存设置
            </Button>
            {saved ? (
              <span className="animate-fade-up flex items-center gap-1 text-xs text-chart-3">
                <CheckCircle2 className="size-3.5" />
                已保存
              </span>
            ) : null}
          </div>

          <Feedback test={test} />
        </div>

        <ol className="space-y-1.5 rounded-card border bg-card/60 p-4 text-xs leading-relaxed text-muted-foreground">
          {[
            '打开 OrigamiNav 管理后台的「设置 → 浏览器扩展」。',
            '生成访问令牌并复制到上方输入框。',
            '在任意网页点击工具栏的扩展图标即可收藏。',
          ].map((step, index) => (
            <li key={step} className="flex items-start gap-2">
              <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.625rem] font-medium text-primary">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Feedback({ test }: { test: TestStatus }) {
  if (test.state === 'idle') return null;
  if (test.state === 'testing') {
    return (
      <Hint tone="muted">正在连接…</Hint>
    );
  }
  if (test.state === 'ok') {
    return (
      <Hint tone="ok">
        连接成功：「{test.context.siteName}」，共 {test.context.categories.length}{' '}
        个分类。
      </Hint>
    );
  }
  return <Hint tone="fail">{test.message}</Hint>;
}

function Hint({
  tone,
  children,
}: {
  tone: 'ok' | 'fail' | 'muted';
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        'flex animate-fade-up items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed',
        tone === 'ok' &&
          'border-chart-3/40 bg-chart-3/10 text-chart-3',
        tone === 'fail' &&
          'border-destructive/30 bg-destructive/10 text-destructive',
        tone === 'muted' && 'border-border bg-muted/50 text-muted-foreground',
      )}
    >
      {tone === 'ok' ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
      ) : tone === 'fail' ? (
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
      )}
      {children}
    </p>
  );
}
