# KoalaSound

> Audio tweaks for browser video tabs — testbed for features destined for [KoalaSync](https://github.com/Shik3i/KoalaSync).

A lightweight Chrome extension that lets you select a tab and apply real-time audio processing to its `<video>` / `<audio>` elements via the Web Audio API.

## Features

- **Tab picker** – lists all open tabs; audible (media-playing) tabs float to the top with 🔊 and 🎬 markers
- **Compressor** – DynamicsCompressorNode with 3 presets (Gentle / Moderate / Heavy) inside an accordion group
- **Per-tab persistence** – selected tab, active presets, and on/off state survive popup close (`chrome.storage.local`)

## How to install (developer mode)

```bash
git clone https://github.com/Shik3i/KoalaSound.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the cloned `KoalaSound` folder

Existing tabs need a one-time refresh for the content script to be injected.

## How to use

1. Click the KoalaSound toolbar icon
2. Pick a tab from the list (media tabs are grouped on top)
3. Expand the **Compressor** group by clicking the header
4. Choose a preset (Gentle, Moderate, or Heavy) — or flip the master toggle to re-activate the last preset
5. Play a video in that tab — volume differences are smoothed

## Architecture

```
popup      → chrome.tabs.sendMessage() → content.js (in target tab)
(popup.js)                               (Web Audio API graph)
```

| Layer | File | Role |
|-------|------|------|
| Popup UI | `popup.html` + `popup.js` | Tab list, toggle switches, state persistence |
| Content | `content.js` | Injected into every page; builds/tears down Web Audio chains on demand |
| Background | `background.js` | Placeholder service worker (currently unused) |

### Audio routing

Each `<video>` / `<audio>` element gets its own processing chain:

```
MediaElement → dryGain → destination  (bypass / compressor off)
             ↘ compressor → wetGain ↗ (compressor on)
```

Toggling cross-fades between the two paths over 40 ms to avoid clicks.

## Known limitations

| Issue | Cause | Status |
|-------|-------|--------|
| ❌ **AudioContext suspended** | Chrome autoplay policy — compressor won't work until the user interacts with the tab | Workaround: click anywhere in the target tab |
| ❌ **YouTube / Spotify / other Web Audio sites** | These sites already use `createMediaElementSource` on their media elements, and the API allows only one call per element | Cannot be fixed from an extension |
| ⚠️ **Shadow DOM media** | `document.querySelectorAll` doesn't penetrate shadow roots | Can be added later |
| ⚠️ **Dynamically added media** | New `<video>` elements added after a toggle won't be affected until the next toggle | Re-toggle to pick them up |
| ⚠️ **All frames processed** | `all_frames: true` sends the message to every frame; iframes with media are included, which is usually desired | Feature, not a bug |

## Development

```bash
# lint — no external deps, plain ES2020
npm init -y      # optional, for future tooling
```

## License

MIT
