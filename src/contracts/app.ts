// ABOUTME: 乔木 RSS 线上 API 客户端与数据代理 (直接代理 https://rss.qiaomu.ai，本地零抓取)

export interface Source {
  id: string;
  name: string;
  category?: string | null;
  siteUrl?: string | null;
  enabled?: boolean;
}

export interface Entry {
  id: string;
  sourceId: string;
  sourceName?: string | null;
  title: string;
  titleZh?: string | null;
  link?: string | null;
  author?: string | null;
  published?: string | null;
  publishedTs?: number | null;
  summary?: string | null;
  summaryZh?: string | null;
  content?: string | null;
  image?: string | null;
  hasRewrite?: boolean;
  isRead?: boolean;
  isFavorite?: boolean;
  audio?: { url: string; type?: string | null } | null;
  rewrite?: RewriteData | null;
}

export interface RewriteData {
  title?: string | null;
  body: string;
}

export interface TranslationItem {
  source?: string | null;
  target?: string | null;
  sourceHtml?: string | null;
  targetHtml?: string | null;
}

export interface TranslationData {
  titleZh?: string | null;
  summaryZh?: string | null;
  content?: TranslationItem[] | null;
}

export interface EntryBundle {
  entry: Entry;
  rewrite: RewriteData | null;
  translation: TranslationData | null;
}

export interface AppInfo {
  name: string;
  version: string;
}
