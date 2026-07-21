const serverInput = document.getElementById('server');
const tokenInput = document.getElementById('token');
const status = document.getElementById('status');

chrome.storage.sync.get(['serverUrl', 'token']).then(({ serverUrl, token }) => {
  serverInput.value = serverUrl || 'http://localhost:8321';
  tokenInput.value = token || '';
});

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.sync.set({
      serverUrl: serverInput.value.trim(),
      token: tokenInput.value.trim(),
    });
    status.textContent = 'Settings saved';
    setTimeout(() => { status.textContent = ''; }, 1500);
  }, 400);
}
serverInput.addEventListener('input', persist);
tokenInput.addEventListener('input', persist);

document.getElementById('clip').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clip-active-tab' });
  status.textContent = 'Saving… watch the toolbar badge';
  setTimeout(() => window.close(), 900);
});

document.getElementById('open').addEventListener('click', () => {
  const url = (serverInput.value.trim() || 'http://localhost:8321').replace(/\/+$/, '');
  chrome.tabs.create({ url });
});
