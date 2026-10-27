// ABOUTME: 轻量纯 TypeScript Markdown 渲染器（支持嵌套方括号的图片与链接、标题、列表、引用、代码、分隔线）

const NL = String.fromCharCode(10);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(https?:|mailto:|#|\/)/i.test(value)) return encodeURI(value);
  return null;
}

/** 从 start（指向 '['）开始，返回匹配的 ']' 下标，支持嵌套。 */
function matchBracket(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') { i++; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 解析 [label](target) / ![alt](target)，允许 label 内嵌套 []。 */
function parseLinks(text: string): string {
  let out = '';
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    const isImage = ch === '!' && text[i + 1] === '[';
    const isLink = ch === '[';

    if (!isImage && !isLink) {
      out += escapeHtml(ch);
      i++;
      continue;
    }

    const bracketStart = isImage ? i + 1 : i;
    const bracketEnd = matchBracket(text, bracketStart, '[', ']');
    if (bracketEnd === -1 || text[bracketEnd + 1] !== '(') {
      out += escapeHtml(ch);
      i++;
      continue;
    }

    const parenEnd = matchBracket(text, bracketEnd + 1, '(', ')');
    if (parenEnd === -1) {
      out += escapeHtml(ch);
      i++;
      continue;
    }

    const label = text.slice(bracketStart + 1, bracketEnd);
    const rawTarget = text.slice(bracketEnd + 2, parenEnd).trim();
    const titleMatch = rawTarget.match(/^(\S+)\s+"([^"]*)"$/);
    const target = titleMatch ? titleMatch[1] : rawTarget;
    const title = titleMatch ? titleMatch[2] : '';
    const url = safeUrl(target);

    if (!url) {
      out += isImage ? escapeHtml(label) : parseInline(label);
      i = parenEnd + 1;
      continue;
    }

    const titleAttr = title ? ' title="' + escapeHtml(title) + '"' : '';
    if (isImage) {
      out += '<img src="' + url + '" alt="' + escapeHtml(label) + '"' + titleAttr + ' loading="lazy" referrerpolicy="no-referrer" />';
    } else {
      out += '<a href="' + url + '"' + titleAttr + ' target="_blank" rel="noopener noreferrer">' + parseInline(label) + '</a>';
    }
    i = parenEnd + 1;
  }

  return out;
}

/** 行内代码优先切分，代码内部不再解析其它语法。 */
function parseInline(text: string): string {
  const segments = text.split(/(`[^`]+`)/g);
  return segments
    .map(segment => {
      if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
        return '<code>' + escapeHtml(segment.slice(1, -1)) + '</code>';
      }
      let s = parseLinks(segment);
      s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^\w*])\*([^*]+)\*(?=[^\w*]|$)/g, '$1<em>$2</em>');
      s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      return s;
    })
    .join('');
}

export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split(new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n'));
  const out: string[] = [];

  let inCode = false;
  let codeLang = '';
  let codeBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inQuote = false;

  const closeList = () => {
    if (listType) {
      out.push('</' + listType + '>');
      listType = null;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      out.push('</blockquote>');
      inQuote = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCode) {
        const cls = codeLang ? ' class="language-' + escapeHtml(codeLang) + '"' : '';
        out.push('<pre><code' + cls + '>' + escapeHtml(codeBuffer.join(NL)) + '</code></pre>');
        inCode = false;
        codeBuffer = [];
        codeLang = '';
      } else {
        closeList();
        closeQuote();
        inCode = true;
        codeLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (!trimmed) {
      closeList();
      closeQuote();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1].length;
      out.push('<h' + level + '>' + parseInline(heading[2].trim()) + '</h' + level + '>');
      continue;
    }

    if (/^(\*\s*){3,}$/.test(trimmed) || /^(-\s*){3,}$/.test(trimmed) || /^(_\s*){3,}$/.test(trimmed)) {
      closeList();
      closeQuote();
      out.push('<hr />');
      continue;
    }

    if (trimmed.startsWith('>')) {
      closeList();
      if (!inQuote) {
        out.push('<blockquote>');
        inQuote = true;
      }
      out.push('<p>' + parseInline(trimmed.replace(/^>\s?/, '')) + '</p>');
      continue;
    }
    closeQuote();

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      if (listType === 'ol') closeList();
      if (!listType) {
        out.push('<ul>');
        listType = 'ul';
      }
      out.push('<li>' + parseInline(bullet[1].trim()) + '</li>');
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      if (listType === 'ul') closeList();
      if (!listType) {
        out.push('<ol>');
        listType = 'ol';
      }
      out.push('<li>' + parseInline(ordered[1].trim()) + '</li>');
      continue;
    }

    closeList();
    out.push('<p>' + parseInline(trimmed) + '</p>');
  }

  if (inCode) {
    out.push('<pre><code>' + escapeHtml(codeBuffer.join(NL)) + '</code></pre>');
  }
  closeList();
  closeQuote();

  return out.join(NL);
}
