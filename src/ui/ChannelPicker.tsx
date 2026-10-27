// ABOUTME: 频道与订阅源选择浮层（Vercel/Geist 命令面板风格，含分类折叠与全量搜索）

import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Layers,
  Globe,
  Search,
  X,
  Check,
  Rss,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { groupSources } from './channel-groups.js';
import type { Source } from '../contracts/app.ts';

type SectionKey = '微信公众号' | '播客' | 'Newsletter' | '博客与资讯' | '读者社区';

const SECTIONS: SectionKey[] = ['微信公众号', '播客', 'Newsletter', '博客与资讯', '读者社区'];

function stripProtocol(value: string): string {
  return value.replace(new RegExp('^https?://'), '').replace(new RegExp('/$'), '');
}

export function ChannelPicker({
  sources,
  mySubscriptions = [],
  current,
  onSelect,
  onClose,
  onOpenAddModal,
}: {
  sources: Source[];
  mySubscriptions?: Array<{ id: string; url: string; name: string }>;
  current: string;
  onSelect: (key: string) => void;
  onClose: () => void;
  onOpenAddModal?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    微信公众号: true,
    播客: true,
    Newsletter: true,
    博客与资讯: true,
    读者社区: true,
  });

  const grouped = useMemo(() => groupSources(sources, mySubscriptions), [sources, mySubscriptions]);
  const isSearching = query.trim().length > 0;

  const totalCount = useMemo(() => {
    return SECTIONS.reduce((sum, key) => sum + grouped[key].length, 0) + mySubscriptions.length;
  }, [grouped, mySubscriptions]);

  const results = useMemo(() => {
    if (!isSearching) return [];
    const q = query.trim().toLowerCase();
    const out: Array<{ id: string; name: string; subtitle: string; section: string }> = [];

    for (const item of grouped.聚合) {
      if (item.name.toLowerCase().includes(q) || (item.subtitle ?? '').toLowerCase().includes(q)) {
        out.push({ id: item.id, name: item.name, subtitle: item.subtitle ?? '', section: '聚合' });
      }
    }
    for (const key of SECTIONS) {
      for (const s of grouped[key]) {
        if (s.name.toLowerCase().includes(q) || (s.siteUrl ?? '').toLowerCase().includes(q)) {
          out.push({ id: s.id, name: s.name, subtitle: s.siteUrl ? stripProtocol(s.siteUrl) : s.id, section: key });
        }
      }
    }
    for (const sub of mySubscriptions) {
      if (sub.name.toLowerCase().includes(q) || sub.url.toLowerCase().includes(q)) {
        out.push({ id: sub.id, name: sub.name, subtitle: stripProtocol(sub.url), section: '个人订阅' });
      }
    }
    return out;
  }, [grouped, isSearching, query, mySubscriptions]);

  const pick = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <div className="vc-dialog-backdrop" onClick={onClose}>
      <div className="vc-dialog" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="vc-dialog-header">
          <div className="vc-dialog-title-group">
            <h3 className="vc-dialog-title">切换频道</h3>
            <span className="vc-dialog-subtitle">{totalCount} 个线上频道与个人订阅</span>
          </div>
          <button type="button" className="vc-btn-ghost vc-btn-icon" onClick={onClose} aria-label="关闭">
            <X size={15} />
          </button>
        </div>

        <div className="vc-search-wrapper">
          <Search size={14} className="vc-search-icon" />
          <input
            type="search"
            placeholder="搜索频道、公众号、播客或订阅源"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button type="button" className="vc-search-clear" onClick={() => setQuery('')} aria-label="清空搜索">
              <X size={11} />
            </button>
          )}
        </div>

        <div className="vc-dialog-body">
          {isSearching ? (
            results.length > 0 ? (
              <div className="vc-section-items">
                {results.map(item => (
                  <button
                    key={`${item.section}-${item.id}`}
                    type="button"
                    className={`vc-channel-item${current === item.id ? ' is-active' : ''}`}
                    onClick={() => pick(item.id)}
                  >
                    <span className="vc-channel-icon">
                      {item.section === '聚合' ? <Sparkles size={13} /> : item.section === '个人订阅' ? <Rss size={13} /> : <Globe size={13} />}
                    </span>
                    <span className="vc-channel-text">
                      <span className="vc-channel-name">{item.name}</span>
                      <span className="vc-channel-sub">{item.section} · {item.subtitle}</span>
                    </span>
                    {current === item.id && <Check size={14} className="vc-channel-check" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="vc-empty-hint">没有匹配的频道</div>
            )
          ) : (
            <>
              <div className="vc-section-group">
                <div className="vc-section-label">
                  <span className="vc-section-title">聚合</span>
                </div>
                <div className="vc-section-items">
                  {grouped.聚合.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`vc-channel-item${current === item.id ? ' is-active' : ''}`}
                      onClick={() => pick(item.id)}
                    >
                      <span className="vc-channel-icon">
                        {item.id === 'qiaomu' ? <Sparkles size={13} /> : <Layers size={13} />}
                      </span>
                      <span className="vc-channel-text">
                        <span className="vc-channel-name">{item.name}</span>
                        <span className="vc-channel-sub">{item.subtitle}</span>
                      </span>
                      {current === item.id && <Check size={14} className="vc-channel-check" />}
                    </button>
                  ))}
                </div>
              </div>

              {SECTIONS.map(key => {
                const list = grouped[key];
                if (!list.length) return null;
                const isCollapsed = Boolean(collapsed[key]);
                return (
                  <div key={key} className="vc-section-group">
                    <button
                      type="button"
                      className="vc-section-label is-clickable"
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <span className="vc-section-arrow">
                        {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                      </span>
                      <span className="vc-section-title">{key}</span>
                      <span className="vc-section-count">{list.length}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="vc-section-items">
                        {list.map(source => (
                          <button
                            key={source.id}
                            type="button"
                            className={`vc-channel-item${current === source.id ? ' is-active' : ''}`}
                            onClick={() => pick(source.id)}
                          >
                            <span className="vc-channel-dot" aria-hidden="true" />
                            <span className="vc-channel-text">
                              <span className="vc-channel-name">{source.name}</span>
                              {source.siteUrl && <span className="vc-channel-sub">{stripProtocol(source.siteUrl)}</span>}
                            </span>
                            {current === source.id && <Check size={14} className="vc-channel-check" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {mySubscriptions.length > 0 && (
                <div className="vc-section-group">
                  <div className="vc-section-label">
                    <span className="vc-section-title">个人订阅</span>
                    <span className="vc-section-count">{mySubscriptions.length}</span>
                  </div>
                  <div className="vc-section-items">
                    {mySubscriptions.map(sub => (
                      <button
                        key={sub.id}
                        type="button"
                        className={`vc-channel-item${current === sub.id ? ' is-active' : ''}`}
                        onClick={() => pick(sub.id)}
                      >
                        <span className="vc-channel-icon"><Rss size={13} /></span>
                        <span className="vc-channel-text">
                          <span className="vc-channel-name">{sub.name}</span>
                          <span className="vc-channel-sub">{stripProtocol(sub.url)}</span>
                        </span>
                        {current === sub.id && <Check size={14} className="vc-channel-check" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="vc-dialog-footer">
          {onOpenAddModal && (
            <button
              type="button"
              className="vc-btn-secondary"
              onClick={() => {
                onClose();
                onOpenAddModal();
              }}
            >
              <Rss size={13} />
              添加订阅
            </button>
          )}
          <button type="button" className="vc-btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
