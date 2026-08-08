// §8: link-fetching pipeline. Fetch the URL's HTML, run a light readability-
// style extraction (strip nav/ads/scripts/comments, keep the main body), and
// hand the cleaned text on as the next chat message — same extraction path as
// pasted text. Raw HTML wastes tokens and pollutes extraction, so it is never
// sent as-is.
//
// The extraction (extractReadableText) is pure and unit-tested; fetchAndExtract
// adds the network I/O and the §8 edge cases.
import { logger } from '../debug/logStore';

const FETCH_TIMEOUT_MS = 20_000;
// Below this many characters we assume the page was a JS-rendered empty shell
// (§8 edge case) rather than a real article we failed to parse.
const MIN_USEFUL_CHARS = 200;

const BLOCK_TAGS = ['script', 'style', 'noscript', 'template', 'svg', 'nav', 'header', 'footer', 'aside', 'form'];

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&mdash;': '—', '&ndash;': '–', '&hellip;': '…', '&deg;': '°', '&frac12;': '½', '&frac14;': '¼', '&frac34;': '¾',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&[a-z0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

export function extractReadableText(html: string): string {
  let text = html;

  // Prefer the <article> or <main> body when present — that's the recipe, not
  // the surrounding chrome.
  const article = /<article[\s>][\s\S]*?<\/article>/i.exec(html) ?? /<main[\s>][\s\S]*?<\/main>/i.exec(html);
  if (article) text = article[0];

  // Drop whole blocks whose content is never the recipe.
  for (const tag of BLOCK_TAGS) {
    text = text.replace(new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
    text = text.replace(new RegExp(`<${tag}[^>]*/>`, 'gi'), ' ');
  }
  // Strip HTML comments.
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  // Turn block-level boundaries into line breaks so the recipe keeps some shape.
  text = text.replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n• ');
  // Remove every remaining tag.
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);

  // Collapse whitespace: trim each line, drop empties, cap consecutive blanks.
  const lines = text
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l.length > 0);
  return lines.join('\n').trim();
}

export class LinkFetchError extends Error {}

export async function fetchAndExtract(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(normalized, {
      signal: controller.signal,
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
  } catch (error) {
    clearTimeout(timeout);
    logger.error('ui', 'Dishision Bot: link fetch failed', { url: normalized, error: String(error) });
    throw new LinkFetchError("Couldn't load that page. Check the link and your connection.");
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new LinkFetchError(`Couldn't load that page (HTTP ${response.status}).`);
  }
  const html = await response.text();
  const text = extractReadableText(html);
  if (text.length < MIN_USEFUL_CHARS) {
    // §8: JS-rendered empty-shell pages are out of scope for v1.
    throw new LinkFetchError("Couldn't read this page — it may need JavaScript to show its recipe. Try pasting the text instead.");
  }
  return text;
}

// The message actually sent into the chat: the cleaned text, framed so the bot
// treats it as source material to extract (§8 step 3).
export function linkMessage(url: string, extracted: string): string {
  return `Here's a recipe from ${url} — please extract it:\n\n${extracted}`;
}
