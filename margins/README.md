# Margins

A self-hosted read-later app in the spirit of Pocket / Matter, built around the two
things those apps don't do well:

1. **Original formatting is preserved.** Saving a page captures a single-file
   snapshot — stylesheets inlined, images embedded — so the article looks the way it
   did in your browser, not like a stripped-down "reader view".
2. **Paperpile-style highlighting.** Select text in an article *or* a PDF, pick a
   color, attach a note. Highlights live in a side panel, jump back to their spot in
   the document, and survive reloads (they're anchored to the quoted text, not to
   fragile DOM positions).

Plus: a **read-aloud mode** (text-to-speech with per-sentence tracking, speed and
voice controls) for listening to articles and PDFs.

Everything is stored locally on your machine in `data/` (SQLite + files). No
accounts, no cloud.

## Quick start

```bash
cd margins
npm install
npm start          # http://localhost:8321
```

Requires Node.js ≥ 22.5 (uses the built-in SQLite — no native modules).

## Ways to save things

| From | How |
|---|---|
| The web app | **＋ Save** → paste a URL, or upload a PDF |
| Chrome / Edge / Brave | Install the web clipper (below) — captures the page exactly as rendered, including pages behind logins |
| Android phone | Install the PWA (browser menu → *Add to Home screen*), then share any page or PDF to **Margins** from the share sheet |
| iPhone | Bookmarklet (shown in the ＋ Save dialog), or an iOS Shortcut that opens `http://YOUR-SERVER:8321/clip?url=[Shortcut Input]` |
| Anywhere | `GET /clip?url=…` or `POST /api/clip {"url": …}` |

### Installing the web clipper extension

1. Open `chrome://extensions`, enable **Developer mode**
2. **Load unpacked** → select the `extension/` folder
3. Click the extension icon → set your server URL (default `http://localhost:8321`)
4. Click **✂ Save this page** (or right-click → *Save page to Margins*) on any page

The clipper serializes the live DOM — after JavaScript has run, with your session's
content — inlines the computed stylesheets, embeds images, strips all scripts, and
sends the result to your server. What you see is what gets saved.

### Using it from your phone

Run the server somewhere your phone can reach:

- **Same Wi-Fi:** start the server, then use `http://<your-computer-ip>:8321` on the
  phone. Install it as a PWA and the Android share sheet integration lights up.
- **Anywhere:** put it on a small VPS or behind Tailscale. If it's reachable beyond
  your LAN, set an access token: `MARGINS_TOKEN=some-secret npm start` — the web app
  prompts for it once, and the extension has a token field in its popup.

> Note: Android share-target and (on some browsers) microphone/speech features
> require HTTPS when not on `localhost`. A reverse proxy with a certificate, or
> Tailscale HTTPS, covers this.

## Reading

- **Articles** render in a sandboxed frame with the saved page's own styles.
  Scripts are stripped at capture time *and* blocked by CSP + iframe sandbox.
- **PDFs** render with pdf.js (canvas + selectable text layer).
- Reading progress is saved automatically and restored when you reopen an item.
- **🎧 Listen**: sentence-by-sentence read-aloud. The current sentence is
  highlighted and scrolled into view in articles; in PDFs the view follows the
  current page. Speed (0.6–2×) and voice are configurable; position is remembered
  per document.

## Highlighting

Select text → floating toolbar → pick one of five colors, or **✎ note** to attach a
comment. Click any highlight (or ✎ in the top bar) to open the panel: jump to a
highlight, edit its note, copy the quote, or delete it.

- Article highlights are stored as text-quote selectors (`exact` + `prefix` +
  `suffix`, W3C Web Annotation style) and re-anchored on load.
- PDF highlights store the page number, the quoted text, and normalized rectangles,
  so they render at any zoom level.

## Layout

```
server/     Express app, SQLite (node:sqlite), snapshot/inlining engine (jsdom)
public/     PWA: library, reader, highlighter, TTS, pdf.js viewer, service worker
extension/  MV3 web clipper (Chrome/Edge/Brave; loads unpacked)
scripts/    Icon generator (pure Node, no image deps)
data/       Your library: margins.db + snapshots/ + pdfs/  (gitignored)
```

## API sketch

```
POST   /api/clip                     {url} or {url, html, title}
POST   /api/items/upload             multipart PDF
GET    /api/items                    library list
PATCH  /api/items/:id                {progress|archived|title}
DELETE /api/items/:id
GET    /content/:id                  saved snapshot / PDF bytes
GET    /api/items/:id/highlights
POST   /api/items/:id/highlights     {quote, prefix?, suffix?, color?, note?, page?, rects?}
PATCH  /api/highlights/:id           {color?, note?}
DELETE /api/highlights/:id
POST   /share                        PWA share-target endpoint
GET    /clip?url=…                   bookmarklet endpoint (redirects to reader)
```
