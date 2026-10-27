// ABOUTME: 当前阅读上下文（读者正看着的那篇文章）与原生伴读投递接口

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RouteContext, WorkbenchServer } from '../../sdk/runtime.mjs';
import type { ReadingContextSnapshot, ReadingVersion } from '../contracts/app.ts';
import { fetchOnlineBundle } from './online-api.ts';
import {
  MAX_PROMPT_BODY_CHARS,
  MAX_STORED_CHARS,
  articleTitle,
  availableVersions,
  buildCompanionPrompt,
  buildContextMarkdown,
  resolveVersion,
  versionBody,
} from './companion-text.ts';

/** 单行表：读者的「正在读」只有一份。 */
const SCOPE = 'active';
const CONVERSATION_KEY = 'companion_conversation_id';
const LAST_DISPATCH_KEY = 'companion_last_dispatch';
const SNAPSHOT_FILENAME = 'reading-context.md';
const CONVERSATION_TITLE = 'QMReader 伴读';

interface ContextRow {
  scope: string;
  entry_id: string;
  title: string;
  source_name: string | null;
  link: string | null;
  author: string | null;
  published: string | null;
  version: string;
  selection: string | null;
  body: string;
  body_chars: number;
  updated_at: number;
}

function readActiveRow(ctx: RouteContext): ContextRow | null {
  const row = ctx.database.prepare('SELECT * FROM reading_context WHERE scope = ?').get(SCOPE) as ContextRow | undefined;
  return row ?? null;
}

function getState(ctx: RouteContext, key: string): string | null {
  const row = ctx.database.prepare('SELECT value FROM app_state WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setState(ctx: RouteContext, key: string, value: string): void {
  ctx.database
    .prepare(`
      INSERT INTO app_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    .run(key, value, Date.now());
}

/** 快照落在 SQLite 同目录，Agent 不启动服务也能直接读。 */
function snapshotPath(ctx: RouteContext): string | null {
  try {
    const rows = ctx.database.prepare('PRAGMA database_list').all() as Array<{ file?: string | null }>;
    const file = rows.find(row => row.file)?.file;
    return file ? path.join(path.dirname(file), SNAPSHOT_FILENAME) : null;
  } catch {
    return null;
  }
}

function toSnapshot(row: ContextRow, file: string | null): ReadingContextSnapshot {
  return {
    entryId: row.entry_id,
    title: row.title,
    sourceName: row.source_name,
    link: row.link,
    author: row.author,
    published: row.published,
    version: row.version as ReadingVersion,
    body: row.body,
    bodyChars: row.body_chars,
    updatedAt: row.updated_at,
    file,
  };
}

async function writeSnapshotFile(file: string | null, snapshot: ReadingContextSnapshot): Promise<string | null> {
  if (!file) return null;
  try {
    await fs.writeFile(file, buildContextMarkdown(snapshot), 'utf8');
    return file;
  } catch (err) {
    console.error('[QMReader] 写入阅读上下文快照失败:', err);
    return null;
  }
}

/**
 * 拉取线上正文并覆盖写入「正在读」。
 * 版本缺失时自动回退，保证上下文里永远有内容可读。
 */
async function refreshReadingContext(
  ctx: RouteContext,
  entryId: string,
  requestedVersion?: string | null,
): Promise<ReadingContextSnapshot | null> {
  const bundle = await fetchOnlineBundle(entryId);
  if (!bundle) return null;

  const version = resolveVersion(bundle, requestedVersion);
  const body = versionBody(bundle, version).slice(0, MAX_STORED_CHARS);
  const title = articleTitle(bundle);
  const now = Date.now();

  ctx.database
    .prepare(`
      INSERT INTO reading_context
        (scope, entry_id, title, source_name, link, author, published, version, selection, body, body_chars, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET
        entry_id = excluded.entry_id,
        title = excluded.title,
        source_name = excluded.source_name,
        link = excluded.link,
        author = excluded.author,
        published = excluded.published,
        version = excluded.version,
        selection = excluded.selection,
        body = excluded.body,
        body_chars = excluded.body_chars,
        updated_at = excluded.updated_at
    `)
    .run(
      SCOPE,
      entryId,
      title,
      bundle.entry.sourceName || bundle.entry.sourceId || null,
      bundle.entry.link || null,
      bundle.entry.author?.trim() || null,
      bundle.entry.published ?? null,
      version,
      body,
      body.length,
      now,
    );

  const row = readActiveRow(ctx);
  if (!row) return null;
  const snapshot = toSnapshot(row, snapshotPath(ctx));
  snapshot.versions = availableVersions(bundle);
  await writeSnapshotFile(snapshot.file, snapshot);
  return snapshot;
}

/** 取当前上下文；与请求不一致时刷新。 */
async function ensureReadingContext(
  ctx: RouteContext,
  entryId: string | null | undefined,
  version: string | null | undefined,
): Promise<ReadingContextSnapshot | null> {
  const row = readActiveRow(ctx);
  const fresh = row && (!entryId || row.entry_id === entryId) && (!version || row.version === version);
  if (fresh && row) return toSnapshot(row, snapshotPath(ctx));
  if (!entryId) return row ? toSnapshot(row, snapshotPath(ctx)) : null;
  return refreshReadingContext(ctx, entryId, version);
}

async function createConversation(ctx: RouteContext, title: string, workingDirectory: string): Promise<string> {
  const conversation = await ctx.host.agent.conversations.create({
    title,
    workingDirectory,
    idempotencyKey: `qmreader-conversation:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  });
  setState(ctx, CONVERSATION_KEY, conversation.conversationId);
  return conversation.conversationId;
}

interface DispatchResult {
  conversationId: string;
  runId: string;
  conversationTitle: string;
}

/**
 * 把伴读提问投进 Floatboat 原生对话。
 * 固定复用一条「QMReader 伴读」会话，正在运行时另开一条，避免用户白点一次。
 */
async function dispatchToConversation(
  ctx: RouteContext,
  promptText: string,
  articleTitleText: string,
  requestId: string,
  workingDirectory: string,
): Promise<DispatchResult> {
  let conversationId = getState(ctx, CONVERSATION_KEY);
  let conversationTitle = CONVERSATION_TITLE;

  if (conversationId) {
    try {
      await ctx.host.agent.conversations.get({ conversationId });
    } catch {
      conversationId = null;
    }
  }
  if (!conversationId) conversationId = await createConversation(ctx, CONVERSATION_TITLE, workingDirectory);

  const idempotencyKey = `qmreader-send:${requestId}`;

  try {
    const { runId } = await ctx.host.agent.conversations.send({ conversationId, prompt: promptText, idempotencyKey });
    return { conversationId, runId, conversationTitle };
  } catch (err) {
    if ((err as { code?: string }).code !== 'AGENT_CONVERSATION_BUSY') throw err;
    // 上一轮还在跑：新开一条会话承接这次提问，标题带上文章名便于回头找
    conversationTitle = `QMReader · ${articleTitleText.slice(0, 18)}`;
    const freshId = await createConversation(ctx, conversationTitle, workingDirectory);
    const { runId } = await ctx.host.agent.conversations.send({
      conversationId: freshId,
      prompt: promptText,
      idempotencyKey: `${idempotencyKey}:busy`,
    });
    return { conversationId: freshId, runId, conversationTitle };
  }
}

export function registerReadingContextRoutes(app: WorkbenchServer, workingDirectory: string): void {
  // 1. 阅读器打开文章 / 切换版本时登记「正在读」
  app.route('POST', '/api/v1/reading-context', async (ctx: RouteContext) => {
    const body = (ctx.body || {}) as { entryId?: string; version?: string };
    if (!body.entryId) return { ok: false, error: '缺少 entryId' };

    const snapshot = await refreshReadingContext(ctx, body.entryId, body.version);
    if (!snapshot) return { ok: false, error: '这篇文章暂时取不到正文' };
    return { ok: true, context: snapshot };
  });

  // 2. 读取当前上下文：Floatboat 对话用来回答「总结这篇文章」
  app.route('GET', '/api/v1/reading-context', async (ctx: RouteContext) => {
    const row = readActiveRow(ctx);
    if (!row) {
      return { ok: false, error: '阅读器还没有打开任何文章' };
    }
    const snapshot = toSnapshot(row, snapshotPath(ctx));

    const format = ctx.url.searchParams.get('format');
    if (format === 'markdown' || format === 'md' || format === 'text') {
      return new Response(buildContextMarkdown(snapshot), {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    }

    const lastDispatch = getState(ctx, LAST_DISPATCH_KEY);
    return {
      ok: true,
      context: snapshot,
      lastDispatch: lastDispatch ? (JSON.parse(lastDispatch) as unknown) : null,
    };
  });

  // 3. 只取伴读提问文本（剪贴板兜底路径）
  app.route('POST', '/api/v1/companion/prefill', async (ctx: RouteContext) => {
    const body = (ctx.body || {}) as {
      entryId?: string;
      title?: string;
      version?: string;
      selection?: string;
      prompt?: string;
    };

    if (!body.entryId) {
      const nl = String.fromCharCode(10);
      const title = body.title || '当前阅读文章';
      const label = body.version === 'rewrite' ? '乔木改写' : body.version === 'translation' ? '中文翻译' : '原文';
      const draft = body.selection?.trim()
        ? `关于《${title}》（${label}）的选段：${nl}> ${body.selection.trim()}${nl}${nl}${body.prompt || '请深入剖析这段内容：'}`
        : `关于《${title}》（${label}）：${nl}${body.prompt || '请帮我概括这篇文章的核心论点与深度洞见。'}`;
      return { ok: true, prefilledText: draft };
    }

    const snapshot = await ensureReadingContext(ctx, body.entryId, body.version);
    if (!snapshot) return { ok: false, error: '这篇文章暂时取不到正文' };

    const prefilledText = buildCompanionPrompt({
      title: snapshot.title,
      sourceName: snapshot.sourceName,
      author: snapshot.author,
      published: snapshot.published,
      link: snapshot.link,
      version: snapshot.version,
      body: snapshot.body,
      selection: body.selection,
      prompt: body.prompt,
      contextFile: snapshot.file,
      maxBodyChars: MAX_PROMPT_BODY_CHARS,
    });
    return { ok: true, prefilledText };
  });

  // 4. 直接把「当前文章 + 问题」发进 Floatboat 对话
  app.route('POST', '/api/v1/companion/dispatch', async (ctx: RouteContext) => {
    const body = (ctx.body || {}) as {
      entryId?: string;
      version?: string;
      selection?: string;
      prompt?: string;
      requestId?: string;
    };
    if (!body.entryId) return { ok: false, error: '缺少 entryId' };

    try {
      const snapshot = await ensureReadingContext(ctx, body.entryId, body.version);
      if (!snapshot) return { ok: false, error: '这篇文章暂时取不到正文' };

      const promptText = buildCompanionPrompt({
        title: snapshot.title,
        sourceName: snapshot.sourceName,
        author: snapshot.author,
        published: snapshot.published,
        link: snapshot.link,
        version: snapshot.version,
        body: snapshot.body,
        selection: body.selection,
        prompt: body.prompt,
        contextFile: snapshot.file,
        maxBodyChars: MAX_PROMPT_BODY_CHARS,
      });

      const requestId = body.requestId?.trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = await dispatchToConversation(ctx, promptText, snapshot.title, requestId, workingDirectory);
      setState(
        ctx,
        LAST_DISPATCH_KEY,
        JSON.stringify({ ...result, entryId: snapshot.entryId, version: snapshot.version, at: Date.now() }),
      );

      return { ok: true, ...result, file: snapshot.file };
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'DISPATCH_FAILED';
      const message = err instanceof Error ? err.message : String(err);
      console.error('[QMReader] 伴读投递失败:', code, message);
      return { ok: false, code, error: message };
    }
  });
}
