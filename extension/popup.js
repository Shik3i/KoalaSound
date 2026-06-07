let targetTabId = null;
let sendQueue = Promise.resolve();

const PRESETS = {
  compressor: {
    defaultPreset: 'gentle',
    presets: {
      gentle:   { threshold: -10, knee: 5,  ratio: 2.5, attack: 0.030, release: 0.250 },
      moderate: { threshold: -18, knee: 10, ratio: 4,   attack: 0.020, release: 0.200 },
      movie:    { threshold: -24, knee: 15, ratio: 8,   attack: 0.010, release: 0.300 },
      heavy:    { threshold: -32, knee: 5,  ratio: 20,  attack: 0.003, release: 0.150 },
      custom:   { threshold: -24, knee: 30, ratio: 12,  attack: 0.003, release: 0.250 }
    }
  },
  equalizer: {
    defaultPreset: 'flat',
    presets: {
      flat:      { bass: 0,   lowMid: 0,   mid: 0,   highMid: 0,   air: 0   },
      podcast:   { bass: -2,  lowMid: 0,   mid: 3,   highMid: 4,   air: 2   },
      movieBass: { bass: 5,   lowMid: 3,   mid: -1,  highMid: 1,   air: 3   },
      bright:    { bass: -1,  lowMid: -2,  mid: 0,   highMid: 3,   air: 5   },
      custom:    { bass: 0,   lowMid: 0,   mid: 0,   highMid: 0,   air: 0   }
    }
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const { version_name } = chrome.runtime.getManifest();
  const prefix = document.querySelector('.header-version');
  if (prefix) prefix.textContent = `v${version_name}`;

  setupTabSelect();
  setupAccordion();
  setupPresetRadios();
  setupCustomSliders();
  await tryRestoreTab();
});

/* ─── helpers ─── */

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

const RESTRICTED_PROTOCOLS = ['chrome:', 'about:', 'edge:', 'chrome-extension:', 'chrome-search:', 'devtools:'];

function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PROTOCOLS.some(p => url.startsWith(p));
}

async function storageGet(key) {
  try { const r = await chrome.storage.local.get(key); return r[key]; } catch { return undefined; }
}

async function storageSet(data) {
  try { await chrome.storage.local.set(data); return true; } catch { return false; }
}

function formatParam(name, value) {
  switch (name) {
    case 'threshold': return `${value} dB`;
    case 'knee':      return `${value} dB`;
    case 'ratio':     return `${value}:1`;
    case 'attack':
    case 'release':   return `${Math.round(value * 1000)} ms`;
    case 'bass':
    case 'lowMid':
    case 'mid':
    case 'highMid':
    case 'air':       return `${value > 0 ? '+' : ''}${value} dB`;
    default:          return value;
  }
}

/* ─── tab select dropdown ─── */

function setupTabSelect() {
  const trigger = document.getElementById('tabSelectTrigger');
  const dropdown = document.getElementById('tabSelectDropdown');

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    if (dropdown.classList.contains('open')) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  document.addEventListener('click', closeDropdown);
  dropdown.addEventListener('click', e => e.stopPropagation());

  document.getElementById('tabReloadBtn').addEventListener('click', async e => {
    e.stopPropagation();
    if (!targetTabId) return;
    try {
      await chrome.tabs.reload(targetTabId);
      setStatus('Reloading…', false);
      await new Promise(resolve => {
        const onUpdated = (tabId, changeInfo) => {
          if (tabId === targetTabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }, 10000);
      });
      await new Promise(r => setTimeout(r, 200));
      await reapplyState();
      setStatus('Tab reloaded & state restored', false);
    } catch {
      setStatus('Could not reload tab', true);
    }
  });
}

function openDropdown() {
  const trigger = document.getElementById('tabSelectTrigger');
  const dropdown = document.getElementById('tabSelectDropdown');
  buildDropdown();
  dropdown.classList.add('open');
  trigger.classList.add('open');
}

function closeDropdown() {
  const trigger = document.getElementById('tabSelectTrigger');
  const dropdown = document.getElementById('tabSelectDropdown');
  dropdown.classList.remove('open');
  trigger.classList.remove('open');
}

async function buildDropdown() {
  const dropdown = document.getElementById('tabSelectDropdown');
  const allTabs = (await chrome.tabs.query({})).filter(t => !isRestrictedUrl(t.url) && t.id !== chrome.tabs.TAB_ID_NONE);
  const mediaTabs = allTabs.filter(t => t.audible);
  const mediaIds = new Set(mediaTabs.map(t => t.id));
  const nonMediaTabs = allTabs.filter(t => !mediaIds.has(t.id));

  dropdown.innerHTML = '';

  mediaTabs.forEach(tab => dropdown.appendChild(createOption(tab, true)));
  if (mediaTabs.length && nonMediaTabs.length) {
    const sep = document.createElement('div');
    sep.className = 'tab-opt-sep';
    dropdown.appendChild(sep);
  }
  nonMediaTabs.forEach(tab => dropdown.appendChild(createOption(tab, false)));

  if (!allTabs.length) {
    const empty = document.createElement('div');
    empty.className = 'tab-opt-empty';
    empty.textContent = 'No tabs found';
    dropdown.appendChild(empty);
  }
}

function createOption(tab, isMedia) {
  const div = document.createElement('div');
  div.className = 'tab-option';
  div.dataset.tabId = tab.id;
  if (tab.id === targetTabId) div.classList.add('selected');

  const icon = document.createElement('span');
  icon.className = 'tab-opt-icon';
  icon.textContent = isMedia ? '🔊' : '🌐';

  const label = document.createElement('span');
  label.className = 'tab-opt-label';
  label.textContent = tab.title || 'Untitled';
  label.title = tab.title || '';

  const domain = document.createElement('span');
  domain.className = 'tab-opt-domain';
  try { domain.textContent = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}

  div.append(icon, label, domain);
  div.addEventListener('click', () => handleTabSelect(tab, isMedia));
  return div;
}

function handleTabSelect(tab, isMedia) {
  selectTab(tab.id);
  updateTrigger(tab, isMedia);
  closeDropdown();
}

function updateTrigger(tab, isMedia) {
  const trigger = document.getElementById('tabSelectTrigger');
  trigger.querySelector('.tab-select-icon').textContent = isMedia ? '🔊' : '🌐';
  trigger.querySelector('.tab-select-label').textContent = tab.title || 'Untitled';
}

/* ─── tab lifecycle ─── */

async function tryRestoreTab() {
  const saved = await storageGet('targetTabId');
  if (!saved) return;

  try {
    const tab = await chrome.tabs.get(saved);
    if (isRestrictedUrl(tab.url)) return;
    selectTab(tab.id);
    updateTrigger(tab, tab.audible);
  } catch {
    /* tab gone since last session — start fresh */
  }
}

async function selectTab(tabId) {
  targetTabId = tabId;
  await storageSet({ targetTabId: tabId });

  document.getElementById('tweaks').classList.remove('disabled');

  document.querySelectorAll('.tab-option').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.tabId) === tabId);
  });

  await restoreTweakState();
}

/* ─── tweak state ─── */

async function restoreTweakState() {
  const key = `tab_${targetTabId}`;
  const state = await storageGet(key);

  document.querySelectorAll('.tweak-group').forEach(group => {
    const name = group.dataset.group;
    const gs = (state && state[name]) || {};
    const master = group.querySelector('.group-master-toggle');

    let preset = gs.preset || PRESETS[name].defaultPreset;
    let radio = group.querySelector(`input[value="${preset}"]`);
    if (!radio) {
      preset = PRESETS[name].defaultPreset;
      radio = group.querySelector(`input[value="${preset}"]`);
    }

    master.checked = gs.enabled === true;
    if (radio) radio.checked = true;

    const controls = group.querySelector('.custom-controls');
    if (controls) {
      const cp = gs.customParams;
      if (cp) {
        Object.assign(PRESETS[name].presets.custom, cp);
      }
      controls.querySelectorAll('input[type="range"]').forEach(slider => {
        const val = PRESETS[name].presets.custom[slider.dataset.param];
        if (val !== undefined) {
          slider.value = val;
          const valueEl = slider.parentElement.querySelector('.param-value');
          if (valueEl) valueEl.value = formatParam(slider.dataset.param, val);
        }
      });
      controls.classList.toggle('visible', preset === 'custom');
    }
  });
}

/* ─── accordion / master toggle ─── */

function setupAccordion() {
  document.querySelectorAll('.tweak-group-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('.switch')) return;
      const body = header.nextElementSibling;
      const expanded = body.classList.toggle('expanded');
      header.classList.toggle('expanded', expanded);
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
    radio.addEventListener('change', async () => {
      if (!targetTabId || !radio.checked) return;

      const group = radio.closest('.tweak-group');
      const name = group.dataset.group;
      const preset = radio.value;

      const controls = group.querySelector('.custom-controls');
      if (controls) controls.classList.toggle('visible', preset === 'custom');

      group.querySelector('.group-master-toggle').checked = true;

      const params = PRESETS[name].presets[preset];
      await persistAndSend(name, true, preset, params);
    });
  });
}

/* ─── custom slider live preview ─── */

function parseRawValue(str) {
  const m = String(str).match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : NaN;
}

function setSliderFromInput(input, slider) {
  const raw = parseRawValue(input.value);
  if (isNaN(raw)) return false;
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const step = parseFloat(slider.step);
  const clamped = Math.min(max, Math.max(min, raw));
  const stepped = Math.round(clamped / step) * step;
  slider.value = Math.round(stepped * 1000) / 1000;
  input.value = formatParam(slider.dataset.param, parseFloat(slider.value));
  return true;
}

function setupCustomSliders() {
  const liveSend = debounce(async group => {
    if (!targetTabId) return;
    const master = group.querySelector('.group-master-toggle');
    if (!master.checked) return;

    const params = getCustomParams(group);
    await queuedSend(group.dataset.group, params, true);
  }, 40);

  document.querySelectorAll('.custom-controls input[type="range"]').forEach(slider => {
    const group = slider.closest('.tweak-group');

    slider.addEventListener('input', () => {
      const param = slider.dataset.param;
      const value = parseFloat(slider.value);
      const valueEl = slider.parentElement.querySelector('.param-value');
      if (valueEl) valueEl.value = formatParam(param, value);

      PRESETS[group.dataset.group].presets.custom[param] = value;
      liveSend(group);
    });

    slider.addEventListener('change', async () => {
      const name = group.dataset.group;
      const params = getCustomParams(group);
      const key = `tab_${targetTabId}`;
      const state = await storageGet(key);
      await storageSet({
        [key]: { ...(state || {}), [name]: { ...(state?.[name] || {}), customParams: params } }
      });
    });
  });

  document.querySelectorAll('.custom-controls .param-value').forEach(input => {
    const group = input.closest('.tweak-group');
    const slider = input.parentElement.querySelector('input[type="range"]');
    if (!slider) return;

    input.addEventListener('change', async () => {
      if (!setSliderFromInput(input, slider)) {
        input.value = formatParam(slider.dataset.param, parseFloat(slider.value));
        return;
      }
      const param = slider.dataset.param;
      const value = parseFloat(slider.value);
      PRESETS[group.dataset.group].presets.custom[param] = value;

      const name = group.dataset.group;
      const params = getCustomParams(group);
      const key = `tab_${targetTabId}`;
      const state = await storageGet(key);
      await storageSet({
        [key]: { ...(state || {}), [name]: { ...(state?.[name] || {}), customParams: params } }
      });

      if (targetTabId && group.querySelector('.group-master-toggle')?.checked) {
        queuedSend(name, params, true);
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.dispatchEvent(new Event('change'));
      }
      if (e.key === 'Escape') {
        input.value = formatParam(slider.dataset.param, parseFloat(slider.value));
        input.blur();
      }
    });
  });
}

function getCustomParams(group) {
  const params = {};
  group.querySelectorAll('.custom-controls input[type="range"]').forEach(slider => {
    params[slider.dataset.param] = parseFloat(slider.value);
  });
  return params;
}

/* ─── state / messaging ─── */

function selectedPreset(groupName) {
  const r = document.querySelector(`input[name="${groupName}-preset"]:checked`);
  return r ? r.value : PRESETS[groupName].defaultPreset;
}

async function reapplyState() {
  document.querySelectorAll('.tweak-group').forEach(group => {
    const name = group.dataset.group;
    const enabled = group.querySelector('.group-master-toggle').checked;
    if (!enabled) return;
    const preset = selectedPreset(name);
    const params = PRESETS[name].presets[preset];
    queuedSend(name, params, true);
  });
}

async function persistAndSend(groupName, enabled, preset, params) {
  const tabId = targetTabId;
  const key = `tab_${tabId}`;
  const state = await storageGet(key);

  const groupState = { enabled, preset };
  if (preset === 'custom') groupState.customParams = params;

  await storageSet({
    [key]: { ...(state || {}), [groupName]: groupState }
  });

  const ok = await queuedSend(groupName, params, enabled, tabId);
  if (ok) setStatus(enabled ? `${preset} ON` : `${groupName} OFF`);
}

/* ─── serialised sendMessage with retry ─── */

async function queuedSend(groupName, params, enabled, forceTabId) {
  await sendQueue;
  const task = (async () => {
    const tabId = forceTabId || targetTabId;
    if (!tabId) return false;

    try {
      await chrome.tabs.get(tabId);
    } catch {
      setStatus('Tab no longer exists – select a new one', true);
      return false;
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'apply_tweak',
          tweak: groupName,
          enabled: enabled !== undefined ? enabled : true,
          params
        });
        return true;
      } catch {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 150));
        } else {
          setStatus('Tab unreachable – reload or re-select', true);
          return false;
        }
      }
    }
    return false;
  })();
  sendQueue = task;
  return await task;
}
