// ABOUTME: Vercel 极简几何风格的阅读设置弹窗 (ReadingAppearance.tsx)

import React from 'react';
import { FONTS, TEXT_WIDTHS, THEMES, READING_DEFAULTS, type ReadingSettings } from './reading-settings.js';
import { X, RotateCcw } from 'lucide-react';

export function ReadingAppearance({
  settings,
  onChange,
  onClose,
}: {
  settings: ReadingSettings;
  onChange: (patch: Partial<ReadingSettings>) => void;
  onClose: () => void;
}) {
  return (
    <div className="vc-popover" role="dialog" aria-label="阅读设置">
      <div className="vc-popover-header">
        <span className="vc-popover-title">排版与外观</span>
        <button type="button" className="vc-btn-ghost vc-btn-icon" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="vc-popover-body">
        {/* 字体选择 */}
        <div className="vc-setting-row">
          <span className="vc-setting-label">排版字体</span>
          <select
            className="vc-select"
            value={settings.readingFont}
            onChange={e => onChange({ readingFont: e.target.value as ReadingSettings['readingFont'] })}
          >
            {Object.entries(FONTS).map(([val, font]) => (
              <option key={val} value={val}>{font.label}</option>
            ))}
          </select>
        </div>

        {/* 字号滑块 */}
        <div className="vc-setting-row is-stacked">
          <div className="vc-setting-label-split">
            <span>字号大小</span>
            <span className="vc-setting-num">{settings.fontSize} px</span>
          </div>
          <input
            type="range"
            className="vc-range"
            min="14"
            max="32"
            step="1"
            value={settings.fontSize}
            onChange={e => onChange({ fontSize: Number(e.target.value) })}
          />
        </div>

        {/* 行高滑块 */}
        <div className="vc-setting-row is-stacked">
          <div className="vc-setting-label-split">
            <span>行距比例</span>
            <span className="vc-setting-num">{settings.lineHeight.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            className="vc-range"
            min="1.5"
            max="2.4"
            step="0.1"
            value={settings.lineHeight}
            onChange={e => onChange({ lineHeight: Number(e.target.value) })}
          />
        </div>

        {/* 版心宽度 */}
        <div className="vc-setting-row">
          <span className="vc-setting-label">正文版心</span>
          <select
            className="vc-select"
            value={settings.textWidth}
            onChange={e => onChange({ textWidth: Number(e.target.value) })}
          >
            {TEXT_WIDTHS.map(w => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>

        {/* 阅读主题 */}
        <div className="vc-setting-row">
          <span className="vc-setting-label">底色质感</span>
          <select
            className="vc-select"
            value={settings.readingTheme}
            onChange={e => onChange({ readingTheme: e.target.value as ReadingSettings['readingTheme'] })}
          >
            <option value="auto">跟随系统</option>
            <option value="light">极简白</option>
            <option value="paper">暖色纸质</option>
            <option value="sage">淡雅青绿</option>
            <option value="mist">冷杉雾蓝</option>
            <option value="dark">沉浸深灰</option>
            <option value="black">纯黑极夜</option>
          </select>
        </div>

        {/* 默认版本 */}
        <div className="vc-setting-row">
          <span className="vc-setting-label">优先模式</span>
          <select
            className="vc-select"
            value={settings.defaultVersion}
            onChange={e => onChange({ defaultVersion: e.target.value as ReadingSettings['defaultVersion'] })}
          >
            <option value="rewrite">乔木改写</option>
            <option value="translation">中文翻译</option>
            <option value="original">英文原文</option>
          </select>
        </div>
      </div>

      <div className="vc-popover-footer">
        <button
          type="button"
          className="vc-btn-ghost vc-btn-reset"
          onClick={() => onChange({ ...READING_DEFAULTS })}
        >
          <RotateCcw size={12} />
          <span>重置默认</span>
        </button>
      </div>
    </div>
  );
}
