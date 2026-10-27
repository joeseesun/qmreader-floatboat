// ABOUTME: 移植自 Obsidian 插件的精选频道分组逻辑 (包含：聚合、微信公众号、播客、Newsletter、博客与资讯、社区)

import type { Source } from '../contracts/app.ts';

export const NEWSLETTER_SOURCE_IDS = new Set([
  'james-clear', 'bensbites', 'levelingup', 'tldrai', 'importai', 'nlp-elvis', 'interconnects',
  'brainfood', 'oneusefulthing', 'whytryai', 'chinai', 'dankoe', 'tylerfolkman',
  'superhuman_ai', 'aibreakfast', 'garymarcus', 'dwarkesh', 'experimental-history',
  'construction-physics', 'ds-ai-section',
]);

export const QIAOMU_DIVIDERS = ['微信公众号', '播客', 'Newsletter', '博客与资讯'] as const;

export function qiaomuChannelDivider(source: Source): string {
  let host = '';
  try {
    host = new URL(source.siteUrl || '').hostname.toLowerCase().replace(/^www\./, '');
  } catch { /* ignore */ }

  if (host === 'mp.weixin.qq.com' || source.id.startsWith('wechat-')) return '微信公众号';
  if (source.category === 'podcast' || host === 'xiaoyuzhoufm.com') return '播客';
  if (NEWSLETTER_SOURCE_IDS.has(source.id) || host.endsWith('.substack.com') || host.endsWith('.beehiiv.com') || host.startsWith('newsletter.') || /newsletter/i.test(source.name)) return 'Newsletter';
  return '博客与资讯';
}

export interface GroupedSections {
  聚合: Array<{ id: string; name: string; subtitle?: string; kind?: string }>;
  微信公众号: Source[];
  播客: Source[];
  Newsletter: Source[];
  博客与资讯: Source[];
  读者社区: Source[];
  我的订阅: Array<{ id: string; url: string; name: string }>;
}

export function groupSources(sources: Source[], mySubscriptions: Array<{ id: string; url: string; name: string }> = []): GroupedSections {
  const sections: GroupedSections = {
    聚合: [
      { id: 'qiaomu', name: '乔木精选', subtitle: '精选高质量内容', kind: 'curated' },
      { id: 'all', name: '全部文章', subtitle: '全量聚合时间线', kind: 'all' },
    ],
    微信公众号: [],
    播客: [],
    Newsletter: [],
    博客与资讯: [],
    读者社区: [],
    我的订阅: mySubscriptions,
  };

  for (const s of sources) {
    if (s.category === 'community') {
      sections.读者社区.push(s);
    } else {
      const divider = qiaomuChannelDivider(s);
      if (divider === '微信公众号') sections.微信公众号.push(s);
      else if (divider === '播客') sections.播客.push(s);
      else if (divider === 'Newsletter') sections.Newsletter.push(s);
      else sections.博客与资讯.push(s);
    }
  }

  return sections;
}
