# QMReader 工程设计

## 模块结构

| 路径 | 职责 |
| --- | --- |
| `src/server/index.ts` | 组装服务入口，注册路由 |
| `src/server/reader-routes.ts` | 代理 `rss.qiaomu.ai` 公开 API，合并本地已读 / 星标，管理个人订阅 |
| `src/server/online-api.ts` | 线上只读客户端：一次取齐原文 / 乔木改写 / 中文翻译 |
| `src/server/reading-context.ts` | 「正在读」上下文：写入 SQLite + Markdown 快照，并把伴读提问投进 Floatboat 对话 |
| `src/server/companion-text.ts` | 伴读纯函数：版本回退、正文抽取、上下文 Markdown、带正文的提问拼装 |
| `src/server/pagination.ts` | 分页纯函数：聚合流 offset 切片、分频道游标判定 |
| `src/server/app-route.ts` | `/api/app` 应用信息 |
| `src/contracts/app.ts` | 前后端共享类型：`Source`、`Entry`、`EntryBundle` 等 |
| `src/ui/App.tsx` | 主界面：频道栏、文章列表、阅读器、无限滚动 |
| `src/ui/ChannelPicker.tsx` | 频道切换浮层，分组折叠与搜索 |
| `src/ui/channel-groups.ts` | 频道分组规则，移植自 Obsidian 插件 `src/discovery.ts` |
| `src/ui/markdown.ts` | Markdown 渲染：括号配对解析图片与链接，转义原始 HTML，拦截非安全协议 |
| `src/ui/selection.ts` | 正文选区锚定，移植自 `qiaomu-rss-dsh` |
| `src/ui/reading-settings.ts` / `ReadingAppearance.tsx` | 阅读外观设置 |
| `src/ui/AddFeedDialog.tsx` | 添加个人订阅 |

## 本地 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/sources` | 线上频道 + 个人订阅 |
| GET | `/api/v1/entries?source=&cursor=&limit=` | 文章列表，返回 `entries`、`hasMore`、`nextCursor` |
| GET | `/api/v1/entries/:id` | 正文、改写、翻译并发读取，合成 `bundle` |
| POST | `/api/v1/entries/:id/state` | 写入已读 / 星标 |
| POST / DELETE | `/api/v1/subscriptions[/:id]` | 增删个人订阅 |
| POST | `/api/v1/reading-context` | 登记「正在读」：`{ entryId, version }`，返回正文快照 |
| GET | `/api/v1/reading-context` | 读当前上下文；`?format=markdown` 直接返回 Markdown 快照 |
| POST | `/api/v1/companion/prefill` | 只取伴读提问文本（剪贴板兜底） |
| POST | `/api/v1/companion/dispatch` | 把「正文 + 提问」发进 Floatboat 原生对话 |

## 伴读：当前文章如何进入对话

阅读器每次打开文章、切换版本，前端都会 `POST /api/v1/reading-context`，服务端把该版本正文存两份：

1. `reading_context` 表（唯一一行，`scope='active'`），`body` 为纯文本 / Markdown；
2. 磁盘快照 `reading-context.md`，与 `data.sqlite` 同目录：
   `~/Library/Application Support/floatboat/workbench/data/<appId>/reading-context.md`。

于是任何 Floatboat 对话（包括用户只说「总结这篇文章」）都能这样拿到当前正文：

```bash
curl -s "http://127.0.0.1:<port>/api/v1/reading-context" | jq -r .context.body   # 服务在跑
head -40 "~/Library/Application Support/floatboat/workbench/data/<appId>/reading-context.md"  # 服务没跑
```

点击工具栏伴读按钮或「剖析此段」时走 `POST /api/v1/companion/dispatch`：

- 正文**内嵌**进提问文本（上限 `MAX_PROMPT_BODY_CHARS`，超出时提示去读快照文件），对话无需再回查接口；
- 通过 `ctx.host.agent.conversations` 复用一条标题为 `QMReader 伴读` 的会话，会话 id 存在 `app_state`；
- 上一轮仍在运行（`AGENT_CONVERSATION_BUSY`）时另开一条会话，标题带文章名；
- Host 侧不可用时前端自动退回复制剪贴板（`/api/v1/companion/prefill`），按住 ⌥ 点按钮可直接走这条路。

`workingDirectory` 取工程根（自 `import.meta.url` 向上找 `manifest.json`），Agent 因此能读到 `reading-context.md`。

## 分页

线上两种接口分页方式不同，服务端统一成 `{ entries, hasMore, nextCursor }`：

- **分频道** `/api/sources/:id/entries`：透传服务端游标。没有游标时强制 `hasMore=false`。
- **聚合流** `/api/entries`：服务端不给游标，`limit` 最多返回 1000 条。用 offset 作游标，请求 `offset + pageSize` 条后切片。
- **个人订阅**：一次读完整个 feed，`hasMore=false`。

前端无限滚动用 `scroll` / `wheel` / `touchmove` 事件判断距底部距离，再加 600ms 低频轮询兜底，因为有的宿主在 `scrollTop` 变化时不派发事件。同步 ref 守卫保证连续事件只发一次请求，频道切换序号丢弃过期响应。

## 数据

SQLite 迁移已运行后不可修改，只能追加：

- `0003_online_states.sql`：`read_states`、`favorite_states`
- `0004_user_subscriptions.sql`：`user_subscriptions`
- `0005_reading_context.sql`：`reading_context`（单行 `scope='active'`，读者此刻看的文章）、`app_state`（伴读会话 id、最近一次投递）
- `0002_qmreader.sql` 中的 `sources`、`entries`、`entry_rewrites`、`companion_messages` 是早期本地抓取版本的遗留表，当前代码不再读写。

## 验证

```bash
npm test
```

覆盖 Markdown 渲染（嵌套方括号图片、链接、XSS 与 `javascript:` 拦截）、分页边界（1000 上限、短池、空页、游标解析）、频道分组。
