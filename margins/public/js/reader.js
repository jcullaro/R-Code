import { api, toast, escapeHtml } from './api.js';
import {
  buildTextMap, rangeToSelector, findSelector, wrapRange, unwrapMarks, HIGHLIGHT_CSS,
} from './highlighter.js';
import { splitSentences, ReadAloud } from './tts.js';
import { createPdfViewer } from './pdf-reader.js';

const params = new URLSearchParams(location.search);
const itemId = params.get('id');

const pane = document.getElementById('content-pane');
const toolbar = document.getElementById('hl-toolbar');
const panel = document.getElementById('hl-panel');
const hlList = document.getElementById('hl-list');
const ttsBar = document.getElementById('tts-bar');

let item = null;
let highlights = [];
let pending = null; // {selector} for html, {quote,page,rects} for pdf
let iframeDoc = null;
let map = null;
let pdfViewer = null;
let pageOffsets = null;

// ---------------------------------------------------------------------------
// Boot

async function boot() {
  if (!itemId) { location.href = '/'; return; }
  item = await api(`/api/items/${itemId}`);
  document.getElementById('doc-title').textContent = item.title;
  document.title = `${item.title} — Margins`;
  if (item.url) {
    const link = document.getElementById('orig-link');
    link.href = item.url;
    link.style.display = '';
  }
  highlights = await api(`/api/items/${itemId}/highlights`);

  if (item.type === 'html') await bootHtml();
  else await bootPdf();
  renderPanel();
}

async function bootHtml() {
  const iframe = document.createElement('iframe');
  // allow-same-origin (so we can annotate the DOM) but NO allow-scripts:
  // saved snapshots stay inert.
  iframe.setAttribute('sandbox', 'allow-same-origin allow-popups');
  iframe.src = `/content/${item.id}`;
  pane.appendChild(iframe);

  await new Promise((resolve) => { iframe.onload = resolve; });
  iframeDoc = iframe.contentDocument;

  const style = iframeDoc.createElement('style');
  style.textContent = HIGHLIGHT_CSS;
  iframeDoc.head?.appendChild(style);
  // Links inside a saved article should open in a new tab, not replace it.
  const base = iframeDoc.createElement('base');
  base.setAttribute('target', '_blank');
  iframeDoc.head?.prepend(base);

  map = buildTextMap(iframeDoc);
  applyStoredHighlightsHtml();

  iframeDoc.addEventListener('mouseup', onHtmlSelection);
  iframeDoc.addEventListener('click', (e) => {
    const mark = e.target.closest?.('mark.mg-hl');
    if (mark) {
      e.preventDefault();
      openPanel();
      flashCard(mark.dataset.mgId);
    } else {
      hideToolbar();
    }
  });

  // Reading progress: restore, then track.
  const win = iframe.contentWindow;
  const sEl = () => iframeDoc.scrollingElement || iframeDoc.documentElement;
  if (item.progress > 0.01) {
    const el = sEl();
    el.scrollTop = item.progress * (el.scrollHeight - el.clientHeight);
  }
  win.addEventListener('scroll', debounce(() => {
    const el = sEl();
    const denom = el.scrollHeight - el.clientHeight;
    if (denom > 0) saveProgress(el.scrollTop / denom);
  }, 800));
}

async function bootPdf() {
  pdfViewer = await createPdfViewer({
    container: pane,
    url: `/content/${item.id}`,
    onSelection(sel) {
      pending = { quote: sel.quote, page: sel.page, rects: sel.rects, clear: sel.clear };
      showToolbarAt(sel.anchorRect);
    },
    onHighlightClick(hl) {
      openPanel();
      flashCard(hl.id);
    },
  });
  pdfViewer.applyHighlights(highlights);

  const scroll = pdfViewer.scrollEl;
  if (item.progress > 0.01) {
    scroll.scrollTop = item.progress * (scroll.scrollHeight - scroll.clientHeight);
  }
  scroll.addEventListener('scroll', debounce(() => {
    const denom = scroll.scrollHeight - scroll.clientHeight;
    if (denom > 0) saveProgress(scroll.scrollTop / denom);
  }, 800));
  scroll.addEventListener('mousedown', hideToolbar);
}

// ---------------------------------------------------------------------------
// HTML highlighting

function applyStoredHighlightsHtml() {
  const located = [];
  for (const hl of highlights) {
    const found = findSelector({ exact: hl.quote, prefix: hl.prefix, suffix: hl.suffix }, map);
    if (found) located.push({ hl, start: found[0], end: found[1] });
  }
  // Descending start order keeps offsets valid while we split text nodes.
  located.sort((a, b) => b.start - a.start);
  for (const { hl, start, end } of located) {
    wrapRange(map, start, end, { id: hl.id, color: hl.color });
  }
  map = buildTextMap(iframeDoc);
}

function onHtmlSelection() {
  setTimeout(() => {
    const sel = iframeDoc.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { hideToolbar(); return; }
    const range = sel.getRangeAt(0);
    if (!range.toString().trim()) { hideToolbar(); return; }
    map = buildTextMap(iframeDoc);
    const selector = rangeToSelector(range, map);
    if (!selector) return;
    pending = { selector, clear: () => sel.removeAllRanges() };
    const rect = range.getBoundingClientRect();
    const frameRect = pane.querySelector('iframe').getBoundingClientRect();
    showToolbarAt({
      left: rect.left + frameRect.left,
      right: rect.right + frameRect.left,
      top: rect.top + frameRect.top,
      bottom: rect.bottom + frameRect.top,
    });
  }, 10);
}

// ---------------------------------------------------------------------------
// Toolbar + highlight creation

function showToolbarAt(rect) {
  toolbar.classList.remove('hidden');
  const tb = toolbar.getBoundingClientRect();
  let left = (rect.left + rect.right) / 2 - tb.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tb.width - 8));
  let top = rect.top - tb.height - 10;
  if (top < 52) top = rect.bottom + 10;
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

function hideToolbar() {
  toolbar.classList.add('hidden');
  pending = null;
}

async function createHighlight(color, note) {
  if (!pending) return;
  const p = pending;
  hideToolbar();
  try {
    let body;
    if (p.selector) {
      body = {
        color, note,
        quote: p.selector.exact,
        prefix: p.selector.prefix,
        suffix: p.selector.suffix,
      };
    } else {
      body = { color, note, quote: p.quote, page: p.page, rects: p.rects };
    }
    const r = await api(`/api/items/${itemId}/highlights`, { method: 'POST', body });
    const hl = { id: r.id, item_id: itemId, ...body, created_at: new Date().toISOString() };
    highlights.push(hl);

    if (p.selector) {
      wrapRange(map, p.selector._start, p.selector._end, { id: hl.id, color });
      map = buildTextMap(iframeDoc);
    } else {
      pdfViewer.applyHighlights([hl]);
    }
    p.clear?.();
    renderPanel();
  } catch (err) {
    toast(`Could not save highlight: ${err.message}`);
  }
}

toolbar.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
toolbar.addEventListener('click', (e) => {
  const swatch = e.target.closest('.swatch');
  if (swatch) createHighlight(swatch.dataset.color);
});
document.getElementById('hl-note-btn').addEventListener('click', () => {
  const note = prompt('Note for this highlight:');
  if (note !== null) createHighlight('yellow', note || null);
});

// ---------------------------------------------------------------------------
// Highlights panel

function renderPanel() {
  if (!highlights.length) {
    hlList.innerHTML = `<p style="color:var(--ink-soft);font-size:13px">
      Select text in the ${item.type === 'pdf' ? 'PDF' : 'article'} to highlight it.</p>`;
    return;
  }
  hlList.innerHTML = highlights.map((hl) => `
    <div class="hl-card" data-id="${hl.id}" style="border-left-color: var(--hl-${escapeHtml(hl.color)}, var(--hl-yellow))">
      <p class="quote">${escapeHtml(hl.quote.length > 220 ? hl.quote.slice(0, 220) + '…' : hl.quote)}</p>
      ${hl.note ? `<p class="note">${escapeHtml(hl.note)}</p>` : ''}
      ${hl.page ? `<p class="note">p. ${hl.page}</p>` : ''}
      <div class="hl-actions">
        <button data-act="note">✎ note</button>
        <button data-act="copy">copy</button>
        <button data-act="delete">delete</button>
      </div>
    </div>
  `).join('');
}

hlList.addEventListener('click', async (e) => {
  const card = e.target.closest('.hl-card');
  if (!card) return;
  const hl = highlights.find((h) => h.id === card.dataset.id);
  const act = e.target.closest('button')?.dataset.act;

  if (act === 'delete') {
    await api(`/api/highlights/${hl.id}`, { method: 'DELETE' });
    highlights = highlights.filter((h) => h !== hl);
    if (item.type === 'html') {
      unwrapMarks(iframeDoc, `mark.mg-hl[data-mg-id="${CSS.escape(hl.id)}"]`);
      map = buildTextMap(iframeDoc);
    } else {
      pdfViewer.removeHighlight(hl.id);
    }
    renderPanel();
    return;
  }
  if (act === 'note') {
    const note = prompt('Note:', hl.note || '');
    if (note === null) return;
    await api(`/api/highlights/${hl.id}`, { method: 'PATCH', body: { note: note || null } });
    hl.note = note || null;
    renderPanel();
    return;
  }
  if (act === 'copy') {
    await navigator.clipboard.writeText(`"${hl.quote}"${hl.note ? ` — ${hl.note}` : ''}`);
    toast('Copied');
    return;
  }
  // Card body click: jump to the highlight.
  if (item.type === 'html') {
    const mark = iframeDoc.querySelector(`mark.mg-hl[data-mg-id="${CSS.escape(hl.id)}"]`);
    mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    pdfViewer.scrollToHighlight(hl);
  }
});

function openPanel() {
  panel.classList.remove('hidden');
  document.getElementById('panel-btn').classList.add('active');
}

function flashCard(id) {
  const card = hlList.querySelector(`.hl-card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  card.scrollIntoView({ block: 'center' });
  card.style.outline = '2px solid var(--accent)';
  setTimeout(() => { card.style.outline = ''; }, 1200);
}

document.getElementById('panel-btn').addEventListener('click', () => {
  panel.classList.toggle('hidden');
  document.getElementById('panel-btn').classList.toggle('active', !panel.classList.contains('hidden'));
});

// ---------------------------------------------------------------------------
// Read aloud (TTS)

let tts = null;

async function initTts() {
  let text;
  if (item.type === 'html') {
    map = buildTextMap(iframeDoc);
    text = map.text;
  } else {
    const extracted = await pdfViewer.getText();
    text = extracted.text;
    pageOffsets = extracted.pageOffsets;
  }
  const sentences = splitSentences(text);
  if (!sentences.length) { toast('No readable text found'); return null; }

  const engine = new ReadAloud({
    onSentence(sentence, index) {
      localStorage.setItem(`margins_tts_${itemId}`, String(index));
      document.getElementById('tts-sentence').textContent = sentence.text;
      if (item.type === 'html') {
        unwrapMarks(iframeDoc, 'mark.mg-tts');
        map = buildTextMap(iframeDoc);
        const marks = wrapRange(map, sentence.start, sentence.end, { className: 'mg-tts', color: 'none' });
        marks[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (pageOffsets) {
        const po = pageOffsets.find((p) => sentence.start >= p.start && sentence.start < p.end);
        if (po && engine._lastPage !== po.page) {
          engine._lastPage = po.page;
          pdfViewer.scrollToPage(po.page);
        }
      }
    },
    onStateChange(playing) {
      document.getElementById('tts-play').textContent = playing ? '⏸' : '▶';
      if (!playing && item.type === 'html' && iframeDoc) {
        unwrapMarks(iframeDoc, 'mark.mg-tts');
        map = buildTextMap(iframeDoc);
      }
    },
  });
  const resume = Number(localStorage.getItem(`margins_tts_${itemId}`) || 0);
  engine.load(sentences, resume);
  return engine;
}

function populateVoices() {
  if (!tts) return;
  const sel = document.getElementById('tts-voice');
  const voices = tts.voices();
  sel.innerHTML = voices.map((v) =>
    `<option value="${escapeHtml(v.name)}" ${v.name === tts.voiceName ? 'selected' : ''}>${escapeHtml(v.name.replace(/\s*\(.*\)$/, ''))}</option>`
  ).join('');
}

document.getElementById('tts-btn').addEventListener('click', async () => {
  if (ttsBar.classList.contains('visible')) {
    ttsBar.classList.remove('visible');
    tts?.stop();
    return;
  }
  ttsBar.classList.add('visible');
  if (!tts) {
    tts = await initTts();
    if (!tts) return;
    populateVoices();
    speechSynthesis.addEventListener('voiceschanged', populateVoices);
    const rate = tts.rate;
    document.getElementById('tts-rate').value = String(rate);
    document.getElementById('tts-rate-label').textContent = `${rate}×`;
  }
});

document.getElementById('tts-play').addEventListener('click', () => tts?.toggle());
document.getElementById('tts-prev').addEventListener('click', () => tts?.skip(-1));
document.getElementById('tts-next').addEventListener('click', () => tts?.skip(1));
document.getElementById('tts-close').addEventListener('click', () => {
  ttsBar.classList.remove('visible');
  tts?.stop();
});
document.getElementById('tts-rate').addEventListener('input', (e) => {
  const rate = Number(e.target.value);
  document.getElementById('tts-rate-label').textContent = `${rate}×`;
  tts?.setRate(rate);
});
document.getElementById('tts-voice').addEventListener('change', (e) => tts?.setVoice(e.target.value));

// ---------------------------------------------------------------------------
// Misc

document.getElementById('back-btn').addEventListener('click', () => { location.href = '/'; });
window.addEventListener('beforeunload', () => speechSynthesis.cancel());
document.addEventListener('mousedown', (e) => {
  if (!toolbar.contains(e.target)) hideToolbar();
});

const saveProgress = debounce((p) => {
  api(`/api/items/${itemId}`, { method: 'PATCH', body: { progress: p } }).catch(() => {});
}, 1200);

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

boot().catch((err) => {
  toast(`Could not open item: ${err.message}`, 6000);
  console.error(err);
});
