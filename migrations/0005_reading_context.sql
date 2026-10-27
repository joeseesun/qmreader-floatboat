-- 0005_reading_context.sql: 当前正在阅读的文章快照 + 伴读会话绑定

-- 只有一行（scope='active'）：读者此刻在阅读器里看着的那篇文章。
-- 正文统一存成纯文本 / Markdown，Floatboat 对话可以直接读取，不必再次请求线上接口。
CREATE TABLE IF NOT EXISTS reading_context (
  scope TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT,
  link TEXT,
  author TEXT,
  published TEXT,
  version TEXT NOT NULL,
  selection TEXT,
  body TEXT NOT NULL,
  body_chars INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- 工作台自己用的小型键值状态：例如伴读会话 id。
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
