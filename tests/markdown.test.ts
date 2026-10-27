import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownToHtml } from '../src/ui/markdown.ts';

describe('markdown renderer', () => {
  it('renders an image whose alt text contains brackets', () => {
    const md = '![[AINews] Anthropic files for $2T IPO](https://example.com/a.webp)';
    const html = renderMarkdownToHtml(md);
    assert.match(html, /<img src="https:\/\/example.com\/a.webp"/);
    assert.match(html, /alt="\[AINews\] Anthropic files for \$2T IPO"/);
    assert.doesNotMatch(html, /!\[\[AINews\]/);
  });

  it('renders inline links and keeps surrounding text', () => {
    const html = renderMarkdownToHtml('\u4f46\u8fd9\u4efd [S-1](https://example.com/s1) \u6709 350 \u591a\u9875');
    assert.match(html, /<a href="https:\/\/example.com\/s1" target="_blank" rel="noopener noreferrer">S-1<\/a>/);
  });

  it('renders headings, bold, lists, quotes and code fences', () => {
    const md = [
      '## \u6807\u9898',
      '**\u52a0\u7c97** \u6b63\u6587',
      '- \u7b2c\u4e00\u9879',
      '- \u7b2c\u4e8c\u9879',
      '> \u5f15\u7528',
      '```js',
      'const a = 1 < 2;',
      '```',
    ].join(String.fromCharCode(10));
    const html = renderMarkdownToHtml(md);
    assert.match(html, /<h2>/);
    assert.match(html, /<strong>/);
    assert.match(html, /<ul>[\s\S]*<li>/);
    assert.match(html, /<blockquote>/);
    assert.match(html, /<pre><code class="language-js">/);
    assert.match(html, /const a = 1 &lt; 2;/);
  });

  it('escapes raw html and rejects unsafe urls', () => {
    const html = renderMarkdownToHtml('<script>alert(1)</script> [x](javascript:alert(1))');
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /javascript:/);
  });
});
