<div align="center">

# OrigamiNav · 折纸导航

**自托管书签导航站。一条 PostgreSQL 连接串就能跑，不依赖 Redis、对象存储或外部鉴权。**

[![CI](https://github.com/sudojia/OrigamiNav/actions/workflows/ci.yml/badge.svg)](https://github.com/sudojia/OrigamiNav/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE) [![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org) [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org) [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com) [![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-2b2b2b)](https://orm.drizzle.team) [![Node](https://img.shields.io/badge/node-%3E%3D20.9-339933?logo=node.js&logoColor=white)](https://nodejs.org) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)

简体中文 | [English](./README.en.md)

</div>

## 亮点

- **一条连接串**：缓存、会话密钥、上传的图标全部存在数据库里。除了 PostgreSQL 14+，不依赖任何外部服务。
- **拼音搜索**：全拼和首字母都能命中，输入 `bd` 出「百度」、`zq` 出「重庆」。搜索索引在服务端预计算，客户端不加载拼音字典。
- **三套皮肤**：清爽蓝、暗色极客（纯深色）、温暖纸色（衬线标题）。首屏绘制前应用，无闪烁。
- **命令面板**：`Cmd / Ctrl + K` 跳分类、开书签；`/` 聚焦搜索框，`Esc` 清空筛选。
- **后台**：总览统计、书签 / 分类 / 标签增删改、拖拽排序；后台明暗模式与前台独立。
- **导入导出**：浏览器书签 HTML（Netscape 格式，在浏览器里解析）、JSON 备份、批量 URL；一键导出完整 JSON。
- **AI 填充**：一键抓取网页标题、描述与标签，可接 OpenAI / Anthropic 兼容接口。
- **首启自动建表**：空库直接跑，不需要任何手工操作。
- **不挑部署**：独立 Node 服务、容器、Serverless 都行，不绑定任何平台。

**深色：**

![深色](https://www.yotu.net/uploads/20261004/5275395755a30d16f7c298980c9e473b.png)

**浅色：**

![浅色](https://www.yotu.net/uploads/20261004/0d7fe3ec9a9b28028a3148ddead9998a.png)

## 快速开始

要求 Node.js 20.9+ 和 PostgreSQL 14+。

```bash
git clone https://github.com/sudojia/OrigamiNav.git
cd OrigamiNav
npm ci
cp .env.example .env    # 填入 DATABASE_URL
npm run build && npm run start
```

打开站点会跳到 `/setup` 创建管理员，然后进入 `/admin`。首次启动自动建表。

也可以用 Releases 里的独立包，解压即用：

```bash
tar -xzf origaminav-<版本>-standalone.tar.gz
cd origaminav-<版本>
cp .env.example .env    # 填入 DATABASE_URL
node server.js
```

## 部署

通用要求：Node.js 20.9+ 运行时（**不能用 Edge**，应用依赖 `pg` 和 `node:crypto`），以及一个可访问的 PostgreSQL 14+。

Vercel、Netlify、Railway、Render、Fly.io、腾讯云 EdgeOne Pages、Cloudflare、Deno Deploy 等都可以，步骤基本一致：连仓库 → 构建 `npm run build` → 启动 `npm run start` → 配 `DATABASE_URL` → 选 Node 运行时。

容器（基于 standalone 产物）：

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

它是一条标准 PostgreSQL 连接串，服务器自建、Docker、任何托管平台都一样。完整说明见 [`.env.example`](./.env.example)。可选变量（通常不用设置）：`NEXT_PUBLIC_SITE_URL`、`TRUSTED_PROXY`、`DRIZZLE_LOG`。

## 技术栈

Next.js 16（App Router / RSC / Server Actions）、React 19、Tailwind CSS 4、shadcn/ui、Drizzle ORM、iron-session。

## 开发

```bash
npm run dev      # 开发服务器
npm run check    # ESLint + TypeScript
npm run build    # 生产构建，无需数据库
```

改了 `src/db/schema.ts` 后运行 `npm run db:generate`，把结构变更写入 `drizzle/`。

## 参与

问题反馈与 PR 见 [CONTRIBUTING.md](./.github/CONTRIBUTING.md)，安全漏洞见 [SECURITY.md](./.github/SECURITY.md)，提问到 [Discussions](https://github.com/sudojia/OrigamiNav/discussions)。

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
