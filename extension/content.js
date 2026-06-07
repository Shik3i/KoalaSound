(() => {
  'use strict';

  let audioCtx = null;
  const chains = new WeakMap();

  const EQ_BANDS = [
    { name: 'bass',    type: 'lowshelf',  freq: 80,    q: 0.7 },
    { name: 'lowMid',  type: 'peaking',   freq: 350,   q: 0.7 },
    { name: 'mid',     type: 'peaking',   freq: 1000,  q: 0.7 },
    { name: 'highMid', type: 'peaking',   freq: 4000,  q: 0.7 },
    { name: 'air',     type: 'highshelf', freq: 12000, q: 0.7 },
  ];

  function getCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new AudioContext({ latencyHint: 'interactive' });
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

  function createEqFilters(ctx) {
    return EQ_BANDS.map(band => {
      const f = ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.freq;
      f.Q.value = band.q;
      f.gain.value = 0;
      return f;
    });
  }

  function setupChain(el) {
    if (chains.has(el)) return chains.get(el);

    const ctx = getCtx();
    if (!ctx) return null;

    try {
      const src = ctx.createMediaElementSource(el);
      const compressor = ctx.createDynamicsCompressor();
      const filters = createEqFilters(ctx);
      const dryGain = ctx.createGain();
      const compGain = ctx.createGain();
      const eqGain = ctx.createGain();
      const dest = ctx.destination;

      src.connect(dryGain);
      dryGain.connect(dest);

      src.connect(compressor);
      compressor.connect(compGain);
      compGain.connect(dest);

      let prev = src;
      filters.forEach(f => { prev.connect(f); prev = f; });
      prev.connect(eqGain);
      eqGain.connect(dest);

      dryGain.gain.value = 1;
      compGain.gain.value = 0;
      eqGain.gain.value = 0;

      const chain = { compressor, filters, dryGain, compGain, eqGain, activeCount: 0, compressorOn: false, eqOn: false };
      chains.set(el, chain);
      return chain;
    } catch (e) {
      console.warn('KoalaSound: setup failed — element may already use Web Audio', e);
      return null;
    }
  }

  function rampGain(node, value, t) {
    const current = node.gain.value;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(current, t);
    node.gain.linearRampToValueAtTime(value, t + 0.04);
  }

  function updateCrossfade(chain) {
    const onCount = (chain.compressorOn ? 1 : 0) + (chain.eqOn ? 1 : 0);
    chain.activeCount = onCount;

    const t = chain.dryGain.context.currentTime;

    if (onCount === 0) {
      rampGain(chain.dryGain, 1, t);
      rampGain(chain.compGain, 0, t);
      rampGain(chain.eqGain, 0, t);
    } else {
      const perGain = 1 / Math.max(1, onCount);
      rampGain(chain.dryGain, 0, t);
      rampGain(chain.compGain, chain.compressorOn ? perGain : 0, t);
      rampGain(chain.eqGain, chain.eqOn ? perGain : 0, t);
    }
  }

  function setCompressor(enabled, params) {
    const media = document.querySelectorAll('video, audio');
    if (media.length === 0) console.warn('KoalaSound: no media elements on this page');

    media.forEach(el => {
      const chain = setupChain(el);
      if (!chain) return;

      if (enabled) {
        if (params) {
          if (params.threshold !== undefined) chain.compressor.threshold.value = params.threshold;
          if (params.knee !== undefined) chain.compressor.knee.value = params.knee;
          if (params.ratio !== undefined) chain.compressor.ratio.value = params.ratio;
          if (params.attack !== undefined) chain.compressor.attack.value = params.attack;
          if (params.release !== undefined) chain.compressor.release.value = params.release;
        }
      } else {
        chain.compressor.threshold.value = 0;
        chain.compressor.ratio.value = 1;
      }

      if (enabled !== chain.compressorOn) {
        chain.compressorOn = enabled;
        updateCrossfade(chain);
      }
    });
  }

  function setEqualizer(enabled, params) {
    const media = document.querySelectorAll('video, audio');
    if (media.length === 0) console.warn('KoalaSound: no media elements on this page');

    media.forEach(el => {
      const chain = setupChain(el);
      if (!chain) return;

      chain.filters.forEach((filter, i) => {
        const key = EQ_BANDS[i].name;
        if (enabled && params && params[key] !== undefined) {
          filter.gain.value = params[key];
        } else {
          filter.gain.value = 0;
        }
      });

      if (enabled !== chain.eqOn) {
        chain.eqOn = enabled;
        updateCrossfade(chain);
      }
    });
  }

  window.addEventListener('pagehide', closeCtx);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg.action === 'apply_tweak') {
        switch (msg.tweak) {
          case 'compressor': setCompressor(msg.enabled, msg.params); break;
          case 'equalizer':  setEqualizer(msg.enabled, msg.params); break;
        }
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'unknown action' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  });
})();