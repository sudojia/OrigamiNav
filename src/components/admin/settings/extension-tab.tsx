'use client';

import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Plug,
  Puzzle,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  generateExtTokenAction,
  revokeExtTokenAction,
} from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { FieldSection } from './field-section';

/** Settings → extension tab: token management and setup guide. */
export function ExtensionTab({
  active,
  initialToken,
}: {
  active: boolean;
  initialToken: string | null;
}) {
  const [token, setToken] = useState(initialToken);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'generate' | 'revoke' | null>(
    null,
  );
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  function armConfirm(kind: 'generate' | 'revoke') {
    setConfirming(kind);
    confirmTimer.current = setTimeout(() => setConfirming(null), 4000);
  }

  async function runAction(kind: 'generate' | 'revoke') {
    setBusy(true);
    setConfirming(null);
    try {
      const result =
        kind === 'generate'
          ? await generateExtTokenAction()
          : await revokeExtTokenAction();
      if (result.ok) {
        setToken(result.token ?? null);
        setRevealed(kind === 'generate');
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  }

  const displayed = token
    ? revealed
      ? token
      : `${token.slice(0, 8)}${'•'.repeat(18)}`
    : '尚未生成';

  return (
    <div hidden={!active} role="tabpanel" aria-label="浏览器扩展">
      <div className="space-y-6 px-5 py-5">
        <FieldSection
          Icon={Puzzle}
          title="访问令牌"
          description="浏览器扩展通过它调用本站的收藏接口；512 位强度、origaminav_ 前缀，可随时查看、复制与轮换。"
        >
          <div className="flex items-center gap-2">
            <code
              className={cn(
                'min-w-0 flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs',
                token ? 'text-foreground' : 'text-muted-foreground',
              )}
              title={token ?? undefined}
            >
              {displayed}
            </code>
            {token ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={revealed ? '隐藏令牌' : '显示令牌'}
                  onClick={() => setRevealed((value) => !value)}
                >
                  {revealed ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="复制令牌"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-4 text-chart-3" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                </Button>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {confirming === 'generate' ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => runAction('generate')}
                >
                  确认重新生成
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                >
                  取消
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => (token ? armConfirm('generate') : runAction('generate'))}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                {token ? '重新生成' : '生成令牌'}
              </Button>
            )}
            {token
              ? confirming === 'revoke' ? (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => runAction('revoke')}
                    >
                      确认吊销
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirming(null)}
                    >
                      取消
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => armConfirm('revoke')}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    吊销
                  </Button>
                )
              : null}
          </div>

          <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-amber-600 dark:text-amber-500">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            令牌等同于书签写入权限，请勿外泄；重新生成或吊销后，需要在扩展的选项页更新令牌。
          </p>
        </FieldSection>

        <FieldSection
          divided
          Icon={Plug}
          title="接入步骤"
          description="三步把浏览器扩展连到本站。"
        >
          <ol className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
            {[
              '在上方生成并复制访问令牌。',
              '安装 OrigamiNav 浏览器扩展，在扩展的设置页填写本站地址并粘贴令牌。',
              '在任意网页点击扩展图标，确认分类后即可一键收藏。',
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.625rem] font-medium text-primary">
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <a
            href="https://github.com/sudojia/OrigamiNav/releases"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            前往 GitHub Releases 下载扩展安装包
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </FieldSection>
      </div>
    </div>
  );
}

/** Side-rail summary of the extension status. */
export function ExtensionRail({ token }: { token: string | null }) {
  const configured = Boolean(token);
  return (
    <section className="rounded-card border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Puzzle className="size-3.5" aria-hidden />
        </span>
        扩展状态
      </h2>
      <dl className="mt-3 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-xs text-muted-foreground">接口令牌</dt>
          <dd
            className={cn(
              'text-xs font-medium',
              configured ? 'text-chart-3' : 'text-muted-foreground',
            )}
          >
            {configured ? '已配置' : '未生成'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-xs text-muted-foreground">接口地址</dt>
          <dd className="min-w-0 truncate text-right font-mono text-xs font-medium">
            /api/ext/*
          </dd>
        </div>
      </dl>
      <p
        className={cn(
          'mt-3 rounded-md px-2.5 py-1.5 text-[0.6875rem] leading-relaxed',
          configured
            ? 'bg-chart-3/10 text-chart-3'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {configured
          ? '令牌已就绪，把站点地址与令牌填入扩展即可使用。'
          : '生成令牌后即可接入浏览器扩展。'}
      </p>
    </section>
  );
}
