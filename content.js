(() => {
  'use strict';

  let audioCtx = null;
  const chains = new WeakMap();

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function setupChain(el) {
    if (chains.has(el)) return chains.get(el);

    try {
      const ctx = getCtx();
      const src = ctx.createMediaElementSource(el);
      const compressor = ctx.createDynamicsCompressor();
      const dest = ctx.destination;

      compressor.threshold.value = -20;
      compressor.knee.value = 10;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.05;

      src.connect(dest);
      src.connect(compressor);

      const chain = { src, compressor, dest, bypassed: true };
      chains.set(el, chain);
      return chain;
    } catch {
      return null;
    }
  }

  function setCompressor(enabled) {
    const media = document.querySelectorAll('video, audio');
    media.forEach(el => {
      const chain = setupChain(el);
      if (!chain) return;

      if (enabled && chain.bypassed) {
        chain.src.disconnect(chain.dest);
        chain.compressor.connect(chain.dest);
        chain.bypassed = false;
      } else if (!enabled && !chain.bypassed) {
        chain.compressor.disconnect(chain.dest);
        chain.src.connect(chain.dest);
        chain.bypassed = true;
      }
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'apply_tweak') {
      if (msg.tweak === 'compressor') setCompressor(msg.enabled);
      sendResponse({ ok: true });
    }
    return true;
  });
})();
