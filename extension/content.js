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
        console.warn('KoalaSound: needs tab interaction to resume AudioContext');
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

      src.connect(dryGain);
      dryGain.connect(dest);

      src.connect(compressor);
      compressor.connect(wetGain);
      wetGain.connect(dest);

      dryGain.gain.value = 1;
      wetGain.gain.value = 0;

      const chain = { compressor, dryGain, wetGain, bypassed: true };
      chains.set(el, chain);
      return chain;
    } catch (e) {
      console.warn('KoalaSound: setup failed — element may already use Web Audio', e);
      return null;
    }
  }

  function setCompressor(enabled, params) {
    const media = document.querySelectorAll('video, audio');

    if (media.length === 0) {
      console.warn('KoalaSound: no media elements on this page');
    }

    media.forEach(el => {
      const chain = setupChain(el);
      if (!chain) return;

      if (params) {
        if (params.threshold !== undefined) chain.compressor.threshold.value = params.threshold;
        if (params.knee !== undefined) chain.compressor.knee.value = params.knee;
        if (params.ratio !== undefined) chain.compressor.ratio.value = params.ratio;
        if (params.attack !== undefined) chain.compressor.attack.value = params.attack;
        if (params.release !== undefined) chain.compressor.release.value = params.release;
      }

      const t = chain.dryGain.context.currentTime;
      if (enabled && chain.bypassed) {
        chain.dryGain.gain.linearRampToValueAtTime(0, t + 0.04);
        chain.wetGain.gain.linearRampToValueAtTime(1, t + 0.04);
        chain.bypassed = false;
      } else if (!enabled && !chain.bypassed) {
        chain.wetGain.gain.linearRampToValueAtTime(0, t + 0.04);
        chain.dryGain.gain.linearRampToValueAtTime(1, t + 0.04);
        chain.bypassed = true;
      }
    });
  }

  window.addEventListener('pagehide', closeCtx);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg.action === 'apply_tweak') {
        if (msg.tweak === 'compressor') setCompressor(msg.enabled, msg.params);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'unknown action' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  });
})();
