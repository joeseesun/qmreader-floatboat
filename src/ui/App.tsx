// ABOUTME: QMReader 阅读工作台主界面（Vercel/Geist 设计语言，线上频道 + 个人订阅 + 原生伴读联动）

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  Search,
  RefreshCw,
  Bookmark,
  SlidersHorizontal,
  ChevronDown,
  ExternalLink,
  WandSparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Volume2,
  Inbox,
} from 'lucide-react';
import { pageConnection } from './connection.js';
import { renderMarkdownToHtml } from './markdown.js';
import { READING_DEFAULTS, fontStack, THEMES, type ReadingSettings } from './reading-settings.js';
import { selectedPassage, type SelectedPassage } from './selection.js';
import { ChannelPicker } from './ChannelPicker.js';
import { ReadingAppearance } from './ReadingAppearance.js';
import { AddFeedDialog } from './AddFeedDialog.js';
import type { Source, Entry, EntryBundle } from '../contracts/app.ts';

type Version = 'rewrite' | 'translation' | 'original';

/** 单页条目数；配合触底预取，兼顾首屏速度与滚动连续性。 */
const PAGE_SIZE = 40;

/** 距列表底部多少像素内开始预取，约两屏条目高度，滚动时不出现等待空档。 */
const PREFETCH_PX = 480;

/** 兜底轮询间隔：只读三次布局属性，开销可忽略。 */
const AUTO_PAGE_POLL_MS = 600;

const VERSION_NAMES: Record<Version, string> = {
  rewrite: '乔木改写',
  translation: '中文翻译',
  original: '原文',
};

function formatDate(value: string | number | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatFullDate(value: string | number | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** 每点一次就是一轮独立提问，用于 Host 侧幂等键。 */
function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shortTitle(title: string, max = 16): string {
  return title.length > max ? `${title.slice(0, max)}…` : title;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [mySubscriptions, setMySubscriptions] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const [channel, setChannel] = useState<string>(() => localStorage.getItem('qrs.channel') || 'qiaomu');
  const [filter, setFilter] = useState<'all' | 'unread' | 'favorites'>('all');
  const [query, setQuery] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState<boolean>(false);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entryBundle, setEntryBundle] = useState<EntryBundle | null>(null);
  const [loadingArticle, setLoadingArticle] = useState<boolean>(false);
  const [dispatching, setDispatching] = useState<boolean>(false);

  const [activeVersion, setActiveVersion] = useState<Version>('rewrite');
  const [passage, setPassage] = useState<SelectedPassage | null>(null);

  const [focused, setFocused] = useState<boolean>(false);
  const [listWidth, setListWidth] = useState<number>(() => Number(localStorage.getItem('qrs.listWidth')) || 320);
  const [reading, setReading] = useState<ReadingSettings>(() => {
    try {
      const saved = localStorage.getItem('qrs.reading');
      return saved ? { ...READING_DEFAULTS, ...JSON.parse(saved) } : READING_DEFAULTS;
    } catch {
      return READING_DEFAULTS;
    }
  });

  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [appearanceOpen, setAppearanceOpen] = useState<boolean>(false);
  const [addFeedOpen, setAddFeedOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<string>('');

  const proseRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  /** 频道切换序号，用于丢弃过期的分页响应。 */
  const loadSeq = useRef(0);
  /** 同步防重入：React 状态更新前，连续滚动事件仍只会发一次请求。 */
  const pagingInFlight = useRef(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  const applyReading = (patch: Partial<ReadingSettings>) => {
    setReading(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem('qrs.reading', JSON.stringify(next));
      return next;
    });
  };

  const loadSources = async () => {
    try {
      const page = await pageConnection;
      const res = await page.fetch('/api/v1/sources');
      const data = await res.json() as { sources?: Source[]; mySubscriptions?: Array<{ id: string; url: string; name: string }> };
      if (data?.sources) setSources(data.sources);
      if (data?.mySubscriptions) setMySubscriptions(data.mySubscriptions);
    } catch (err) {
      console.error('Failed to load sources', err);
    }
  };

  /**
   * 把「正在读」写进工作台 SQLite 并落一份 Markdown 快照。
   * 之后在任何 Floatboat 对话里问「总结这篇文章」，都能读到当前正文。
   */
  const syncReadingContext = (id: string, version: Version) => {
    void (async () => {
      try {
        const page = await pageConnection;
        await page.fetch('/api/v1/reading-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId: id, version }),
        });
      } catch (err) {
        console.error('Failed to sync reading context', err);
      }
    })();
  };

  const openArticle = async (id: string) => {
    setSelectedId(id);
    setLoadingArticle(true);
    setPassage(null);
    bodyScrollRef.current?.scrollTo({ top: 0 });
    try {
      const page = await pageConnection;
      const res = await page.fetch(`/api/v1/entries/${encodeURIComponent(id)}`);
      const data = await res.json() as { bundle?: EntryBundle };
      if (data?.bundle) {
        setEntryBundle(data.bundle);

        const preferred = reading.defaultVersion as Version;
        const has: Record<Version, boolean> = {
          rewrite: Boolean(data.bundle.rewrite),
          translation: Boolean(data.bundle.translation?.content?.length),
          original: true,
        };
        let resolved: Version = 'original';
        if (has[preferred]) resolved = preferred;
        else if (has.rewrite) resolved = 'rewrite';
        else if (has.translation) resolved = 'translation';
        setActiveVersion(resolved);
        syncReadingContext(id, resolved);

        if (!data.bundle.entry.isRead) {
          void page.fetch(`/api/v1/entries/${encodeURIComponent(id)}/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isRead: true }),
          });
          setEntries(prev => prev.map(e => (e.id === id ? { ...e, isRead: true } : e)));
        }
      }
    } catch (err) {
      console.error('Failed to open article', err);
    } finally {
      setLoadingArticle(false);
    }
  };

  /** 首屏加载：重置列表、游标，并自动打开第一篇。 */
  const loadEntries = async (chan: string) => {
    loadSeq.current += 1;
    const seq = loadSeq.current;

    setLoading(true);
    setHasMore(false);
    setCursor(null);
    setLoadMoreError('');
    // 切频道时旧频道的分页请求会被 seq 丢弃，这里释放守卫，新频道可立即翻页
    pagingInFlight.current = false;
    setLoadingMore(false);
    try {
      const page = await pageConnection;
      const params = new URLSearchParams();
      if (chan && chan !== 'all' && chan !== 'qiaomu') params.set('source', chan);
      params.set('limit', String(PAGE_SIZE));

      const res = await page.fetch(`/api/v1/entries?${params.toString()}`);
      const data = await res.json() as { entries?: Entry[]; hasMore?: boolean; nextCursor?: string | null };
      // 频道已被切换，丢弃这次过期响应
      if (seq !== loadSeq.current) return;

      const list = data?.entries ?? [];
      setEntries(list);
      setHasMore(Boolean(data?.hasMore));
      setCursor(data?.nextCursor ?? null);

      if (list.length > 0) void openArticle(list[0].id);
      else {
        setSelectedId(null);
        setEntryBundle(null);
      }
    } catch (err) {
      console.error('Failed to load entries', err);
      if (seq === loadSeq.current) setLoadMoreError('文章列表加载失败');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };

  /** 触底追加下一页；按 id 去重，避免游标边界重复。 */
  const loadMoreEntries = async () => {
    if (pagingInFlight.current || !hasMore || !cursor) return;
    pagingInFlight.current = true;
    const seq = loadSeq.current;

    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const page = await pageConnection;
      const params = new URLSearchParams();
      if (channel && channel !== 'all' && channel !== 'qiaomu') params.set('source', channel);
      params.set('limit', String(PAGE_SIZE));
      params.set('cursor', cursor);

      const res = await page.fetch(`/api/v1/entries?${params.toString()}`);
      const data = await res.json() as { entries?: Entry[]; hasMore?: boolean; nextCursor?: string | null };
      if (seq !== loadSeq.current) return;

      const incoming = data?.entries ?? [];
      setEntries(prev => {
        const seen = new Set(prev.map(e => e.id));
        const fresh = incoming.filter(e => !seen.has(e.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });

      const nextCursor = data?.nextCursor ?? null;
      // 游标没有前进说明服务端已到末尾，必须停下来，否则会无限请求同一页
      const advanced = Boolean(nextCursor) && nextCursor !== cursor;
      setCursor(nextCursor);
      setHasMore(Boolean(data?.hasMore) && advanced && incoming.length > 0);
    } catch (err) {
      console.error('Failed to load more entries', err);
      if (seq === loadSeq.current) setLoadMoreError('加载更多失败，点击重试');
    } finally {
      // 只释放属于当前频道的守卫，避免过期请求误清新频道正在进行的分页
      if (seq === loadSeq.current) {
        pagingInFlight.current = false;
        setLoadingMore(false);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEntries(channel);
    setRefreshing(false);
    showToast('已拉取最新文章');
  };

  const toggleFavorite = async (entry: Entry) => {
    const nextFav = !entry.isFavorite;
    const page = await pageConnection;
    await page.fetch(`/api/v1/entries/${encodeURIComponent(entry.id)}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: nextFav }),
    });
    setEntries(prev => prev.map(e => (e.id === entry.id ? { ...e, isFavorite: nextFav } : e)));
    if (entryBundle && entryBundle.entry.id === entry.id) {
      setEntryBundle({ ...entryBundle, entry: { ...entryBundle.entry, isFavorite: nextFav } });
    }
    showToast(nextFav ? '已加入星标' : '已取消星标');
  };

  const captureSelection = () => {
    const sel = selectedPassage(proseRef.current);
    setPassage(sel);
  };

  const companionPrompt = (quote: string) =>
    quote
      ? '请结合整篇文章的上下文，深入剖析这段话在讲什么、为什么重要。'
      : '请先一句话说清这篇文章在讲什么，再分点总结核心信息、关键数据和值得注意的细节。';

  /** 兜底路径：把带正文的伴读指令复制到剪贴板，用户自己粘进对话。 */
  const copyCompanionPrompt = async () => {
    if (!entryBundle) return;
    const quote = passage?.quote?.trim() || '';
    try {
      const page = await pageConnection;
      const res = await page.fetch('/api/v1/companion/prefill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: entryBundle.entry.id,
          version: activeVersion,
          selection: quote,
          prompt: companionPrompt(quote),
        }),
      });
      const data = (await res.json()) as { ok: boolean; prefilledText?: string };
      if (!data?.prefilledText) throw new Error('prefill failed');
      await navigator.clipboard.writeText(data.prefilledText);
      showToast(quote ? '已复制选段伴读指令（含正文）' : '已复制文章伴读指令（含正文），粘贴到对话即可');
    } catch (err) {
      console.error('Copy companion prompt failed', err);
      showToast('复制失败，可手动选中正文后提问');
    }
  };

  /**
   * 主路径：把「当前文章正文 + 提问」直接发进 Floatboat 原生对话。
   * 失败时才退回复制，保证按钮永远有反馈。
   */
  const askFloatboat = async () => {
    if (!entryBundle || dispatching) return;
    const quote = passage?.quote?.trim() || '';
    setDispatching(true);
    try {
      const page = await pageConnection;
      const res = await page.fetch('/api/v1/companion/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: entryBundle.entry.id,
          version: activeVersion,
          selection: quote,
          prompt: companionPrompt(quote),
          requestId: newRequestId(),
        }),
      });
      const data = (await res.json()) as { ok: boolean; conversationTitle?: string; error?: string };
      if (!data?.ok) throw new Error(data?.error || 'dispatch failed');
      const target = data.conversationTitle || 'Floatboat 对话';
      showToast(
        quote
          ? `已把选段发进「${target}」`
          : `已把《${shortTitle(entryBundle.entry.titleZh || entryBundle.entry.title)}》发进「${target}」`,
      );
    } catch (err) {
      console.error('Dispatch to Floatboat failed', err);
      await copyCompanionPrompt();
    } finally {
      setDispatching(false);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    void loadEntries(channel);
  }, [channel]);

  // 无限滚动：距底部 PREFETCH_PX 以内即预取下一页。
  //
  // 用 scroll 事件直接测量剩余距离，不依赖 IntersectionObserver / rAF 回调。
  // 判断本身只是三次读布局，开销很小；同步的 inFlight 守卫保证连续滚动事件
  // 在 React 重渲染前也只会发出一次请求。
  //
  // 搜索/筛选时列表是本地子集，继续分页会让结果忽隐忽现，故暂停自动加载。
  const autoPaging = hasMore && !loading && filter === 'all' && !query.trim();

  const maybeLoadMore = () => {
    const el = listScrollRef.current;
    if (!el || !autoPaging || pagingInFlight.current) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining <= PREFETCH_PX) void loadMoreEntries();
  };

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el || !autoPaging) return;

    // 主路径：滚动 / 滚轮 / 触摸事件，响应最快
    el.addEventListener('scroll', maybeLoadMore, { passive: true });
    el.addEventListener('wheel', maybeLoadMore, { passive: true });
    el.addEventListener('touchmove', maybeLoadMore, { passive: true });

    // 兜底：部分宿主环境下 scrollTop 被改写时不会派发 scroll 事件，
    // 低频轮询剩余距离，保证停在底部时一定会继续加载
    const timer = window.setInterval(maybeLoadMore, AUTO_PAGE_POLL_MS);

    return () => {
      el.removeEventListener('scroll', maybeLoadMore);
      el.removeEventListener('wheel', maybeLoadMore);
      el.removeEventListener('touchmove', maybeLoadMore);
      window.clearInterval(timer);
    };
  }, [autoPaging, cursor, channel]);

  // 内容不足一屏时没有滚动事件可触发，加载完成后主动补检一次，直到填满视口
  useEffect(() => {
    if (autoPaging && !loadingMore) maybeLoadMore();
  }, [entries.length, autoPaging, loadingMore]);

  const handleSelectChannel = (key: string) => {
    if (key === channel) return;
    setChannel(key);
    localStorage.setItem('qrs.channel', key);
    setSelectedId(null);
    setEntryBundle(null);
  };

  const currentChannelName = useMemo(() => {
    if (channel === 'qiaomu') return '乔木精选';
    if (channel === 'all') return '全部文章';
    const sub = mySubscriptions.find(s => s.id === channel);
    if (sub) return sub.name;
    const found = sources.find(s => s.id === channel);
    return found ? found.name : channel;
  }, [channel, sources, mySubscriptions]);

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (filter === 'unread' && e.isRead) return false;
      if (filter === 'favorites' && !e.isFavorite) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hit =
          e.title?.toLowerCase().includes(q) ||
          e.titleZh?.toLowerCase().includes(q) ||
          e.summary?.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [entries, filter, query]);

  const bodyHtml = useMemo(() => {
    if (!entryBundle) return '';
    if (activeVersion === 'rewrite') {
      return entryBundle.rewrite ? renderMarkdownToHtml(entryBundle.rewrite.body) : '';
    }
    if (activeVersion === 'translation') {
      const pairs = entryBundle.translation?.content;
      if (!pairs?.length) return '';
      return pairs
        .map(p => {
          const target = escapeHtml(p.target || '');
          const source = escapeHtml(p.source || '');
          return `<div class="vc-trans-pair"><p class="vc-trans-target">${target}</p><p class="vc-trans-source">${source}</p></div>`;
        })
        .join('');
    }
    return entryBundle.entry.content || entryBundle.entry.summary || '';
  }, [entryBundle, activeVersion]);

  const appRootStyle = useMemo(() => {
    const textWidthPx = Math.round(reading.textWidth * reading.fontSize * 1.08);
    const themeColors = THEMES[reading.readingTheme];
    return {
      '--qrs-font-family': fontStack(reading),
      '--qrs-font-size': `${reading.fontSize}px`,
      '--qrs-line-height': String(reading.lineHeight),
      '--qrs-article-width': `${textWidthPx}px`,
      '--qrs-list-width': `${listWidth}px`,
      ...(themeColors
        ? {
            '--vc-bg': themeColors[0],
            '--vc-fg': themeColors[1],
          }
        : {}),
    } as React.CSSProperties;
  }, [reading, listWidth]);

  const versionAvailability: Record<Version, boolean> = {
    rewrite: Boolean(entryBundle?.rewrite),
    translation: Boolean(entryBundle?.translation?.content?.length),
    original: true,
  };

  return (
    <div className={`vc-app-root${focused ? ' is-focused' : ''}`} style={appRootStyle}>
      <div className="vc-layout">
        {/* 左栏 */}
        <aside className="vc-sidebar">
          <div className="vc-sidebar-top">
            <button
              type="button"
              className="vc-channel-trigger"
              onClick={() => setPickerOpen(true)}
              title="切换频道与订阅源"
            >
              <Sparkles size={14} />
              <span className="vc-channel-trigger-name">{currentChannelName}</span>
              <ChevronDown size={13} />
            </button>

            <div className="vc-top-actions">
              <button
                type="button"
                className="vc-btn-ghost vc-btn-icon"
                title="添加个人订阅"
                onClick={() => setAddFeedOpen(true)}
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                className="vc-btn-ghost vc-btn-icon"
                title="搜索已载入文章"
                onClick={() => {
                  setSearchOpen(prev => !prev);
                  setTimeout(() => searchInputRef.current?.focus(), 40);
                }}
              >
                <Search size={15} />
              </button>
              <button
                type="button"
                className="vc-btn-ghost vc-btn-icon"
                title="刷新当前频道"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
              >
                <RefreshCw size={14} className={refreshing ? 'vc-spin' : undefined} />
              </button>
            </div>
          </div>

          <div className="vc-filter-pill-bar">
            {(['all', 'unread', 'favorites'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                className={`vc-pill${filter === mode ? ' is-active' : ''}`}
                onClick={() => setFilter(mode)}
              >
                {mode === 'all' ? '全部' : mode === 'unread' ? '未读' : '星标'}
              </button>
            ))}

            <div className="vc-pill-actions">
              <button
                type="button"
                className="vc-btn-ghost vc-btn-icon"
                title="排版与外观"
                onClick={() => setAppearanceOpen(prev => !prev)}
              >
                <SlidersHorizontal size={14} />
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="vc-inline-search">
              <input
                ref={searchInputRef}
                type="search"
                placeholder="搜索标题或摘要，Esc 收起"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setSearchOpen(false);
                    setQuery('');
                  }
                }}
              />
            </div>
          )}

          <div className="vc-entries-scroll" ref={listScrollRef}>
            {loading && entries.length === 0 ? (
              <div className="vc-empty-hint">
                <RefreshCw size={16} className="vc-spin" />
                <span>正在读取线上文章</span>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="vc-empty-hint">
                <Inbox size={18} />
                <span>
                  {filter === 'favorites' ? '还没有星标文章' : filter === 'unread' ? '没有未读文章' : '这个频道暂无文章'}
                </span>
              </div>
            ) : (
              filteredEntries.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  className={`vc-entry-row${selectedId === entry.id ? ' is-selected' : ''}${entry.isRead ? ' is-read' : ''}`}
                  onClick={() => void openArticle(entry.id)}
                >
                  <span className="vc-entry-dot" aria-hidden="true" />
                  <div className="vc-entry-body">
                    <div className="vc-entry-meta">
                      <span className="vc-entry-source">{entry.sourceName || entry.sourceId}</span>
                      {entry.isFavorite && <Bookmark size={11} className="vc-entry-star" />}
                      <span className="vc-entry-date">{formatDate(entry.publishedTs || entry.published)}</span>
                    </div>
                    <h4 className="vc-entry-title">{entry.titleZh || entry.title}</h4>
                    {entry.summary && <p className="vc-entry-summary">{entry.summary}</p>}
                  </div>

                  {entry.image && (
                    <div className="vc-entry-thumb">
                      <img src={entry.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    </div>
                  )}
                </button>
              ))
            )}

            {/* 分页状态 */}
            {entries.length > 0 && (
              <div className="vc-list-foot" role="status" aria-live="polite">
                {loadMoreError ? (
                  <button type="button" className="vc-load-retry" onClick={() => void loadMoreEntries()}>
                    {loadMoreError}
                  </button>
                ) : loadingMore ? (
                  <span className="vc-load-state">
                    <RefreshCw size={13} className="vc-spin" />
                    正在加载更多
                  </span>
                ) : hasMore ? (
                  filter === 'all' && !query.trim() ? (
                    <span className="vc-load-state">下滚加载更多</span>
                  ) : (
                    <button type="button" className="vc-load-retry" onClick={() => void loadMoreEntries()}>
                      加载更多文章
                    </button>
                  )
                ) : (
                  <span className="vc-load-state is-end">已到底 · 共 {entries.length} 篇</span>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* 分隔线 */}
        <div
          className="vc-resizer"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={e => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = listWidth;
            const handleMove = (moveEvt: PointerEvent) => {
              const next = Math.max(258, Math.min(520, startW + (moveEvt.clientX - startX)));
              setListWidth(next);
              localStorage.setItem('qrs.listWidth', String(next));
            };
            const handleUp = () => {
              window.removeEventListener('pointermove', handleMove);
              window.removeEventListener('pointerup', handleUp);
            };
            window.addEventListener('pointermove', handleMove);
            window.addEventListener('pointerup', handleUp);
          }}
          onDoubleClick={() => {
            setListWidth(320);
            localStorage.setItem('qrs.listWidth', '320');
          }}
        />

        {/* 右栏 */}
        <main className="vc-reader">
          <header className="vc-reader-topbar">
            <div className="vc-topbar-left">
              <button
                type="button"
                className="vc-btn-ghost vc-btn-icon"
                title={focused ? '显示文章列表' : '专注阅读'}
                onClick={() => setFocused(prev => !prev)}
              >
                {focused ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>

              {entryBundle && (
                <div className="vc-segmented-selector" role="group" aria-label="阅读版本">
                  {(['rewrite', 'translation', 'original'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      className={`vc-segmented-btn${activeVersion === v ? ' is-active' : ''}`}
                      disabled={!versionAvailability[v]}
                      aria-pressed={activeVersion === v}
                      title={versionAvailability[v] ? VERSION_NAMES[v] : `${VERSION_NAMES[v]}（本文暂缺）`}
                      onClick={() => {
                        setPassage(null);
                        setActiveVersion(v);
                        if (entryBundle) syncReadingContext(entryBundle.entry.id, v);
                      }}
                    >
                      {VERSION_NAMES[v]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {entryBundle && (
              <div className="vc-topbar-right">
                <button
                  type="button"
                  className="vc-btn-ghost vc-btn-icon"
                  title={
                    dispatching
                      ? '正在把正文发进 Floatboat 对话'
                      : `${passage ? '把选段' : '把这篇正文'}发进 Floatboat 对话（按住 ⌥ 复制伴读指令）`
                  }
                  aria-busy={dispatching}
                  disabled={dispatching}
                  onClick={event => {
                    if (event.altKey) void copyCompanionPrompt();
                    else void askFloatboat();
                  }}
                >
                  {dispatching ? <RefreshCw size={14} className="vc-spin" /> : <WandSparkles size={15} />}
                </button>
                <button
                  type="button"
                  className={`vc-btn-ghost vc-btn-icon${entryBundle.entry.isFavorite ? ' is-starred' : ''}`}
                  title={entryBundle.entry.isFavorite ? '取消星标' : '加入星标'}
                  onClick={() => void toggleFavorite(entryBundle.entry)}
                >
                  <Bookmark size={15} />
                </button>
                {entryBundle.entry.link && (
                  <a
                    href={entryBundle.entry.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="vc-btn-ghost vc-btn-icon"
                    title="在浏览器打开原文"
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            )}
          </header>

          {passage && (
            <div className="vc-selection-toolbar">
              <span className="vc-selection-quote">已选中：{passage.quote.slice(0, 60)}</span>
              <button
                type="button"
                className="vc-btn-primary"
                disabled={dispatching}
                title="把这一段的上下文和你的问题一起发进 Floatboat 对话"
                onClick={() => void askFloatboat()}
              >
                {dispatching ? <RefreshCw size={13} className="vc-spin" /> : <WandSparkles size={13} />}
                剖析此段
              </button>
            </div>
          )}

          <div className="vc-reader-body-scroll" ref={bodyScrollRef}>
            {loadingArticle ? (
              <div className="vc-article-measure">
                <div className="vc-skeleton-stack">
                  <div className="vc-skeleton is-title" />
                  <div className="vc-skeleton is-sub" />
                  <div className="vc-skeleton" />
                  <div className="vc-skeleton" />
                  <div className="vc-skeleton is-short" />
                </div>
              </div>
            ) : !entryBundle ? (
              <div className="vc-article-measure vc-reader-placeholder">
                <Inbox size={30} />
                <h3>选择文章开始阅读</h3>
                <p>从左侧精选频道或个人订阅挑选内容，支持乔木改写、双语对照与 Floatboat 原生伴读。</p>
              </div>
            ) : (
              <article className="vc-article-measure">
                <header className="vc-article-header">
                  <h1 className="vc-article-headline">
                    {entryBundle.entry.link ? (
                      <a href={entryBundle.entry.link} target="_blank" rel="noopener noreferrer">
                        {entryBundle.entry.titleZh || entryBundle.entry.title}
                      </a>
                    ) : (
                      entryBundle.entry.titleZh || entryBundle.entry.title
                    )}
                  </h1>

                  <div className="vc-article-submeta">
                    <span className="vc-meta-strong">{entryBundle.entry.sourceName || entryBundle.entry.sourceId}</span>
                    {entryBundle.entry.published && (
                      <span>· {formatFullDate(entryBundle.entry.publishedTs || entryBundle.entry.published)}</span>
                    )}
                    {entryBundle.entry.author && <span>· {entryBundle.entry.author}</span>}
                    <span>· {VERSION_NAMES[activeVersion]}</span>
                  </div>
                </header>

                {entryBundle.entry.audio && (
                  <div className="vc-article-audio">
                    <Volume2 size={15} />
                    <audio controls src={entryBundle.entry.audio.url} />
                  </div>
                )}

                {bodyHtml ? (
                  <div
                    ref={proseRef}
                    className="vc-prose-stream"
                    onMouseUp={captureSelection}
                    onKeyUp={captureSelection}
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                  />
                ) : (
                  <div className="vc-empty-hint">
                    <span>这个版本暂无内容，可切换到其他版本阅读。</span>
                  </div>
                )}
              </article>
            )}
          </div>
        </main>
      </div>

      {pickerOpen && (
        <ChannelPicker
          sources={sources}
          mySubscriptions={mySubscriptions}
          current={channel}
          onSelect={handleSelectChannel}
          onClose={() => setPickerOpen(false)}
          onOpenAddModal={() => setAddFeedOpen(true)}
        />
      )}

      {appearanceOpen && (
        <ReadingAppearance settings={reading} onChange={applyReading} onClose={() => setAppearanceOpen(false)} />
      )}

      {addFeedOpen && (
        <AddFeedDialog
          onClose={() => setAddFeedOpen(false)}
          onAddSuccess={() => {
            void loadSources();
            showToast('已添加新订阅');
          }}
        />
      )}

      {toast && <div className="vc-toast">{toast}</div>}
    </div>
  );
}
