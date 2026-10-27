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

/** 阅读版本；与阅读器右上角切换器一致。 */
export type ReadingVersion = 'rewrite' | 'translation' | 'original';

/** 线上三份数据合成的一份阅读素材。 */
export interface OnlineBundle {
  entry: Entry;
  rewrite: RewriteData | null;
  translation: TranslationData | null;
}

/**
 * 当前阅读上下文：读者此刻看着的那篇文章。
 * `body` 是已选定版本的正文纯文本，Floatboat 对话与伴读提问都从这里取内容。
 */
export interface ReadingContextSnapshot {
  entryId: string;
  title: string;
  sourceName: string | null;
  link: string | null;
  author: string | null;
  published: string | null;
  version: ReadingVersion;
  body: string;
  bodyChars: number;
  updatedAt: number;
  /** 磁盘上的 Markdown 快照路径，Agent 可直接读取；写入失败为 null。 */
  file: string | null;
  /** 各版本是否有内容，前端用于展示。 */
  versions?: Record<ReadingVersion, boolean>;
}
