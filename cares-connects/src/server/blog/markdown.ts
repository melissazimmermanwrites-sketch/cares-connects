import { Marked, type Tokens } from 'marked';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Anything else, including javascript: and data: in any disguise, doesn't become a link. */
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/|#)[^\s\u0000-\u001f]*$/i;
const SAFE_IMAGE = /^(https:\/\/|\/media\/)[^\s\u0000-\u001f]*$/i;

const markdown = new Marked({
  gfm: true,
  renderer: {
    // Posts are Markdown. Any HTML typed into one shows as plain text rather than running.
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      if (!SAFE_LINK.test(href.trim())) return text;
      const external = /^https?:\/\//i.test(href.trim());
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      const newTab = external ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${escapeHtml(href.trim())}"${titleAttr}${newTab}>${text}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      if (!SAFE_IMAGE.test(href.trim())) return escapeHtml(text);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(href.trim())}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy" />`;
    },
  },
});

export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false });
}
