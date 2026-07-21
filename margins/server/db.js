'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.MARGINS_DATA_DIR || path.join(__dirname, '..', 'data');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');

for (const dir of [DATA_DIR, SNAPSHOT_DIR, PDF_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new DatabaseSync(path.join(DATA_DIR, 'margins.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL CHECK (type IN ('html', 'pdf')),
    url         TEXT,
    title       TEXT NOT NULL DEFAULT 'Untitled',
    site        TEXT,
    byline      TEXT,
    excerpt     TEXT,
    text_content TEXT,
    file_name   TEXT,
    archived    INTEGER NOT NULL DEFAULT 0,
    progress    REAL NOT NULL DEFAULT 0,
    added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS highlights (
    id          TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    color       TEXT NOT NULL DEFAULT 'yellow',
    note        TEXT,
    quote       TEXT NOT NULL,
    prefix      TEXT,
    suffix      TEXT,
    page        INTEGER,
    rects       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_highlights_item ON highlights(item_id);
`);

function newId() {
  return require('crypto').randomBytes(9).toString('base64url');
}

const stmts = {
  insertItem: db.prepare(`
    INSERT INTO items (id, type, url, title, site, byline, excerpt, text_content, file_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listItems: db.prepare(`
    SELECT i.id, i.type, i.url, i.title, i.site, i.byline, i.excerpt, i.archived, i.progress, i.added_at,
           (SELECT COUNT(*) FROM highlights h WHERE h.item_id = i.id) AS highlight_count
    FROM items i
    ORDER BY i.added_at DESC
  `),
  getItem: db.prepare(`SELECT * FROM items WHERE id = ?`),
  findByUrl: db.prepare(`SELECT id FROM items WHERE url = ? LIMIT 1`),
  updateProgress: db.prepare(`UPDATE items SET progress = ? WHERE id = ?`),
  updateArchived: db.prepare(`UPDATE items SET archived = ? WHERE id = ?`),
  updateTitle: db.prepare(`UPDATE items SET title = ? WHERE id = ?`),
  deleteItem: db.prepare(`DELETE FROM items WHERE id = ?`),

  insertHighlight: db.prepare(`
    INSERT INTO highlights (id, item_id, color, note, quote, prefix, suffix, page, rects)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listHighlights: db.prepare(`SELECT * FROM highlights WHERE item_id = ? ORDER BY created_at ASC`),
  listAllHighlights: db.prepare(`
    SELECT h.*, i.title AS item_title, i.type AS item_type
    FROM highlights h JOIN items i ON i.id = h.item_id
    ORDER BY h.created_at DESC
  `),
  getHighlight: db.prepare(`SELECT * FROM highlights WHERE id = ?`),
  updateHighlight: db.prepare(`UPDATE highlights SET color = ?, note = ? WHERE id = ?`),
  deleteHighlight: db.prepare(`DELETE FROM highlights WHERE id = ?`),
};

module.exports = { db, stmts, newId, DATA_DIR, SNAPSHOT_DIR, PDF_DIR };
