// Procedural level generation. Every level 1..50000 is generated from its number,
// so the same level always plays the same way.
(function () {
  'use strict';
  const HD = (window.HD = window.HD || {});

  HD.MAX_LEVEL = 50000;
  HD.FH = 230;          // vertical distance between castle floors
  HD.SLAB = 30;         // floor/ceiling thickness
  HD.CEIL = HD.FH - HD.SLAB; // corridor height (alt of ceiling)
  HD.SW = 150;          // horizontal run of the staircase between floors
  HD.GRAV = 1500;
  HD.JUMPV = 600;
  HD.FALLT = 1.0;       // seconds for falling debris to hit the floor

  HD.THEMES = [
    { name: 'The Great Hall',     wall: ['#4a3b2f', '#3f3228', '#56463a'], floor: '#7a6650', decor: ['candles', 'banner', 'window', 'torch', 'candles'] },
    { name: 'Grand Staircase',    wall: ['#575367', '#4a4659', '#625e73'], floor: '#7d7686', decor: ['portrait', 'torch', 'window', 'portrait'] },
    { name: 'The Dungeons',       wall: ['#2f3d36', '#27332d', '#384840'], floor: '#4d5c53', decor: ['cauldron', 'greentorch', 'chains', 'cauldron'] },
    { name: 'The Library',        wall: ['#4b3a2c', '#3e3024', '#56442f'], floor: '#76603f', decor: ['shelf', 'shelf', 'candles', 'torch'] },
    { name: 'Charms Corridor',    wall: ['#5d5a52', '#4f4c45', '#69665d'], floor: '#867f71', decor: ['window', 'torch', 'armor', 'portrait'] },
    { name: 'Trophy Room',        wall: ['#4a3f2a', '#3c3322', '#574a31'], floor: '#7f6e46', decor: ['trophy', 'torch', 'banner', 'trophy'] },
    { name: 'Gryffindor Tower',   wall: ['#5a2f2a', '#4a2622', '#683832'], floor: '#7f4f3e', decor: ['banner', 'portrait', 'torch', 'window'] },
    { name: 'Forbidden Corridor', wall: ['#3a3640', '#2f2c35', '#44404b'], floor: '#5a5662', decor: ['chains', 'torch', 'armor', 'darkmark'] },
    { name: 'Astronomy Tower',    wall: ['#2e3550', '#262c44', '#373f5d'], floor: '#4e5676', decor: ['bigwindow', 'torch', 'bigwindow'] },
    { name: 'Chamber of Secrets', wall: ['#203a2e', '#1a3026', '#264535'], floor: '#386249', decor: ['serpent', 'greentorch', 'column', 'darkmark'] },
  ];

  // Obstacle catalogue: hitbox width and altitude band (alt = height above floor).
  // act = the move that beats it.
  HD.TYPES = {
    spikes:   { act: 'jump',  w: 50, a0: 0,  a1: 22 },
    pillar:   { act: 'jump',  w: 20, a0: 0,  a1: 28 },
    pumpkin:  { act: 'jump',  w: 22, a0: 0,  a1: 24 },
    rubble:   { act: 'jump',  w: 26, a0: 0,  a1: 20 },
    book:     { act: 'jump',  w: 34, a0: 0,  a1: 24, mv: 55 },
    wolf:     { act: 'jump',  w: 54, a0: 0,  a1: 30, mv: 150 },
    gap:      { act: 'jump' },
    crow:     { act: 'slide', w: 54, a0: 28, a1: 60, mv: 85 },
    beam:     { act: 'slide', w: 24, a0: 28, a1: HD.CEIL },
    flybooks: { act: 'slide', w: 32, a0: 28, a1: 92 },
    troll:    { act: 'slide', w: 40, a0: 28, a1: 86 },
    debris:   { act: 'dash',  w: 28 },
    dementor: { act: 'patronus', w: 36, a0: 0, a1: HD.CEIL, mv: 70 },
  };

  // Level -> which move gets introduced (tutorial freeze-frame the first time).
  HD.TUTORIAL = { 1: 'jump', 2: 'slide', 3: 'turn', 4: 'dash', 20: 'patronus' };
  HD.DEMENTOR_FROM = 20;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  HD.rng = rng;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  HD.clamp = clamp;

  HD.themeFor = (n, f) => HD.THEMES[(Math.floor((n - 1) / 10) + f) % HD.THEMES.length];
  HD.groupTheme = (g) => HD.THEMES[g % HD.THEMES.length];

  // Difficulty curve: first five levels are gentle tutorials, then an exponential
  // ramp that saturates around level ~400, with a sawtooth inside every group of
  // ten (the 10th level of each group is a harder "chest" level, the 1st is a breather).
  HD.levelParams = function (n) {
    const r = rng(n * 9973 + 17);
    const pos = (n - 1) % 10;
    let d;
    if (n <= 5) d = [0, 0.03, 0.06, 0.09, 0.12][n - 1];
    else {
      const base = 0.14 + 0.86 * (1 - Math.exp(-(n - 5) / 90));
      const saw = [-0.07, -0.04, -0.02, 0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.11][pos];
      d = clamp(base + saw * (0.4 + base), 0.1, 1);
    }
    const speed = 160 + 140 * d + (n > 500 ? Math.min(40, Math.log10(n / 500) * 25) : 0);
    const durT = n <= 5 ? 0.02 * (n - 1) : Math.min(1, 0.1 + (n - 5) / 260);
    const dur = clamp(Math.round(30 + 90 * durT * (0.55 + 0.45 * r()) + (pos === 9 && n > 5 ? 10 : 0)), 30, 120);
    const coins = Math.round(10 + (90 * (dur - 30)) / 90);
    return { n, d, speed, dur, coins, r, lives: n <= 5 ? 5 : 3 };
  };

  function pickType(n, d, r, force) {
    if (force) return force;
    const w = [['spikes', 3], ['pillar', 2], ['pumpkin', 1.4]];
    if (n >= 2) w.push(['crow', 2.6]);
    if (n >= 4) w.push(['debris', 1.4 + 2 * d]);
    if (n >= 5) w.push(['gap', 2], ['book', 1.6]);
    if (n >= 7) w.push(['beam', 1.6]);
    if (n >= 9) w.push(['flybooks', 1.6]);
    if (n >= 12) w.push(['troll', 1.2]);
    if (n >= 15) w.push(['wolf', 1.4 + d]);
    if (n >= HD.DEMENTOR_FROM) w.push(['dementor', 0.9 + d]);
    let tot = 0; for (const [, x] of w) tot += x;
    let k = r() * tot;
    for (const [t, x] of w) { if ((k -= x) <= 0) return t; }
    return 'spikes';
  }

  HD.genLevel = function (n) {
    const P = HD.levelParams(n);
    const r = P.r, s = P.speed, d = P.d;
    const total = s * P.dur;
    const tut = HD.TUTORIAL[n];
    const nTurns = n < 3 ? 0 : clamp(Math.round(P.dur / 24 + r() * 1.2 - 0.3), 1, 6);
    const TZ = Math.max(120, s * 0.6);
    const L = { P, n, floors: [], cps: [], snitches: [], TZ, total, tut };

    // Split the run into floors (corridors), alternating direction.
    const wts = []; let wsum = 0;
    for (let i = 0; i <= nTurns; i++) { const x = 0.75 + 0.5 * r(); wts.push(x); wsum += x; }
    let x = 0, dir = 1, sOff = 0;
    for (let f = 0; f <= nTurns; f++) {
      const len = Math.max(s * 7, (total * wts[f]) / wsum);
      const fl = { f, dir, xs: x, L: len, xe: x + dir * len, sOff, obs: [], theme: HD.themeFor(n, f), last: f === nTurns, tut: f === 0 && tut === 'turn' };
      L.floors.push(fl);
      sOff += len;
      x = fl.xe - dir * HD.SW;
      dir = -dir;
    }

    // Checkpoints: start of every floor after the first, plus mid-floor on long corridors.
    for (const fl of L.floors) {
      if (fl.f > 0) L.cps.push({ f: fl.f, u: 40 });
      const extra = fl.L > s * 22 ? Math.floor(fl.L / (s * 16)) : (L.floors.length === 1 ? 1 : 0);
      for (let k = 1; k <= extra; k++) L.cps.push({ f: fl.f, u: Math.round((fl.L * k) / (extra + 1)) });
    }
    for (const c of L.cps) { c.reached = false; c.t = 0; }

    // Obstacles.
    let tutPlaced = !(tut === 'jump' || tut === 'slide' || tut === 'dash' || tut === 'patronus');
    let lastDem = -1e9; // dementors stay ~10s apart so the Patronus can recharge
    const cand = []; // snitch candidates {f,u,alt}
    for (const fl of L.floors) {
      const start = fl.f === 0 ? s * 2.0 : s * 1.3;
      const end = fl.last ? fl.L - s * 1.2 : fl.L - TZ - s * 0.9;
      let u = start + s * 0.3;
      let prev = start - s * 0.6;
      const cpsHere = L.cps.filter((c) => c.f === fl.f).map((c) => c.u);
      while (u < end) {
        // keep a clean runway after each checkpoint
        const blocked = cpsHere.find((cu) => u > cu - 110 && u < cu + s * 1.1);
        if (blocked !== undefined) { u = blocked + s * 1.1 + 10; continue; }

        let force = null;
        if (!tutPlaced) force = tut === 'jump' ? 'spikes' : tut === 'slide' ? 'crow' : tut === 'patronus' ? 'dementor' : 'debris';
        let type = pickType(n, d, r, force);
        const su = fl.sOff + u;
        if (type === 'dementor' && !force && su - lastDem < s * 10) type = 'crow';
        const group = [];
        group.push(type);
        if (type === 'dementor') {
          lastDem = su;
          // a swarm on later levels; one Patronus drives them all off
          const swarm = n >= 150 ? 3 : n >= 60 ? 2 : 1;
          for (let k = 1; k < swarm && r() < 0.5 + d * 0.4; k++) group.push('dementor');
        } else if (!force && n >= 15 && r() < d * 0.55) {
          // combos on harder levels
          const second = pickType(n, d, r);
          if (second !== 'debris' && second !== 'dementor' && type !== 'debris') group.push(second);
        }
        let gu = u;
        for (let gi = 0; gi < group.length; gi++) {
          const t = group[gi];
          const T = HD.TYPES[t];
          const o = { type: t, u: gu, plan: gu, f: fl.f };
          if (t === 'gap') o.w = Math.round(48 + 58 * d);
          if (T.mv) o.u0 = o.u = gu + (560 * T.mv) / (s + T.mv); // starts moving when on screen; meets player near gu
          if (t === 'debris') {
            o.mode = force || r() < 0.65 ? 'dash' : 'early';
            o.trig = o.mode === 'dash' ? s * HD.FALLT * 0.95 : s * HD.FALLT * 1.7;
          }
          if (!tutPlaced && force) { o.tut = tut; tutPlaced = true; }
          o.u0 = o.u;
          fl.obs.push(o);

          // snitch candidates for this obstacle
          if (T.act === 'jump') {
            cand.push({ f: fl.f, u: gu - 40, alt: 104 }, { f: fl.f, u: gu, alt: 126 }, { f: fl.f, u: gu + 40, alt: 104 });
          } else if (T.act === 'slide') {
            cand.push({ f: fl.f, u: gu - 70, alt: 10 }, { f: fl.f, u: gu - 36, alt: 10 });
          } else {
            cand.push({ f: fl.f, u: gu + 60, alt: 14 }, { f: fl.f, u: gu + 92, alt: 14 });
          }
          if (gi < group.length - 1) {
            const nxt = group[gi + 1];
            const jj = T.act === 'jump' && HD.TYPES[nxt].act === 'jump';
            gu += t === 'dementor' ? 90 : s * (jj ? 1.1 : 0.95) + (o.w || 0);
          }
        }
        // a line of snitches on the runway before this obstacle
        const mid0 = prev + s * 0.5, mid1 = u - s * 0.55;
        if (mid1 - mid0 > 60) {
          const cnt = Math.min(5, Math.floor((mid1 - mid0) / 34));
          const c0 = (mid0 + mid1) / 2 - ((cnt - 1) * 34) / 2;
          for (let i = 0; i < cnt; i++) cand.push({ f: fl.f, u: c0 + i * 34, alt: 16 });
        }
        prev = gu;
        const gapSec = n === 1 ? 3.2 : Math.max(0.95, 2.8 - 1.9 * d);
        const spacing = Math.max(210, s * gapSec * (0.85 + 0.4 * r()));
        u = gu + spacing + (HD.TYPES[type].mv ? 120 : 0) + (type === 'gap' ? 40 : 0);
      }
      // runway snitches up to the end of the floor
      const endU = fl.last ? fl.L - 120 : fl.L - TZ - 40;
      for (let uu = prev + s * 0.6; uu < endU; uu += 38) cand.push({ f: fl.f, u: uu, alt: 16 });
    }

    // Choose exactly P.coins snitches spread evenly through the level.
    cand.sort((a, b) => a.f - b.f || a.u - b.u);
    const N = P.coins, C = cand.length;
    if (C <= N) {
      L.snitches = cand.slice();
    } else {
      for (let j = 0; j < C; j++) {
        if (Math.floor(((j + 1) * N) / C) > Math.floor((j * N) / C)) L.snitches.push(cand[j]);
      }
    }
    // if the level is short of candidates, sprinkle extras on the first floor runway
    let extra = 0;
    while (L.snitches.length < N) {
      const fl = L.floors[extra % L.floors.length];
      L.snitches.push({ f: fl.f, u: 60 + (extra % 6) * 30, alt: 16 + 30 * Math.floor(extra / 6) });
      extra++;
    }
    L.snitches.forEach((sn, i) => { sn.got = false; sn.banked = false; sn.ph = i * 0.7; });
    return L;
  };
})();
