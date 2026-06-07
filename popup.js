let targetTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await renderTabs();
  setupTweakListeners();
  await restoreTargetTab();
});

async function restoreTargetTab() {
  const { targetTabId: saved } = await chrome.storage.local.get('targetTabId');
  if (saved) {
    const tabs = await chrome.tabs.query({});
    if (tabs.some(t => t.id === saved)) {
      selectTab(saved);
    }
  }
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status-bar');
  el.textContent = msg;
  el.className = isError ? 'error' : '';
  clearTimeout(el._timeout);
  if (msg) {
    el._timeout = setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
  }
}

async function renderTabs() {
  const allTabs = await chrome.tabs.query({});
  const mediaTabs = allTabs.filter(t => t.audible);
  const mediaIds = new Set(mediaTabs.map(t => t.id));
  const nonMediaTabs = allTabs.filter(t => !mediaIds.has(t.id));

  const container = document.getElementById('tab-list');
  container.innerHTML = '';
  document.getElementById('tab-count').textContent = allTabs.length;

  mediaTabs.forEach(tab => container.appendChild(createTabItem(tab, true)));

  if (mediaTabs.length > 0 && nonMediaTabs.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'separator';
    container.appendChild(sep);
  }

  nonMediaTabs.forEach(tab => container.appendChild(createTabItem(tab, false)));
}

function createTabItem(tab, isMedia) {
  const div = document.createElement('div');
  div.className = 'tab-item';
  div.dataset.tabId = tab.id;

  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = `${isMedia ? '🎬 ' : ''}${tab.title || 'Untitled'}`;

  const domain = document.createElement('span');
  domain.className = 'tab-domain';
  try {
    domain.textContent = new URL(tab.url).hostname.replace(/^www\./, '');
  } catch {
    domain.textContent = '';
  }

  const indicator = document.createElement('span');
  indicator.className = 'tab-indicator';
  if (isMedia) indicator.textContent = '🔊';

  div.append(indicator, label, domain);
  div.addEventListener('click', () => selectTab(tab.id));
  return div;
}

async function selectTab(tabId) {
  targetTabId = tabId;
  await chrome.storage.local.set({ targetTabId: tabId });

  document.querySelectorAll('.tab-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.tabId) === tabId);
  });

  document.getElementById('tweaks').classList.remove('disabled');
  await restoreTweakState();
}

async function restoreTweakState() {
  const key = `tab_${targetTabId}`;
  const result = await chrome.storage.local.get(key);
  const state = result[key] || {};

  document.querySelectorAll('.tweak-toggle').forEach(input => {
    const name = input.dataset.tweak;
    input.checked = state[name] || false;
  });
}

function setupTweakListeners() {
  document.querySelectorAll('.tweak-toggle').forEach(input => {
    input.addEventListener('change', async () => {
      if (!targetTabId) return;

      const tweak = input.dataset.tweak;
      const enabled = input.checked;

      const key = `tab_${targetTabId}`;
      const result = await chrome.storage.local.get(key);
      const state = result[key] || {};
      state[tweak] = enabled;
      await chrome.storage.local.set({ [key]: state });

      try {
        await chrome.tabs.sendMessage(targetTabId, {
          action: 'apply_tweak',
          tweak,
          enabled
        });
        setStatus(enabled ? `${tweak} ON` : `${tweak} OFF`);
      } catch {
        setStatus('Refresh the target tab to activate', true);
      }
    });
  });
}
