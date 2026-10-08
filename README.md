<div align="center">

# OrigamiNav · 折纸导航

[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE) [![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org) [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org) [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com) [![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-2b2b2b)](https://orm.drizzle.team) [![Node](https://img.shields.io/badge/node-%3E%3D20.18-339933?logo=node.js&logoColor=white)](https://nodejs.org) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)

</div>

## 亮点

- **一条连接串**：缓存、会话密钥、上传的图标全部存在数据库里。除了 PostgreSQL 14+，不依赖任何外部服务。
- **拼音搜索**：全拼、首字母、域名都能搜到（服务端预计算搜索索引），配合标签筛选与 `Ctrl+K` 命令面板，即时过滤不发请求。
- **三套皮肤**：清爽蓝、暗色极客（纯深色）、温暖纸色（衬线标题）。首屏绘制前应用，无闪烁。
- **后台**：总览统计、书签 / 分类 / 标签增删改、拖拽排序；后台明暗模式与前台独立。
- **私有化**：隐藏的分类与书签仅管理员可见，公开页面与缓存里都不会出现。
- **导入导出**：浏览器书签 HTML（Netscape 格式，在浏览器里解析）、JSON 备份、批量 URL（可并发抓取标题）；批量写入走分块事务，大备份也能快速入库。一键导出完整 JSON。
- **书签图标源可配置**：智能多源回退、彩虹 API、xinac、favicon.im、自定义 `{domain}` 模板，或完全关闭只显示字母色块——设置页内置实时预览。
- **AI 标签**：接入 OpenAI / Anthropic 兼容接口，保存书签后 AI 会在后台自动根据书签内容补全标签。
- **首启自动建表**：空库直接跑，启动时自动应用 `drizzle/` 迁移，不需要任何手工操作。
- **不挑部署**：独立 Node 服务、容器、Serverless 都行，不绑定任何平台。

**深色：**

![深色](https://www.yotu.net/uploads/20261004/5275395755a30d16f7c298980c9e473b.png)

**浅色：**

![浅色](https://www.yotu.net/uploads/20261004/0d7fe3ec9a9b28028a3148ddead9998a.png)

## 快速开始

要求 Node.js 20.18+ 和 PostgreSQL 14+。

```bash
git clone https://github.com/sudojia/OrigamiNav.git
cd OrigamiNav
npm ci
cp .env.example .env    # 填入 DATABASE_URL
npm run build && npm run start
```

打开站点会跳到 `/setup` 创建管理员，然后进入 `/admin`。首次启动自动建表。

## 部署

标准 Next.js 应用：构建命令 `npm run build`，启动命令 `npm run start`，环境变量只配 `DATABASE_URL`。首次启动自动建表，不需要手动迁移。

通用要求：

- **运行时**：Node.js ≥ 20.18。平台若锁定旧版 Node 20.x（部分 Serverless 平台常见），低于 20.18 时依赖安装正常、运行时会报错。
- **数据库**：PostgreSQL 14+，连接串尾加 `?sslmode=require` 可启用加密连接。

常见平台：

| 平台 | 说明 |
|------|------|
| Vercel | 导入仓库自动识别 Next.js，配好 `DATABASE_URL` 即可 |
| Netlify / Railway / Render / Fly.io | 建 Node 服务：安装 `npm ci` → 构建 `npm run build` → 启动 `npm run start` |
| 腾讯云 EdgeOne Pages | Next.js 预设，运行时 Node.js 20.19 满足要求，配好 `DATABASE_URL` 即可 |

Cloudflare、Deno Deploy 这类非 Node 运行时的平台需要 OpenNext 适配器，配置较重，不作首选推荐。

VPS / 裸机自托管：

```bash
npm ci && npm run build && npm run start    # 默认监听 3000 端口
```

前面挂 Nginx / Caddy 反代即可。若反代会覆写 `X-Real-IP` 请求头，可开启 `TRUSTED_PROXY` 让登录限速按客户端 IP 生效（详见 [`.env.example`](./.env.example)）。

容器（基于 standalone 产物，`next.config.ts` 已开启 `output: 'standalone'`）：

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
EXPOSE 3000
CMD ["node", "server.js"]
```

## 环境变量

**只需要配置 `DATABASE_URL` 一个**，其余全部可以不管。

```bash
DATABASE_URL="postgresql://user:password@host:5432/postgres"
```

它是一条标准 PostgreSQL 连接串，服务器自建、Docker、任何托管平台都一样。完整说明见 [`.env.example`](./.env.example)。可选变量：`NEXT_PUBLIC_SITE_URL`、`ANALYTICS_SCRIPT_ORIGIN`、`TRUSTED_PROXY`、`DRIZZLE_LOG`。（通常不用设置）

## SEO 与收录

在后台「设置 → SEO」里集中配置，保存后即时生效（只有两个环境变量是构建期读取）：

- **站点地址**：canonical、`sitemap.xml`、结构化数据与主动推送都基于它，支持子路径部署；留空时回退 `NEXT_PUBLIC_SITE_URL`。
- **收录开关**：关闭后前台页面输出 `noindex`，`robots.txt` 全站禁止抓取。
- **搜索引擎验证**：Google、Bing、百度、搜狗、360、Yandex 的验证码，保存后自动输出对应的 meta 标签。
- **分类独立页**：`/c/<分类 slug>` 是该分类的完整列表页（不受首页展示数量限制），自带标题、canonical 与结构化数据，并写入 `sitemap.xml`；首页「查看全部」指向它。
- **主动推送**：一键把首页与全部分类页提交给 IndexNow（Bing、Yandex 等）与百度；IndexNow 密钥文件由本站托管在 `/<key>.txt`。
- **访问统计**：Google Analytics 4、百度统计，以及 Umami / Plausible 等自建统计（自建需在构建环境设置 `ANALYTICS_SCRIPT_ORIGIN` 才会被 CSP 放行）。

## 浏览器扩展

官方配套浏览器扩展（Chrome / Edge 等 Chromium 内核浏览器）：在任意网页点一下工具栏图标，自动识别标题、链接、描述与站点图标，可直接新建分类、设为私有，一键收藏。

**安装方式一：下载安装包（推荐，无需 Node 环境）**

1. 前往 [GitHub Releases](https://github.com/sudojia/OrigamiNav/releases) 下载 `origaminav-extension-*-chrome.zip` 并解压；
2. 打开 `chrome://extensions`，开启右上角「开发者模式」，点击「加载已解压的扩展程序」，选择解压出的目录；
3. 在管理后台「设置 → 浏览器扩展」生成访问令牌；
4. 打开扩展设置页，填入站点地址与令牌即可。

**安装方式二：从源码构建**

```bash
git clone https://github.com/sudojia/OrigamiNav.git
cd OrigamiNav/extension
npm install && npm run build
```

然后同样在 `chrome://extensions` 加载 `extension/.output/chrome-mv3` 目录。

详细说明见 [`extension/README.md`](./extension/README.md)。

## 技术栈

| 层 | 选型 |
|------|------|
| 框架 | Next.js 16（App Router / RSC / Server Actions）· React 19 · TypeScript 5 |
| 样式 | Tailwind CSS 4 · shadcn/ui · radix-ui · lucide-react |
| 数据 | PostgreSQL 14+ · Drizzle ORM 0.45（node-postgres 驱动） |
| 会话 | iron-session（加密 Cookie 会话，服务端不存会话状态） |
| 交互 | @dnd-kit（拖拽排序）· cmdk（命令面板）· next-themes（明暗切换）· sonner（Toast） |
| 服务端 | zod（参数校验）· undici（元数据抓取，固定 DNS 解析防 SSRF）· pinyin-pro（拼音搜索索引） |

## 开发

```bash
npm run dev      # 开发服务器
npm run check    # ESLint + TypeScript
npm run build    # 生产构建，无需数据库
```

改了 `src/db/schema.ts` 后运行 `npm run db:generate`，把结构变更写入 `drizzle/`。

## Star History

<a href="https://star-history.com/#sudojia/OrigamiNav&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=sudojia/OrigamiNav&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=sudojia/OrigamiNav&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=sudojia/OrigamiNav&type=Date" />
  </picture>
</a>

## 许可

[MIT](./LICENSE) © OrigamiNav contributors
