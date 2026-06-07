<p align="center">
  <img src="extension/icons/icon.svg" width="80" alt="KoalaSound logo">
</p>

<h1 align="center">KoalaSound</h1>

<p align="center">
  <strong>Real-time audio processing for browser video tabs</strong> · PoC testbed for <a href="https://github.com/Shik3i/KoalaSync">KoalaSync</a>
  <br>
  <sub>No CDNs · No analytics · No dependencies · ~1k lines</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-1a73e8?logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
  <img src="https://img.shields.io/badge/status-proof--of--concept-yellow" alt="PoC">
  <img src="https://img.shields.io/badge/CI-release-brightgreen" alt="Release CI">
</p>

---

## Features

| | |
|---|---|
| **🎯 Tab Dropdown** | Custom‑styled dropdown — audible tabs float to the top with 🔊, closes on outside click, slide+fade animation |
| **📦 Accordion Groups** | Smooth `max-height` expand/collapse — one click to toggle, another to expand details |
| **🎚 Compressor** | DynamicsCompressorNode with 3 fixed presets (Gentle / Moderate / Heavy) + fully custom slider mode |
| **⚡ Live Preview** | Drag any slider in Custom mode — changes arrive 40 ms later. Hear it while you tweak it |
| **💾 Per-tab State** | The selected tab, its enabled tweaks, active preset, and custom slider values all persist in `chrome.storage.local` |
| **🔒 Zero Dependencies** | No CDN, no fonts, no build step, no runtime — pure ES2020, plain CSS, single manifest |

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
2. Open the dropdown → pick a target tab       ← 🔊 = tab is playing audio
3. Expand the Compressor group                  ← click the header
4. Choose a preset (Gentle / Moderate / Heavy)
   — or select Custom and drag the sliders
5. The master toggle re‑activates the last used preset
```

| Preset | Threshold | Ratio | Release | Best for |
|--------|-----------|-------|---------|----------|
| **Gentle** | −20 dB | 4:1 | 50 ms | Dialogue, movies, speech |
| **Moderate** | −30 dB | 8:1 | 80 ms | General purpose, podcasts |
| **Heavy** | −40 dB | 20:1 | 100 ms | Extreme dynamic range, quiet environments |
| **Custom** | any | any | any | Experimentation / live tuning |

## Project structure

```
KoalaSound/
├── .github/workflows/release.yml     CI: ZIP + Release on tag push
├── extension/                         ← load this folder in Chrome
│   ├── manifest.json                  Manifest V3
│   ├── popup.html                     Popup shell
│   ├── popup.js                       Dropdown, accordion, presets, live sliders
│   ├── content.js                     Web Audio API chain (injected in every tab)
│   ├── background.js                  Service worker (placeholder)
│   ├── styles.css                     Dark theme with animations
│   └── icons/                         SVG source + PNG 16/48/128
├── .gitignore
├── LICENSE
└── README.md
```

## Audio routing

Each `<video>` / `<audio>` element gets its own processing chain using the Web Audio API:

```
MediaElement → dryGain → destination  (bypass / compressor off)
             ↘ compressor → wetGain ↗ (compressor on)
```

- **Bypassed** (off): `dryGain` at 100 %, `wetGain` at 0 % — signal passes through unchanged.
- **Active** (on): `dryGain` at 0 %, `wetGain` at 100 % — signal routed through the `DynamicsCompressorNode`.
- **Toggle**: Cross‑fades over 40 ms via `linearRampToValueAtTime` to avoid clicks or dropouts.
- **Custom**: All five compressor parameters (`threshold`, `knee`, `ratio`, `attack`, `release`) are written directly to the `AudioParam` objects — no additional filtering, no script processor, zero latency overhead.

### Why cross‑fade instead of connect/disconnect?

The naive approach disconnects the compressor node from the destination and re‑connects the source directly. This creates a brief gap (audio cuts out) and can cause audible pops. A cross‑fade keeps both paths wired permanently and simply ramps the gain of each — smooth, gapless, pop‑free.

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

| Component | Role |
|-----------|------|
| **popup.html / popup.js** | Renders the dropdown tab selector, accordion groups, preset radios, custom sliders. Sends messages to the active tab. Persists state in `chrome.storage.local` |
| **content.js** | Loaded into every page at `document_idle`. Listens for `apply_tweak` messages. Creates AudioContext lazily, manages per‑element `WeakMap` chains, applies cross‑fades |
| **background.js** | Minimal service worker — currently a no‑op, kept as a hook for future features |

## CI / Release

Pushing a tag matching `v*.*` triggers the release workflow (`.github/workflows/release.yml`):

```bash
git tag v1.0 && git push origin v1.0
```

The workflow:
1. Zips the `extension/` directory → `koalasound-v1.0.zip`
2. Creates a GitHub Release with the ZIP attached

Only explicit tags trigger this — normal commits and pushes do nothing.

## Known limitations

### ❌ Spotify, YouTube, Twitch, and other streaming sites

These services use the **Media Source Extensions (MSE)** and **Encrypted Media Extensions (EME)** to feed audio/video into `<video>` / `<audio>` elements. More importantly, they often create their **own Web Audio graph** — for example, YouTube applies its own dynamics processing, and Spotify wraps its audio track in a custom AudioContext pipeline.

The Web Audio API rule is: **`createMediaElementSource()` can only be called once per `HTMLMediaElement` in its entire lifetime**. If the page already called it (which YouTube, Spotify et al. do), our call throws a `DOMException`, and we have to silently skip that element.

**Why this can't be fixed from an extension:**
- There is no API to "tap into" an existing `AudioNode` chain from a content script.
- We cannot intercept or wrap the page's `AudioContext` before it's created.
- The `AudioParam` values of the page's own compressor are not exposed to us.
- Even if we used a `MediaStream` capture approach (`captureStream()` + `createMediaStreamSource()`), we'd be limited by autoplay policy and would introduce extra latency.

**Workarounds that don't work reliably:**
- `captureStream()` → `createMediaStreamSource()` → compressor → audio output. This creates a feedback loop on tabs that already play audio and adds ~100 ms of latency plus potential echo.
- Overwriting `HTMLMediaElement.prototype.play` to inject our audio context *before* the page does. This is fragile, race‑prone, and breaks on many sites.
- Using `chrome.debugger` API to attach a debugger and inspect the page's audio graph. This is overkill and requires the user to accept a scary permission prompt.

### ❌ AudioContext autoplay policy

Chrome suspends any `AudioContext` created without a direct user gesture in the **tab's own document**. Our content script receives the message from the popup (a different document), which does **not** count as a user gesture for the tab.

**What happens:** The toggle shows "ON", the gain ramps complete internally, but no audio processes until the user clicks or taps anywhere inside the target tab. After that, the context resumes and the compressor springs to life.

**Detection:** We log a warning to the console (`needs tab interaction to resume AudioContext`). The extension cannot show a UI prompt inside the tab because that would be intrusive.

### ⚠️ Shadow DOM media

`document.querySelectorAll('video, audio')` does not penetrate shadow roots. If a website embeds its player inside a closed shadow DOM (some custom players do), we won't find it.

**Possible future fix:** Recursively walk all shadow roots with `element.shadowRoot?.querySelectorAll(...)`.

### ⚠️ Dynamically added media (SPAs)

If a page adds new `<video>` or `<audio>` elements after we've already toggled the compressor, the new elements won't be processed. This is common in single‑page apps that lazy‑load content.

**Current workaround:** Toggle the master switch off then on — this re‑scans the DOM with `document.querySelectorAll` and sets up chains for any new elements.

### ⚠️ AudioContext lifecycle in SPAs

Single‑page apps that use `pushState` navigation (React, Vue, Angular) do not trigger `pagehide` or `unload` events. Our AudioContext therefore persists across virtual page navigations, sitting idle. It's closed only when the tab is actually closed, navigated to a new origin, or refreshed.

This is negligible — an idle AudioContext consumes no CPU and minimal memory (~a few KB).

### ✅ What *does* work

| Scenario | Works? | Notes |
|----------|--------|-------|
| Netflix, Amazon Prime, Disney+ | ✅ | Standard `<video>` with EME — no custom Web Audio layer |
| Local video files (`file://`) | ✅ | Simple `<video>` tag |
| Embedded video players (JWPlayer, Video.js) | ✅ | Usually plain `<video>` under the hood |
| `<audio>` elements (podcasts, music players) | ✅ | Same path as `<video>` |
| YouTube **if embedded** (`youtube.com/embed/...`) | ✅ | Plain `<video>` in an iframe — our `all_frames: true` catches it |
| Multiple videos on one page | ✅ | Each gets its own `WeakMap` entry |
| Extension popup → select → play | ✅ | Core workflow |

## Development

```bash
├── No build step
├── No dependencies to install
├── Plain ES2020 — runs as-is
├── Single manifest.json
└── Workflow: Edit → Reload extension in chrome://extensions
```

### Adding a new tweak category

1. **HTML** — Add a new `.tweak-group` block in `extension/popup.html`
2. **Presets** — Add an entry to `PRESETS` in `extension/popup.js`
3. **Content** — Add a `case` for the new tweak in the `chrome.runtime.onMessage` listener in `extension/content.js`
4. **Wire** — The popup's `persistAndSend` → `sendOnly` → `chrome.tabs.sendMessage` already handles generic dispatch

## License

[MIT](LICENSE) © 2026 KoalaDev
