// ABOUTME: 添加个人 RSS 订阅弹窗（Vercel/Geist 极简表单）

import React, { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { pageConnection } from './connection.js';

export function AddFeedDialog({
  onClose,
  onAddSuccess,
}: {
  onClose: () => void;
  onAddSuccess: () => void;
}) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError('');

    try {
      const page = await pageConnection;
      const res = await page.fetch('/api/v1/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        onAddSuccess();
        onClose();
      } else {
        setError(data.error || '添加失败，请检查链接是否有效');
      }
    } catch {
      setError('网络请求失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vc-dialog-backdrop" onClick={onClose}>
      <div className="vc-dialog is-modal-sm" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="vc-dialog-header">
          <div className="vc-dialog-title-group">
            <h3 className="vc-dialog-title">添加个人订阅</h3>
            <span className="vc-dialog-subtitle">支持标准 RSS / Atom 地址</span>
          </div>
          <button type="button" className="vc-btn-ghost vc-btn-icon" onClick={onClose} aria-label="关闭">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="vc-dialog-form">
          {error && <div className="vc-form-error">{error}</div>}

          <div className="vc-field-group">
            <label className="vc-label" htmlFor="vc-feed-url">订阅地址</label>
            <input
              id="vc-feed-url"
              type="url"
              className="vc-input"
              placeholder="https://example.com/feed.xml"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="vc-field-group">
            <label className="vc-label" htmlFor="vc-feed-name">显示名称（可选）</label>
            <input
              id="vc-feed-name"
              type="text"
              className="vc-input"
              placeholder="留空则自动读取域名"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="vc-dialog-footer">
            <button type="button" className="vc-btn-secondary" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="vc-btn-primary" disabled={busy || !url.trim()}>
              {busy ? '正在订阅' : '确认添加'}
              <ArrowRight size={13} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
