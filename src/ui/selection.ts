// ABOUTME: 移植自 qiaomu-rss-dsh 的文本选区锚定与高亮算法 (selection.js)

export interface SelectedPassage {
  quote: string;
  prefix: string;
  suffix: string;
}

export function selectedPassage(root: HTMLElement | null, selection: Selection | null = window.getSelection()): SelectedPassage | null {
  if (!root || !selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const quote = selection.toString().trim();
  if (!quote || quote.length > 6000) return null;
  const before = range.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const offset = before.toString().length;
  return {
    quote,
    prefix: (root.textContent || '').slice(Math.max(0, offset - 40), offset),
    suffix: (root.textContent || '').slice(offset + selection.toString().length, offset + selection.toString().length + 40),
  };
}
