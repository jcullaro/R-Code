// Text anchoring + highlight rendering for HTML snapshots.
//
// Highlights are stored as W3C-style TextQuoteSelectors ({exact, prefix,
// suffix}) so they survive re-rendering and minor DOM differences. To apply
// one, we flatten the document's visible text nodes into a single string,
// locate the quote (disambiguated by its prefix/suffix), then map the match
// back to concrete text nodes and wrap them in <mark> elements.

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TITLE']);

export function buildTextMap(root) {
  const doc = root.ownerDocument || root;
  const walker = doc.createTreeWalker(
    root.nodeType === Node.DOCUMENT_NODE ? root.body || root : root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  const segments = [];
  let text = '';
  let node;
  while ((node = walker.nextNode())) {
    segments.push({ node, start: text.length, end: text.length + node.data.length });
    text += node.data;
  }
  return { text, segments };
}

// Locate the character position of a Range's boundary within the map.
function pointToIndex(map, container, offset) {
  if (container.nodeType === Node.TEXT_NODE) {
    const seg = map.segments.find((s) => s.node === container);
    return seg ? seg.start + offset : null;
  }
  // Element boundary: find the first mapped text node at/after the child index.
  const walkFrom = container.childNodes[offset] || null;
  if (walkFrom) {
    for (const seg of map.segments) {
      const pos = walkFrom.compareDocumentPosition(seg.node);
      if (seg.node === walkFrom || pos & Node.DOCUMENT_POSITION_CONTAINED_BY ||
          pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        return seg.start;
      }
    }
    return map.text.length;
  }
  // offset past last child: first text node after the container.
  for (const seg of map.segments) {
    const pos = container.compareDocumentPosition(seg.node);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY)) {
      return seg.start;
    }
  }
  return map.text.length;
}

const CONTEXT = 40;

// Range → {exact, prefix, suffix} selector.
export function rangeToSelector(range, map) {
  const start = pointToIndex(map, range.startContainer, range.startOffset);
  const end = pointToIndex(map, range.endContainer, range.endOffset);
  if (start == null || end == null || end <= start) return null;
  return {
    exact: map.text.slice(start, end),
    prefix: map.text.slice(Math.max(0, start - CONTEXT), start),
    suffix: map.text.slice(end, end + CONTEXT),
    _start: start,
    _end: end,
  };
}

// Selector → [start, end) in map.text, or null.
export function findSelector(sel, map) {
  const { text } = map;
  const { exact, prefix = '', suffix = '' } = sel;
  if (!exact) return null;

  // Best case: prefix + exact + suffix appears verbatim.
  if (prefix || suffix) {
    const i = text.indexOf(prefix + exact + suffix);
    if (i !== -1) return [i + prefix.length, i + prefix.length + exact.length];
  }
  // Next: exact match, scored by surrounding context similarity.
  let best = null;
  let bestScore = -1;
  let from = 0;
  while (true) {
    const i = text.indexOf(exact, from);
    if (i === -1) break;
    let score = 0;
    if (prefix && text.slice(Math.max(0, i - prefix.length), i) === prefix) score += 2;
    if (suffix && text.slice(i + exact.length, i + exact.length + suffix.length) === suffix) score += 2;
    if (score > bestScore) { bestScore = score; best = [i, i + exact.length]; }
    from = i + 1;
  }
  if (best) return best;

  // Last resort: whitespace-normalized search mapped back to raw offsets.
  const norm = [];
  const idx = [];
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) { norm.push(' '); idx.push(i); lastWasSpace = true; }
    } else {
      norm.push(ch); idx.push(i); lastWasSpace = false;
    }
  }
  const normText = norm.join('');
  const normExact = exact.replace(/\s+/g, ' ').trim();
  const j = normText.indexOf(normExact);
  if (j === -1 || !normExact) return null;
  return [idx[j], idx[j + normExact.length - 1] + 1];
}

// Wrap [start, end) of the mapped text in <mark class="mg-hl mg-c-{color}">.
// Returns the created mark elements. Splits boundary text nodes as needed.
//
// Splitting truncates the tail of the affected text node, so when applying
// several highlights against one map, apply them in DESCENDING start order
// (later splits never invalidate earlier offsets) and rebuild the map after.
export function wrapRange(map, start, end, { id, color = 'yellow', className = 'mg-hl' }) {
  const doc = map.segments[0]?.node.ownerDocument;
  if (!doc) return [];
  const marks = [];
  for (const seg of map.segments) {
    if (seg.end <= start || seg.start >= end) continue;
    const node = seg.node;
    if (!node.isConnected) continue;
    const len = node.data.length;
    const from = Math.min(Math.max(start, seg.start) - seg.start, len);
    const to = Math.min(Math.min(end, seg.end) - seg.start, len);
    if (from >= to) continue;
    // Split so [from, to) is its own text node, then wrap it.
    let target = node;
    if (from > 0) target = target.splitText(from);
    if (to - from < target.data.length) target.splitText(to - from);
    if (target.parentElement?.classList.contains('mg-hl')) continue; // overlap guard
    const mark = doc.createElement('mark');
    mark.className = `${className} mg-c-${color}`;
    if (id) mark.dataset.mgId = id;
    target.parentNode.replaceChild(mark, target);
    mark.appendChild(target);
    marks.push(mark);
  }
  return marks;
}

export function unwrapMarks(doc, selector) {
  for (const mark of [...doc.querySelectorAll(selector)]) {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    parent.normalize();
  }
}

// Styles injected into the snapshot iframe.
export const HIGHLIGHT_CSS = `
  .mg-hl { color: inherit; cursor: pointer; border-radius: 2px; padding: 0.5px 0; }
  .mg-c-yellow { background: rgba(255, 226, 122, 0.75); }
  .mg-c-green  { background: rgba(185, 232, 166, 0.75); }
  .mg-c-blue   { background: rgba(174, 220, 255, 0.75); }
  .mg-c-pink   { background: rgba(255, 196, 214, 0.75); }
  .mg-c-orange { background: rgba(255, 207, 158, 0.75); }
  .mg-tts { background: rgba(181, 80, 42, 0.22) !important; box-shadow: 0 0 0 2px rgba(181, 80, 42, 0.22); border-radius: 2px; }
  ::selection { background: rgba(0, 105, 220, 0.3); }
`;
