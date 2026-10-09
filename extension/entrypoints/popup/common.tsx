import { Settings } from 'lucide-react';
import { browser } from 'wxt/browser';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/** Popup states shared by the save form and the bookmark manager. */

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
      {children}
    </div>
  );
}

/** Shown while no site URL and token are stored. */
export function ConnectNotice() {
  return (
    <Centered>
      <Settings className="size-8 text-primary/70" />
      <p className="text-sm font-medium">先连接到你的 OrigamiNav</p>
      <p className="max-w-[16rem] text-center text-xs leading-relaxed text-muted-foreground">
        在管理后台「设置 → 浏览器扩展」生成令牌，然后到扩展选项页填写站点地址与令牌。
      </p>
      <Button size="sm" onClick={() => void browser.runtime.openOptionsPage()}>
        打开选项页
      </Button>
    </Centered>
  );
}
