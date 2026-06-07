let targetTabId = null;

const PRESETS = {
  compressor: {
    defaultPreset: 'gentle',
    presets: {
      gentle:  { threshold: -20, knee: 10, ratio: 4,  attack: 0.005, release: 0.05  },
      moderate:{ threshold: -30, knee: 15, ratio: 8,  attack: 0.003, release: 0.08  },
      heavy:   { threshold: -40, knee: 5,  ratio: 20, attack: 0.002, release: 0.1   },
      custom:  { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25  }
    }
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await renderTabs();
  setupAccordion();
  setupPresetRadios();
  setupCustomSliders();
  await restoreTargetTab();
});

/* ── helpers ── */

function setStatus(msg, isError) {
  const el = document.getElementById('status-bar');
  el.textContent = msg;
  el.className = isError ? 'error' : '';
  clearTimeout(el._timeout);
  if (msg) {
    el._timeout = setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
  }
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function formatParam(name, value) {
  switch (name) {
    case 'threshold': return `${value} dB`;
    case 'knee':      return `${value} dB`;
    case 'ratio':     return `${value}:1`;
    case 'attack':    return `${Math.round(value * 1000)} ms`;
    case 'release':   return `${Math.round(value * 1000)} ms`;
    default:          return value;
  }
}

/* ── tabs ── */

async function restoreTargetTab() {
  const { targetTabId: saved } = await chrome.storage.local.get('targetTabId');
  if (saved) {
    const tabs = await chrome.tabs.query({});
    if (tabs.some(t => t.id === saved)) selectTab(saved);
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

  if (mediaTabs.length && nonMediaTabs.length) {
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
  const { [key]: state } = await chrome.storage.local.get(key);

  document.querySelectorAll('.tweak-group').forEach(group => {
    const name = group.dataset.group;
    const gs = (state && state[name]) || {};
    const master = group.querySelector('.group-master-toggle');

    const preset = gs.preset || PRESETS[name].defaultPreset;
    const radio = group.querySelector(`input[value="${preset}"]`);

    master.checked = gs.enabled === true;
    if (radio) radio.checked = true;

    const controls = group.querySelector('.custom-controls');
    if (controls) {
      const cp = gs.customParams;
      if (cp) {
        PRESETS[name].presets.custom = { ...PRESETS[name].presets.custom, ...cp };
      }
      controls.querySelectorAll('input[data-param]').forEach(slider => {
        const val = PRESETS[name].presets.custom[slider.dataset.param];
        if (val !== undefined) {
          slider.value = val;
          const valueEl = slider.parentElement.querySelector('.param-value');
          if (valueEl) valueEl.textContent = formatParam(slider.dataset.param, val);
        }
      });
      controls.classList.toggle('visible', radio && radio.value === 'custom' && radio.checked);
    }
  });
}

/* ── accordion ── */

function setupAccordion() {
  document.querySelectorAll('.tweak-group-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('.switch')) return;
      const body = header.nextElementSibling;
      body.classList.toggle('expanded');
      header.classList.toggle('expanded');
    });
  });

  document.querySelectorAll('.group-master-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      if (!targetTabId) return;
      const group = toggle.closest('.tweak-group');
      const name = group.dataset.group;
      const enabled = toggle.checked;
      const preset = selectedPreset(name);
      const params = PRESETS[name].presets[preset];

      await persistAndSend(name, enabled, preset, params);
    });
  });
}

function setupPresetRadios() {
  document.querySelectorAll('.preset-option input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (!targetTabId || !radio.checked) return;

      const group = radio.closest('.tweak-group');
      const name = group.dataset.group;
      const preset = radio.value;

      const controls = group.querySelector('.custom-controls');
      if (controls) controls.classList.toggle('visible', preset === 'custom');

      group.querySelector('.group-master-toggle').checked = true;

      const params = PRESETS[name].presets[preset];
      persistAndSend(name, true, preset, params);
    });
  });
}

/* ── custom slider live preview ── */

function setupCustomSliders() {
  const liveSend = debounce(async group => {
    if (!targetTabId) return;
    const name = group.dataset.group;
    const master = group.querySelector('.group-master-toggle');
    if (!master.checked) return;

    const params = getCustomParams(group);
    await sendOnly(name, params);
  }, 40);

  document.querySelectorAll('.custom-controls input[data-param]').forEach(slider => {
    const group = slider.closest('.tweak-group');

    slider.addEventListener('input', () => {
      const param = slider.dataset.param;
      const value = parseFloat(slider.value);
      const valueEl = slider.parentElement.querySelector('.param-value');
      if (valueEl) valueEl.textContent = formatParam(param, value);

      PRESETS[group.dataset.group].presets.custom[param] = value;
      liveSend(group);
    });

    slider.addEventListener('change', async () => {
      const name = group.dataset.group;
      const params = getCustomParams(group);
      const key = `tab_${targetTabId}`;
      const { [key]: state } = await chrome.storage.local.get(key);
      await chrome.storage.local.set({
        [key]: { ...(state || {}), [name]: { ...(state?.[name] || {}), customParams: params } }
      });
    });
  });
}

function getCustomParams(group) {
  const params = {};
  group.querySelectorAll('.custom-controls input[data-param]').forEach(slider => {
    params[slider.dataset.param] = parseFloat(slider.value);
  });
  return params;
}

/* ── state / messaging ── */

function selectedPreset(groupName) {
  const r = document.querySelector(`input[name="${groupName}-preset"]:checked`);
  return r ? r.value : PRESETS[groupName].defaultPreset;
}

async function persistAndSend(groupName, enabled, preset, params) {
  const key = `tab_${targetTabId}`;
  const { [key]: state } = await chrome.storage.local.get(key);

  const groupState = { enabled, preset };
  if (preset === 'custom') groupState.customParams = params;

  await chrome.storage.local.set({
    [key]: { ...(state || {}), [groupName]: groupState }
  });

  await sendOnly(groupName, params, enabled);
}

async function sendOnly(groupName, params, enabled) {
  try {
    await chrome.tabs.sendMessage(targetTabId, {
      action: 'apply_tweak',
      tweak: groupName,
      enabled: enabled !== undefined ? enabled : true,
      params
    });
  } catch (e) {
    const msg = e.message && e.message.includes('tab')
      ? 'Tab gone – select a new one'
      : 'Reload the target tab to activate';
    setStatus(msg, true);
  }
}
