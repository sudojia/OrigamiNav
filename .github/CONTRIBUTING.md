# 贡献指南

感谢关注 OrigamiNav！无论是报告问题、完善文档还是提交代码，都非常欢迎。

## 提 Issue

- **Bug** 请使用 [Bug 模板](https://github.com/sudojia/OrigamiNav/issues/new?template=bug_report.yml)，附上复现步骤与环境信息（注意脱敏，勿泄露 `DATABASE_URL` 或密码）；
- **功能建议** 请使用[功能模板](https://github.com/sudojia/OrigamiNav/issues/new?template=feature_request.yml)，先说清楚「想解决什么问题」；
- **使用提问 / 交流** 请到 [Discussions](https://github.com/sudojia/OrigamiNav/discussions)；
- **安全漏洞** 请勿公开提 Issue，见 [SECURITY.md](./SECURITY.md)。

## 提 Pull Request

1. Fork 仓库，从 `master` 切出分支：

   ```bash
   git checkout -b feat/your-feature
   ```

2. 开发前先同步依赖：`npm install`；本地跑起来需要复制 `.env.example` 为 `.env` 并填入 `DATABASE_URL`；
3. 提交前自查：

   ```bash
   npm run check     # ESLint + TypeScript
   npm run build     # 需要能通过（CI 会在有库和无库两种情况下各构建一次）
   ```

4. 修改了 `src/db/schema.ts` 时，用 `npm run db:generate` 生成对应的数据库变更脚本一并提交，不要手写 SQL；
5. 提交 PR 时填写模板，说明改动动机；CI 全绿后等待 review。

## 代码约定

- 代码风格由 ESLint（eslint-config-next）约束，`npm run lint:fix` 可自动修复大部分问题；
- TypeScript 严格模式，尽量不使用 `any`；
- 环境变量与配置相关的改动，请同步更新 `.env.example` 和 README 的环境变量表；
- 面向用户的文案默认使用简体中文。

## 开源协议

提交即表示你同意以 [MIT License](./LICENSE) 授权你的贡献。
