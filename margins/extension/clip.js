// Runs in the page. Captures a single-file snapshot of the DOM as currently
// rendered (after JavaScript, behind logins) so the saved copy looks exactly
// like what you're seeing: computed stylesheets are inlined, images embedded.
// Returns {url, title, html} to the caller (background service worker).

(async () => {
  const MAX_IMG = 600 * 1024;
  const MAX_TOTAL = 20 * 1024 * 1024;
  let budget = MAX_TOTAL;

  const abs = (u, base) => {
    try { return new URL(u, base || location.href).href; } catch { return null; }
  };

  const absolutizeCssUrls = (css, base) =>
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
      if (/^(data:|#)/.test(ref)) return m;
      const a = abs(ref.trim(), base);
      return a ? `url("${a}")` : m;
    });

  // 1. Collect CSS from every stylesheet we can read (same-origin + CORS-ok);
  //    cross-origin sheets we can't read stay as absolute <link>s.
  let cssText = '';
  const blockedLinks = [];
  for (const sheet of document.styleSheets) {
    if (sheet.disabled) continue;
    const media = sheet.media?.mediaText;
    try {
      let rules = '';
      for (const rule of sheet.cssRules) rules += rule.cssText + '\n';
      rules = absolutizeCssUrls(rules, sheet.href || location.href);
      cssText += media && media !== 'all' ? `@media ${media} { ${rules} }\n` : rules + '\n';
    } catch {
      if (sheet.href) blockedLinks.push({ href: sheet.href, media });
    }
  }

  // 2. Clone the DOM and pair originals with clones (same document order).
  const clone = document.documentElement.cloneNode(true);

  // Preserve current values of form fields.
  const liveInputs = document.querySelectorAll('input, textarea, select');
  const cloneInputs = clone.querySelectorAll('input, textarea, select');
  liveInputs.forEach((el, i) => {
    const c = cloneInputs[i];
    if (!c) return;
    if (el.tagName === 'TEXTAREA') c.textContent = el.value;
    else if (el.tagName === 'SELECT') {
      [...c.options].forEach((o, j) => o.toggleAttribute('selected', el.options[j]?.selected));
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      c.toggleAttribute('checked', el.checked);
    } else c.setAttribute('value', el.value);
  });

  // 3. Embed images. Use currentSrc (the responsive candidate actually shown).
  const toDataUrl = async (url) => {
    if (budget <= 0) return null;
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size > MAX_IMG || blob.size > budget) return null;
      budget -= blob.size;
      return await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  const liveImgs = document.querySelectorAll('img');
  const cloneImgs = clone.querySelectorAll('img');
  await Promise.all([...liveImgs].map(async (img, i) => {
    const c = cloneImgs[i];
    if (!c) return;
    const src = img.currentSrc || img.src;
    c.removeAttribute('srcset');
    c.removeAttribute('loading');
    if (!src) return;
    const a = abs(src);
    if (!a) return;
    const data = a.startsWith('data:') ? a : await toDataUrl(a);
    c.setAttribute('src', data || a);
  }));
  for (const s of clone.querySelectorAll('picture source')) s.remove();

  // Canvases → snapshot images.
  const liveCanvases = document.querySelectorAll('canvas');
  const cloneCanvases = clone.querySelectorAll('canvas');
  liveCanvases.forEach((cv, i) => {
    const c = cloneCanvases[i];
    if (!c) return;
    try {
      const img = document.createElement('img');
      img.src = cv.toDataURL();
      img.setAttribute('style', c.getAttribute('style') || '');
      img.className = c.className;
      img.width = cv.width;
      img.height = cv.height;
      c.replaceWith(img);
    } catch { /* tainted canvas — leave as-is */ }
  });

  // 4. Strip scripts and live styling references (replaced by captured CSS).
  const kill = clone.querySelectorAll(
    'script, noscript, link[rel~="stylesheet"], style, link[rel="preload"], link[rel="modulepreload"], iframe, embed, object'
  );
  for (const el of kill) el.remove();
  for (const el of clone.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  }

  // Absolutize links.
  for (const aEl of clone.querySelectorAll('a[href]')) {
    const a = abs(aEl.getAttribute('href'));
    if (a) aEl.setAttribute('href', a);
  }

  // 5. Reassemble head: charset, title, captured CSS, unreadable sheets.
  const head = clone.querySelector('head') || clone.insertBefore(document.createElement('head'), clone.firstChild);
  const frag = document.createDocumentFragment();
  const meta = document.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  frag.appendChild(meta);
  for (const { href, media } of blockedLinks) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (media) link.media = media;
    frag.appendChild(link);
  }
  const style = document.createElement('style');
  style.textContent = cssText;
  frag.appendChild(style);
  head.prepend(frag);

  return {
    url: location.href,
    title: document.title,
    html: '<!DOCTYPE html>\n' + clone.outerHTML,
  };
})();
