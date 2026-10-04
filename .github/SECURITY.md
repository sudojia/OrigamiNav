# 安全策略

## 报告漏洞

如果你发现了安全漏洞，请**不要**在公开 Issue / Discussion 中披露，而是私下报告：

1. 使用 [GitHub 的私密安全报告](https://github.com/sudojia/OrigamiNav/security/advisories/new)（推荐），或
2. 通过仓库主页的个人主页联系方式联系维护者。

请尽可能包含：

- 漏洞类型与影响范围
- 复现步骤或概念验证（PoC）
- 受影响的版本 / commit

## 响应时间

本项目为业余维护的开源项目，一般会在 **72 小时内**确认收到，具体修复时间视严重程度而定。确认修复后会发布新版本并致谢报告者（除非你希望匿名）。

## 安全设计参考

OrigamiNav 的安全默认值包括：iron-session 加密会话、管理员登录限速、严格 CSP 与安全响应头、元数据抓取的 SSRF 内网防护、AI 接口密钥独立存储（`secrets` 表）等。相关实现见 `src/lib/` 与 `next.config.ts`。
