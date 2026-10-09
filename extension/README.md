# OrigamiNav 浏览器扩展

OrigamiNav 的配套浏览器扩展：在任意网页点一下工具栏图标，弹窗自动识别当前页面的**标题、链接、描述、站点图标**，选好分类后一键收藏到你的 OrigamiNav 站点；同一个弹窗里也能**搜索已收藏的书签、改标签、删除**，不必回后台。界面与主站同源（React 19 + Tailwind CSS 4 + shadcn 风格组件），自动跟随系统深浅色。

基于 [WXT](https://wxt.dev)（Manifest V3）构建，目标浏览器为 Chrome / Edge 等 Chromium 内核浏览器（Firefox 可用 `build:firefox` 产出，未做持续测试）。

## 功能

- **自动识别**：读取活动标签页的标题、URL、favicon，并通过 `activeTab` 权限读取页面 `meta description` / `og:description`；
- **分类选择**：拉取站点分类列表，默认选中「上次使用的分类」，保存后自动记忆；
- **新建分类**：分类下拉内置「新建分类…」，直接在弹窗里输入名称即可创建并选中，重名自动复用已有分类，无需先去后台建好；
- **设为私有**：一键把书签标记为私有，不出现在公开导航页，仅登录管理员可见；
- **重复提醒**：URL 已收藏时提示所在分类，可选择「仍然添加」；
- **书签管理**：弹窗右上角的列表按钮进入「已收藏的书签」，按标题、网址、描述或标签搜索（服务端检索，与站内搜索同一套规则），就地改标题、换分类、改标签（不存在的标签自动创建）或删除；删除进站点回收站，可在后台恢复；
- **AI 标签**：若站点已配置 AI，创建的书签会在后台自动生成标签（无需扩展做任何事）；
- **安全**：所有请求通过 `Authorization: Bearer <令牌>` 鉴权，令牌在管理后台生成、可随时吊销或轮换。

## 使用

1. **生成令牌**：打开 OrigamiNav 管理后台 →「设置 → 浏览器扩展」→ 生成并复制访问令牌；
2. **安装扩展**：
   
   ```bash
   cd extension
   npm install
   npm run build
   ```
   打开 `chrome://extensions`，开启右上角「开发者模式」，点击「加载已解压的扩展程序」，选择 `extension/.output/chrome-mv3` 目录；
3. **连接站点**：点击扩展图标，通过弹窗右上角的 ⚙ 设置按钮打开设置页（或右键扩展图标 →「选项」），填入站点地址（如 `https://nav.example.com`）与令牌，点「测试连接」确认后保存；
4. **收藏**：在任意网页点扩展图标，确认标题与分类，回车或点击「添加收藏」；
5. **管理**：点弹窗右上角的列表按钮，搜索已收藏的书签，直接改标题、换分类、改标签或删除。

> 换令牌或换站点：随时从弹窗右上角的 ⚙ 按钮进入设置页修改，设置页以完整标签页打开；重新生成令牌后旧令牌立即失效，需同步更新到扩展。

## API

扩展依赖站点侧的扩展专用 REST 接口（随主站自带，无需额外部署）：

| 接口 | 说明 |
|------|------|
| `GET /api/ext/context?url=` | 站点名、分类列表、URL 重复检测 |
| `GET /api/ext/bookmarks?q=&limit=` | 搜索书签（标题/拼音/描述/标签/域名），一并返回分类列表与每条书签的分类名、标签 |
| `POST /api/ext/bookmarks` | 创建书签（`hidden: true` 设为私有，`force: true` 忽略重复） |
| `PATCH /api/ext/bookmarks/:id` | 更新书签的标题、分类与标签（`{ title, categoryId, tags }`，不存在的标签自动创建） |
| `DELETE /api/ext/bookmarks/:id` | 移入站点回收站（可在管理后台恢复） |
| `POST /api/ext/categories` | 创建分类（幂等：重名返回已有分类） |

以上接口均需 Bearer 令牌，令牌存储于数据库 `secrets` 表（`ext_token`），在管理后台生成/吊销。

## 开发

```bash
npm run dev           # 开发模式：自动启动浏览器并热更新
npm run build         # 构建到 .output/chrome-mv3
npm run build:firefox # 构建 Firefox（MV3）版本
npm run zip           # 打包发布 zip
npm run typecheck     # TypeScript 检查
npm run icons         # 重新生成扩展图标（scripts/make-icons.mjs，零依赖）
```

目录结构：

```
entrypoints/
  popup/    弹窗：识别页面 → 选分类 → 保存；右上角进入已收藏书签的管理视图
  options/  选项页：站点地址 + 令牌 + 测试连接
utils/
  config.ts  chrome.storage.local 配置读写
  api.ts     /api/ext/* 类型化客户端
  page.ts    活动标签页信息 + meta 描述提取
components/ui/  从主站移植的 shadcn 风格组件（button/input/textarea/label/select）
assets/globals.css  主站 blue 皮肤设计令牌的精简移植
```

权限说明：

- `activeTab`（读取当前页信息，仅在点击图标时生效）

- `scripting`（读取页面 meta 描述）

- `storage`（本地保存站点地址与令牌）

扩展不申请任何站点的主机权限——跨域请求由站点侧 `/api/ext/*` 的 CORS 头放行。
