import { api, toast, escapeHtml } from './api.js';

const grid = document.getElementById('grid');
const search = document.getElementById('search');
const filters = document.getElementById('filters');
const addDialog = document.getElementById('add-dialog');

let items = [];
let filter = 'inbox';

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function matches(item) {
  if (filter === 'inbox' && item.archived) return false;
  if (filter === 'archived' && !item.archived) return false;
  if ((filter === 'html' || filter === 'pdf') && (item.type !== filter || item.archived)) return false;
  const q = search.value.trim().toLowerCase();
  if (q) {
    const hay = `${item.title} ${item.site || ''} ${item.excerpt || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function render() {
  const visible = items.filter(matches);
  if (!visible.length) {
    grid.innerHTML = `<div class="empty">
      <p style="font-size:32px;margin:0">📚</p>
      <p>Nothing here yet. Hit <strong>＋ Save</strong> to add an article or PDF,<br>
      or install the web clipper extension from the <code>extension/</code> folder.</p>
    </div>`;
    return;
  }
  grid.innerHTML = visible.map((it) => `
    <article class="card ${it.type}" data-id="${it.id}">
      <span class="kind"><span class="dot"></span>${it.type === 'pdf' ? 'PDF' : escapeHtml(it.site || 'Article')}</span>
      <h3>${escapeHtml(it.title)}</h3>
      ${it.excerpt ? `<p class="excerpt">${escapeHtml(it.excerpt)}</p>` : ''}
      <div class="meta">
        <span>${timeAgo(it.added_at)}</span>
        ${it.byline ? `<span>· ${escapeHtml(it.byline)}</span>` : ''}
        ${it.highlight_count ? `<span class="hl-badge">${it.highlight_count} ✎</span>` : ''}
      </div>
      ${it.progress > 0.01 ? `<div class="progress"><i style="width:${Math.round(it.progress * 100)}%"></i></div>` : ''}
      <button class="card-menu" title="Options">⋯</button>
    </article>
  `).join('');
}

async function load() {
  try {
    items = await api('/api/items');
    render();
  } catch (err) {
    toast(`Could not load library: ${err.message}`);
  }
}

grid.addEventListener('click', async (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const item = items.find((i) => i.id === card.dataset.id);
  if (e.target.closest('.card-menu')) {
    const action = prompt(
      `"${item.title}"\n\nType: archive, unarchive, rename, original, or delete`,
      item.archived ? 'unarchive' : 'archive'
    );
    if (!action) return;
    if (action === 'archive' || action === 'unarchive') {
      await api(`/api/items/${item.id}`, { method: 'PATCH', body: { archived: action === 'archive' } });
    } else if (action === 'rename') {
      const title = prompt('New title:', item.title);
      if (title) await api(`/api/items/${item.id}`, { method: 'PATCH', body: { title } });
    } else if (action === 'original' && item.url) {
      window.open(item.url, '_blank');
      return;
    } else if (action === 'delete') {
      if (confirm('Delete this item and its highlights?')) {
        await api(`/api/items/${item.id}`, { method: 'DELETE' });
      }
    }
    load();
    return;
  }
  location.href = `/reader.html?id=${item.id}`;
});

filters.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter;
  for (const b of filters.querySelectorAll('button')) b.classList.toggle('active', b === btn);
  render();
});

search.addEventListener('input', render);

// --- Save dialog -----------------------------------------------------------

document.getElementById('add-btn').addEventListener('click', () => {
  const base = location.origin;
  document.getElementById('clip-url').textContent = `${base}/clip?url=`;
  document.getElementById('bookmarklet-code').textContent =
    `javascript:location.href='${base}/clip?url='+encodeURIComponent(location.href)`;
  addDialog.showModal();
});

addDialog.addEventListener('click', (e) => {
  if (e.target === addDialog) addDialog.close();
});

document.getElementById('url-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = document.getElementById('url-input').value.trim();
  addDialog.close();
  toast('Saving page…', 60000);
  try {
    const r = await api('/api/clip', { method: 'POST', body: { url } });
    document.querySelector('.toast')?.remove();
    toast(r.existed ? 'Already in your library' : 'Saved ✓');
    document.getElementById('url-input').value = '';
    load();
  } catch (err) {
    document.querySelector('.toast')?.remove();
    toast(err.message, 5000);
  }
});

document.getElementById('pdf-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('pdf-input').files[0];
  if (!file) return;
  addDialog.close();
  toast('Uploading…', 60000);
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api('/api/items/upload', { method: 'POST', body: fd });
    document.querySelector('.toast')?.remove();
    toast('PDF saved ✓');
    load();
  } catch (err) {
    document.querySelector('.toast')?.remove();
    toast(err.message, 5000);
  }
});

// Feedback after a share-target save.
const saved = new URLSearchParams(location.search).get('saved');
if (saved) {
  history.replaceState(null, '', '/');
  toast(saved === 'none' ? 'Nothing saveable in that share' : 'Saved to Margins ✓');
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

load();
