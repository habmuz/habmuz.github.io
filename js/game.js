// Runner engine: physics, obstacles, checkpoints and pixel-art rendering on a 640x360 canvas.
(function () {
  'use strict';
  const HD = (window.HD = window.HD || {});
  const W = 640, H = 360, GSY = 292; // ground line on screen
  const { FH, SLAB, CEIL, SW, GRAV, JUMPV, FALLT, TYPES, clamp } = HD;
  const STAND_H = 46, SLIDE_H = 22, HALF_W = 9;
  const SLIDE_T = 0.65, DASH_T = 0.45, DASH_CD = 1.0, DASH_MUL = 1.9, CLIMB_T = 0.6;
  const FONT = '"Press Start 2P", monospace';

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const img = new Image();
  img.src = 'assets/atlas.png';
  HD.atlasImg = img;
  const A = window.ATLAS;

  let L = null, P = null, p = null, state = 'off', lives = 0, got = 0, maxLives = 3, bonus = 0;
  let LO = {}, pet = null, bolts = [], hedwigFlip = false;
  let camX = 0, camY = 0, shake = 0, gtime = 0, stateT = 0, freeze = null, deathReason = '';
  let particles = [], popups = [], skin = 'harry', raf = 0, last = 0;
  const buf = { jump: -9, slide: -9, fwd: -9, back: -9, spell: -9 };
  const SPELL_CD = 8;
  const fallT = () => FALLT * (LO.timeturner ? 1.35 : 1);
  const dashCd = () => DASH_CD * (LO.timeturner ? 0.5 : 1);
  const BUF_T = 0.18;
  const now = () => performance.now() / 1000;

  // ---------- helpers ----------
  const gy = (f) => -f * FH;
  const floorOf = (f) => L.floors[f];
  const wx = (fl, u) => fl.xs + fl.dir * u;
  function hash(a, b, c) {
    let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0;
    return HD.rng(h);
  }
  function spr(name, i, x, y, flip = false, scale = 1, alpha = 1, ax = 0.5, ay = 1) {
    const fr = A[name][((i % A[name].length) + A[name].length) % A[name].length];
    const w = fr[2] * scale, h = fr[3] * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, fr[0], fr[1], fr[2], fr[3], Math.round(-w * ax), Math.round(-h * ay), Math.round(w), Math.round(h));
    ctx.restore();
  }
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function text(t, x, y, size, color, align = 'center', shadow = true) {
    ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(t, Math.round(x) + 1, Math.round(y) + 2); }
    ctx.fillStyle = color; ctx.fillText(t, Math.round(x), Math.round(y));
  }
  function glow(x, y, r, color, a = 0.35) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('A', a)); g.addColorStop(1, color.replace('A', 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  HD.skinScale = (id) => Math.min(1, 60 / A[id][A[id].length > 1 ? 1 : 0][3]);

  // ---------- patterns ----------
  const patCache = {};
  function brickPattern(theme) {
    if (patCache[theme.name]) return patCache[theme.name];
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const g = c.getContext('2d'); const r = HD.rng(theme.name.length * 977);
    g.fillStyle = '#1b1612'; g.fillRect(0, 0, 64, 32);
    for (let row = 0; row < 2; row++) {
      for (let k = -1; k < 3; k++) {
        const x = k * 32 + (row ? 16 : 0), y = row * 16;
        g.fillStyle = theme.wall[Math.floor(r() * 3)];
        g.fillRect(x + 1, y + 1, 30, 14);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 1, y + 1, 30, 2);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 13, 30, 2);
        if (r() < 0.4) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 4 + Math.floor(r() * 20), y + 4 + Math.floor(r() * 7), 3, 2); }
      }
    }
    return (patCache[theme.name] = ctx.createPattern(c, 'repeat'));
  }
  let extPat = null, vignette = null;
  function initStatic() {
    const c = document.createElement('canvas'); c.width = 48; c.height = 48;
    const g = c.getContext('2d'); g.fillStyle = '#0d0c12'; g.fillRect(0, 0, 48, 48);
    const r = HD.rng(42);
    for (let y = 0; y < 48; y += 12) for (let x = -24; x < 48; x += 24) {
      const ox = (y / 12) % 2 ? 12 : 0;
      g.fillStyle = ['#17151f', '#1b1924', '#14121b'][Math.floor(r() * 3)];
      g.fillRect(x + ox + 1, y + 1, 22, 10);
    }
    extPat = ctx.createPattern(c, 'repeat');
    vignette = document.createElement('canvas'); vignette.width = W; vignette.height = H;
    const v = vignette.getContext('2d');
    const gr = v.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(5,3,12,0.62)');
    v.fillStyle = gr; v.fillRect(0, 0, W, H);
  }

  // ---------- particles ----------
  function puff(x, y, n, color, spd = 80, grav = 200, life = 0.6, size = 2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3, g: grav, life: life * (0.6 + Math.random() * 0.6), t: 0, c: color, s: size });
    }
  }
  function popup(x, y, t, c = '#ffd34d', size = 8) { popups.push({ x, y, t, c, size, life: 0 }); }

  // ---------- game API ----------
  function start(n) {
    L = HD.genLevel(n); P = L.P;
    LO = HD.loadout ? HD.loadout() : {};
    maxLives = P.lives + (LO.scarf ? 1 : 0); lives = maxLives; got = 0; bonus = 0; bolts = [];
    skin = HD.save.skin;
    p = { f: 0, u: 0, alt: 0, vy: 0, ground: true, slide: 0, dash: 0, dashCd: 0, climb: null, inv: 0, anim: 0, pendSlide: false, coyote: 0, scale: HD.skinScale(skin), shield: LO.hat ? 1 : 0, dobby: LO.pet === 'dobby' ? 1 : 0, spellCd: 0, dj: false };
    pet = LO.pet ? { id: LO.pet, x: wx(L.floors[0], 0) - 30, y: gy(0), hop: 0 } : null;
    for (const k in buf) buf[k] = -9;
    particles = []; popups = []; freeze = null; shake = 0;
    state = 'intro'; stateT = 0; gtime = 0;
    const fl = L.floors[0];
    camX = wx(fl, 0) - 190; camY = gy(0) - GSY;
    if (!extPat) initStatic();
    ctx.imageSmoothingEnabled = false;
    cancelAnimationFrame(raf);
    last = now();
    raf = requestAnimationFrame(loop);
  }
  function stop() { state = 'off'; cancelAnimationFrame(raf); }
  function setPaused(v) {
    if (state === 'off') return;
    if (v && state !== 'paused') { HD.game._prev = state; state = 'paused'; }
    else if (!v && state === 'paused') { state = HD.game._prev || 'play'; last = now(); }
  }

  // world-relative input: 'up' | 'down' | 'left' | 'right'
  function input(k) {
    if (!p || state === 'off' || state === 'paused') return;
    const t = now();
    if (k === 'spell') { if (LO.spell) buf.spell = t; return; }
    if (k === 'up') buf.jump = t;
    else if (k === 'down') buf.slide = t;
    else {
      const dir = p.climb ? p.climb.dir : floorOf(p.f).dir;
      const wdir = k === 'right' ? 1 : -1;
      if (wdir === dir) buf.fwd = t; else buf.back = t;
    }
    if (freeze) {
      const need = freeze.need;
      if ((need === 'jump' && k === 'up') || (need === 'slide' && k === 'down') ||
          (need === 'dash' && buf.fwd === t) || (need === 'turn' && buf.back === t)) {
        freeze.obj && (freeze.obj.tutDone = true);
        if (need === 'turn') floorOf(p.f).tutDone = true;
        freeze = null;
      }
    }
  }
  const fresh = (k) => now() - buf[k] < BUF_T;
  const consume = (k) => { buf[k] = -9; };

  // ---------- simulation ----------
  function pRect() { return [p.u - HALF_W, p.u + HALF_W, p.alt, p.alt + (p.slide > 0 ? SLIDE_H : STAND_H)]; }
  const overlap = (a, b) => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];

  function overGap(fl, u) {
    for (const o of fl.obs) if (o.type === 'gap' && Math.abs(u - o.u) < o.w / 2 - 5) return true;
    return false;
  }

  function die(reason) {
    if (state !== 'play' || (p.inv > 0 && reason !== 'wall' && reason !== 'fell')) return;
    const fl0 = floorOf(p.f), px = wx(fl0, p.u), py = gy(p.f) - p.alt - 24;
    if (p.shield > 0 && reason !== 'wall' && reason !== 'fell') {
      p.shield--; p.inv = 1.3; shake = 6;
      HD.audio.sfx.shield(); puff(px, py, 26, '#8fd3ff', 150, 0, 0.6, 2);
      popup(px, py - 30, 'PROTEGO!', '#8fd3ff', 8);
      return;
    }
    if (p.dobby > 0) {
      p.dobby--; p.inv = 1.5; shake = 4;
      HD.audio.sfx.snap(); puff(px, py, 30, '#f2e6c9', 120, 0, 0.7, 2);
      popup(px, py - 30, 'DOBBY SAVES YOU!', '#ffe9b0', 8);
      if (reason === 'wall') {
        const nf = floorOf(p.f + 1);
        p.climb = { t: 0, x0: px, y0: gy(p.f), x1: nf.xs, y1: gy(p.f + 1), dir: nf.dir };
      } else if (reason === 'fell') {
        const gp = fl0.obs.find((o) => o.type === 'gap' && Math.abs(p.u - o.u) < o.w);
        if (gp) p.u = gp.u + gp.w / 2 + 14;
        p.alt = 0; p.vy = 0; p.ground = true;
      }
      return;
    }
    state = 'dead'; stateT = 0; deathReason = reason;
    lives--; shake = 12;
    if (reason === 'crushed') HD.audio.sfx.crash(); HD.audio.sfx.die();
    const fl = floorOf(p.f);
    puff(wx(fl, p.u), gy(p.f) - p.alt - 20, 24, '#ffdf6b', 140, 300, 0.8, 2);
  }

  function respawn() {
    let cp = { f: 0, u: 0 };
    for (const c of L.cps) if (c.reached) cp = c;
    for (const fl of L.floors) if (fl.f >= cp.f) for (const o of fl.obs) {
      o.u = o.u0; o.active = false; o.st = null; o.t = 0; o.landed = false; o.dead = false; o.howled = false;
    }
    for (const sn of L.snitches) {
      if (sn.got && !sn.banked) { sn.got = false; got--; }
      if (!sn.got) { sn.missed = false; if (sn.u0 !== undefined) { sn.u = sn.u0; sn.alt = sn.a0; } }
    }
    bolts = [];
    Object.assign(p, { f: cp.f, u: cp.u, alt: 0, vy: 0, ground: true, slide: 0, dash: 0, dashCd: 0, climb: null, inv: 1.6, pendSlide: false, dj: false });
    for (const k in buf) buf[k] = -9;
    const fl = floorOf(p.f);
    camX = wx(fl, p.u) - (fl.dir > 0 ? 190 : W - 190); camY = gy(p.f) - GSY;
    state = 'play'; stateT = 0;
  }

  function update(dt) {
    gtime += dt; stateT += dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 40);
    for (const c of L.cps) if (c.reached) c.t += dt;
    updateParticles(dt);

    if (state === 'intro') { if (stateT > 1.7) { state = 'play'; stateT = 0; } updateCam(dt); return; }
    if (state === 'dead') {
      if (stateT > 1.3) {
        if (lives > 0) respawn();
        else { state = 'over'; HD.ui.onLevelEnd({ win: false, n: L.n, got, bonus, total: L.snitches.length }); }
      }
      return;
    }
    if (state === 'win') {
      if (stateT > 1.6 && !L.reported) {
        L.reported = true; state = 'over';
        const total = L.snitches.length, pct = got / total;
        HD.ui.onLevelEnd({ win: true, n: L.n, got, bonus, total, stars: pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1 });
      }
      p.anim += dt; updateCam(dt); return;
    }
    if (state !== 'play') return;

    if (freeze) { p.anim += dt * 0.15; updateCam(dt); return; }

    p.inv = Math.max(0, p.inv - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.spellCd = Math.max(0, p.spellCd - dt);
    updatePet(dt);
    p.dash = Math.max(0, p.dash - dt);

    // climbing the staircase to the next floor
    if (p.climb) {
      const c = p.climb; c.t += dt; p.anim += dt;
      if (c.t >= CLIMB_T) {
        p.f++; p.u = 0; p.climb = null; p.alt = 0; p.vy = 0; p.ground = true;
        popup(wx(floorOf(p.f), 20), gy(p.f) - 118, floorOf(p.f).theme.name, '#e8d9ff', 8);
      }
      updateCam(dt); return;
    }

    const fl = floorOf(p.f);
    const spd = P.speed * (p.dash > 0 ? DASH_MUL : 1);

    // actions
    if (fresh('fwd') && p.dashCd <= 0) {
      consume('fwd'); p.dash = DASH_T; p.dashCd = dashCd(); HD.audio.sfx.dash();
    }
    if (fresh('jump') && (p.ground || p.coyote > 0)) {
      consume('jump'); p.vy = JUMPV; p.ground = false; p.coyote = 0; p.slide = 0; p.pendSlide = false;
      HD.audio.sfx.jump();
      puff(wx(fl, p.u), gy(p.f), 5, '#b9a98c', 50, 100, 0.35);
    } else if (fresh('jump') && LO.broom && !p.ground && !p.dj) {
      consume('jump'); p.vy = JUMPV * 0.85; p.dj = true; p.slide = 0; p.pendSlide = false;
      HD.audio.sfx.jump();
      puff(wx(fl, p.u), gy(p.f) - p.alt, 10, '#d9b36a', 70, 60, 0.4);
    }
    if (fresh('spell') && p.spellCd <= 0) {
      consume('spell'); p.spellCd = SPELL_CD; HD.audio.sfx.spell();
      bolts.push({ f: p.f, u: p.u + 14, start: p.u });
    }
    updateBolts(fl, dt);
    if (fresh('slide')) {
      consume('slide');
      if (p.ground) { p.slide = SLIDE_T; HD.audio.sfx.slide(); }
      else { p.vy = Math.min(p.vy, -900); p.pendSlide = true; }
    }

    // turn at the staircase
    if (!fl.last && fresh('back') && p.u >= fl.L - L.TZ) {
      consume('back');
      const nf = floorOf(p.f + 1);
      p.climb = { t: 0, x0: wx(fl, p.u), y0: gy(p.f) - p.alt, x1: nf.xs, y1: gy(p.f + 1), dir: nf.dir };
      p.slide = 0; p.dash = 0; p.inv = Math.max(p.inv, 0.2);
      HD.audio.sfx.turn();
      return;
    }

    // tutorial freeze for the turn
    if (fl.tut && !fl.tutDone && p.u >= fl.L - L.TZ * 0.6) { freeze = { need: 'turn' }; HD.audio.sfx.hint(); }

    // motion
    p.u += spd * dt;
    p.anim += dt * (spd / 190);
    if (p.slide > 0) p.slide = Math.max(0, p.slide - dt);
    if (!p.ground) {
      p.vy -= GRAV * dt; p.alt += p.vy * dt;
      if (p.alt <= 0) {
        if (overGap(fl, p.u)) {
          if (p.alt < -40) { die('fell'); return; }
        } else {
          p.alt = 0; p.vy = 0; p.ground = true; p.dj = false;
          puff(wx(fl, p.u), gy(p.f), 4, '#b9a98c', 40, 80, 0.3);
          if (p.pendSlide) { p.pendSlide = false; p.slide = SLIDE_T; HD.audio.sfx.slide(); }
        }
      }
    } else if (overGap(fl, p.u)) {
      p.ground = false; p.vy = 0; p.coyote = 0.07;
    }
    if (p.coyote > 0) p.coyote -= dt;
    if (p.dash > 0 && Math.random() < 0.6) particles.push({ x: wx(fl, p.u) - fl.dir * 8, y: gy(p.f) - p.alt - 10 - Math.random() * 30, vx: -fl.dir * 40, vy: 0, g: 0, life: 0.3, t: 0, c: '#ffe27a', s: 2 });

    // wall / finish
    if (!fl.last && p.u >= fl.L) { p.u = fl.L; die('wall'); return; }
    if (fl.last && p.u >= fl.L - 30) {
      state = 'win'; stateT = 0; HD.audio.sfx.win();
      const x = wx(fl, fl.L - 20);
      puff(x, gy(p.f) - 40, 50, '#ffd34d', 200, 120, 1.2, 3);
      puff(x, gy(p.f) - 40, 30, '#b48cff', 160, 80, 1.2, 2);
      return;
    }

    // obstacles
    const pr = pRect();
    for (const o of fl.obs) {
      if (o.dead) continue;
      const T = TYPES[o.type];
      const dist = o.u - p.u;
      if (T.mv) {
        if (!o.active && dist < 560) o.active = true;
        if (o.active) o.u -= T.mv * dt;
        if (o.type === 'wolf' && o.active && !o.howled) { o.howled = true; HD.audio.sfx.howl(); }
      }
      if (o.type === 'debris') {
        if (!o.st && dist < o.trig && dist > -20) {
          o.st = 'fall'; o.t = 0; HD.audio.sfx.rumble(); shake = Math.max(shake, 3);
          puff(wx(fl, o.u), gy(p.f) - CEIL + 4, 10, '#8d8577', 60, 300, 0.7);
          if (o.tut && !o.tutDone) { freeze = { need: 'dash', obj: o }; HD.audio.sfx.hint(); return; }
        }
        if (o.st === 'fall') {
          o.t += dt;
          if (o.t >= fallT()) {
            o.st = 'down'; shake = Math.max(shake, 5);
            puff(wx(fl, o.u), gy(p.f) - 4, 16, '#9b927f', 110, 300, 0.6, 2);
          }
          const bot = (CEIL - 26) * (1 - Math.pow(Math.min(1, o.t / fallT()), 2));
          if (overlap(pr, [o.u - 14, o.u + 14, bot, bot + 26])) { die('crushed'); return; }
        }
        if (o.st === 'down' && overlap(pr, [o.u - 13, o.u + 13, 0, 20])) { die('rubble'); return; }
        continue;
      }
      if (o.type === 'gap') {
        if (o.tut && !o.tutDone && dist <= P.speed * 0.4 && dist > 0) { freeze = { need: 'jump', obj: o }; HD.audio.sfx.hint(); return; }
        continue;
      }
      // tutorial freeze-frames
      if (o.tut && !o.tutDone && dist > 0) {
        const trig = T.act === 'jump' ? P.speed * 0.4 : (T.w / 2 + HALF_W + (T.mv ? 34 : 8 + P.speed * 0.08));
        if (dist <= trig) { freeze = { need: T.act, obj: o }; HD.audio.sfx.hint(); return; }
      }
      if (Math.abs(dist) > 120) continue;
      if (overlap(pr, [o.u - T.w / 2, o.u + T.w / 2, T.a0, T.a1])) { die(o.type); return; }
    }

    // snitches (pets can pull them in or catch the ones you miss)
    const magnet = LO.pet === 'crookshanks' ? 95 : LO.pet === 'scabbers' ? 48 : 0;
    if (magnet || LO.pet === 'owl') for (const sn of L.snitches) {
      if (sn.got || sn.f !== p.f) continue;
      const du = sn.u - p.u;
      if (magnet && du > -20 && du < magnet) {
        if (sn.u0 === undefined) { sn.u0 = sn.u; sn.a0 = sn.alt; }
        sn.u += (p.u - sn.u) * Math.min(1, dt * 9); sn.alt += (p.alt + 22 - sn.alt) * Math.min(1, dt * 9);
      }
      if (LO.pet === 'owl' && !sn.missed && du < -40) {
        sn.missed = true; hedwigFlip = !hedwigFlip;
        if (hedwigFlip) {
          sn.got = true; got++; HD.audio.sfx.snitch();
          const x = wx(fl, sn.u), y = gy(p.f) - sn.alt;
          puff(x, y, 10, '#ffffff', 80, 0, 0.5, 2); popup(x, y - 12, 'HEDWIG!', '#ffffff', 6);
          if (pet) pet.swoop = 0.6;
        }
      }
    }
    for (const sn of L.snitches) {
      if (sn.got || sn.f !== p.f || Math.abs(sn.u - p.u) > 30) continue;
      const sa = sn.alt + Math.sin(gtime * 3 + sn.ph) * 3;
      const cx = clamp(sn.u, pr[0], pr[1]), cy = clamp(sa, pr[2], pr[3]);
      if ((cx - sn.u) ** 2 + (cy - sa) ** 2 < 14 * 14) {
        sn.got = true; got++;
        HD.audio.sfx.snitch();
        const x = wx(fl, sn.u), y = gy(p.f) - sa;
        puff(x, y, 8, '#ffd34d', 70, 0, 0.4, 2);
        popup(x, y - 12, '+1', '#ffd34d', 8);
      }
    }

    // checkpoints
    for (const c of L.cps) {
      if (!c.reached && c.f === p.f && p.u >= c.u) {
        c.reached = true; c.t = 0;
        if (LO.pet === 'toad') { bonus += 2; popup(wx(fl, c.u), gy(p.f) - 92, '+2 TREVOR', '#9be27a', 6); }
        for (const sn of L.snitches) if (sn.got) sn.banked = true;
        HD.audio.sfx.checkpoint();
        const x = wx(fl, c.u);
        puff(x, gy(p.f) - 40, 18, '#ff5a4a', 90, 120, 0.8, 2);
        popup(x, gy(p.f) - 76, 'CHECKPOINT!', '#7dff9a', 8);
      }
    }
    updateCam(dt);
  }

  function updateParticles(dt) {
    for (const q of particles) { q.t += dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    particles = particles.filter((q) => q.t < q.life);
    for (const q of popups) q.life += dt;
    popups = popups.filter((q) => q.life < 1.1);
    // ambient dust falling from the ceiling
    if (state !== 'off' && Math.random() < 0.25) {
      particles.push({ x: camX + Math.random() * W, y: gy(p.f) - CEIL + 2, vx: 0, vy: 20, g: 60, life: 2.2, t: 0, c: 'rgba(200,190,170,0.5)', s: 1 });
    }
  }

  function playerWorld() {
    if (p.climb) {
      const c = p.climb, k = Math.min(1, c.t / CLIMB_T);
      const e = k * k * (3 - 2 * k);
      return [c.x0 + (c.x1 - c.x0) * k, c.y0 + (c.y1 - c.y0) * e];
    }
    const fl = floorOf(p.f);
    return [wx(fl, p.u), gy(p.f) - p.alt];
  }
  function updateCam(dt) {
    if (state === 'over' && L.reported) return;
    const [x, y] = playerWorld();
    const dir = p.climb ? p.climb.dir : floorOf(p.f).dir;
    const tx = x - (dir > 0 ? 190 : W - 190);
    const ty = (p.climb ? y + p.alt : gy(p.f)) - GSY;
    camX += (tx - camX) * Math.min(1, dt * (p.climb ? 4 : 7));
    camY += (ty - camY) * Math.min(1, dt * 6);
  }

  // ---------- spells & pets ----------
  function updateBolts(fl, dt) {
    for (const b of bolts) {
      b.u += 640 * dt;
      for (const o of fl.obs) {
        if (o.dead || o.type === 'gap' || Math.abs(o.u - b.u) > 22) continue;
        if (o.type === 'debris' && !o.st) continue; // nothing to hit until it falls
        o.dead = true; b.done = true;
        const x = wx(fl, o.u), y = gy(p.f) - 30;
        HD.audio.sfx.crash(); shake = Math.max(shake, 4);
        puff(x, y, 24, '#7dff9a', 140, 120, 0.7, 2);
        popup(x, y - 26, 'STUPEFY!', '#7dff9a', 8);
        break;
      }
      if (b.u - b.start > 520) b.done = true;
    }
    bolts = bolts.filter((b) => !b.done);
  }
  function drawBolts() {
    for (const b of bolts) {
      const fl = floorOf(b.f), x = wx(fl, b.u), y = gy(b.f) - 30;
      glow(x, y, 24, 'rgba(110,255,150,A)', 0.5);
      spr('spell', 0, x, y, fl.dir < 0, 0.8, 1, 0.5, 0.5);
    }
  }
  function updatePet(dt) {
    if (!pet) return;
    const [x, y] = playerWorld();
    const dir = p.climb ? p.climb.dir : floorOf(p.f).dir;
    const fly = pet.id === 'owl';
    const tx = x - dir * (fly ? 26 : 30), ty = fly ? y - 62 + Math.sin(gtime * 4) * 5 : (p.climb ? y : gy(p.f));
    pet.x += (tx - pet.x) * Math.min(1, dt * 10);
    pet.y += (ty - pet.y) * Math.min(1, dt * (fly ? 5 : 14));
    pet.dir = dir;
    pet.hop = (pet.hop + dt * 9) % (Math.PI * 2);
    if (pet.swoop) pet.swoop = Math.max(0, pet.swoop - dt);
  }
  function drawPet(behind) {
    if (!pet || state === 'off' || (state === 'over' && L.reported)) return;
    if (behind !== (pet.id !== 'owl')) return;
    const flip = pet.dir < 0;
    const hop = pet.id === 'toad' ? Math.abs(Math.sin(pet.hop)) * 8 : (pet.id === 'owl' ? 0 : Math.abs(Math.sin(pet.hop * 1.4)) * 2);
    const sw = pet.swoop ? Math.sin(pet.swoop * 10) * 6 : 0;
    const frame = pet.id === 'toad' ? (hop > 4 ? 1 : 0) : 0;
    const sc = pet.id === 'toad' ? 0.6 : 1;
    spr(pet.id, frame, pet.x, pet.y - hop + sw, flip, sc);
  }

  // ---------- rendering ----------
  function floorBounds(fl) {
    const d = fl.dir;
    const endFace = fl.xe + d * 14;
    const startFace = fl.f === 0 ? fl.xs - d * 260 : fl.xs - d * (SW + 14);
    return [Math.min(endFace, startFace), Math.max(endFace, startFace)];
  }

  function drawFloorInterior(fl) {
    const [lo, hi] = floorBounds(fl), g = gy(fl.f);
    ctx.fillStyle = brickPattern(fl.theme);
    ctx.fillRect(lo, g - CEIL, hi - lo, CEIL);
    // ceiling shadow and floor shading
    const gr = ctx.createLinearGradient(0, g - CEIL, 0, g);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(0.35, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = gr; ctx.fillRect(lo, g - CEIL, hi - lo, CEIL);
    // decorations
    const k0 = Math.max(0, Math.floor((camX - 80 - lo) / 140)), k1 = Math.floor((camX + W + 80 - lo) / 140);
    for (let k = k0; k <= k1; k++) {
      const x = lo + 70 + k * 140;
      if (x > hi - 40) break;
      const r = hash(L.n, fl.f, k);
      if (r() < 0.22) continue;
      const kind = fl.theme.decor[Math.floor(r() * fl.theme.decor.length)];
      drawDecor(kind, x, g, r);
    }
  }

  const HOUSE = [['#8c1d18', '#e2b23b'], ['#1d5c33', '#c0c6cc'], ['#1d3a7a', '#b0763b'], ['#d9a92a', '#222']];
  function drawDecor(kind, x, g, r) {
    const top = g - CEIL;
    switch (kind) {
      case 'torch': case 'greentorch': {
        const gc = kind === 'torch' ? 'rgba(255,170,60,A)' : 'rgba(90,255,140,A)';
        const fl = 0.3 + Math.sin(gtime * 13 + x) * 0.04 + Math.random() * 0.03;
        glow(x, g - 128, 60, gc, fl);
        spr('lantern', 0, x, g - 112, false, 1);
        rect(x - 1, g - 112, 3, 6, '#3b2a1c');
        break;
      }
      case 'window': {
        const wx0 = x - 14, wy = g - 168;
        rect(wx0 - 3, wy - 3, 34, 66, '#2a2620');
        rect(wx0, wy + 8, 28, 52, '#16224a');
        rect(wx0 + 4, wy + 3, 20, 6, '#16224a'); rect(wx0 + 8, wy, 12, 4, '#16224a');
        for (let i = 0; i < 5; i++) rect(wx0 + 3 + Math.floor(r() * 22), wy + 6 + Math.floor(r() * 44), 1, 1, '#cfd8ff');
        rect(wx0 + 13, wy + 2, 2, 58, '#2a2620'); rect(wx0, wy + 30, 28, 2, '#2a2620');
        glow(x, wy + 30, 40, 'rgba(120,150,255,A)', 0.12);
        break;
      }
      case 'bigwindow': {
        const cx = x, cy = g - 120;
        ctx.fillStyle = '#2a2620'; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0f1838'; ctx.beginPath(); ctx.arc(cx, cy, 35, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = r() * 32; rect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 1, i % 4 ? '#d8e0ff' : '#ffe9a8'); }
        rect(cx + 10, cy - 18, 8, 8, '#f3eccc'); rect(cx + 13, cy - 18, 5, 5, '#0f1838');
        rect(cx - 1, cy - 35, 2, 70, '#2a2620'); rect(cx - 35, cy - 1, 70, 2, '#2a2620');
        glow(cx, cy, 60, 'rgba(140,160,255,A)', 0.14);
        break;
      }
      case 'portrait': {
        const px = x - 13, py = g - 150, hue = Math.floor(r() * 360);
        rect(px - 3, py - 3, 32, 40, '#b8892b'); rect(px - 1, py - 1, 28, 36, '#7a5a1b');
        rect(px, py, 26, 34, `hsl(${hue},35%,28%)`);
        rect(px + 8, py + 8, 10, 10, '#e7c9a2'); rect(px + 6, py + 18, 14, 16, `hsl(${(hue + 180) % 360},40%,35%)`);
        rect(px + 7, py + 5, 12, 4, ['#3a2a1a', '#aaa', '#d9a441', '#222'][Math.floor(r() * 4)]);
        const blink = (Math.floor(gtime * 2 + x) % 9) === 0;
        if (!blink) { rect(px + 10, py + 11, 2, 2, '#111'); rect(px + 14, py + 11, 2, 2, '#111'); }
        break;
      }
      case 'banner': {
        const [c1, c2] = HOUSE[Math.floor(r() * 4)], bx = x - 12, by = top + 6;
        const sway = Math.round(Math.sin(gtime * 1.5 + x) * 1.5);
        rect(bx - 4, by, 32, 4, '#5a3d1e');
        rect(bx + sway, by + 4, 24, 52, c1);
        ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(bx + sway, by + 56); ctx.lineTo(bx + 12 + sway, by + 66); ctx.lineTo(bx + 24 + sway, by + 56); ctx.fill();
        rect(bx + 8 + sway, by + 20, 8, 12, c2); rect(bx + sway, by + 8, 24, 2, c2);
        break;
      }
      case 'candles': {
        for (let i = 0; i < 3; i++) {
          const cx = x - 40 + i * 40 + Math.floor(r() * 10), cy = top + 30 + Math.floor(r() * 40) + Math.sin(gtime * 1.6 + i + x) * 4;
          rect(cx - 2, cy, 4, 12, '#efe6cf'); rect(cx - 2, cy, 1, 12, '#fff');
          rect(cx - 1, cy - 4 + (Math.random() < 0.2 ? -1 : 0), 2, 3, '#ffcc4d');
          glow(cx, cy - 3, 18, 'rgba(255,200,90,A)', 0.35);
        }
        break;
      }
      case 'shelf': {
        const sx = x - 32, sy = g - 120;
        rect(sx, sy, 64, 120, '#4a2f19'); rect(sx + 3, sy + 3, 58, 114, '#2b1a0e');
        const cols = ['#8c1d18', '#1d5c33', '#1d3a7a', '#a67c2d', '#5c2d6e', '#704214'];
        for (let row = 0; row < 4; row++) {
          let bx = sx + 4;
          while (bx < sx + 58) {
            const w = 3 + Math.floor(r() * 4), h = 18 + Math.floor(r() * 7);
            if (bx + w > sx + 60) break;
            rect(bx, sy + 4 + row * 28 + (26 - h), w, h, cols[Math.floor(r() * cols.length)]);
            bx += w + (r() < 0.15 ? 3 : 0);
          }
          rect(sx + 3, sy + 30 + row * 28, 58, 3, '#4a2f19');
        }
        break;
      }
      case 'cauldron': {
        const cy = g;
        glow(x, cy - 6, 30, 'rgba(255,120,40,A)', 0.3);
        rect(x - 6, cy - 6, 12, 6, '#ff8a2a');
        rect(x - 14, cy - 26, 28, 20, '#1a1a1e'); rect(x - 16, cy - 28, 32, 4, '#2c2c33');
        rect(x - 12, cy - 27, 24, 2, '#53e07a');
        for (let i = 0; i < 3; i++) {
          const t = (gtime * 0.8 + i * 0.33 + x * 0.01) % 1;
          rect(x - 8 + i * 7, cy - 30 - t * 24, 3, 3, `rgba(110,255,150,${1 - t})`);
        }
        glow(x, cy - 30, 26, 'rgba(90,255,140,A)', 0.2);
        break;
      }
      case 'chains': {
        const len = 30 + Math.floor(r() * 60);
        for (let i = 0; i < len; i += 6) rect(x - 1 + (i / 6) % 2, top + i, 3, 5, '#6c6c72');
        rect(x - 5, top + len, 11, 3, '#8a8a90'); rect(x - 5, top + len, 2, 8, '#8a8a90'); rect(x + 4, top + len, 2, 8, '#8a8a90');
        break;
      }
      case 'armor': {
        const b = g;
        rect(x - 6, b - 52, 12, 10, '#a8adb5'); rect(x - 4, b - 48, 8, 2, '#222');
        rect(x - 9, b - 42, 18, 18, '#959aa3'); rect(x - 9, b - 42, 18, 2, '#c7ccd4');
        rect(x - 12, b - 40, 3, 16, '#80858d'); rect(x + 9, b - 40, 3, 16, '#80858d');
        rect(x - 7, b - 24, 5, 24, '#80858d'); rect(x + 2, b - 24, 5, 24, '#80858d');
        rect(x + 13, b - 62, 2, 60, '#6d4a2a'); rect(x + 11, b - 66, 6, 6, '#c7ccd4');
        break;
      }
      case 'trophy': {
        const b = g;
        rect(x - 10, b - 30, 20, 30, '#3d2c1c'); rect(x - 12, b - 32, 24, 4, '#56402a');
        rect(x - 8, b - 50, 16, 12, '#e2b23b'); rect(x - 12, b - 48, 4, 6, '#e2b23b'); rect(x + 8, b - 48, 4, 6, '#e2b23b');
        rect(x - 2, b - 38, 4, 4, '#b8892b'); rect(x - 5, b - 34, 10, 2, '#b8892b');
        rect(x - 6, b - 49, 3, 8, '#fff2b0');
        glow(x, b - 44, 24, 'rgba(255,215,90,A)', 0.2);
        break;
      }
      case 'column': {
        rect(x - 12, top, 24, CEIL, '#2c4a3b'); rect(x - 12, top, 4, CEIL, '#3d6450'); rect(x + 8, top, 4, CEIL, '#1c3328');
        rect(x - 16, top, 32, 8, '#3d6450'); rect(x - 16, g - 8, 32, 8, '#3d6450');
        break;
      }
      case 'darkmark': {
        glow(x, g - 130, 50, 'rgba(90,255,140,A)', 0.22 + Math.sin(gtime * 2 + x) * 0.06);
        spr('darkmark', 0, x, g - 130, false, 0.9, 0.75, 0.5, 0.5);
        break;
      }
      case 'serpent': {
        for (let i = 0; i < 70; i += 2) rect(x - 35 + i, g - 110 + Math.sin(i * 0.15) * 14, 3, 5, '#4fae6a');
        rect(x + 35, g - 112 + Math.sin(70 * 0.15) * 14, 8, 7, '#4fae6a'); rect(x + 40, g - 110 + Math.sin(70 * 0.15) * 14, 2, 2, '#ffe14d');
        break;
      }
    }
  }

  function drawStairs(fl) {
    if (fl.last) return;
    const g = gy(fl.f), d = fl.dir, n = 10, run = SW / n, rise = FH / n;
    for (let i = 0; i < n; i++) {
      const xa = fl.xe - d * i * run, xb = fl.xe - d * (i + 1) * run;
      const x = Math.min(xa, xb), top = g - (i + 1) * rise;
      rect(x, top, run + 1, (i + 1) * rise, '#4a4452');
      rect(x, top, run + 1, 3, '#7d7588');
      rect(x, top + 3, run + 1, 2, '#2c2833');
    }
    // banister
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fl.xe, g - 26); ctx.lineTo(fl.xe - d * SW, g - FH - 26); ctx.stroke();
  }

  function drawSlab(fl) {
    const [lo, hi] = floorBounds(fl), g = gy(fl.f);
    // hole for the staircase coming up from the floor below
    let holeA = null, holeB = null;
    if (fl.f > 0) { const a = fl.xs, b = fl.xs - fl.dir * (SW + 14); holeA = Math.min(a, b); holeB = Math.max(a, b); }
    const segs = holeA === null ? [[lo - 20, hi + 20]] : [[lo - 20, holeA], [holeB, hi + 20]];
    for (const [a, b] of segs) {
      if (b <= a) continue;
      rect(a, g, b - a, SLAB, '#221d26');
      rect(a, g, b - a, 5, fl.theme.floor);
      rect(a, g + 5, b - a, 2, 'rgba(0,0,0,0.35)');
      const t0 = Math.floor(Math.max(a, camX - 20) / 24) * 24;
      for (let t = t0; t < Math.min(b, camX + W + 20); t += 24) { rect(t, g, 1, 5, 'rgba(0,0,0,0.25)'); rect(t + 12, g + 12, 1, 8, 'rgba(255,255,255,0.04)'); }
    }
    // end walls
    for (const xw of [lo, hi]) {
      rect(xw - 8, g - CEIL, 16, CEIL, '#2e2935');
      rect(xw - 8, g - CEIL, 3, CEIL, '#45404f');
    }
    // gaps
    for (const o of fl.obs) {
      if (o.type !== 'gap') continue;
      const x = wx(fl, o.u);
      rect(x - o.w / 2, g, o.w, SLAB, '#050308');
      rect(x - o.w / 2, g, 3, SLAB, '#3a3340'); rect(x + o.w / 2 - 3, g, 3, SLAB, '#3a3340');
      glow(x, g + 20, o.w * 0.6, 'rgba(120,60,200,A)', 0.18);
    }
  }

  function drawKey(x, y, dir, s = 1, lit = true) {
    const w = 18 * s;
    rect(x - w / 2, y - w / 2 + 2 * s, w, w, '#7a6a4a');
    rect(x - w / 2, y - w / 2, w, w - 2 * s, lit ? '#f4e6b8' : '#bfb08a');
    ctx.fillStyle = '#3a2a14'; ctx.beginPath();
    const a = 5 * s;
    const pts = { up: [[0, -a], [a, a * 0.6], [-a, a * 0.6]], down: [[0, a], [a, -a * 0.6], [-a, -a * 0.6]], left: [[-a, 0], [a * 0.6, -a], [a * 0.6, a]], right: [[a, 0], [-a * 0.6, -a], [-a * 0.6, a]] }[dir];
    ctx.moveTo(x + pts[0][0], y - s + pts[0][1]); ctx.lineTo(x + pts[1][0], y - s + pts[1][1]); ctx.lineTo(x + pts[2][0], y - s + pts[2][1]); ctx.fill();
  }

  function drawTurnSign(fl) {
    if (fl.last) return;
    const g = gy(fl.f), d = fl.dir;
    const x = fl.xe - d * (L.TZ * 0.55);
    const inZone = p.f === fl.f && !p.climb && p.u >= fl.L - L.TZ;
    const blink = inZone ? Math.floor(gtime * 8) % 2 : Math.floor(gtime * 2) % 2;
    glow(x, g - 150, 40, 'rgba(255,210,90,A)', inZone ? 0.5 : 0.25);
    rect(x - 26, g - 166, 52, 30, '#5a3d1e'); rect(x - 24, g - 164, 48, 26, '#7a5530');
    rect(x - 2, g - 136, 4, 136, '#5a3d1e');
    drawKey(x, g - 151, d > 0 ? 'left' : 'right', 1, !!blink);
    if (inZone) text('TURN!', x, g - 180, 8, blink ? '#ffe27a' : '#fff');
  }

  function drawFlag(c) {
    const fl = floorOf(c.f), x = wx(fl, c.u), g = gy(c.f), d = fl.dir;
    rect(x - 7, g - 6, 14, 6, '#5d5666'); rect(x - 7, g - 6, 14, 2, '#7d7588');
    if (!c.reached) { rect(x - 1, g - 14, 3, 8, '#9a8f7a'); return; }
    const t = c.t;
    const k = Math.min(1, t / 0.35);
    const pop = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); // ease-out-back
    const ph = 58 * pop;
    rect(x - 1, g - 6 - ph, 3, ph, '#d8c9a3');
    rect(x - 2, g - 9 - ph, 5, 4, '#ffd34d');
    if (k < 0.6) return;
    const amp = 1.5 + 8 * Math.exp(-t * 1.4);
    const ft = g - ph;
    for (let i = 0; i < 26; i++) {
      const off = Math.sin(t * 9 - i * 0.42) * amp * (i / 26) + Math.sin(t * 3) * (i / 26) * 2;
      const cx = x + d * (2 + i);
      rect(cx, ft + off, 1, 16, i % 7 === 6 ? '#7a1410' : '#b8231c');
      if (i > 8 && i < 16) rect(cx, ft + off + 5, 1, 6, '#ffd34d');
    }
  }

  function drawFinish(fl) {
    const x = wx(fl, fl.L - 20), g = gy(fl.f);
    glow(x, g - 50, 90, 'rgba(180,120,255,A)', 0.45 + Math.sin(gtime * 3) * 0.1);
    rect(x - 34, g - 110, 8, 110, '#b8892b'); rect(x + 26, g - 110, 8, 110, '#b8892b');
    rect(x - 34, g - 118, 68, 10, '#e2b23b'); rect(x - 30, g - 124, 60, 6, '#b8892b');
    const s = 2.2 + Math.sin(gtime * 4) * 0.12;
    spr('portal', 0, x, g - 50, false, s, 1, 0.5, 0.5);
    spr('orb', 0, x, g - 50, false, 1.4, 0.7 + Math.sin(gtime * 6) * 0.3, 0.5, 0.5);
    text('EXIT', x, g - 132, 8, '#ffe27a');
  }

  function drawObstacle(fl, o) {
    const g = gy(fl.f), x = wx(fl, o.u), towards = fl.dir > 0; // movers face the player
    const tAnim = Math.floor(gtime * 8);
    switch (o.type) {
      case 'spikes': spr('spikes', 0, x, g + 1, false, 0.82); break;
      case 'pillar': spr('pillar', 0, x, g + 1, false, 1); break;
      case 'pumpkin': glow(x, g - 12, 22, 'rgba(255,150,40,A)', 0.25); spr('pumpkin', 0, x, g + 1, false, 0.95); break;
      case 'book': spr('book', tAnim, x, g + 1, towards, 0.8); break;
      case 'wolf': {
        const lope = o.active ? Math.abs(Math.sin(gtime * 14)) * 5 : 0;
        spr('wolf', 0, x, g + 1 - lope, towards, 1);
        if (o.active && Math.random() < 0.3) puff(x + (towards ? 26 : -26), g - 2, 1, '#8d8577', 30, 50, 0.3);
        break;
      }
      case 'crow': spr('crow', Math.floor(gtime * 6), x, g - 30, towards, 0.66); break;
      case 'troll': spr('troll', Math.floor(gtime * 2.5), x, g + 1, towards, 1.22); break;
      case 'flybooks': {
        const names = ['redbook', 'greenbook', 'bluebook'];
        for (let i = 0; i < 3; i++) {
          const by = g - 36 - i * 20 - Math.sin(gtime * 5 + i) * 3;
          spr(names[i], 0, x + (i - 1) * 6, by, i % 2 === 0, 0.62 + 0.1 * Math.abs(Math.sin(gtime * 10 + i)), 1, 0.5, 0.5);
        }
        break;
      }
      case 'beam': {
        const top = g - CEIL;
        rect(x - 2, top, 4, CEIL - 70, '#5a5560');
        const sway = Math.round(Math.sin(gtime * 2 + o.u) * 2);
        rect(x - 16 + sway, g - 74, 32, 6, '#6b4a2b');
        rect(x - 12 + sway, g - 68, 24, 34, '#8c1d18'); rect(x - 12 + sway, g - 66, 24, 2, '#e2b23b');
        rect(x - 4 + sway, g - 58, 8, 10, '#e2b23b');
        ctx.fillStyle = '#8c1d18'; ctx.beginPath(); ctx.moveTo(x - 12 + sway, g - 34); ctx.lineTo(x + sway, g - 28); ctx.lineTo(x + 12 + sway, g - 34); ctx.fill();
        break;
      }
      case 'debris': {
        if (o.st === 'fall') {
          const k = Math.min(1, o.t / fallT());
          const bot = (CEIL - 26) * (1 - k * k);
          ctx.fillStyle = `rgba(0,0,0,${0.2 + 0.5 * k})`;
          ctx.beginPath(); ctx.ellipse(x, g - 1, 8 + 12 * k, 3, 0, 0, Math.PI * 2); ctx.fill();
          drawRock(x, g - bot, 1);
          if (Math.floor(gtime * 10) % 2) text('!', x, g - CEIL + 18, 16, '#ff5a4a');
        } else if (o.st === 'down') {
          drawRock(x, g, 1); rect(x - 16, g - 4, 8, 4, '#6c655c'); rect(x + 10, g - 3, 6, 3, '#6c655c');
        } else {
          // cracked ceiling hint
          const top = g - CEIL;
          rect(x - 8, top, 2, 6, '#111'); rect(x - 6, top + 5, 6, 2, '#111'); rect(x + 2, top, 2, 9, '#111');
        }
        break;
      }
    }
  }
  function drawRock(x, bottom, s) {
    rect(x - 14, bottom - 26, 28, 26, '#6e675e');
    rect(x - 14, bottom - 26, 28, 4, '#8f877b');
    rect(x - 14, bottom - 4, 28, 4, '#4f4943');
    rect(x - 4, bottom - 20, 2, 8, '#4f4943'); rect(x - 2, bottom - 14, 6, 2, '#4f4943');
    rect(x + 6, bottom - 22, 2, 5, '#4f4943');
  }

  function drawSnitch(fl, sn) {
    if (sn.got) return;
    const x = wx(fl, sn.u), y = gy(fl.f) - sn.alt - Math.sin(gtime * 3 + sn.ph) * 3;
    if (x < camX - 40 || x > camX + W + 40) return;
    glow(x, y, 16, 'rgba(255,215,80,A)', 0.35);
    spr('snitch', Math.floor(gtime * 14 + sn.ph * 3), x, y, fl.dir < 0, 0.5, 1, 0.5, 0.5);
  }

  function drawPlayer() {
    if (state === 'over' && L.reported) return;
    const [x, y] = playerWorld();
    const dir = p.climb ? p.climb.dir : floorOf(p.f).dir;
    const flip = dir < 0;
    const s = p.scale;
    if (state === 'dead') {
      const k = Math.min(1, stateT / 0.5);
      ctx.save(); ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(-dir * k * 1.45);
      ctx.globalAlpha = 1 - Math.max(0, stateT - 0.9) * 2;
      spr(skin, 0, 0, 0, flip, s);
      ctx.restore();
      if (deathReason === 'crushed') drawRock(x, y, 1);
      return;
    }
    if (p.inv > 0 && Math.floor(gtime * 16) % 2 === 0 && !p.climb) return;
    // shadow
    if (!p.climb) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, gy(p.f), Math.max(4, 11 - p.alt * 0.05), 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    let frame;
    if (state === 'intro') frame = 0;
    else if (state === 'win') frame = 1 + (Math.floor(p.anim * 12) % 3);
    else if (!p.ground && !p.climb) frame = p.vy > 0 ? 3 : 2;
    else frame = [1, 2, 3, 2][Math.floor(p.anim * 10) % 4];
    if (p.dash > 0) for (let i = 1; i <= 3; i++) spr(skin, frame, x - dir * i * 10, y, flip, s, 0.25 / i);
    if (state === 'win') {
      const k = Math.min(1, stateT / 1.2);
      spr(skin, frame, x + dir * k * 10, y - k * 20, flip, s * (1 - k * 0.9), 1 - k);
      return;
    }
    if (p.slide > 0 && !p.climb) {
      ctx.save(); ctx.translate(Math.round(x - dir * 4), Math.round(y - 15));
      ctx.rotate(-dir * 1.25);
      spr(skin, 2, 0, 0, flip, s * 0.92, 1, 0.5, 0.5);
      ctx.restore();
      drawShield(x, y + 14);
      if (Math.random() < 0.5) particles.push({ x: x + dir * 8, y: y - 2, vx: -dir * 60, vy: -20, g: 80, life: 0.3, t: 0, c: '#b9a98c', s: 2 });
      return;
    }
    const single = A[skin].length === 1;
    const bob = p.ground && !p.climb && state === 'play' ? (Math.floor(p.anim * 10) % 2) * (single ? 3 : 1) : 0;
    if (single && state === 'play') {
      ctx.save(); ctx.translate(Math.round(x), Math.round(y - bob));
      ctx.rotate(dir * (0.06 + Math.sin(p.anim * 20) * 0.05));
      spr(skin, 0, 0, 0, flip, s); ctx.restore();
    } else spr(skin, frame, x, y - bob, flip, s);
    drawShield(x, y);
  }

  function drawShield(x, y) {
    if (!(p.shield > 0) || state !== 'play') return;
    ctx.strokeStyle = `rgba(143,211,255,${0.35 + Math.sin(gtime * 5) * 0.15})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y - 26), 30, 0, Math.PI * 2); ctx.stroke();
  }
  function drawHUD() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    rect(0, 0, W, 24, 'rgba(8,6,16,0.7)'); rect(0, 24, W, 1, 'rgba(255,211,77,0.35)');
    const fl = floorOf(p.climb ? Math.min(p.f + 1, L.floors.length - 1) : p.f);
    text('LV ' + L.n, 8, 9, 8, '#ffd34d', 'left');
    text(fl.theme.name.toUpperCase(), 8, 19, 6, '#c9b8ff', 'left', false);
    // progress bar
    const bx = 200, bw = 220, by = 9;
    rect(bx, by, bw, 6, '#2a2433'); rect(bx, by, bw, 1, '#000');
    const prog = clamp((floorOf(p.f).sOff + (p.climb ? floorOf(p.f).L : p.u)) / L.total, 0, 1);
    rect(bx, by, bw * prog, 6, '#e2b23b');
    for (const c of L.cps) {
      const cx = bx + bw * ((floorOf(c.f).sOff + c.u) / L.total);
      rect(cx - 1, by - 3, 2, 12, c.reached ? '#7dff9a' : '#8a7f99');
      if (c.reached) rect(cx + 1, by - 3, 4, 3, '#b8231c');
    }
    rect(bx + bw - 2, by - 3, 4, 12, '#b48cff');
    spr(skin, 0, bx + bw * prog, by + 12, floorOf(p.f).dir < 0, 0.28);
    // snitch counter
    spr('snitch', Math.floor(gtime * 14), 448, 12, false, 0.38, 1, 0.5, 0.5);
    text(got + '/' + L.snitches.length, 464, 13, 8, '#ffd34d', 'left');
    // hearts
    for (let i = 0; i < maxLives; i++) drawHeart(560 + i * 14 - (maxLives - 3) * 14, 7, i < lives);
    // defences
    let ix = 70;
    if (LO.hat) { spr('hat', 0, ix + 8, H - 6, false, 0.42, p.shield > 0 ? 1 : 0.25); ix += 22; }
    if (LO.pet === 'dobby') { spr('dobby', 0, ix + 6, H - 6, false, 0.55, p.dobby > 0 ? 1 : 0.25); ix += 18; }
    if (LO.spell) {
      const sk = 1 - p.spellCd / SPELL_CD;
      rect(ix + 4, H - 16, 52, 8, 'rgba(0,0,0,0.5)');
      rect(ix + 5, H - 15, 50 * sk, 6, sk >= 1 ? '#7dff9a' : '#3f7a4c');
      text('SPELL [E]', ix + 30, H - 24, 6, sk >= 1 ? '#7dff9a' : '#8a7f99', 'center');
    }
    // dash meter
    const dk = 1 - p.dashCd / dashCd();
    rect(8, H - 16, 52, 8, 'rgba(0,0,0,0.5)');
    rect(9, H - 15, 50 * dk, 6, dk >= 1 ? '#ffe27a' : '#8a7340');
    text('DASH', 34, H - 24, 6, dk >= 1 ? '#ffe27a' : '#8a7f99', 'center');
  }
  function drawHeart(x, y, full) {
    const c = full ? '#ff4d5e' : '#3d2f44';
    rect(x + 1, y, 3, 2, c); rect(x + 6, y, 3, 2, c); rect(x, y + 1, 10, 4, c);
    rect(x + 1, y + 5, 8, 2, c); rect(x + 3, y + 7, 4, 2, c);
    if (full) rect(x + 2, y + 1, 2, 2, '#ffb3bb');
  }

  const DEATH_TEXT = {
    crushed: ['CRUSHED!', 'forward', 'Tap FORWARD to dash past falling rocks'],
    rubble: ['TRIPPED!', 'up', 'Jump over the rubble'],
    wall: ['BONK!', 'back', 'Press BACK at the stairs to turn & climb'],
    fell: ['WHOOOPS!', 'up', 'Jump across the gaps'],
    spikes: ['OUCH!', 'up', 'Jump over the spikes'],
    pillar: ['OOF!', 'up', 'Jump over the pillar'],
    pumpkin: ['SPLAT!', 'up', 'Jump over the pumpkin'],
    book: ['CHOMP!', 'up', 'Jump over the Monster Book'],
    crow: ['SQUAWK!', 'down', 'Slide under the crows'],
    beam: ['THWACK!', 'down', 'Slide under the banners'],
    flybooks: ['WHACK!', 'down', 'Slide under the flying books'],
    troll: ['CLUBBED!', 'down', 'Slide between the troll\'s legs'],
  };
  const HINTS = {
    jump: ['up', 'Press UP to JUMP!'],
    slide: ['down', 'Press DOWN to SLIDE!'],
    dash: ['forward', 'Rocks falling! FORWARD to DASH!'],
    turn: ['back', 'Wall ahead! BACK to turn & climb'],
  };
  function keyDir(k) {
    const dir = p.climb ? p.climb.dir : floorOf(p.f).dir;
    if (k === 'forward') return dir > 0 ? 'right' : 'left';
    if (k === 'back') return dir > 0 ? 'left' : 'right';
    return k;
  }

  function drawOverlays() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state === 'intro') {
      const a = Math.min(1, stateT * 3);
      rect(0, 120, W, 80, `rgba(10,6,20,${0.75 * a})`);
      rect(0, 120, W, 2, '#e2b23b'); rect(0, 198, W, 2, '#e2b23b');
      text('LEVEL ' + L.n, W / 2, 144, 16, '#ffd34d');
      text(L.floors[0].theme.name.toUpperCase() + '  ·  ' + L.snitches.length + ' SNITCHES', W / 2, 172, 8, '#e8d9ff');
      if (stateT > 1.2) text('GO!', W / 2, 230, 24, '#7dff9a');
    }
    if (freeze) {
      const [k, msg] = HINTS[freeze.need];
      const pulse = 1 + Math.sin(gtime * 8) * 0.08;
      rect(W / 2 - 170, 52, 340, 64, 'rgba(10,6,20,0.82)');
      rect(W / 2 - 170, 52, 340, 2, '#e2b23b'); rect(W / 2 - 170, 114, 340, 2, '#e2b23b');
      drawKey(W / 2, 72, keyDir(k), 1.4 * pulse);
      text(msg, W / 2, 101, 8, '#fff');
    }
    if (state === 'dead' && stateT > 0.25) {
      const [t, k, tip] = DEATH_TEXT[deathReason] || ['OUCH!', 'up', ''];
      text(t, W / 2, 120, 24, '#ff5a4a');
      rect(W / 2 - 180, 146, 360, 30, 'rgba(10,6,20,0.75)');
      drawKey(W / 2 - 160, 161, keyDir(k), 0.9);
      text(tip, W / 2 + 12, 162, 7, '#fff');
      text(lives > 0 ? 'Back to checkpoint…' : 'Out of lives!', W / 2, 196, 8, lives > 0 ? '#c9b8ff' : '#ff8a8a');
    }
    if (state === 'win') {
      const s = 1 + Math.sin(gtime * 6) * 0.05;
      text('ESCAPED!', W / 2, 120, Math.round(24 * s), '#ffd34d');
    }
    if (L.n <= 4 && state === 'play' && !freeze && gtime < 9) {
      text(['UP: jump', 'DOWN: slide', 'BACK at the stairs: turn', 'FORWARD: dash'][L.n - 1], W / 2, 42, 7, 'rgba(255,255,255,0.75)');
    }
  }

  function render() {
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    const cx = Math.round(camX + sx), cy = Math.round(camY + sy);
    ctx.setTransform(1, 0, 0, 1, -cx, -cy);
    ctx.fillStyle = extPat; ctx.fillRect(cx, cy, W, H);
    const fmin = Math.max(0, p.f - 1), fmax = Math.min(L.floors.length - 1, p.f + 2);
    const vis = [];
    for (let f = fmin; f <= fmax; f++) vis.push(floorOf(f));
    for (const fl of vis) drawFloorInterior(fl);
    for (const fl of vis) drawStairs(fl);
    for (const fl of vis) drawSlab(fl);
    for (const fl of vis) { drawTurnSign(fl); if (fl.last) drawFinish(fl); }
    for (const c of L.cps) if (c.f >= fmin && c.f <= fmax) drawFlag(c);
    for (const fl of vis) for (const o of fl.obs) {
      if (o.type === 'gap' || o.dead) continue;
      const x = wx(fl, o.u);
      if (x > cx - 100 && x < cx + W + 100) drawObstacle(fl, o);
    }
    for (const sn of L.snitches) if (sn.f >= fmin && sn.f <= fmax) drawSnitch(floorOf(sn.f), sn);
    drawPet(true);
    drawPlayer();
    drawPet(false);
    drawBolts();
    for (const q of particles) rect(q.x, q.y, q.s, q.s, q.c);
    for (const q of popups) {
      ctx.globalAlpha = 1 - Math.max(0, q.life - 0.6) * 2;
      text(q.t, q.x, q.y - q.life * 26, q.size, q.c);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(vignette, 0, 0);
    drawHUD();
    drawOverlays();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const t = now();
    let dt = Math.min(1 / 30, t - last); last = t;
    if (state === 'paused' || state === 'off') { if (state === 'paused') render(); return; }
    // substeps keep collisions solid at high speed
    const steps = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < steps && state !== 'off'; i++) update(dt / steps);
    if (state !== 'off') render();
  }

  HD.game = { start, stop, input, setPaused, get state() { return state; }, get level() { return L && L.n; }, get dbg() { return { L, p, state, lives, got, freeze }; } };
})();
