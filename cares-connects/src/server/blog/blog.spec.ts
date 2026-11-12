import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';
import { detectImageType } from './media';
import { cleanCategories, MAX_SEARCH_WORDS, searchWords } from '../../shared/blog';

describe('renderMarkdown', () => {
  it('renders ordinary Markdown', () => {
    const html = renderMarkdown('## Hello\n\nSome **bold** text.\n\n- one\n- two');
    expect(html).toContain('<h2>Hello</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<li>one</li>');
  });

  it('shows raw HTML as text instead of running it', () => {
    for (const source of ['<script>alert(1)</script>', 'Hi <img src=x onerror=alert(1)> there', '<iframe src="https://evil.example"></iframe>']) {
      const html = renderMarkdown(source);
      expect(html, source).not.toMatch(/<(script|img|iframe)/);
      expect(html, source).toContain('&lt;');
    }
  });

  it('drops unsafe links but keeps their text', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'java&#115;cript:alert(1)']) {
      const html = renderMarkdown(`[click](${href})`);
      expect(html, href).not.toContain('<a');
      expect(html, href).toContain('click');
    }
  });

  it('keeps safe links, and opens outside ones in a new tab', () => {
    expect(renderMarkdown('[a](https://example.org)')).toContain('<a href="https://example.org" target="_blank" rel="noopener">a</a>');
    expect(renderMarkdown('[a](/find)')).toContain('<a href="/find">a</a>');
    expect(renderMarkdown('[a](mailto:hi@example.org)')).toContain('href="mailto:hi@example.org"');
    expect(renderMarkdown('[a](tel:988)')).toContain('href="tel:988"');
  });

  it('escapes attributes so they cannot break out', () => {
    const html = renderMarkdown('[a](https://example.org "x\\" onmouseover=\\"alert(1)")');
    expect(html).not.toContain('" onmouseover');
    expect(html).toContain('&quot;');
    const image = renderMarkdown('![x" onerror="alert(1)](/media/abc)');
    expect(image).not.toContain('" onerror');
  });

  it('only allows uploaded or https images', () => {
    expect(renderMarkdown('![cat](/media/abc)')).toContain('<img src="/media/abc" alt="cat"');
    expect(renderMarkdown('![cat](https://example.org/a.png)')).toContain('<img src="https://example.org/a.png"');
    for (const src of ['http://example.org/a.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>']) {
      expect(renderMarkdown(`![cat](${src})`), src).not.toContain('<img');
    }
  });
});

describe('detectImageType', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it('goes by the file contents', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(detectImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('image/gif');
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp');
  });
  it('rejects everything else, including SVG and HTML', () => {
    const text = (s: string) => new TextEncoder().encode(s);
    expect(detectImageType(text('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(detectImageType(text('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectImageType(bytes())).toBeNull();
  });
});

describe('cleanCategories', () => {
  it('trims, drops blanks, and keeps the first spelling of a repeat', () => {
    expect(cleanCategories([' Mental  Health ', '', 'mental health', 'Nonprofit', '  '])).toEqual(['Mental Health', 'Nonprofit']);
  });
});

describe('searchWords', () => {
  it('splits on spaces and commas, lowercases, and drops repeats', () => {
    expect(searchWords('Food  help, Lincoln food')).toEqual(['food', 'help', 'lincoln']);
  });

  it('trims punctuation around words but keeps it inside them', () => {
    expect(searchWords('"rent-help"? (Roseville).')).toEqual(['rent-help', 'roseville']);
  });

  it('returns nothing for blank or punctuation-only input', () => {
    expect(searchWords('   ')).toEqual([]);
    expect(searchWords('!!! ...')).toEqual([]);
  });

  it('caps the number of words', () => {
    expect(searchWords('a b c d e f g h')).toHaveLength(MAX_SEARCH_WORDS);
  });

  it('keeps LIKE wildcards as ordinary characters for the caller to escape', () => {
    expect(searchWords('50% off_')).toEqual(['50', 'off']);
    expect(searchWords('a%b c_d')).toEqual(['a%b', 'c_d']);
  });
});
