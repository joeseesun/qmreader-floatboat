// ABOUTME: 文章列表分页的纯函数。聚合流没有服务端游标，用 offset 自行切片；分频道透传服务端游标。

/** 线上聚合流 /api/entries 的实测硬上限（limit 超过 1000 仍只返回 1000 条）。 */
export const AGGREGATE_MAX = 1000;

/** 把游标字符串解析成非负整数偏移量；非法值一律从头开始。 */
export function parseOffset(cursor: string | null | undefined): number {
  const value = Number(cursor);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/** 本次需要向线上请求的条目窗口大小，不超过服务端上限。 */
export function aggregateWindow(offset: number, pageSize: number): number {
  return Math.min(AGGREGATE_MAX, offset + pageSize);
}

/**
 * 从线上返回的条目池中切出当前页。
 * 只有本页取满、未触及服务端上限、且服务端确实返回了完整窗口时，才认为还有下一页。
 */
export function aggregatePage<T>(pool: T[], offset: number, pageSize: number) {
  const window = aggregateWindow(offset, pageSize);
  const items = pool.slice(offset, offset + pageSize);
  const nextOffset = offset + items.length;
  return {
    items,
    nextCursor: String(nextOffset),
    hasMore: items.length === pageSize && nextOffset < AGGREGATE_MAX && pool.length >= window,
  };
}

/** 分频道分页：没有游标就无法继续翻页，必须据此关闭 hasMore，避免前端空转。 */
export function sourceHasMore(hasMore: boolean | undefined, nextCursor: string | null | undefined): boolean {
  return Boolean(hasMore && nextCursor);
}
