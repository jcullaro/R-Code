// Minimal PDF viewer on top of pdf.js: canvas rendering + selectable text
// layer + a highlight overlay layer per page. Highlights are stored as
// normalized rectangles (PDF units at scale 1) plus the quoted text, so they
// re-render correctly at any zoom level.

const COLOR_RGBA = {
  yellow: 'rgba(255, 226, 122, 0.55)',
  green: 'rgba(185, 232, 166, 0.55)',
  blue: 'rgba(174, 220, 255, 0.55)',
  pink: 'rgba(255, 196, 214, 0.55)',
  orange: 'rgba(255, 207, 158, 0.55)',
};

export async function createPdfViewer({ container, url, onSelection, onHighlightClick }) {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

  const scroll = document.createElement('div');
  scroll.className = 'pdf-scroll';
  container.appendChild(scroll);

  const doc = await pdfjs.getDocument({ url }).promise;
  const pages = []; // {div, hlLayer, viewport1, rendered, num}

  // Fit-to-width scale based on the first page.
  const first = await doc.getPage(1);
  const vp1 = first.getViewport({ scale: 1 });
  const targetWidth = Math.min(900, Math.max(320, container.clientWidth - 36));
  const scale = targetWidth / vp1.width;

  for (let n = 1; n <= doc.numPages; n++) {
    const page = n === 1 ? first : await doc.getPage(n);
    const viewport1 = page.getViewport({ scale: 1 });
    const div = document.createElement('div');
    div.className = 'mg-page';
    div.dataset.page = String(n);
    div.style.width = `${Math.floor(viewport1.width * scale)}px`;
    div.style.height = `${Math.floor(viewport1.height * scale)}px`;
    div.style.setProperty('--scale-factor', String(scale));
    const hlLayer = document.createElement('div');
    hlLayer.className = 'hl-layer';
    div.appendChild(hlLayer);
    scroll.appendChild(div);
    pages.push({ div, hlLayer, viewport1, rendered: false, num: n, page });
  }

  async function renderPage(entry) {
    if (entry.rendered) return;
    entry.rendered = true;
    const viewport = entry.page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    entry.div.insertBefore(canvas, entry.hlLayer);
    await entry.page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
    }).promise;

    const textDiv = document.createElement('div');
    textDiv.className = 'textLayer';
    entry.div.appendChild(textDiv);
    const textLayer = new pdfjs.TextLayer({
      textContentSource: entry.page.streamTextContent(),
      container: textDiv,
      viewport,
    });
    await textLayer.render();
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const entry = pages[Number(e.target.dataset.page) - 1];
          renderPage(entry).catch(console.error);
        }
      }
    },
    { root: scroll, rootMargin: '600px 0px' }
  );
  for (const p of pages) observer.observe(p.div);

  // ---- Selection → highlight ------------------------------------------

  scroll.addEventListener('mouseup', () => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const startEl = range.startContainer.nodeType === 1
        ? range.startContainer : range.startContainer.parentElement;
      const pageDiv = startEl?.closest('.mg-page');
      if (!pageDiv || !scroll.contains(pageDiv)) return;
      const quote = sel.toString().replace(/\s+/g, ' ').trim();
      if (quote.length < 1) return;

      const pageRect = pageDiv.getBoundingClientRect();
      const rects = [];
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        // Only keep rects on the starting page (v1: single-page highlights).
        if (r.top < pageRect.top - 2 || r.bottom > pageRect.bottom + 2) continue;
        rects.push([
          (r.left - pageRect.left) / scale,
          (r.top - pageRect.top) / scale,
          r.width / scale,
          r.height / scale,
        ].map((v) => Math.round(v * 100) / 100));
      }
      if (!rects.length) return;
      const anchor = range.getBoundingClientRect();
      onSelection({
        quote,
        page: Number(pageDiv.dataset.page),
        rects: mergeLineRects(rects),
        anchorRect: anchor,
        clear: () => sel.removeAllRanges(),
      });
    }, 10);
  });

  // Merge fragment rects on the same visual line into one.
  function mergeLineRects(rects) {
    rects.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const out = [];
    for (const r of rects) {
      const last = out[out.length - 1];
      if (last && Math.abs(last[1] - r[1]) < 3 && r[0] <= last[0] + last[2] + 12) {
        const right = Math.max(last[0] + last[2], r[0] + r[2]);
        last[2] = Math.round((right - last[0]) * 100) / 100;
        last[3] = Math.max(last[3], r[3]);
      } else {
        out.push([...r]);
      }
    }
    return out;
  }

  // ---- Highlight overlays ---------------------------------------------

  function drawHighlight(hl) {
    const entry = pages[(hl.page || 1) - 1];
    if (!entry) return;
    const rects = typeof hl.rects === 'string' ? JSON.parse(hl.rects) : hl.rects;
    if (!rects) return;
    for (const [x, y, w, h] of rects) {
      const el = document.createElement('div');
      el.className = 'hl-rect';
      el.dataset.mgId = hl.id;
      el.style.left = `${x * scale}px`;
      el.style.top = `${y * scale}px`;
      el.style.width = `${w * scale}px`;
      el.style.height = `${h * scale}px`;
      el.style.background = COLOR_RGBA[hl.color] || COLOR_RGBA.yellow;
      el.title = hl.note || '';
      el.addEventListener('click', () => onHighlightClick?.(hl));
      entry.hlLayer.appendChild(el);
    }
  }

  function applyHighlights(hls) {
    for (const hl of hls) drawHighlight(hl);
  }

  function removeHighlight(id) {
    for (const el of scroll.querySelectorAll(`.hl-rect[data-mg-id="${CSS.escape(id)}"]`)) el.remove();
  }

  function scrollToHighlight(hl) {
    const entry = pages[(hl.page || 1) - 1];
    if (!entry) return;
    const rects = typeof hl.rects === 'string' ? JSON.parse(hl.rects) : hl.rects;
    const y = rects?.[0]?.[1] ? rects[0][1] * scale : 0;
    scroll.scrollTo({ top: entry.div.offsetTop + y - 120, behavior: 'smooth' });
  }

  function scrollToPage(n) {
    const entry = pages[n - 1];
    if (entry) scroll.scrollTo({ top: entry.div.offsetTop - 20, behavior: 'smooth' });
  }

  // ---- Text extraction (for read-aloud) --------------------------------

  async function getText() {
    let text = '';
    const pageOffsets = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const start = text.length;
      const content = await pages[n - 1].page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
      }
      text += pageText.replace(/[ \t]+/g, ' ') + '\n\n';
      pageOffsets.push({ page: n, start, end: text.length });
    }
    return { text, pageOffsets };
  }

  return {
    scrollEl: scroll,
    numPages: doc.numPages,
    applyHighlights,
    removeHighlight,
    scrollToHighlight,
    scrollToPage,
    getText,
  };
}
