-- 0002_qmreader.sql: QMReader 核心订阅源、文章、改写与 Floatboat 伴读记录表

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'article',
  site_url TEXT,
  feed_url TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  title_zh TEXT,
  link TEXT,
  author TEXT,
  published TEXT,
  published_ts INTEGER DEFAULT 0,
  summary TEXT,
  content TEXT,
  image TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entries_source_published
  ON entries(source_id, published_ts DESC);

CREATE INDEX IF NOT EXISTS idx_entries_published
  ON entries(published_ts DESC);

CREATE TABLE IF NOT EXISTS entry_rewrites (
  entry_id TEXT PRIMARY KEY,
  title TEXT,
  body TEXT NOT NULL,
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companion_messages (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_companion_messages_entry
  ON companion_messages(entry_id, created_at ASC);
