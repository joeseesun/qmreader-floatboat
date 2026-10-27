// ABOUTME: 乔木 RSS 线上只读 API 客户端（频道、条目、改写、翻译）

import { createHash } from 'node:crypto';
import type { Entry, OnlineBundle, RewriteData, TranslationData } from '../contracts/app.ts';

export const ONLINE_BASE_URL = 'https://rss.qiaomu.ai';

const ONLINE_HEADERS = { 'User-Agent': 'Floatboat-QMReader-Plugin/1.0' };

export function hashId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: ONLINE_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 一次取齐单篇文章的三份素材：原文、乔木改写、中文翻译。
 * 条目本身取不到（或网络失败）时返回 null；改写 / 翻译缺失只是字段为空。
 */
export async function fetchOnlineBundle(entryId: string): Promise<OnlineBundle | null> {
  const encodedId = encodeURIComponent(entryId);
  const [entryJson, rewriteJson, translationJson] = await Promise.all([
    fetchJson<{ entry?: Entry }>(`${ONLINE_BASE_URL}/api/entry/${encodedId}`, 15000),
    fetchJson<{ rewrite?: RewriteData | null }>(`${ONLINE_BASE_URL}/api/entry/${encodedId}/rewrite`, 15000),
    fetchJson<{ translation?: TranslationData | null }>(`${ONLINE_BASE_URL}/api/entry/${encodedId}/translation`, 15000),
  ]);

  if (!entryJson?.entry) return null;
  return {
    entry: entryJson.entry,
    rewrite: rewriteJson?.rewrite ?? null,
    translation: translationJson?.translation ?? null,
  };
}
