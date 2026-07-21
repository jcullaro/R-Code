// Service worker: injects the capture script, then uploads the snapshot to
// the Margins server (configured in the popup).

async function getConfig() {
  const { serverUrl, token } = await chrome.storage.sync.get(['serverUrl', 'token']);
  return { serverUrl: (serverUrl || 'http://localhost:8321').replace(/\/+$/, ''), token: token || '' };
}

async function clipTab(tab) {
  const { serverUrl, token } = await getConfig();
  setBadge(tab.id, '…', '#8a8a8a');
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['clip.js'],
    });
    if (!result?.html) throw new Error('capture failed');

    const res = await fetch(`${serverUrl}/api/clip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(result),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    setBadge(tab.id, '✓', '#2e7d32');
  } catch (err) {
    console.error('Margins clip failed:', err);
    setBadge(tab.id, '✕', '#c62828');
  }
  setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 3500);
}

function setBadge(tabId, text, color) {
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'margins-clip',
    title: 'Save page to Margins',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'margins-clip' && tab?.id) clipTab(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'clip-active-tab') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) clipTab(tab);
    });
    sendResponse({ ok: true });
  }
});
