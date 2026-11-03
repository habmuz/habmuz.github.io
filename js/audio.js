// Tiny WebAudio synth: chiptune sound effects and an original looping tune.
(function () {
  'use strict';
  const HD = (window.HD = window.HD || {});
  let ac = null, master = null, musicGain = null, sfxGain = null, noiseBuf = null;
  let musicTimer = null, nextNote = 0, step = 0;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = HD.save && HD.save.muted ? 0 : 0.6; master.connect(ac.destination);
    sfxGain = ac.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
    musicGain = ac.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(freq, dur, type = 'square', vol = 0.15, to = null, when = 0, out = sfxGain) {
    if (!ac) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.2, freq = 1000, when = 0) {
    if (!ac) return;
    const t = ac.currentTime + when;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur);
  }

  let coinPitch = 0, coinT = 0;
  const sfx = {
    jump() { tone(300, 0.16, 'square', 0.1, 720); },
    slide() { noise(0.22, 0.18, 1400); },
    dash() { noise(0.28, 0.22, 3200); tone(220, 0.22, 'sawtooth', 0.06, 880); },
    snitch() {
      const now = performance.now();
      coinPitch = now - coinT < 450 ? Math.min(coinPitch + 1, 8) : 0; coinT = now;
      const f = 880 * Math.pow(2, coinPitch / 12);
      tone(f, 0.06, 'square', 0.08); tone(f * 1.5, 0.14, 'square', 0.07, null, 0.05);
    },
    turn() { tone(392, 0.08, 'triangle', 0.15); tone(523, 0.08, 'triangle', 0.15, null, 0.08); tone(659, 0.14, 'triangle', 0.15, null, 0.16); },
    rumble() { noise(0.7, 0.25, 220); },
    crash() { noise(0.45, 0.4, 500); tone(160, 0.4, 'square', 0.12, 40); },
    die() { tone(520, 0.12, 'square', 0.12); tone(390, 0.12, 'square', 0.12, null, 0.12); tone(260, 0.4, 'square', 0.12, 70, 0.24); },
    checkpoint() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.09, null, i * 0.08)); },
    win() { [523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 6 ? 0.6 : 0.14, 'square', 0.1, null, i * 0.12)); },
    unlock() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, null, i * 0.1)); },
    click() { tone(660, 0.05, 'square', 0.06); },
    shield() { tone(1200, 0.25, 'sine', 0.15, 300); noise(0.2, 0.15, 5000); },
    snap() { noise(0.06, 0.4, 8000); tone(1568, 0.12, 'square', 0.1, null, 0.05); tone(2093, 0.2, 'square', 0.08, null, 0.12); },
    spell() { tone(300, 0.3, 'sawtooth', 0.1, 1800); noise(0.25, 0.12, 6000); },
    howl() { tone(330, 0.9, 'triangle', 0.12, 520); tone(520, 0.6, 'triangle', 0.08, 300, 0.9); },
    buy() { [523, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', 0.1, null, i * 0.07)); },
    hint() { tone(880, 0.1, 'triangle', 0.12); tone(1175, 0.16, 'triangle', 0.12, null, 0.1); },
  };

  // Original 16-step loop in E minor (bass + arpeggio + sparse lead).
  const BASS = [40, 40, 40, 40, 36, 36, 36, 36, 43, 43, 43, 43, 38, 38, 42, 42];
  const LEAD = [64, 0, 67, 0, 71, 0, 69, 67, 64, 0, 0, 62, 64, 0, 0, 0, 60, 0, 64, 0, 67, 0, 66, 64, 62, 0, 66, 0, 71, 0, 0, 0];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function schedule() {
    const spb = 60 / 132 / 2; // eighth notes at 132bpm
    while (nextNote < ac.currentTime + 0.2) {
      const when = nextNote - ac.currentTime;
      const b = BASS[Math.floor(step / 2) % 16];
      if (step % 2 === 0) tone(mtof(b), spb * 1.8, 'triangle', 0.5, null, when, musicGain);
      const arp = [0, 7, 12, 15][step % 4];
      tone(mtof(b + 24 + arp), spb * 0.6, 'square', 0.07, null, when, musicGain);
      const l = LEAD[step % 32];
      if (l) tone(mtof(l + 12), spb * 1.6, 'square', 0.12, null, when, musicGain);
      if (step % 4 === 2) { if (noiseBuf) noiseHat(when); }
      nextNote += spb; step++;
    }
  }
  function noiseHat(when) {
    const t = ac.currentTime + when;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ac.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(musicGain); s.start(t); s.stop(t + 0.06);
  }

  HD.audio = {
    init,
    sfx: new Proxy(sfx, { get: (o, k) => () => { if (ac && !(HD.save && HD.save.muted)) o[k](); } }),
    startMusic() {
      if (!ac || musicTimer) return;
      nextNote = ac.currentTime + 0.1; step = 0;
      musicTimer = setInterval(schedule, 60);
    },
    stopMusic() { clearInterval(musicTimer); musicTimer = null; },
    setMuted(m) { if (master) master.gain.value = m ? 0 : 0.6; },
  };
})();
