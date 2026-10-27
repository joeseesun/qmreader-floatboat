// ABOUTME: 伴读文本纯函数：版本正文抽取、上下文 Markdown、带正文的伴读提问

import type { OnlineBundle, ReadingContextSnapshot, ReadingVersion } from '../contracts/app.ts';

export const VERSION_LABELS: Record<ReadingVersion, string> = {
  rewrite: '乔木改写',
  translation: '中文翻译',
  original: '原文',
};

/** 正文入库上限：覆盖长文，又不至于让一次读入塞满对话上下文。 */
export const MAX_STORED_CHARS = 80_000;

/** 贴进对话的正文上限；超出时截断并提示去读快照文件。 */
export const MAX_PROMPT_BODY_CHARS = 24_000;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&#x2F;': '/',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
};

/** 线上原文是 HTML，转成阅读器之外的纯文本前先去掉标签与实体。 */
export function htmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(new RegExp('<script[\\s\\S]*?</script>', 'gi'), '')
    .replace(new RegExp('<style[\\s\\S]*?</style>', 'gi'), '')
    .replace(new RegExp('<br\\s*/?>', 'gi'), '\n')
    .replace(new RegExp('</(p|div|section|article|header|footer|h[1-6]|li|blockquote|tr|figure)>', 'gi'), '\n\n')
    .replace(new RegExp('<li[^>]*>', 'gi'), '- ')
    .replace(new RegExp('<[^>]+>', 'g'), '')
    .replace(/&#(\d+);/g, (_all, code: string) => String.fromCharCode(Number(code)))
    .replace(new RegExp(Object.keys(ENTITIES).join('|'), 'g'), match => ENTITIES[match] ?? match)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 三个版本里哪些真的有内容。原文永远可用（至少有摘要）。 */
export function availableVersions(bundle: OnlineBundle): Record<ReadingVersion, boolean> {
  return {
    rewrite: Boolean(bundle.rewrite?.body?.trim()),
    translation: Boolean(bundle.translation?.content?.some(pair => (pair.target || pair.targetHtml || '').trim())),
    original: Boolean(bundle.entry.content?.trim() || bundle.entry.summary?.trim()),
  };
}

/** 请求的版本缺失时按「改写 → 翻译 → 原文」回退，永远返回一个可用版本。 */
export function resolveVersion(bundle: OnlineBundle, requested?: string | null): ReadingVersion {
  const has = availableVersions(bundle);
  if (requested === 'rewrite' && has.rewrite) return 'rewrite';
  if (requested === 'translation' && has.translation) return 'translation';
  if (requested === 'original' && has.original) return 'original';
  if (has.rewrite) return 'rewrite';
  if (has.translation) return 'translation';
  return 'original';
}

/** 取出某一版本的正文；翻译按 target 段落拼接，原文去 HTML。 */
export function versionBody(bundle: OnlineBundle, version: ReadingVersion): string {
  if (version === 'rewrite' && bundle.rewrite?.body) {
    return bundle.rewrite.body.trim();
  }
  if (version === 'translation') {
    const pairs = bundle.translation?.content ?? [];
    const text = pairs
      .map(pair => htmlToText(pair.targetHtml || pair.target || ''))
      .filter(Boolean)
      .join('\n\n');
    if (text) return text;
  }
  return htmlToText(bundle.entry.content || bundle.entry.summary || '');
}

export function articleTitle(bundle: OnlineBundle): string {
  return (bundle.entry.titleZh || bundle.entry.title || '未命名文章').trim();
}

function clipBody(body: string, maxChars: number): { text: string; truncated: boolean } {
  const text = body.trim();
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars).trimEnd(), truncated: true };
}

function formatPublished(published: string | null | undefined): string {
  if (!published) return '';
  const ts = Number(published);
  const date = Number.isFinite(ts) && String(ts).length >= 12 ? new Date(ts) : new Date(published);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 落盘的 Markdown 快照：人可读，Agent 也可直接读。 */
export function buildContextMarkdown(context: ReadingContextSnapshot): string {
  const lines: string[] = [];
  lines.push(`# ${context.title}`);
  lines.push('');
  lines.push(`- 来源：${context.sourceName || '未知频道'}`);
  if (context.author) lines.push(`- 作者：${context.author}`);
  if (context.published) lines.push(`- 发布：${formatPublished(context.published)}`);
  if (context.link) lines.push(`- 原文：${context.link}`);
  lines.push(`- 阅读版本：${VERSION_LABELS[context.version]}`);
  lines.push(`- 正文字数：约 ${context.bodyChars} 字`);
  lines.push(`- 抓取时间：${formatPublished(String(context.updatedAt))}（QMReader 工作台）`);
  lines.push('');
  lines.push('## 正文');
  lines.push('');
  lines.push(context.body);
  lines.push('');
  return lines.join('\n');
}

export interface CompanionPromptInput {
  title: string;
  sourceName?: string | null;
  author?: string | null;
  published?: string | null;
  link?: string | null;
  version: ReadingVersion;
  body: string;
  selection?: string | null;
  prompt?: string | null;
  /** 贴进对话的正文上限，默认 MAX_PROMPT_BODY_CHARS。 */
  maxBodyChars?: number;
  /** 是否有落盘快照，可提示 Agent 读全文。 */
  contextFile?: string | null;
}

const DEFAULT_FULL_ARTICLE_PROMPT = '请先一句话说清这篇文章在讲什么，再分点总结核心信息、关键数据和值得注意的细节。';
const DEFAULT_SELECTION_PROMPT = '请结合整篇文章的上下文，深入剖析这段话在讲什么、为什么重要。';

/**
 * 生成贴进 Floatboat 对话的完整提问：元信息 + 正文 + 问题。
 * 正文直接内嵌，对话不必再回查任何接口。
 */
export function buildCompanionPrompt(input: CompanionPromptInput): string {
  const { text, truncated } = clipBody(input.body, input.maxBodyChars ?? MAX_PROMPT_BODY_CHARS);
  const meta: string[] = [];
  meta.push(`来源：${input.sourceName || '乔木 RSS'}`);
  if (input.author) meta.push(`作者：${input.author}`);
  if (input.published) meta.push(`发布：${formatPublished(input.published)}`);
  meta.push(`版本：${VERSION_LABELS[input.version]}`);
  if (input.link) meta.push(`原文：${input.link}`);

  const blocks: string[] = [];
  blocks.push(`我在 Floatboat 的 QMReader 里读《${input.title}》，正文如下，请基于正文回答。`);
  blocks.push(meta.join(' · '));

  if (input.selection?.trim()) {
    blocks.push(['我选中的段落：', `> ${input.selection.trim().split('\n').join('\n> ')}`].join('\n'));
  }

  blocks.push(['正文（' + `${text.length}` + ' 字）：', '', text].join('\n'));
  if (truncated) {
    blocks.push(
      `正文较长，上文只贴了前 ${text.length} 字。${
        input.contextFile ? `完整正文已存在 ${input.contextFile}，可自行读取。` : ''
      }`.trim(),
    );
  }

  blocks.push(input.prompt?.trim() || (input.selection?.trim() ? DEFAULT_SELECTION_PROMPT : DEFAULT_FULL_ARTICLE_PROMPT));
  return blocks.join('\n\n');
}
