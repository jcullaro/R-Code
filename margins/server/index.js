'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const { stmts, newId, SNAPSHOT_DIR, PDF_DIR } = require('./db');
const { snapshotUrl, snapshotHtml } = require('./snapshot');

// Route outbound fetches through an HTTPS proxy when the environment defines
// one (no-op otherwise).
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    const { setGlobalDispatcher, EnvHttpProxyAgent } = require('undici');
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch {
    /* undici not installed — plain fetch */
  }
}

const PORT = Number(process.env.MARGINS_PORT || process.env.PORT || 8321);
const TOKEN = process.env.MARGINS_TOKEN || null;

const app = express();
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Auth (optional): set MARGINS_TOKEN to require a bearer token on /api routes.
// The web UI passes it as a query param or Authorization header.
function checkAuth(req, res, next) {
  if (!TOKEN) return next();
  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (bearer === TOKEN || req.query.token === TOKEN) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// ---------------------------------------------------------------------------
// Item creation helpers

function saveHtmlItem({ html, meta, url }) {
  const id = newId();
  fs.writeFileSync(path.join(SNAPSHOT_DIR, `${id}.html`), html);
  stmts.insertItem.run(
    id, 'html', url || null, meta.title || 'Untitled', meta.site, meta.byline,
    meta.excerpt, meta.text, null
  );
  return id;
}

function savePdfItem({ buffer, title, url, fileName }) {
  const id = newId();
  const name = `${id}.pdf`;
  fs.writeFileSync(path.join(PDF_DIR, name), buffer);
  let site = null;
  try {
    if (url) site = new URL(url).hostname.replace(/^www\./, '');
  } catch { /* no site */ }
  stmts.insertItem.run(
    id, 'pdf', url || null,
    (title || fileName || 'Untitled PDF').replace(/\.pdf$/i, '').slice(0, 500),
    site, null, null, null, name
  );
  return id;
}

async function clipFromUrl(url) {
  const existing = stmts.findByUrl.get(url);
  if (existing) return { id: existing.id, existed: true };
  const snap = await snapshotUrl(url);
  if (snap.pdf) {
    const name = decodeURIComponent(
      (snap.finalUrl.split('/').pop() || 'document.pdf').split('?')[0]
    );
    return { id: savePdfItem({ buffer: snap.pdf, url: snap.finalUrl, fileName: name }) };
  }
  return { id: saveHtmlItem({ html: snap.html, meta: snap.meta, url: snap.finalUrl }) };
}

// ---------------------------------------------------------------------------
// Clipping API

// From the browser extension ({url, html}) or plain URL saves ({url}).
app.post('/api/clip', checkAuth, async (req, res) => {
  try {
    const { url, html } = req.body || {};
    if (html) {
      const snap = await snapshotHtml(html, url || 'about:blank');
      if (req.body.title) snap.meta.title = String(req.body.title).slice(0, 500);
      const id = saveHtmlItem({ html: snap.html, meta: snap.meta, url });
      return res.json({ id, ok: true });
    }
    if (url) {
      const result = await clipFromUrl(url);
      return res.json({ ...result, ok: true });
    }
    res.status(400).json({ error: 'url or html required' });
  } catch (err) {
    res.status(502).json({ error: `Could not save page: ${err.message}` });
  }
});

// Bookmarklet: GET /clip?url=... — snapshots then opens the reader.
app.get('/clip', checkAuth, async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing ?url=');
  try {
    const { id } = await clipFromUrl(url);
    res.redirect(`/reader.html?id=${id}`);
  } catch (err) {
    res.status(502).send(`Could not save page: ${err.message}`);
  }
});

// PDF upload from the web app.
app.post('/api/items/upload', checkAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  if (!/pdf$/i.test(req.file.mimetype) && !/\.pdf$/i.test(req.file.originalname)) {
    return res.status(400).json({ error: 'only PDF files are supported' });
  }
  const id = savePdfItem({
    buffer: req.file.buffer,
    title: req.body.title,
    fileName: req.file.originalname,
  });
  res.json({ id, ok: true });
});

// PWA share target (Android "share to app"): accepts a shared URL/text or PDFs.
app.post('/share', checkAuth, upload.array('files', 5), async (req, res) => {
  try {
    const files = (req.files || []).filter(
      (f) => /pdf$/i.test(f.mimetype) || /\.pdf$/i.test(f.originalname)
    );
    if (files.length) {
      let lastId = null;
      for (const f of files) {
        lastId = savePdfItem({ buffer: f.buffer, title: req.body.title, fileName: f.originalname });
      }
      return res.redirect(303, `/?saved=${lastId}`);
    }
    const text = [req.body.url, req.body.text, req.body.title].filter(Boolean).join(' ');
    const match = text.match(/https?:\/\/\S+/);
    if (match) {
      const { id } = await clipFromUrl(match[0]);
      return res.redirect(303, `/?saved=${id}`);
    }
    res.redirect(303, '/?saved=none');
  } catch (err) {
    res.status(502).send(`Could not save: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// Items API

app.get('/api/items', checkAuth, (req, res) => {
  res.json(stmts.listItems.all());
});

app.get('/api/items/:id', checkAuth, (req, res) => {
  const item = stmts.getItem.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  delete item.text_content;
  res.json(item);
});

app.patch('/api/items/:id', checkAuth, (req, res) => {
  const item = stmts.getItem.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const { progress, archived, title } = req.body || {};
  if (typeof progress === 'number') {
    stmts.updateProgress.run(Math.max(0, Math.min(1, progress)), item.id);
  }
  if (typeof archived === 'boolean') stmts.updateArchived.run(archived ? 1 : 0, item.id);
  if (typeof title === 'string' && title.trim()) {
    stmts.updateTitle.run(title.trim().slice(0, 500), item.id);
  }
  res.json({ ok: true });
});

app.delete('/api/items/:id', checkAuth, (req, res) => {
  const item = stmts.getItem.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  stmts.deleteItem.run(item.id);
  try {
    if (item.type === 'html') fs.unlinkSync(path.join(SNAPSHOT_DIR, `${item.id}.html`));
    else if (item.file_name) fs.unlinkSync(path.join(PDF_DIR, item.file_name));
  } catch { /* file already gone */ }
  res.json({ ok: true });
});

// Saved snapshot content. Scripts are stripped at save time; the CSP header and
// the reader's sandboxed iframe make sure nothing executes even so.
app.get('/content/:id', (req, res) => {
  const item = stmts.getItem.get(req.params.id);
  if (!item) return res.status(404).send('Not found');
  if (item.type === 'html') {
    res.set('Content-Security-Policy', "script-src 'none'; frame-src 'none'");
    res.sendFile(path.join(SNAPSHOT_DIR, `${item.id}.html`));
  } else {
    res.set('Content-Type', 'application/pdf');
    res.sendFile(path.join(PDF_DIR, item.file_name));
  }
});

// ---------------------------------------------------------------------------
// Highlights API

app.get('/api/highlights', checkAuth, (req, res) => {
  res.json(stmts.listAllHighlights.all());
});

app.get('/api/items/:id/highlights', checkAuth, (req, res) => {
  res.json(stmts.listHighlights.all(req.params.id));
});

app.post('/api/items/:id/highlights', checkAuth, (req, res) => {
  const item = stmts.getItem.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const { color, note, quote, prefix, suffix, page, rects } = req.body || {};
  if (!quote) return res.status(400).json({ error: 'quote required' });
  const id = newId();
  stmts.insertHighlight.run(
    id, item.id, color || 'yellow', note || null, quote,
    prefix || null, suffix || null,
    Number.isInteger(page) ? page : null,
    rects ? JSON.stringify(rects) : null
  );
  res.json({ id, ok: true });
});

app.patch('/api/highlights/:id', checkAuth, (req, res) => {
  const hl = stmts.getHighlight.get(req.params.id);
  if (!hl) return res.status(404).json({ error: 'not found' });
  stmts.updateHighlight.run(
    req.body.color || hl.color,
    'note' in (req.body || {}) ? req.body.note : hl.note,
    hl.id
  );
  res.json({ ok: true });
});

app.delete('/api/highlights/:id', checkAuth, (req, res) => {
  stmts.deleteHighlight.run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Static assets

app.use('/vendor/pdfjs', express.static(path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build')));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Margins running at http://localhost:${PORT}`);
  if (TOKEN) console.log('API token auth is ON');
});
