# QMReader 视觉与体验设计

参照 Vercel / Geist：单色、1px 发丝描边、克制的动效。

## 布局

- 两栏：左侧频道栏 + 文章列表（默认 320px，可拖动 258–520px，双击复位），右侧阅读器。
- 顶栏统一 48px，左右对齐。
- 专注模式隐藏左栏。

## 颜色

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--vc-bg` | `#ffffff` | `#0a0a0a` | 主背景 |
| `--vc-bg-subtle` | `#fafafa` | `#0f0f10` | 左栏、引用块 |
| `--vc-fg` | `#09090b` | `#fafafa` | 正文、选中态 |
| `--vc-fg-muted` | `#71717a` | `#a1a1aa` | 次要文字 |
| `--vc-border` | `#e9e9ec` | `#232326` | 分隔线 |
| `--vc-star` | `#c2820a` | `#e8b339` | 星标，唯一的彩色 |

阅读主题（纸张、青绿、雾蓝等）覆盖 `--vc-bg` / `--vc-fg`。

## 规则

- **不用侧边竖条**：选中、未读、引用块都不用 `border-left` 竖条。选中用底色，未读用 5px 圆点，引用块用浅色底加四角圆角。
- 列表分隔线内缩（左 20px、右 12px），不贯通全宽。
- 滚动条 6px 可视、10px 命中区，无轨道底色。Chromium 下不设 `scrollbar-width`，否则会覆盖 `::-webkit-scrollbar` 宽度。
- 日期与数字用 `tabular-nums`，标题用 `text-wrap: balance`。
- 聚焦态统一 1px 描边加 3px 柔光环。
- 支持 `prefers-reduced-motion` 与 860px 以下窄屏。
