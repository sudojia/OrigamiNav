<div align="center">

# OrigamiNav

**A self-hosted bookmark start page. One PostgreSQL connection string is all it takes — no Redis, no object storage, no external auth.**

[![CI](https://github.com/sudojia/OrigamiNav/actions/workflows/ci.yml/badge.svg)](https://github.com/sudojia/OrigamiNav/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE) [![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org) [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org) [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com) [![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-2b2b2b)](https://orm.drizzle.team) [![Node](https://img.shields.io/badge/node-%3E%3D20.9-339933?logo=node.js&logoColor=white)](https://nodejs.org) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)

[简体中文](./README.md) | English

</div>

## Highlights

- **One connection string**: cache, session keys and uploaded icons all live in the database. Beyond PostgreSQL 14+, no external service is required.
- **Pinyin search**: full pinyin and initials both match — type `bd` for 百度, `zq` for 重庆. The search index is precomputed on the server, so the client loads no pinyin dictionary.
- **Three skins**: Blue, Geek (pure dark) and Paper (serif headings). Applied before first paint, with no flash.
- **Command palette**: `Cmd / Ctrl + K` to jump to a category or open a bookmark; `/` focuses the search box, `Esc` clears the filters.
- **Admin panel**: dashboard stats, CRUD for bookmarks / categories / tags, drag-and-drop ordering; the admin light/dark mode is independent of the public site.
- **Import / export**: browser bookmark HTML (Netscape format, parsed in the browser), JSON backups, bulk URLs; one-click full JSON export.
- **AI filling**: one-click fetch of page title, description and tags, with OpenAI / Anthropic-compatible endpoints.
- **Tables created automatically on first boot**: point it at an empty database and it just works.
- **Runs anywhere**: standalone Node service, container or serverless — not tied to any platform.

**Dark:**

![Dark](https://www.yotu.net/uploads/20261004/5275395755a30d16f7c298980c9e473b.png)

**Light:**

![Light](https://www.yotu.net/uploads/20261004/0d7fe3ec9a9b28028a3148ddead9998a.png)

## Quick start

Requires Node.js 20.9+ and PostgreSQL 14+.

```bash
git clone https://github.com/sudojia/OrigamiNav.git
cd OrigamiNav
npm ci
cp .env.example .env    # fill in DATABASE_URL
npm run build && npm run start
```

Opening the site redirects to `/setup` to create an admin, then you land in `/admin`. Tables are created automatically on first boot.

You can also use the standalone bundle from Releases, ready to run after extracting:

```bash
tar -xzf origaminav-<version>-standalone.tar.gz
cd origaminav-<version>
cp .env.example .env    # fill in DATABASE_URL
node server.js
```

## Deployment

General requirements: a Node.js 20.9+ runtime (**Edge is not supported** — the app depends on `pg` and `node:crypto`), and a reachable PostgreSQL 14+.

Vercel, Netlify, Railway, Render, Fly.io, Tencent Cloud EdgeOne Pages, Cloudflare, Deno Deploy and others all work; the steps are essentially the same: connect the repository → build `npm run build` → start `npm run start` → configure `DATABASE_URL` → pick the Node runtime.

Container (based on the standalone output):

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

## Environment variables

**`DATABASE_URL` is the only one you need.** Everything else can be ignored.

```bash
DATABASE_URL="postgresql://user:password@host:5432/postgres"
```

It is a standard PostgreSQL connection string: self-hosted, Docker or any managed platform all work the same. See [`.env.example`](./.env.example) for details. Optional, usually unnecessary: `NEXT_PUBLIC_SITE_URL`, `TRUSTED_PROXY`, `DRIZZLE_LOG`.

## Tech stack

Next.js 16 (App Router / RSC / Server Actions), React 19, Tailwind CSS 4, shadcn/ui, Drizzle ORM, iron-session.

## Development

```bash
npm run dev      # dev server
npm run check    # ESLint + TypeScript
npm run build    # production build, no database needed
```

After changing `src/db/schema.ts`, run `npm run db:generate` to write the change into `drizzle/`.

## Contributing

Issues and PRs: [CONTRIBUTING.md](./.github/CONTRIBUTING.md); security vulnerabilities: [SECURITY.md](./.github/SECURITY.md); questions: [Discussions](https://github.com/sudojia/OrigamiNav/discussions).

## Star History

<a href="https://star-history.com/#sudojia/OrigamiNav&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=sudojia/OrigamiNav&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=sudojia/OrigamiNav&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=sudojia/OrigamiNav&type=Date" />
  </picture>
</a>

## License

[MIT](./LICENSE) © OrigamiNav contributors
