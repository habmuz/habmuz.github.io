// Home map (virtualised pathway of 50,000 levels), wardrobe, result screens, input and save data.
(function () {
  'use strict';
  const HD = (window.HD = window.HD || {});
  const $ = (s) => document.querySelector(s);
  const SAVE_KEY = 'hogwartsDash.v1';

  HD.SKINS = [
    { id: 'harry', name: 'Harry', need: 0 },
    { id: 'hermione', name: 'Hermione', need: 60 },
    { id: 'ron', name: 'Ron', need: 180 },
    { id: 'draco', name: 'Draco', need: 400 },
    { id: 'hagrid', name: 'Hagrid', need: 800 },
    { id: 'snape', name: 'Snape', need: 1400 },
    { id: 'dumbledore', name: 'Dumbledore', need: 2400 },
    { id: 'voldemort', name: 'Voldemort', need: 4000 },
  ];

  function defaults() { return { unlocked: 1, coins: 0, skin: 'harry', stars: {}, chests: {}, muted: false, seen: {} }; }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) return Object.assign(defaults(), s); } catch (e) { /* storage unavailable */ }
    return defaults();
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(HD.save)); } catch (e) { /* storage unavailable */ } }
  HD.save = load();
  const owned = (s) => HD.save.coins >= s.need;

  // ---------- sprites as DOM elements ----------
  let AW = 1024, AH = 217;
  function spriteEl(name, frame = 0, scale = 1, cls = '') {
    const fr = window.ATLAS[name][frame];
    const d = document.createElement('div');
    d.className = 'spr ' + cls;
    Object.assign(d.style, {
      width: fr[2] * scale + 'px', height: fr[3] * scale + 'px',
      backgroundSize: `${AW * scale}px ${AH * scale}px`,
      backgroundPosition: `${-fr[0] * scale}px ${-fr[1] * scale}px`,
    });
    return d;
  }
  HD.spriteEl = spriteEl;

  // ---------- map layout ----------
  const STEP = 74, HEAD = 104, TOP = 360, GROUPS = HD.MAX_LEVEL / 10;
  const GH = HEAD + 10 * STEP;
  const map = $('#map'), inner = $('#mapInner');
  let mapW = 400;
  const stoneLocalY = (i) => HEAD + 30 + i * STEP;
  const stoneX = (k) => mapW / 2 + Math.sin(k * 0.55) * Math.min(140, mapW * 0.3);
  const stoneAbsY = (k) => TOP + Math.floor(k / 10) * GH + stoneLocalY(k % 10);
  const endTop = TOP + GROUPS * GH + 40;
  const rendered = new Map();

  function groupStars(g) {
    let s = 0;
    for (let n = g * 10 + 1; n <= g * 10 + 10; n++) s += HD.save.stars[n] || 0;
    return s;
  }

  function buildGroup(g) {
    const el = document.createElement('div');
    el.className = 'group';
    el.style.top = TOP + g * GH + 'px';
    el.style.height = GH + 'px';
    const theme = HD.groupTheme(g);
    const first = g * 10 + 1, lastL = g * 10 + 10;
    const cur = HD.save.unlocked;
    const locked = first > cur;

    const plaque = document.createElement('div');
    plaque.className = 'plaque' + (locked ? ' locked' : '') + (g % 2 ? ' right' : '');
    plaque.innerHTML = `<div class="ch">CHAPTER ${(g + 1).toLocaleString()}</div><div class="tn">${theme.name}</div>` +
      `<div class="lv">Levels ${first.toLocaleString()}–${lastL.toLocaleString()} · <span class="st">★ ${groupStars(g)}/30</span></div>`;
    el.appendChild(plaque);

    // path
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const k = g * 10 + i;
      if (k >= HD.MAX_LEVEL) break;
      pts.push([stoneX(k), i < 10 ? stoneLocalY(i) : GH + stoneLocalY(0)]);
    }
    let dDone = '', dTodo = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const seg = `M${x0},${y0} C${x0},${(y0 + y1) / 2} ${x1},${(y0 + y1) / 2} ${x1},${y1} `;
      if (g * 10 + i + 2 <= cur) dDone += seg; else dTodo += seg;
    }
    el.insertAdjacentHTML('beforeend',
      `<svg class="path" width="${mapW}" height="${GH + 200}"><path d="${dTodo}" class="todo"/><path d="${dDone}" class="done"/></svg>`);

    for (let i = 0; i < 10; i++) {
      const n = g * 10 + i + 1;
      const b = document.createElement('button');
      const st = HD.save.stars[n] || 0;
      const isChest = i === 9;
      b.className = 'stone' + (n < cur ? ' done' : n === cur ? ' current' : ' locked') + (isChest ? ' chest' : '');
      b.style.left = stoneX(n - 1) + 'px';
      b.style.top = stoneLocalY(i) + 'px';
      b.dataset.n = n;
      b.innerHTML = `<span class="num">${n.toLocaleString()}</span>` +
        (n < cur ? `<span class="stars">${'★'.repeat(st)}<i>${'★'.repeat(3 - st)}</i></span>` : '');
      if (isChest) {
        const c = spriteEl('chest', 0, 0.42, 'mini-chest' + (HD.save.chests[g] ? ' open' : ''));
        b.appendChild(c);
      }
      if (n === cur) {
        const av = spriteEl(HD.save.skin, 0, HD.skinScale(HD.save.skin) * 0.9, 'avatar');
        b.appendChild(av);
      }
      el.appendChild(b);
    }
    return el;
  }

  function renderMap(force) {
    if (force) { rendered.forEach((el) => el.remove()); rendered.clear(); }
    const top = map.scrollTop, bot = top + map.clientHeight;
    const g0 = Math.max(0, Math.floor((top - TOP - 400) / GH));
    const g1 = Math.min(GROUPS - 1, Math.floor((bot - TOP + 400) / GH));
    for (const [g, el] of rendered) if (g < g0 || g > g1) { el.remove(); rendered.delete(g); }
    for (let g = g0; g <= g1; g++) if (!rendered.has(g)) { const el = buildGroup(g); rendered.set(g, el); inner.appendChild(el); }
  }

  function layoutMap() {
    mapW = inner.clientWidth || 400;
    inner.style.height = endTop + 760 + 'px';
    $('#treasure').style.top = endTop + 'px';
    renderMap(true);
  }

  function scrollToLevel(n, smooth) {
    const y = n <= 2 ? 0 : stoneAbsY(n - 1) - map.clientHeight * 0.55;
    map.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
  }

  map.addEventListener('scroll', () => { requestAnimationFrame(() => renderMap(false)); updateFloatBtns(); }, { passive: true });
  window.addEventListener('resize', () => { if (!$('#home').classList.contains('hidden')) layoutMap(); fitCanvas(); });

  inner.addEventListener('click', (e) => {
    const b = e.target.closest('.stone');
    if (!b) return;
    const n = +b.dataset.n;
    HD.audio.init();
    if (n > HD.save.unlocked) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); HD.audio.sfx.click(); return; }
    play(n);
  });

  function updateFloatBtns() {
    const cur = HD.save.unlocked;
    $('#playBtn').textContent = '▶ PLAY LEVEL ' + cur.toLocaleString();
    const y = stoneAbsY(cur - 1);
    const away = Math.abs(y - (map.scrollTop + map.clientHeight / 2)) > map.clientHeight;
    $('#meBtn').classList.toggle('hidden', !away);
  }

  function refreshHome() {
    $('#coinCount').textContent = HD.save.coins.toLocaleString();
    $('#muteBtn').textContent = HD.save.muted ? '🔇' : '🔊';
    const heroAv = $('#heroAvatar');
    heroAv.innerHTML = '';
    heroAv.appendChild(spriteEl(HD.save.skin, 0, HD.skinScale(HD.save.skin) * 2));
    renderMap(true);
    updateFloatBtns();
  }

  // ---------- screens ----------
  function show(id) {
    for (const s of ['#home', '#play']) $(s).classList.toggle('hidden', s !== id);
  }
  function goHome() {
    HD.game.stop();
    hideOverlay();
    show('#home');
    layoutMap();
    refreshHome();
    scrollToLevel(HD.save.unlocked, false);
  }
  function play(n) {
    HD.audio.init(); HD.audio.startMusic();
    hideOverlay();
    show('#play');
    fitCanvas();
    HD.game.start(n);
  }

  function fitCanvas() {
    const c = $('#game'), wrap = $('#stage');
    const sw = window.innerWidth, sh = window.innerHeight;
    const scale = Math.min(sw / 640, sh / 360);
    const w = Math.floor(640 * scale), h = Math.floor(360 * scale);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
  }

  // ---------- overlays ----------
  const ov = $('#overlay'), card = $('#card');
  let primary = null, secondary = null;
  function showOverlay(html, onPrimary, onSecondary) {
    card.innerHTML = html; ov.classList.remove('hidden');
    primary = onPrimary; secondary = onSecondary;
    card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      HD.audio.sfx.click();
      const a = b.dataset.act;
      if (a === 'map') goHome();
      else if (a === 'retry') play(HD.game.level);
      else if (a === 'next') play(Math.min(HD.MAX_LEVEL, HD.game.level + 1));
      else if (a === 'resume') { hideOverlay(); HD.game.setPaused(false); }
      else if (a === 'close') hideOverlay();
    }));
  }
  function hideOverlay() { ov.classList.add('hidden'); primary = secondary = null; }
  const isOpen = () => !ov.classList.contains('hidden');

  function nextSkin() { return HD.SKINS.find((s) => !owned(s)); }
  function progressHTML() {
    const ns = nextSkin();
    if (!ns) return `<div class="prog-note">Every wizard unlocked!</div>`;
    const prevNeed = HD.SKINS[HD.SKINS.indexOf(ns) - 1].need;
    const k = (HD.save.coins - prevNeed) / (ns.need - prevNeed);
    return `<div class="prog"><div class="prog-label">Next wizard: <b>${ns.name}</b> · ${HD.save.coins.toLocaleString()}/${ns.need.toLocaleString()}</div>` +
      `<div class="bar"><div style="width:${Math.max(3, Math.min(100, k * 100))}%"></div></div></div>`;
  }

  HD.ui = {
    onLevelEnd(r) {
      const before = HD.SKINS.filter(owned).map((s) => s.id);
      HD.save.coins += r.got;
      let chestBonus = 0;
      const g = Math.floor((r.n - 1) / 10);
      if (r.win) {
        HD.save.stars[r.n] = Math.max(HD.save.stars[r.n] || 0, r.stars);
        if (r.n === HD.save.unlocked) HD.save.unlocked = Math.min(HD.MAX_LEVEL, r.n + 1);
        if (r.n % 10 === 0 && !HD.save.chests[g]) {
          chestBonus = Math.min(400, 25 + g * 5);
          HD.save.chests[g] = 1; HD.save.coins += chestBonus;
        }
      }
      const newly = HD.SKINS.filter((s) => owned(s) && !before.includes(s.id));
      persist();

      let h = '';
      if (r.win) {
        h += `<div class="title gold">LEVEL ${r.n.toLocaleString()} COMPLETE!</div>`;
        h += `<div class="bigstars">${[0, 1, 2].map((i) => `<span class="${i < r.stars ? 'on' : ''}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join('')}</div>`;
      } else {
        h += `<div class="title red">OUT OF LIVES</div><div class="sub">You keep every snitch you caught.</div>`;
      }
      h += `<div class="row"><span class="snitch-ico"></span> Snitches caught <b>${r.got}/${r.total}</b></div>`;
      if (chestBonus) h += `<div class="chestwin"><span class="chest-ico"></span><div>Chapter treasure opened!<br><b class="gold">+${chestBonus} snitches</b></div></div>`;
      for (const s of newly) h += `<div class="unlock"><span class="skin-ico" data-skin="${s.id}"></span><div>NEW WIZARD UNLOCKED<br><b>${s.name}</b></div><button class="btn small" data-equip="${s.id}">Wear</button></div>`;
      h += progressHTML();
      h += `<div class="btns"><button class="btn ghost" data-act="map">Map</button><button class="btn ghost" data-act="retry">Retry</button>` +
        (r.win && r.n < HD.MAX_LEVEL ? `<button class="btn" data-act="next">Next ▶</button>` : '') + `</div>`;
      if (newly.length) setTimeout(() => HD.audio.sfx.unlock(), 700);
      showOverlay(h, r.win ? () => play(Math.min(HD.MAX_LEVEL, r.n + 1)) : () => play(r.n), goHome);
      card.querySelectorAll('.snitch-ico').forEach((e) => e.appendChild(spriteEl('snitch', 0, 0.5)));
      card.querySelectorAll('.chest-ico').forEach((e) => e.appendChild(spriteEl('chest', 0, 0.6)));
      card.querySelectorAll('.skin-ico').forEach((e) => e.appendChild(spriteEl(e.dataset.skin, 0, 1)));
      card.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => {
        HD.save.skin = b.dataset.equip; persist(); b.textContent = 'Wearing'; b.disabled = true; HD.audio.sfx.click();
      }));
      if (r.win) confetti();
    },
  };

  function pauseMenu() {
    if (HD.game.state === 'off' || HD.game.state === 'over' || isOpen()) return;
    HD.game.setPaused(true);
    showOverlay(`<div class="title gold">PAUSED</div>
      <div class="controls"><div><kbd>↑</kbd> Jump</div><div><kbd>↓</kbd> Slide</div><div><kbd>→</kbd> Dash forward</div><div><kbd>←</kbd> Turn at stairs</div></div>
      <div class="btns"><button class="btn ghost" data-act="map">Map</button><button class="btn ghost" data-act="retry">Restart</button><button class="btn" data-act="resume">Resume</button></div>`,
    () => { hideOverlay(); HD.game.setPaused(false); }, goHome);
  }

  function wardrobe() {
    let h = `<div class="title gold">WARDROBE</div><div class="sub">Catch snitches to unlock new wizards · <b class="gold">${HD.save.coins.toLocaleString()}</b> caught</div><div class="skins">`;
    for (const s of HD.SKINS) {
      const has = owned(s), on = HD.save.skin === s.id;
      h += `<button class="skin ${has ? '' : 'lockd'} ${on ? 'on' : ''}" data-skin="${s.id}" ${has ? '' : 'disabled'}>
        <span class="skin-ico" data-skin="${s.id}"></span><span class="nm">${s.name}</span>
        <span class="cost">${on ? 'WEARING' : has ? 'WEAR' : '🔒 ' + s.need.toLocaleString()}</span></button>`;
    }
    h += `</div>${progressHTML()}<div class="btns"><button class="btn" data-act="close">Done</button></div>`;
    showOverlay(h, hideOverlay, hideOverlay);
    card.querySelectorAll('.skin-ico').forEach((e) => e.appendChild(spriteEl(e.dataset.skin, 0, 1.3)));
    card.querySelectorAll('.skin:not(.lockd)').forEach((b) => b.addEventListener('click', () => {
      HD.save.skin = b.dataset.skin; persist(); HD.audio.sfx.click(); wardrobe(); refreshHome();
    }));
  }

  function confetti() {
    const box = $('#confetti'); box.innerHTML = '';
    const cols = ['#ffd34d', '#ff5a4a', '#7dff9a', '#b48cff', '#5ab0ff'];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('i');
      s.style.left = Math.random() * 100 + '%';
      s.style.background = cols[i % cols.length];
      s.style.animationDelay = Math.random() * 0.6 + 's';
      s.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
      box.appendChild(s);
    }
    setTimeout(() => (box.innerHTML = ''), 3600);
  }

  // ---------- input ----------
  const KEYS = { ArrowUp: 'up', KeyW: 'up', Space: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', (e) => {
    const inPlay = !$('#play').classList.contains('hidden');
    if (isOpen()) {
      if (e.code === 'Enter' || (e.code === 'Space' && primary)) { e.preventDefault(); primary && primary(); }
      else if (e.code === 'Escape') { e.preventDefault(); secondary && secondary(); }
      return;
    }
    if (!inPlay) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); pauseMenu(); return; }
    const k = KEYS[e.code];
    if (k) { e.preventDefault(); if (!e.repeat) HD.game.input(k); }
  });

  // swipe controls
  let ts = null;
  const stage = $('#stage');
  stage.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; ts = [t.clientX, t.clientY, performance.now()]; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!ts) return;
    const t = e.changedTouches[0], dx = t.clientX - ts[0], dy = t.clientY - ts[1];
    ts = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { HD.game.input('up'); return; }
    if (Math.abs(dx) > Math.abs(dy)) HD.game.input(dx > 0 ? 'right' : 'left');
    else HD.game.input(dy > 0 ? 'down' : 'up');
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseMenu(); });

  $('#pauseBtn').addEventListener('click', pauseMenu);
  $('#shopBtn').addEventListener('click', () => { HD.audio.init(); HD.audio.sfx.click(); wardrobe(); });
  $('#muteBtn').addEventListener('click', () => {
    HD.audio.init();
    HD.save.muted = !HD.save.muted; persist(); HD.audio.setMuted(HD.save.muted); refreshHome();
  });
  $('#playBtn').addEventListener('click', () => play(HD.save.unlocked));
  $('#meBtn').addEventListener('click', () => scrollToLevel(HD.save.unlocked, true));
  $('#toTreasure').addEventListener('click', () => {
    map.scrollTo({ top: endTop - map.clientHeight - 2000 });
    requestAnimationFrame(() => map.scrollTo({ top: endTop + 600 - map.clientHeight, behavior: 'smooth' }));
  });
  $('#toTop').addEventListener('click', () => map.scrollTo({ top: 0 }));

  // ---------- boot ----------
  function boot() {
    AW = HD.atlasImg.naturalWidth || AW; AH = HD.atlasImg.naturalHeight || AH;
    document.documentElement.style.setProperty('--atlas', 'url(assets/atlas.png)');
    const hero = $('#heroArt');
    hero.appendChild(spriteEl('hedwig', 0, 1.2, 'hero-owl'));
    hero.appendChild(spriteEl('snitch', 0, 0.9, 'hero-snitch'));
    const t = $('#treasure');
    t.querySelector('.tchest').appendChild(spriteEl('chest', 0, 2.4));
    goHome();
  }
  if (HD.atlasImg.complete && HD.atlasImg.naturalWidth) boot();
  else HD.atlasImg.addEventListener('load', boot);
})();
