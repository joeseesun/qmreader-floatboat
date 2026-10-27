-- 0003_online_states.sql: 仅存储用户已读状态与伴读

CREATE TABLE IF NOT EXISTS read_states (
  entry_id TEXT PRIMARY KEY,
  is_read INTEGER NOT NULL DEFAULT 1,
  read_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorite_states (
  entry_id TEXT PRIMARY KEY,
  is_favorite INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
