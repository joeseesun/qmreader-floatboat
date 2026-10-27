// ABOUTME: 伴读文本测试：版本回退、正文抽取、带正文的提问拼装

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PROMPT_BODY_CHARS,
  availableVersions,
  buildCompanionPrompt,
  buildContextMarkdown,
  htmlToText,
  resolveVersion,
  versionBody,
} from '../src/server/companion-text.ts';
import type { OnlineBundle, ReadingContextSnapshot } from '../src/contracts/app.ts';

function bundle(patch: Partial<OnlineBundle> = {}): OnlineBundle {
  return {
    entry: {
      id: 'e1',
      sourceId: 's1',
      title: 'Original Title',
      titleZh: '中文标题',
      sourceName: '乔木精选',
      link: 'https://example.com/a',
      published: '2026-10-27T11:02:57.000Z',
      content: '<p>原文第一段。</p><p>原文第二段 &amp; 收尾。</p>',
      summary: '摘要',
    },
    rewrite: { title: '中文标题', body: '改写第一段。\n\n- 要点一' },
    translation: {
      content: [
        { source: 'Para one', target: '第一段译文' },
        { source: 'Para two', targetHtml: '<p>第二段译文</p>' },
      ],
    },
    ...patch,
  };
}

describe('htmlToText', () => {
  it('drops tags, keeps paragraph breaks and decodes entities', () => {
    assert.equal(htmlToText('<p>a &amp; b</p><p>c&nbsp;d</p>'), 'a & b\n\nc d');
    assert.equal(htmlToText('<script>evil()</script>正文'), '正文');
    assert.equal(htmlToText('<ul><li>一</li><li>二</li></ul>'), '- 一\n\n- 二');
  });

  it('survives empty input', () => {
    assert.equal(htmlToText(''), '');
    assert.equal(htmlToText('plain text'), 'plain text');
  });
});

describe('version resolution', () => {
  it('reports which versions exist', () => {
    assert.deepEqual(availableVersions(bundle()), { rewrite: true, translation: true, original: true });
    assert.equal(availableVersions(bundle({ rewrite: null })).rewrite, false);
  });

  it('falls back when the requested version is missing', () => {
    assert.equal(resolveVersion(bundle(), 'translation'), 'translation');
    assert.equal(resolveVersion(bundle({ translation: null }), 'translation'), 'rewrite');
    assert.equal(resolveVersion(bundle({ translation: null, rewrite: null }), 'rewrite'), 'original');
  });

  it('extracts the matching body per version', () => {
    assert.equal(versionBody(bundle(), 'rewrite'), '改写第一段。\n\n- 要点一');
    assert.equal(versionBody(bundle(), 'translation'), '第一段译文\n\n第二段译文');
    assert.equal(versionBody(bundle(), 'original'), '原文第一段。\n\n原文第二段 & 收尾。');
  });
});

describe('companion prompt', () => {
  const base = {
    title: '中文标题',
    sourceName: '乔木精选',
    published: '2026-10-27T11:02:57.000Z',
    link: 'https://example.com/a',
    version: 'rewrite' as const,
    body: '改写第一段。\n\n- 要点一',
  };

  it('embeds the article body so the chat needs no lookup', () => {
    const text = buildCompanionPrompt({ ...base, prompt: '请总结这篇文章。' });
    assert.match(text, /^我在 Floatboat 的 QMReader 里读《中文标题》/);
    assert.match(text, /版本：乔木改写/);
    assert.ok(text.includes('改写第一段。\n\n- 要点一'));
    assert.ok(text.trimEnd().endsWith('请总结这篇文章。'));
  });

  it('quotes the selection and defaults to the passage prompt', () => {
    const text = buildCompanionPrompt({ ...base, selection: '要点一', prompt: null });
    assert.match(text, /> 要点一/);
    assert.match(text, /深入剖析这段话/);
  });

  it('truncates very long bodies and points at the snapshot file', () => {
    const text = buildCompanionPrompt({
      ...base,
      body: 'x'.repeat(MAX_PROMPT_BODY_CHARS + 500),
      prompt: '总结',
      contextFile: '/tmp/reading-context.md',
    });
    assert.ok(text.includes(`前 ${MAX_PROMPT_BODY_CHARS} 字`));
    assert.ok(text.includes('/tmp/reading-context.md'));
  });
});

describe('context markdown', () => {
  it('starts with the title and lists the metadata', () => {
    const snapshot: ReadingContextSnapshot = {
      entryId: 'e1',
      title: '中文标题',
      sourceName: '乔木精选',
      link: 'https://example.com/a',
      author: null,
      published: '2026-10-27T11:02:57.000Z',
      version: 'rewrite',
      body: '改写第一段。',
      bodyChars: 5,
      updatedAt: 1793107836853,
      file: null,
    };
    const markdown = buildContextMarkdown(snapshot);
    assert.match(markdown, /^# 中文标题/);
    assert.ok(markdown.includes('- 来源：乔木精选'));
    assert.ok(markdown.includes('- 阅读版本：乔木改写'));
    assert.ok(markdown.includes('改写第一段。'));
  });
});
