<p align="center">
  <img src="extension/icons/icon.svg" width="80" alt="KoalaSound logo">
</p>

<h1 align="center">KoalaSound</h1>

<p align="center">
  <strong>Real-time audio processing for browser video tabs</strong> · PoC testbed for <a href="https://github.com/Shik3i/KoalaSync">KoalaSync</a>
  <br>
  <sub>No CDNs · No analytics · No dependencies · ~350 lines</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-1a73e8?logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
  <img src="https://img.shields.io/badge/status-proof--of--concept-yellow" alt="PoC">
</p>

---

## Features

| | |
|---|---|
| **🎯 Tab Picker** | All open tabs listed; audible (media-playing) tabs float to the top with 🔊 and 🎬 markers |
| **📦 Accordion Groups** | Collapsible tweak categories — expand for detail, collapse for compact view |
| **🎚 Compressor** | DynamicsCompressorNode with 3 fixed presets + fully custom manual mode |
| **⚡ Live Preview** | Drag sliders in Custom mode — hear changes instantly (40 ms debounced) |
| **💾 Per-tab State** | Selected tab, active preset, custom values persist across popup sessions |

## How to install

```bash
git clone https://github.com/Shik3i/KoalaSound.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top‑right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder inside the cloned repo

> [!NOTE]
> Existing tabs need a one‑time refresh for the content script to be injected.

## How to use

```
1. Click the KoalaSound toolbar icon
2. Pick a target tab from the list    ← audible tabs grouped on top
3. Click the Compressor header        ← expands the preset list
4. Choose a preset or switch to Custom
5. Tweak the sliders in real-time
```

| Preset | Threshold | Ratio | Best for |
|--------|-----------|-------|----------|
| **Gentle** | −20 dB | 4:1 | Speech, dialogue, movies |
| **Moderate** | −30 dB | 8:1 | General purpose |
| **Heavy** | −40 dB | 20:1 | Extreme dynamic range |
| **Custom** | any | any | Experimentation / live tuning |

The master toggle on the collapsed group header re‑activates the last used preset.

## Project structure

```
KoalaSound/
├── extension/              ← load this folder in Chrome
│   ├── manifest.json       Manifest V3
│   ├── popup.html          Popup shell
│   ├── popup.js            Tab list, accordion, preset logic, live sliders
│   ├── content.js          Web Audio API chain (injected in every tab)
│   ├── background.js       Service worker (placeholder)
│   └── styles.css          Dark theme
├── .gitignore
├── LICENSE                 MIT
└── README.md
```

## Audio routing

Each `<video>` / `<audio>` element gets its own processing chain:

```
MediaElement → dryGain → destination  (bypass / compressor off)
             ↘ compressor → wetGain ↗ (compressor on)
```

Toggling cross‑fades between the two paths over 40 ms (`linearRampToValueAtTime`) to avoid clicks or dropouts.

The compressor parameters (`threshold`, `knee`, `ratio`, `attack`, `release`) are applied directly to the `DynamicsCompressorNode` — no additional filtering or buffers.

## Architecture

```
┌───────────┐   chrome.tabs.sendMessage()   ┌──────────────────┐
│  popup.js  │ ────────────────────────────→ │  content.js      │
│  (popup)   │                               │  (target tab)    │
└───────────┘                               │  Web Audio graph │
                                             └──────────────────┘
       │ ▲                                          │
       │ │ chrome.storage.local                     │ WeakMap
       ▼ │                                          ▼
   ┌──────────┐                              ┌──────────┐
   │  per-tab  │                              │  video   │
   │  state    │                              │  chains  │
   └──────────┘                              └──────────┘
```

- **Popup** is ephemeral — state lives in `chrome.storage.local` so it survives popup close.
- **Content script** is injected via `manifest.json` `content_scripts` into every page at `document_idle`.
- **Audio chains** are stored in a `WeakMap` keyed on the DOM element — automatic GC when the element is removed.
- **AudioContext** is created lazily on first tweak and closed on `pagehide`.

## Known limitations

| Issue | Cause | Status |
|-------|-------|--------|
| AudioContext suspended | Chrome autoplay policy — compressor needs a user gesture in the tab | Workaround: click anywhere in the target tab |
| YouTube / Spotify / Web Audio sites | They already own `createMediaElementSource` — API allows only one call per element | Cannot be fixed from an extension |
| Shadow DOM media | `querySelectorAll` doesn't penetrate shadow roots | Future addition |
| Dynamically added media | New `<video>` elements added after a toggle aren't picked up | Re‑toggle to re‑scan |
| SPA navigation | AudioContext persists across `pushState` navigations (no `pagehide` fires) | Negligible — context stays idle |

## Development

```bash
├── No build step
├── No dependencies
├── Plain ES2020
├── Single manifest
└── Load → Edit → Reload extension in chrome://extensions
```

To add a new tweak category (e.g. EQ, limiter, gain):

1. Create a new accordion group in `popup.html`
2. Define presets in `popup.js` → `PRESETS`
3. Add a handler in `content.js`
4. Wire the message dispatch

## License

[MIT](LICENSE) © 2026 KoalaSound
