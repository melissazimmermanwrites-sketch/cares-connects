export type MarkdownAction = 'heading' | 'bold' | 'italic' | 'link' | 'bullets' | 'numbers' | 'quote';

export interface MarkdownEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Wraps the selection, leaving placeholder text selected when nothing was selected. */
function wrap(text: string, start: number, end: number, before: string, after: string, placeholder: string): MarkdownEdit {
  const selected = text.slice(start, end) || placeholder;
  return {
    text: text.slice(0, start) + before + selected + after + text.slice(end),
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  };
}

/** Adds a prefix to every line the selection touches. */
function prefixLines(text: string, start: number, end: number, prefix: (line: number) => string): MarkdownEdit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = text.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text
    .slice(lineStart, lineEnd)
    .split('\n')
    .map((line, i) => prefix(i) + line)
    .join('\n');
  return { text: text.slice(0, lineStart) + lines + text.slice(lineEnd), selectionStart: lineStart, selectionEnd: lineStart + lines.length };
}

export function applyMarkdownAction(text: string, start: number, end: number, action: MarkdownAction): MarkdownEdit {
  switch (action) {
    case 'bold':
      return wrap(text, start, end, '**', '**', 'bold text');
    case 'italic':
      return wrap(text, start, end, '_', '_', 'italic text');
    case 'link': {
      const selected = text.slice(start, end) || 'link text';
      const before = `${text.slice(0, start)}[${selected}](`;
      const url = 'https://';
      return { text: `${before}${url})${text.slice(end)}`, selectionStart: before.length, selectionEnd: before.length + url.length };
    }
    case 'heading':
      return prefixLines(text, start, end, () => '## ');
    case 'bullets':
      return prefixLines(text, start, end, () => '- ');
    case 'numbers':
      return prefixLines(text, start, end, (i) => `${i + 1}. `);
    case 'quote':
      return prefixLines(text, start, end, () => '> ');
  }
}
