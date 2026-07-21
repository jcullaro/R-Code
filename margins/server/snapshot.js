'use strict';

// Fetches a URL and produces a single-file HTML snapshot that preserves the
// original formatting: linked stylesheets are inlined, images are embedded as
// data URIs (up to a size cap) or rewritten to absolute URLs, and all scripts
// are stripped so the saved page is inert.

const { JSDOM } = require('jsdom');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MAX_INLINE_ASSET = 400 * 1024; // per-asset cap for data-URI embedding
const MAX_TOTAL_INLINE = 15 * 1024 * 1024; // total embedded budget per snapshot
const FETCH_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: '*/*', ...(opts.headers || {}) },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function absolutize(u, base) {
  try {
    return new URL(u, base).href;
  } catch {
    return null;
  }
}

// Rewrite url(...) references inside CSS text to absolute URLs.
function absolutizeCssUrls(css, base) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
    if (/^(data:|#)/.test(ref)) return m;
    const abs = absolutize(ref.trim(), base);
    return abs ? `url("${abs}")` : m;
  });
}

// Resolve @import rules one level deep, then absolutize remaining urls.
async function inlineCss(cssText, base, budget) {
  let css = cssText;
  const importRe = /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)['"]?\s*\)?\s*([^;]*);/g;
  const imports = [...css.matchAll(importRe)];
  for (const m of imports) {
    const abs = absolutize(m[1], base);
    if (!abs) continue;
    try {
      const res = await fetchWithTimeout(abs);
      if (res.ok) {
        const sub = absolutizeCssUrls(await res.text(), abs);
        // Preserve media-query condition if the @import had one.
        const cond = (m[2] || '').trim();
        css = css.replace(m[0], cond ? `@media ${cond} { ${sub} }` : sub);
        continue;
      }
    } catch {
      /* keep original @import as absolute url */
    }
    css = css.replace(m[0], `@import url("${abs}");`);
  }
  return absolutizeCssUrls(css, base);
}

async function assetToDataUri(url, budget) {
  if (budget.used >= MAX_TOTAL_INLINE) return null;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_INLINE_ASSET || budget.used + buf.length > MAX_TOTAL_INLINE) return null;
    budget.used += buf.length;
    const type = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0];
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const STRIP_SELECTORS = [
  'script',
  'noscript',
  'link[rel="preload"]',
  'link[rel="prefetch"]',
  'link[rel="modulepreload"]',
  'link[rel="dns-prefetch"]',
  'link[rel="preconnect"]',
  'link[rel="manifest"]',
  'iframe',
  'embed',
  'object',
];

// Sanitize + inline a DOM in place. `base` is the page's URL.
async function processDocument(document, base) {
  const budget = { used: 0 };

  for (const sel of STRIP_SELECTORS) {
    for (const el of [...document.querySelectorAll(sel)]) el.remove();
  }

  // Remove inline event handlers and javascript: URLs.
  for (const el of [...document.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      else if (
        (attr.name === 'href' || attr.name === 'src') &&
        /^\s*javascript:/i.test(attr.value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }

  // <base> would break our absolutized URLs.
  for (const el of [...document.querySelectorAll('base')]) el.remove();

  // Inline linked stylesheets.
  for (const link of [...document.querySelectorAll('link[rel~="stylesheet"]')]) {
    const href = link.getAttribute('href');
    const abs = href && absolutize(href, base);
    if (!abs) {
      link.remove();
      continue;
    }
    try {
      const res = await fetchWithTimeout(abs);
      if (!res.ok) throw new Error(String(res.status));
      const css = await inlineCss(await res.text(), abs, budget);
      const style = document.createElement('style');
      if (link.media) style.setAttribute('media', link.media);
      style.textContent = css;
      link.replaceWith(style);
    } catch {
      link.setAttribute('href', abs); // keep as remote fallback
    }
  }

  // Absolutize url() refs in existing <style> blocks and style="" attributes.
  for (const style of document.querySelectorAll('style')) {
    style.textContent = absolutizeCssUrls(style.textContent || '', base);
  }
  for (const el of document.querySelectorAll('[style]')) {
    el.setAttribute('style', absolutizeCssUrls(el.getAttribute('style'), base));
  }

  // Images: embed small ones, absolutize the rest. Drop srcset (src wins).
  for (const img of [...document.querySelectorAll('img')]) {
    const src = img.currentSrc || img.getAttribute('src');
    const abs = src && absolutize(src, base);
    img.removeAttribute('srcset');
    img.removeAttribute('loading');
    if (!abs) continue;
    const dataUri = abs.startsWith('data:') ? abs : await assetToDataUri(abs, budget);
    img.setAttribute('src', dataUri || abs);
  }
  for (const source of [...document.querySelectorAll('picture source')]) source.remove();

  // Absolutize remaining reference attributes (links, media, favicons).
  const refAttrs = [
    ['a', 'href'],
    ['area', 'href'],
    ['link', 'href'],
    ['video', 'src'],
    ['video', 'poster'],
    ['audio', 'src'],
    ['source', 'src'],
  ];
  for (const [tag, attr] of refAttrs) {
    for (const el of document.querySelectorAll(`${tag}[${attr}]`)) {
      const abs = absolutize(el.getAttribute(attr), base);
      if (abs) el.setAttribute(attr, abs);
    }
  }

  // Make sure charset is declared so the saved file round-trips.
  if (!document.querySelector('meta[charset]')) {
    const meta = document.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    document.head.prepend(meta);
  }
}

function extractMeta(document, url) {
  const pick = (sel, attr = 'content') => {
    const el = document.querySelector(sel);
    const v = el && el.getAttribute(attr);
    return v ? v.trim() : null;
  };
  const title =
    pick('meta[property="og:title"]') ||
    (document.querySelector('title')?.textContent || '').trim() ||
    url;
  const byline = pick('meta[name="author"]') || pick('meta[property="article:author"]');
  let site = pick('meta[property="og:site_name"]');
  if (!site) {
    try {
      site = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      site = null;
    }
  }
  const excerpt = pick('meta[property="og:description"]') || pick('meta[name="description"]');
  const text = (document.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200000);
  return { title: title.slice(0, 500), byline, site, excerpt: excerpt?.slice(0, 500) || null, text };
}

// Snapshot from a URL (server-side fetch — used for bookmarklet / share / URL saves).
async function snapshotUrl(url) {
  const res = await fetchWithTimeout(url, {
    headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
  });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    return { pdf: Buffer.from(await res.arrayBuffer()), finalUrl: res.url || url };
  }
  const html = await res.text();
  return snapshotHtml(html, res.url || url);
}

// Snapshot from raw HTML (used for extension clips; also the tail of snapshotUrl).
async function snapshotHtml(html, url) {
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;
  await processDocument(document, url);
  const meta = extractMeta(document, url);
  const out = `<!DOCTYPE html>\n` + document.documentElement.outerHTML;
  return { html: out, meta, finalUrl: url };
}

module.exports = { snapshotUrl, snapshotHtml };
