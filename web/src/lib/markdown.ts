import { Marked } from 'marked';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Raw HTML in recipe bodies is shown as text, never injected into the page.
const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }) => escape(text),
    image: ({ href, title, text }) =>
      `<img src="${escape(href)}" alt="${escape(text)}"${title ? ` title="${escape(title)}"` : ''} loading="lazy" decoding="async">`,
    link: ({ href, text }) =>
      /^(https?:|mailto:|\/)/.test(href) ? `<a href="${escape(href)}" rel="noopener">${text}</a>` : text,
  },
});

export const renderMarkdown = (md: string) => marked.parse(md, { async: false }) as string;
