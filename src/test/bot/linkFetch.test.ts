import { describe, expect, it } from 'vitest';
import { extractReadableText } from '../../bot/linkFetch';

describe('extractReadableText (§8)', () => {
  it('keeps the article body and drops nav/script/footer', () => {
    const html = `
      <html><head><style>.x{}</style></head><body>
      <nav>Home About Contact</nav>
      <script>trackEverything()</script>
      <article>
        <h1>Green Curry</h1>
        <ul><li>200g chicken</li><li>1 can coconut milk</li></ul>
        <p>Fry the paste. Add chicken.</p>
      </article>
      <footer>Copyright 2026</footer>
      </body></html>`;
    const text = extractReadableText(html);
    expect(text).toContain('Green Curry');
    expect(text).toContain('200g chicken');
    expect(text).toContain('Fry the paste');
    expect(text).not.toContain('Home About Contact');
    expect(text).not.toContain('trackEverything');
    expect(text).not.toContain('Copyright');
  });

  it('decodes HTML entities', () => {
    const html = '<article><p>Salt &amp; pepper &mdash; 1&frac12; tsp</p></article>';
    const text = extractReadableText(html);
    expect(text).toContain('Salt & pepper — 1½ tsp');
  });

  it('collapses whitespace and preserves list/line structure', () => {
    const html = '<article><p>Step one</p><p>Step two</p></article>';
    const text = extractReadableText(html);
    expect(text).toBe('Step one\nStep two');
  });
});
