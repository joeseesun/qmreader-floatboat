import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGGREGATE_MAX,
  aggregatePage,
  aggregateWindow,
  parseOffset,
  sourceHasMore,
} from '../src/server/pagination.ts';
import { groupSources, qiaomuChannelDivider } from '../src/ui/channel-groups.ts';
import type { Source } from '../src/contracts/app.ts';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('aggregate pagination', () => {
  it('parses cursors defensively', () => {
    assert.equal(parseOffset('40'), 40);
    assert.equal(parseOffset('12.9'), 12);
    assert.equal(parseOffset(null), 0);
    assert.equal(parseOffset(''), 0);
    assert.equal(parseOffset('-5'), 0);
    assert.equal(parseOffset('abc'), 0);
  });

  it('never requests past the server cap', () => {
    assert.equal(aggregateWindow(0, 40), 40);
    assert.equal(aggregateWindow(980, 40), AGGREGATE_MAX);
  });

  it('advances the cursor without overlapping pages', () => {
    const first = aggregatePage(range(40), 0, 40);
    const second = aggregatePage(range(80), parseOffset(first.nextCursor), 40);
    assert.deepEqual(first.items, range(40));
    assert.equal(first.nextCursor, '40');
    assert.equal(first.hasMore, true);
    assert.deepEqual(second.items, range(80).slice(40));
    assert.equal(second.nextCursor, '80');
  });

  it('stops when the pool runs short', () => {
    const page = aggregatePage(range(30), 0, 40);
    assert.equal(page.items.length, 30);
    assert.equal(page.hasMore, false);
  });

  it('stops at the server cap even when the last page is full', () => {
    const page = aggregatePage(range(AGGREGATE_MAX), AGGREGATE_MAX - 40, 40);
    assert.equal(page.items.length, 40);
    assert.equal(page.nextCursor, String(AGGREGATE_MAX));
    assert.equal(page.hasMore, false);
  });

  it('returns an empty final page past the end', () => {
    const page = aggregatePage(range(40), 40, 40);
    assert.deepEqual(page.items, []);
    assert.equal(page.hasMore, false);
  });
});

describe('per-source pagination', () => {
  it('requires both a flag and a cursor to continue', () => {
    assert.equal(sourceHasMore(true, '1792768788000:abc'), true);
    assert.equal(sourceHasMore(true, null), false);
    assert.equal(sourceHasMore(true, ''), false);
    assert.equal(sourceHasMore(false, 'cursor'), false);
    assert.equal(sourceHasMore(undefined, undefined), false);
  });
});

describe('channel grouping', () => {
  const source = (id: string, extra: Partial<Source> = {}): Source => ({ id, name: id, ...extra });

  it('classifies sources into Obsidian plugin dividers', () => {
    assert.equal(qiaomuChannelDivider(source('wechat-kazike')), '微信公众号');
    assert.equal(qiaomuChannelDivider(source('x', { siteUrl: 'https://mp.weixin.qq.com/s/1' })), '微信公众号');
    assert.equal(qiaomuChannelDivider(source('nexttoken', { category: 'podcast' })), '播客');
    assert.equal(qiaomuChannelDivider(source('bensbites')), 'Newsletter');
    assert.equal(qiaomuChannelDivider(source('x', { siteUrl: 'https://foo.substack.com' })), 'Newsletter');
    assert.equal(qiaomuChannelDivider(source('simonwillison', { siteUrl: 'https://simonwillison.net' })), '博客与资讯');
  });

  it('keeps community sources out of curated sections', () => {
    const grouped = groupSources([
      source('reader-pick', { category: 'community' }),
      source('bensbites'),
    ]);
    assert.deepEqual(grouped.读者社区.map(s => s.id), ['reader-pick']);
    assert.deepEqual(grouped.Newsletter.map(s => s.id), ['bensbites']);
    assert.deepEqual(grouped.聚合.map(c => c.id), ['qiaomu', 'all']);
  });

  it('passes personal subscriptions through untouched', () => {
    const mine = [{ id: 'user_1', url: 'https://example.com/feed.xml', name: 'Example' }];
    assert.deepEqual(groupSources([], mine).我的订阅, mine);
  });
});
