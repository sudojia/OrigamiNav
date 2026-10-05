import { FileScan, Gauge, Lightbulb, ShieldCheck } from 'lucide-react';

const TIPS = [
  {
    Icon: ShieldCheck,
    text: '相同链接会自动跳过，无需手动去重。',
  },
  {
    Icon: Gauge,
    text: '单个文件不超过 2MB；批量链接一次 500 条，书签 HTML 一次 5000 条。',
  },
  {
    Icon: FileScan,
    text: '书签 HTML 先本地解析预览：文件夹整体映射，单条书签也可在清单里改到其它分类。',
  },
];

export function TipsCard() {
  return (
    <section className="rounded-card border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Lightbulb className="size-3.5" aria-hidden />
        </span>
        导入须知
      </h2>
      <ul className="mt-3 space-y-2.5">
        {TIPS.map(({ Icon, text }) => (
          <li
            key={text}
            className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground"
          >
            <Icon
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden
            />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
