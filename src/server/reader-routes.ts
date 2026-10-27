// ABOUTME: 乔木 RSS 线上 API 网关 + 个人 RSS 订阅管理接口 (直接代理 rss.qiaomu.ai，零重量依赖，支持自建 RSS)

import type { WorkbenchServer, RouteContext } from '../../sdk/runtime.mjs';
import type { Source, Entry, EntryBundle } from '../contracts/app.ts';
import { aggregatePage, aggregateWindow, parseOffset, sourceHasMore } from './pagination.ts';
import { ONLINE_BASE_URL, fetchOnlineBundle, hashId } from './online-api.ts';

/** 把本地已读 / 星标状态合并进线上条目。 */
function withLocalState(ctx: RouteContext, list: Entry[]): Entry[] {
  if (!list.length) return [];

  const readRows = ctx.database.prepare('SELECT entry_id FROM read_states').all() as Array<{ entry_id: string }>;
  const readSet = new Set(readRows.map(r => r.entry_id));

  const favRows = ctx.database.prepare('SELECT entry_id FROM favorite_states').all() as Array<{ entry_id: string }>;
  const favSet = new Set(favRows.map(r => r.entry_id));

  return list.map(e => ({
    ...e,
    isRead: readSet.has(e.id),
    isFavorite: favSet.has(e.id),
  }));
}

export function registerReaderRoutes(app: WorkbenchServer): void {
  // 1. 获取线上频道与信息源列表 (代理线上 /api/sources + 附带用户自定义源)
  app.route('GET', '/api/v1/sources', (ctx: RouteContext) => {
    return Promise.allSettled([
      fetch(`${ONLINE_BASE_URL}/api/sources`, {
        headers: { 'User-Agent': 'Floatboat-QMReader-Plugin/1.0' },
        signal: AbortSignal.timeout(10000),
      }),
    ]).then(async ([sourcesRes]) => {
      let onlineSources: Source[] = [];
      if (sourcesRes.status === 'fulfilled' && sourcesRes.value.ok) {
        try {
          const data = await sourcesRes.value.json() as { sources?: Source[] };
          onlineSources = data.sources || [];
        } catch { /* ignore */ }
      }

      // 获取用户个人自建订阅
      const userSubs = ctx.database.prepare('SELECT id, url, name FROM user_subscriptions ORDER BY created_at DESC').all() as Array<{ id: string; url: string; name: string }>;

      return {
        sources: onlineSources,
        mySubscriptions: userSubs,
      };
    });
  });

  // 2. 添加个人自定义 RSS 订阅
  app.route('POST', '/api/v1/subscriptions', (ctx: RouteContext) => {
    const body = (ctx.body || {}) as { url?: string; name?: string };
    if (!body.url || !body.url.trim()) {
      return { ok: false, error: 'RSS 订阅链接为必填项' };
    }
    const cleanUrl = body.url.trim();
    const id = `user_${hashId(cleanUrl)}`;
    const domainMatch = cleanUrl.match(new RegExp('^https?:\/\/([^\/]+)'));
    const name = (body.name || '').trim() || (domainMatch ? domainMatch[1] : cleanUrl);

    try {
      ctx.database.prepare(`
        INSERT INTO user_subscriptions (id, url, name, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET name = excluded.name
      `).run(id, cleanUrl, name, Date.now());
      return { ok: true, id, name };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  });

  // 3. 删除个人自定义 RSS 订阅
  app.route('DELETE', '/api/v1/subscriptions/:id', (ctx: RouteContext) => {
    const id = ctx.params.id;
    ctx.database.prepare('DELETE FROM user_subscriptions WHERE id = ?').run(id);
    return { ok: true };
  });

  // 4. 获取文章列表 (直接代理线上 /api/entries 或 /api/sources/:id/entries)
  app.route('GET', '/api/v1/entries', async (ctx: RouteContext) => {
    const url = ctx.url;
    const source = url.searchParams.get('source') || '';
    const cursor = url.searchParams.get('cursor') || '';
    const limit = url.searchParams.get('limit') || '40';

    // 如果是个人自定义订阅
    if (source.startsWith('user_')) {
      const sub = ctx.database.prepare('SELECT * FROM user_subscriptions WHERE id = ?').get(source) as { id: string; url: string; name: string } | undefined;
      if (!sub) return { entries: [], hasMore: false, nextCursor: null };

      try {
        const res = await fetch(sub.url, {
          headers: { 'User-Agent': 'Floatboat-QMReader/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { entries: [], hasMore: false, nextCursor: null };
        const xml = await res.text();
        
        // 简易匹配 RSS item
        const itemRegex = new RegExp('<item[\s\S]*?<\/item>', 'gi');
        const itemMatches = xml.match(itemRegex) || [];
        const entries: Entry[] = itemMatches.slice(0, 30).map((itemXml, idx) => {
          const titleMatch = itemXml.match(new RegExp('<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>', 'i'));
          const linkMatch = itemXml.match(new RegExp('<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>', 'i'));
          const descMatch = itemXml.match(new RegExp('<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>', 'i'));
          const dateMatch = itemXml.match(new RegExp('<pubDate[^>]*>([\s\S]*?)<\/pubDate>', 'i'));

          const title = titleMatch ? titleMatch[1].trim() : '无标题';
          const link = linkMatch ? linkMatch[1].trim() : '';
          const summary = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim().slice(0, 240) : '';
          const published = dateMatch ? dateMatch[1].trim() : '';
          const publishedTs = published ? Date.parse(published) || Date.now() - idx * 60000 : Date.now() - idx * 60000;

          return {
            id: `${sub.id}_${hashId(link || title)}`,
            sourceId: sub.id,
            sourceName: sub.name,
            title,
            link,
            summary,
            published,
            publishedTs,
            origin: 'local',
          };
        });

        // 个人订阅一次抓完整个 feed，没有后续分页
        return { entries: withLocalState(ctx, entries), hasMore: false, nextCursor: null, serverTime: Date.now() };
      } catch (err) {
        console.error('[QMReader] Parse user feed failed:', err);
        return { entries: [], hasMore: false, nextCursor: null };
      }
    }

    // 线上两种分页模型：
    // - 分频道 /api/sources/:id/entries 返回真实 hasMore + nextCursor
    // - 聚合流 /api/entries 没有游标，但支持大 limit（上限 1000），故用 offset 游标自行切片
    const isAggregate = !source || source === 'all' || source === 'qiaomu';
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 40));

    if (isAggregate) {
      const offset = parseOffset(cursor);
      const window = aggregateWindow(offset, pageSize);

      try {
        const res = await fetch(`${ONLINE_BASE_URL}/api/entries?limit=${window}`, {
          headers: {
            'User-Agent': 'Floatboat-QMReader-Plugin/1.0',
            'X-Rss-List': 'reader-v1',
          },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) return { entries: [], hasMore: false, nextCursor: null };

        const data = await res.json() as { entries?: Entry[] };
        const page = aggregatePage(data.entries || [], offset, pageSize);

        return {
          entries: withLocalState(ctx, page.items),
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          serverTime: Date.now(),
        };
      } catch (err) {
        console.error('[QMReader] Fetch aggregate entries failed:', err);
        return { entries: [], hasMore: false, nextCursor: null, serverTime: Date.now() };
      }
    }

    const query = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) query.set('cursor', cursor);

    try {
      const res = await fetch(`${ONLINE_BASE_URL}/api/sources/${encodeURIComponent(source)}/entries?${query.toString()}`, {
        headers: {
          'User-Agent': 'Floatboat-QMReader-Plugin/1.0',
          'X-Rss-List': 'reader-v1',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return { entries: [], hasMore: false, nextCursor: null };
      }

      const data = await res.json() as { entries?: Entry[]; hasMore?: boolean; nextCursor?: string | null };

      return {
        entries: withLocalState(ctx, data.entries || []),
        hasMore: sourceHasMore(data.hasMore, data.nextCursor),
        nextCursor: data.nextCursor || null,
        serverTime: Date.now(),
      };
    } catch (err) {
      console.error('[QMReader] Fetch online entries failed:', err);
      return { entries: [], hasMore: false, nextCursor: null, serverTime: Date.now() };
    }
  });

  // 5. 获取单篇文章详情、线上乔木改写与翻译
  app.route('GET', '/api/v1/entries/:id', async (ctx: RouteContext) => {
    const entryId = ctx.params.id;

    try {
      const bundle = await fetchOnlineBundle(entryId);
      if (!bundle) return { error: 'entry not found' };

      const entry = bundle.entry;
      const isReadRow = ctx.database.prepare('SELECT 1 FROM read_states WHERE entry_id = ?').get(entryId);
      const isFavRow = ctx.database.prepare('SELECT 1 FROM favorite_states WHERE entry_id = ?').get(entryId);

      entry.isRead = Boolean(isReadRow);
      entry.isFavorite = Boolean(isFavRow);

      const payload: EntryBundle = {
        entry,
        rewrite: bundle.rewrite || entry.rewrite || null,
        translation: bundle.translation || null,
      };

      return { bundle: payload };
    } catch (err) {
      console.error('[QMReader] Fetch entry bundle failed:', err);
      return { error: 'failed to load entry' };
    }
  });

  // 6. 更新本地已读与收藏状态
  app.route('POST', '/api/v1/entries/:id/state', (ctx: RouteContext) => {
    const entryId = ctx.params.id;
    const body = (ctx.body || {}) as { isRead?: boolean; isFavorite?: boolean };

    if (typeof body.isRead === 'boolean') {
      if (body.isRead) {
        ctx.database.prepare(`
          INSERT INTO read_states (entry_id, is_read, read_at)
          VALUES (?, 1, ?)
          ON CONFLICT(entry_id) DO UPDATE SET is_read = 1, read_at = excluded.read_at
        `).run(entryId, Date.now());
      } else {
        ctx.database.prepare('DELETE FROM read_states WHERE entry_id = ?').run(entryId);
      }
    }

    if (typeof body.isFavorite === 'boolean') {
      if (body.isFavorite) {
        ctx.database.prepare(`
          INSERT INTO favorite_states (entry_id, is_favorite, created_at)
          VALUES (?, 1, ?)
          ON CONFLICT(entry_id) DO UPDATE SET is_favorite = 1
        `).run(entryId, Date.now());
      } else {
        ctx.database.prepare('DELETE FROM favorite_states WHERE entry_id = ?').run(entryId);
      }
    }

    return { ok: true };
  });
}
