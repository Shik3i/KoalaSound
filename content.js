(() => {
  'use strict';

  let audioCtx = null;
  const chains = new WeakMap();

  function getCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new AudioContext();
      } catch (e) {
        console.warn('KoalaSound: AudioContext not available', e);
        return null;
      }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {
        console.warn('KoalaSound: AudioContext suspended — needs user gesture in tab');
      });
    }
    return audioCtx;
  }

  function closeCtx() {
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  }

  function setupChain(el) {
    if (chains.has(el)) return chains.get(el);

    const ctx = getCtx();
    if (!ctx) return null;

    try {
      const src = ctx.createMediaElementSource(el);
      const compressor = ctx.createDynamicsCompressor();
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      const dest = ctx.destination;

      compressor.threshold.value = -20;
      compressor.knee.value = 10;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.05;

      src.connect(dryGain);
      dryGain.connect(dest);

      src.connect(compressor);
      compressor.connect(wetGain);
      wetGain.connect(dest);

      dryGain.gain.value = 1;
      wetGain.gain.value = 0;

      const chain = { ctx, src, compressor, dryGain, wetGain, bypassed: true };
      chains.set(el, chain);
      return chain;
    } catch (e) {
      console.warn('KoalaSound: setup failed for element', e);
      return null;
    }
  }

  function setCompressor(enabled) {
    const media = document.querySelectorAll('video, audio');
    let applied = 0;

    media.forEach(el => {
      const chain = setupChain(el);
      if (!chain) return;

      const t = chain.dryGain.context.currentTime;
      if (enabled && chain.bypassed) {
        chain.dryGain.gain.linearRampToValueAtTime(0, t + 0.04);
        chain.wetGain.gain.linearRampToValueAtTime(1, t + 0.04);
        chain.bypassed = false;
        applied++;
      } else if (!enabled && !chain.bypassed) {
        chain.wetGain.gain.linearRampToValueAtTime(0, t + 0.04);
        chain.dryGain.gain.linearRampToValueAtTime(1, t + 0.04);
        chain.bypassed = true;
        applied++;
      }
    });

    if (media.length === 0) {
      console.warn('KoalaSound: no video/audio elements found on page');
    }
  }

  window.addEventListener('pagehide', closeCtx);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'apply_tweak') {
      if (msg.tweak === 'compressor') setCompressor(msg.enabled);
      sendResponse({ ok: true });
    }
    return true;
  });
})();
