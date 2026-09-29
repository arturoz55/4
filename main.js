/* Hyperpad landing page. Plain JS, no build step. Matter.js (optional) drives the reel jar. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const splashDone = Promise.resolve(); // no entrance screen: the page opens directly

  /* ---------- storage, gated by cookie consent ---------- */
  // Keys that only persist when the visitor allows "Preferences".
  const PREF_KEYS = new Set(['hr-coins', 'hr-sort', 'hr-settings', 'hp-wallet']);
  const pending = new Map();
  let consent = null;
  try { consent = JSON.parse(localStorage.getItem('hp-consent')); } catch { consent = null; }
  const prefsAllowed = () => !!(consent && consent.preferences);
  const store = {
    get(k, d) {
      if (pending.has(k)) return pending.get(k);
      try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; }
    },
    set(k, v) {
      if (PREF_KEYS.has(k) && !prefsAllowed()) { pending.set(k, v); return false; }
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
    }
  };
  function applyConsent(c) {
    consent = { necessary: true, preferences: !!c.preferences, analytics: !!c.analytics, marketing: !!c.marketing, date: new Date().toISOString() };
    try { localStorage.setItem('hp-consent', JSON.stringify(consent)); } catch { /* storage blocked */ }
    try { document.cookie = `hp_consent=${consent.preferences ? 'p' : ''}${consent.analytics ? 'a' : ''}${consent.marketing ? 'm' : ''}n; max-age=31536000; path=/; SameSite=Lax`; } catch { /* cookies blocked */ }
    if (consent.preferences) {
      pending.forEach((v, k) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } });
    } else {
      PREF_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    }
    pending.clear();
  }
  const REEL_COST = 25;       // dollars of reel fees per reel
  const FEE = 0.01;           // 1% of each trade
  const SHARE = { you: 0.3, reels: 0.5, house: 0.2 };
  const usd = (n, d = 0) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Live mode turns on when the Hyperpad server answers /api/config (see the end of this file).
  const live = { on: false, cfg: null, stats: null };
  async function api(path, opts = {}) {
    const r = await fetch(path, { method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || `Request failed (${r.status})`);
    return b;
  }

  /* ---------- toast ---------- */
  const toastEl = $('#toast');
  let toastT;
  function toast(msg, action) {
    toastEl.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', () => { toastEl.hidden = true; action.fn(); });
      toastEl.append(b);
    }
    toastEl.hidden = false;
    toastEl.style.animation = 'none'; void toastEl.offsetWidth; toastEl.style.animation = '';
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.hidden = true; }, action ? 5200 : 2800);
  }

  const root = document.documentElement;
  try { localStorage.removeItem('hr-theme'); } catch { /* ignore */ }

  /* ---------- header ---------- */
  const bar = $('#bar');
  const onScroll = () => bar.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- reveal on scroll ---------- */
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.remove('below'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(el => {
      // Only hide things that start below the fold, so the first frame is complete.
      if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('below'); io.observe(el); }
    });
  }

  /* ---------- reel renderer (original AI host character, varies per coin) ---------- */
  const HOSTS = ['Juniper', 'Rafa', 'Ines', 'Theo', 'Mika', 'Sol', 'Priya', 'Oskar', 'Lena', 'Kofi'];
  const LOOKS = {
    skin: ['#b77a57', '#8d5a3b', '#e0ac85', '#c98f6a', '#6e4630', '#f1c9a5'],
    hair: ['#1d1a2b', '#5b3a24', '#c9772e', '#2d2d2d', '#e9d9b4', '#7a2f4a'],
    shirt: [['#e2ff6b', '#c8e24f'], ['#7cc4ff', '#5aa6e6'], ['#ff9fb7', '#e87f9a'], ['#ffd166', '#e6b447'], ['#b9a4ff', '#9a84ea'], ['#8ef0c4', '#6ad3a5']],
    wall: [['#2d3a7a', '#131832'], ['#5a2d7a', '#1c1232'], ['#1f5a5a', '#0f2626'], ['#7a3b2d', '#2a1510'], ['#34346e', '#0e0e24']]
  };
  function hostFor(key) {
    let x = 0; for (const ch of key) x = (x * 33 + ch.charCodeAt(0)) >>> 0;
    const pick = arr => arr[(x = (x * 1103515245 + 12345) >>> 0) % arr.length];
    return { skin: pick(LOOKS.skin), hair: pick(LOOKS.hair), shirt: pick(LOOKS.shirt), wall: pick(LOOKS.wall), style: x % 3, name: pick(HOSTS) };
  }
  function scriptFor(c, n) {
    const words = c.line.replace(/[.!?]+$/, '').toLowerCase().split(/\s+/).filter(Boolean);
    const lines = [`okay so I found a coin called ${c.ticker}`];
    for (let i = 0; i < words.length && lines.length < 3; i += 6) lines.push(words.slice(i, i + 6).join(' '));
    lines.push('every trade pays for the next video', `this is reel ${n}. see you in the next one`);
    return lines;
  }
  function makeReel(cv, cap, prog, opts = {}) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const DUR = opts.duration || 10000;
    let spec = null, t0 = 0, lineIdx = -1, wordsShown = 0, running = false, ended = false, raf = 0;
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
    function draw(now) {
      const L = spec.look;
      const raw = (now - t0) / DUR;
      const t = opts.loop === false ? Math.min(1, Math.max(0, raw)) : ((raw % 1) + 1) % 1;
      const s = now / 1000;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, L.wall[0]); g.addColorStop(1, L.wall[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 9; i++) {
        const x = (i * 83 + s * 6) % (W + 60) - 30, y = 90 + (i * 57) % 260;
        ctx.fillStyle = `rgba(${i % 2 ? '255,110,160' : '160,150,255'},.12)`;
        ctx.beginPath(); ctx.arc(x, y, 18 + (i % 3) * 10, 0, 7); ctx.fill();
      }
      const sx = Math.sin(s * .9) * 4, sy = Math.cos(s * 1.3) * 3;
      ctx.save(); ctx.translate(W / 2 + sx, sy);
      ctx.fillStyle = L.shirt[0]; rr(-120, 430, 240, 260, 90); ctx.fill();
      ctx.fillStyle = L.shirt[1]; rr(-40, 430, 80, 40, 20); ctx.fill();
      ctx.fillStyle = L.skin; ctx.fillRect(-22, 380, 44, 60);
      ctx.beginPath(); ctx.ellipse(0, 320, 78, 92, 0, 0, 7); ctx.fill();
      ctx.fillStyle = L.hair;
      ctx.beginPath(); ctx.ellipse(0, 262, 86, 52, 0, Math.PI, 0); ctx.fill();
      if (L.style === 0) { ctx.beginPath(); ctx.ellipse(-60, 280, 26, 40, .3, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(62, 276, 22, 34, -.4, 0, 7); ctx.fill(); }
      if (L.style === 1) { ctx.beginPath(); ctx.arc(0, 205, 30, 0, 7); ctx.fill(); }
      if (L.style === 2) { rr(-92, 250, 30, 150, 14); ctx.fill(); rr(62, 250, 30, 150, 14); ctx.fill(); }
      const blink = (s % 3.2) < .12 ? .1 : 1, look = Math.sin(s * .7) * 3;
      ctx.fillStyle = '#1d1a2b';
      ctx.beginPath(); ctx.ellipse(-28 + look, 318, 7, 9 * blink, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(28 + look, 318, 7, 9 * blink, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#1d1a2b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      const br = Math.sin(s * 2.2) > .7 ? -4 : 0;
      ctx.beginPath(); ctx.moveTo(-40, 298 + br); ctx.lineTo(-16, 294 + br); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, 294 + br); ctx.lineTo(40, 298 + br); ctx.stroke();
      const talking = running && t < .99 && (t * spec.script.length % 1) < .85;
      const open = talking ? 4 + Math.abs(Math.sin(s * 14)) * 12 : 3;
      ctx.fillStyle = '#5a1f2c'; ctx.beginPath(); ctx.ellipse(0, 362, 20, open, 0, 0, 7); ctx.fill();
      ctx.restore();
      // held-up coin sign in the coin's own colour
      const ly = 480 + Math.sin(s * 1.6) * 6;
      ctx.save(); ctx.translate(W / 2 + 96 + sx, ly + sy); ctx.rotate(-.12 + Math.sin(s) * .04);
      ctx.fillStyle = L.skin; ctx.beginPath(); ctx.ellipse(-10, 40, 22, 18, 0, 0, 7); ctx.fill();
      ctx.fillStyle = spec.color; ctx.beginPath(); ctx.arc(0, 0, 48, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(0, 0, 38, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 20px Geist, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$' + spec.ticker.slice(0, 3), 0, 1);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.025)';
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      // word-by-word captions
      const sc = spec.script;
      const li = Math.max(0, Math.min(sc.length - 1, Math.floor(t * sc.length)));
      const ws = sc[li].split(' ');
      const want = Math.min(ws.length, Math.ceil((t * sc.length - li) * ws.length * 1.4));
      if (li !== lineIdx) { lineIdx = li; wordsShown = 0; cap.textContent = ''; }
      while (wordsShown < want) {
        const w = ws[wordsShown], sp = document.createElement('span');
        sp.className = 'w' + (spec.hot.has(w.toLowerCase().replace(/[.,]/g, '')) ? ' hot' : '');
        sp.textContent = w; cap.append(sp, ' '); wordsShown++;
      }
      prog.style.width = (t * 100).toFixed(2) + '%';
      if (opts.loop === false && raw >= 1 && !ended) { ended = true; opts.onEnd && opts.onEnd(); }
    }
    function loop(now) { if (!running) return; draw(now); raf = requestAnimationFrame(loop); }
    return {
      set(c, n) {
        spec = { ticker: c.ticker, color: c.color, script: scriptFor(c, n), look: hostFor(c.ticker + n), hot: new Set([c.ticker.toLowerCase(), 'trade', 'video', 'reel']) };
        t0 = performance.now(); lineIdx = -1; wordsShown = 0; ended = false; cap.textContent = '';
        if (reduced) { cap.textContent = spec.script[0]; draw(t0 + 1500); }
        return spec.look;
      },
      play() { if (reduced || running || !spec) return; running = true; raf = requestAnimationFrame(loop); },
      pause() { running = false; cancelAnimationFrame(raf); }
    };
  }
  const heroReel = makeReel($('#reelCanvas'), $('#caption'), $('#reelProg'));
  heroReel.set({ ticker: 'MOSSY', color: '#2d9a55', line: 'A small green coin for people who like being outside.' }, 1);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { e.isIntersecting ? heroReel.play() : heroReel.pause(); }).observe($('#reelCanvas'));
  } else heroReel.play();

  $('#buyMossy').addEventListener('click', () => {
    if (live.on) { if (coins[0]) tradeUI.open(coins[0]); else $('#feed').scrollIntoView({ behavior: 'smooth' }); return; }
    const c = coins.find(c => c.ticker === 'MOSSY');
    if (c) trade(c, 1000);
    toast('Demo trade: $1,000 of $MOSSY. No real money moved.');
  });

  /* ---------- calculator ---------- */
  const vol = $('#vol');
  function calc() {
    const v = +vol.value, f = v * FEE;
    $('#volOut').textContent = usd(v);
    $('#cFees').textContent = usd(f);
    $('#cYou').textContent = usd(f * SHARE.you);
    $('#cHouse').textContent = usd(f * SHARE.house);
    $('#cReels').textContent = Math.floor(f * SHARE.reels / REEL_COST).toLocaleString('en-US');
    vol.style.background = '';
  }
  vol.addEventListener('input', calc);
  calc();

  /* ---------- reel jar (Matter.js) ---------- */
  const jar = (() => {
    const box = $('#jar'), cv = $('#pitCanvas'), ctx = cv.getContext('2d');
    const amtEl = $('#jarAmt'), fill = $('#jarFill'), hint = $('#jarHint'), reelsEl = $('#jarReels');
    const COIN_VALUE = 0.5;
    let amount = 0, reels = 0, queue = 0, W = 0, H = 0, dpr = 1;
    // Matter.js loads asynchronously; the jar picks it up whenever it arrives.
    let M = null, engine, walls = [], bodies = [];
    function ensureEngine() {
      if (engine || !window.Matter) return;
      M = window.Matter;
      engine = M.Engine.create();
      engine.gravity.y = 1.1;
      size();
    }

    function css(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
    function size() {
      const r = box.getBoundingClientRect();
      dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr;
      if (M && engine) {
        M.Composite.remove(engine.world, walls);
        const o = { isStatic: true };
        walls = [
          M.Bodies.rectangle(W / 2, H + 25, W * 2, 50, o),
          M.Bodies.rectangle(-25, H / 2, 50, H * 3, o),
          M.Bodies.rectangle(W + 25, H / 2, 50, H * 3, o)
        ];
        M.Composite.add(engine.world, walls);
      }
    }
    size();
    ensureEngine();
    new ResizeObserver(size).observe(box);

    function spawn() {
      const r = 11 + Math.random() * 4;
      const b = M.Bodies.circle(20 + Math.random() * (W - 40), -20 - Math.random() * 40, r, { restitution: .45, friction: .05, frictionAir: .01 });
      b.born = performance.now();
      bodies.push(b);
      M.Composite.add(engine.world, b);
    }
    function credit() {
      amount += COIN_VALUE;
      if (amount >= REEL_COST - 1e-9) {
        amount -= REEL_COST;
        reels++;
        reelsEl.textContent = reels;
        const pop = document.createElement('div');
        pop.className = 'reel-pop';
        pop.textContent = `Reel #${reels} funded. Rendering now.`;
        box.append(pop);
        setTimeout(() => pop.remove(), 1700);
        // drain the jar
        if (M) {
          const drain = bodies.splice(0);
          drain.forEach(b => { M.Composite.remove(engine.world, b); });
        }
      }
      amtEl.textContent = usd(amount, 2);
      fill.style.height = (amount / REEL_COST * 100) + '%';
    }
    function drop(tradeSize) {
      hint.style.opacity = 0;
      queue += Math.round(tradeSize * FEE * SHARE.reels / COIN_VALUE);
    }
    let last = 0;
    function tick(now) {
      if (!engine) ensureEngine();
      if (queue > 0 && now - last > 45) {
        last = now; queue--;
        if (M) spawn();
        credit();
      }
      if (M) {
        M.Engine.update(engine, 1000 / 60);
        // cap
        while (bodies.length > 90) M.Composite.remove(engine.world, bodies.shift());
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const coral = css('--coral'), ink = css('--surface');
        for (const b of bodies) {
          const { x, y } = b.position, r = b.circleRadius;
          ctx.save(); ctx.translate(x, y); ctx.rotate(b.angle);
          ctx.fillStyle = coral; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
          ctx.strokeStyle = ink; ctx.globalAlpha = .55; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 0, r - 3.5, 0, 7); ctx.stroke();
          ctx.globalAlpha = 1; ctx.fillStyle = ink;
          ctx.font = `700 ${Math.round(r)}px "IBM Plex Mono", monospace`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 1);
          ctx.restore();
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return { drop };
  })();
  $('#trade1').addEventListener('click', e => { jar.drop(500); burst(e.currentTarget); });
  $('#trade5').addEventListener('click', e => { jar.drop(5000); burst(e.currentTarget); });

  /* ---------- formats ---------- */
  const formats = [
    { n: 'Talking head', d: 'A host explains the coin straight to camera.', c: '#3346ff' },
    { n: 'Unboxing', d: 'A parcel arrives. The coin is inside.', c: '#ff4a6b' },
    { n: 'Street interview', d: 'Strangers are asked if they have heard of it.', c: '#12a36b' },
    { n: 'Hot take', d: 'Thirty seconds of strong opinions, one mic.', c: '#f08a00' },
    { n: 'Reaction', d: 'A host watches the chart and reacts live.', c: '#8a3cff' },
    { n: 'Explainer', d: 'Whiteboard, marker, three bullet points.', c: '#0098c7' },
    { n: 'Skit', d: 'Two hosts act out why they bought.', c: '#d4386e' },
    { n: 'Podcast clip', d: 'A cut from a show that never aired.', c: '#4c5578' }
  ];
  const fl = $('#formatList');
  fl.innerHTML = formats.map((f, i) => `
    <article class="fmt" role="listitem" data-i="${i}">
      <span class="fmt-sw" style="background:${f.c}">${i + 1}</span>
      <span class="tag" hidden></span>
      <h3>${f.n}</h3><p>${f.d}</p>
    </article>`).join('');
  const fEls = $$('.fmt', fl);
  let lastF = 0, nextF = 1, spinning = false;
  function markFormats() {
    fEls.forEach((el, i) => {
      el.classList.toggle('last', i === lastF);
      el.classList.toggle('next', i === nextF);
      el.classList.remove('scan');
      const tag = el.querySelector('.tag');
      tag.hidden = !(i === lastF || i === nextF);
      tag.textContent = i === nextF ? 'Next' : i === lastF ? 'Last used' : '';
    });
  }
  markFormats();
  $('#spinBtn').addEventListener('click', () => {
    if (spinning) return;
    spinning = true;
    lastF = nextF;
    let target;
    do { target = Math.floor(Math.random() * formats.length); } while (target === lastF);
    fEls.forEach(el => el.classList.remove('next', 'last'));
    const steps = reduced ? 0 : formats.length + ((target - lastF + formats.length) % formats.length);
    let k = 0, pos = lastF;
    (function step() {
      fEls.forEach(el => el.classList.remove('scan'));
      if (k >= steps) { nextF = target; markFormats(); spinning = false; return; }
      pos = (pos + 1) % formats.length;
      fEls[pos].classList.add('scan');
      k++;
      setTimeout(step, 40 + k * k * .9);
    })();
  });

  /* ---------- zcash helpers ---------- */
  const ZEC_USD = 40; // example rate for display only, not a live price
  const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function seeded(seedStr) { let x = 0; for (const ch of seedStr) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function demoAddr(ticker, pool) {
    const r = seeded('zec' + ticker + pool);
    const pick = (set, n) => Array.from({ length: n }, () => set[Math.floor(r() * set.length)]).join('');
    return pool === 'shielded' ? 'u1' + pick(B32, 139) : 't1' + pick(B58, 33);
  }
  // Format check only (prefix, alphabet, length). Checksums are not verified in this demo.
  function checkZec(raw) {
    const v = raw.trim();
    if (!v) return null;
    const low = v.toLowerCase();
    if (/^u1/.test(low)) return new RegExp(`^u1[${B32}]{100,}$`).test(low) ? { addr: low, kind: 'Unified', shielded: true } : { err: 'Unified addresses start with u1 and use only bech32 letters and digits (no b, i, o or 1 after the prefix).' };
    if (/^zs1/.test(low)) return new RegExp(`^zs1[${B32}]{75}$`).test(low) ? { addr: low, kind: 'Sapling', shielded: true } : { err: 'Sapling addresses are 78 characters long and start with zs1.' };
    if (/^t[13]/.test(v)) return new RegExp(`^t[13][${B58}]{33}$`).test(v) ? { addr: v, kind: 'Transparent', shielded: false } : { err: 'Transparent addresses are 35 characters long and start with t1 or t3.' };
    return { err: 'That does not look like a Zcash address. It should start with u1, zs1, t1 or t3.' };
  }
  const zecFmt = z => (Math.round(z * 1e8) / 1e8).toFixed(8).replace(/\.?0+$/, '');
  const short = a => a.length > 20 ? a.slice(0, 10) + '…' + a.slice(-6) : a;
  const allTips = [];
  const fanMemos = ['gm from a fan', 'more unboxings please', 'this coin made my week', 'for the next street interview', 'tiny tip, big love', '', 'keep the reels coming', ''];
  function seedTips(c) {
    const r = seeded('tips' + c.ticker);
    const n = 2 + Math.floor(r() * 5);
    c.tips = [];
    for (let i = 0; i < n; i++) {
      const pool = r() < .78 ? 'shielded' : 'transparent';
      const t = { t: Date.now() - (i + 1) * (20 + r() * 300) * 60000, zec: [0.01, 0.05, 0.1, 0.25, 0.5][Math.floor(r() * 5)], pool, memo: pool === 'shielded' ? fanMemos[Math.floor(r() * fanMemos.length)] : '', coin: c };
      c.tips.push(t); allTips.push(t);
    }
  }


  /* ---------- coin artwork: original illustrations for the example coins ---------- */
  const ART = {
    MOSSY: `<rect width="64" height="64" fill="#1f7a4a"/><circle cx="50" cy="12" r="16" fill="#2c9960"/><path d="M8 52c0-14 10-24 24-24s24 10 24 24z" fill="#7bd36b"/><path d="M8 52c2-6 6-7 9-5 1-5 6-7 9-3 2-5 8-6 11-1 3-4 8-3 10 2 3-2 7 0 9 7z" fill="#5bbd57"/><circle cx="25" cy="40" r="3" fill="#123"/><circle cx="39" cy="40" r="3" fill="#123"/><circle cx="26" cy="39" r="1" fill="#fff"/><circle cx="40" cy="39" r="1" fill="#fff"/><path d="M29 46q3 3 6 0" stroke="#123" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M32 28v-8M32 22q-5-3-7 1M32 20q5-4 8 0" stroke="#3a8f3a" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    PBBL: `<rect width="64" height="64" fill="#f1e6d6"/><ellipse cx="32" cy="54" rx="20" ry="4" fill="#d8c8b0"/><path d="M12 40c0-12 9-20 21-20s19 8 19 18-8 16-20 16-20-4-20-14z" fill="#8f98a6"/><path d="M18 36c2-7 8-11 15-11" stroke="#c4cbd4" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M22 20l3-8 7 6 7-6 3 8z" fill="#f2b632"/><circle cx="25" cy="12" r="2" fill="#f2b632"/><circle cx="32" cy="17" r="2" fill="#f2b632"/><circle cx="39" cy="12" r="2" fill="#f2b632"/>`,
    NITE: `<rect width="64" height="64" fill="#101637"/><circle cx="12" cy="12" r="1.2" fill="#fff"/><circle cx="52" cy="20" r="1" fill="#fff"/><circle cx="44" cy="8" r="1.4" fill="#fff"/><circle cx="8" cy="34" r="1" fill="#fff"/><path d="M40 10a15 15 0 1 0 12 24 12 12 0 1 1-12-24z" fill="#ffd66b"/><path d="M14 40h22v10a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6z" fill="#e9eefc"/><path d="M36 43h3a4 4 0 0 1 0 8h-3" stroke="#e9eefc" stroke-width="3" fill="none"/><path d="M20 36q2-3 0-6M26 36q2-3 0-6M32 36q2-3 0-6" stroke="#9aa6d6" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    SOUP: `<rect width="64" height="64" fill="#f59f2a"/><path d="M22 20q3-4 0-8M32 20q3-4 0-8M42 20q3-4 0-8" stroke="#fff4e0" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M8 30h48a24 22 0 0 1-48 0z" fill="#fff"/><ellipse cx="32" cy="30" rx="24" ry="5" fill="#e0512b"/><circle cx="25" cy="30" r="2" fill="#ffd166"/><circle cx="36" cy="29" r="1.6" fill="#7bd36b"/><circle cx="42" cy="31" r="1.4" fill="#ffd166"/><path d="M44 18l10-12" stroke="#b86b1a" stroke-width="3" stroke-linecap="round"/><rect x="24" y="50" width="16" height="4" rx="2" fill="#f7e2c4"/>`,
    CGOAT: `<rect width="64" height="64" fill="#8fc9ff"/><circle cx="50" cy="14" r="7" fill="#fff6c2"/><path d="M8 50a10 10 0 0 1 8-15 13 13 0 0 1 25-3 10 10 0 0 1 15 9 7 7 0 0 1-2 14H14a7 7 0 0 1-6-5z" fill="#fff"/><path d="M24 30q-6-8-2-14M40 30q6-8 2-14" stroke="#b58a5a" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="32" cy="34" rx="9" ry="11" fill="#f3efe8"/><ellipse cx="21" cy="30" rx="4" ry="2" fill="#e2dccf" transform="rotate(-20 21 30)"/><ellipse cx="43" cy="30" rx="4" ry="2" fill="#e2dccf" transform="rotate(20 43 30)"/><circle cx="28" cy="32" r="1.8" fill="#222"/><circle cx="36" cy="32" r="1.8" fill="#222"/><ellipse cx="32" cy="40" rx="3" ry="2" fill="#f2a7b5"/><path d="M32 45l-2 5h4z" fill="#e2dccf"/>`,
    LAMP: `<rect width="64" height="64" fill="#0c5566"/><path d="M36 22 58 64H14z" fill="#ffe28a" opacity=".28"/><path d="M24 12 42 6l6 16-18 6z" fill="#ffc94d"/><path d="M28 26 18 44" stroke="#dfe8ea" stroke-width="3" stroke-linecap="round"/><circle cx="28" cy="26" r="3" fill="#dfe8ea"/><circle cx="18" cy="44" r="3" fill="#dfe8ea"/><path d="M18 44v8" stroke="#dfe8ea" stroke-width="3"/><rect x="10" y="52" width="18" height="4" rx="2" fill="#dfe8ea"/><circle cx="39" cy="22" r="3" fill="#fff6c2"/>`,
    ORBS: `<rect width="64" height="64" fill="#2b1a55"/><circle cx="10" cy="14" r="1" fill="#fff"/><circle cx="54" cy="10" r="1.3" fill="#fff"/><circle cx="56" cy="46" r="1" fill="#fff"/><ellipse cx="32" cy="36" rx="27" ry="8" fill="none" stroke="#b9a4ff" stroke-width="2" transform="rotate(-14 32 36)"/><circle cx="36" cy="32" r="12" fill="#ff9fb7"/><path d="M36 32m-7 0a7 7 0 1 1 7 7 4 4 0 1 1 0-7" stroke="#d45d7e" stroke-width="2.2" fill="none"/><path d="M12 44h26c4 0 6-2 6-4" stroke="#ffd166" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M14 40l-3-8M18 40l0-8" stroke="#ffd166" stroke-width="2" stroke-linecap="round"/><circle cx="11" cy="31" r="1.8" fill="#ffd166"/><circle cx="18" cy="31" r="1.8" fill="#ffd166"/>`,
    BOAT: `<rect width="64" height="64" fill="#2f78c4"/><circle cx="50" cy="14" r="6" fill="#ffe28a"/><path d="M10 36h44l-8 12H18z" fill="#fff"/><path d="M32 10 32 36 14 36z" fill="#f4f7fb"/><path d="M32 16 46 36H32z" fill="#dce6f2"/><path d="M0 50q8-5 16 0t16 0 16 0 16 0v14H0z" fill="#5aa0e6"/><path d="M0 56q8-5 16 0t16 0 16 0 16 0v8H0z" fill="#8cc2f5"/>`
  };
  const artURI = t => ART[t] ? 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${ART[t]}</svg>`) : null;
  // image if the coin has one, otherwise its first two letters
  const avatarInner = c => c.img ? `<img src="${esc(c.img)}" alt="">` : esc(c.ticker.slice(0, 2));

  /* ---------- feed ---------- */
  const palette = ['#3346ff', '#ff4a6b', '#12a36b', '#f08a00', '#8a3cff', '#0098c7', '#d4386e', '#4c5578'];
  const now = Date.now();
  const seed = [
    ['Mossy', 'MOSSY', 'A small green coin for people who like being outside.', 14, 612, 3],
    ['Pebble Club', 'PBBL', 'Members only. The membership is owning one pebble.', 9, 388, 11],
    ['Night Shift', 'NITE', 'For everyone trading at 3am. We see you.', 22, 1044, 1],
    ['Soup Season', 'SOUP', 'It is always soup season somewhere.', 6, 241, 26],
    ['Cloud Goat', 'CGOAT', 'A goat that lives on a cloud and does not come down.', 17, 790, 7],
    ['Tiny Lamp', 'LAMP', 'Lights up one desk at a time.', 3, 132, 44],
    ['Orbit Snail', 'ORBS', 'Slowest thing in space. Still moving.', 11, 505, 16],
    ['Paper Boat', 'BOAT', 'Folded on a Tuesday. Still floating.', 4, 160, 58]
  ];
  let coins = seed.map(([name, ticker, line, reels, fees, minsAgo], i) => ({
    name, ticker, line, reels, fees, color: palette[i % palette.length],
    last: now - minsAgo * 60000, fund: (fees * SHARE.reels) % REEL_COST, mine: false, zecAddr: null, tipsOff: false, img: artURI(ticker)
  }));
  coins.forEach(seedTips);
  function seedHist(c) {
    const r = seeded('hist' + c.ticker); let v = c.fees * (.55 + r() * .2);
    c.hist = Array.from({ length: 24 }, (_, i) => (v += (c.fees - v) / (24 - i) * (0.3 + r() * 1.4)));
    c.hist[23] = c.fees;
  }
  coins.forEach(seedHist);
  const mine = store.get('hr-coins', []);
  if (Array.isArray(mine)) {
    mine.filter(c => c && typeof c.ticker === 'string' && !coins.some(x => x.ticker === c.ticker))
      .forEach(c => coins.unshift({ ...c, mine: true, tips: [], fund: Number(c.fund) || 0, fees: Number(c.fees) || 0, reels: Number(c.reels) || 0 }));
  }
  coins.forEach(c => { if (!Array.isArray(c.hist) || !c.hist.length) c.hist = [c.fees, c.fees]; c.tips.forEach(t => { t.coin = c; if (!allTips.includes(t)) allTips.push(t); }); });
  // tips hold a back-reference to their coin, so strip it before saving
  function saveMine() { store.set('hr-coins', coins.filter(c => c.mine).map(c => ({ ...c, tips: c.tips.map(({ coin, ...t }) => t) }))); }
  const tipTotal = c => c.tips.reduce((a, t) => a + t.zec, 0);

  let sortKey = store.get('hr-sort', 'recent');
  if (!['recent', 'reels', 'fees'].includes(sortKey)) sortKey = 'recent';
  let query = '';
  const grid = $('#feedGrid'), emptyEl = $('#feedEmpty');
  const cards = new Map();
  const keyOf = c => c.address || c.ticker;

  function ago(ts) {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    return h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago';
  }
  function cardFor(c) {
    let el = cards.get(keyOf(c));
    if (!el) {
      el = document.createElement('article');
      el.className = 'coin enter';
      el.addEventListener('animationend', e => { if (e.animationName === 'cardIn') el.classList.remove('enter'); });
      el.innerHTML = `
        <div class="coin-top" role="button" tabindex="0" aria-label="Watch $${esc(c.ticker)} reels">
          <div class="avatar" style="background:${c.color}">${avatarInner(c)}<span class="play"><svg class="ic"><use href="#ic-play"/></svg></span></div>
          <div class="coin-id">
            <h3>${esc(c.name)}${c.mine ? '<span class="badge-new">YOURS</span>' : ''}</h3>
            <p class="mono">$${esc(c.ticker)}</p>
          </div>
        </div>
        <p class="coin-line">${esc(c.line)}</p>
        <dl class="coin-stats">
          <div><dt>Reels</dt><dd class="mono" data-k="reels"></dd></div>
          <div><dt>Fees</dt><dd class="mono" data-k="fees"></dd></div>
          <div><dt>Last reel</dt><dd class="mono" data-k="last"></dd></div>
        </dl>
        <svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path class="a"/><path class="l"/></svg>
        <div class="meter" aria-hidden="true"><span></span></div>
        <div class="meter-label mono"><span>next reel</span><span data-k="fund"></span></div>
        <p class="coin-tips mono"><svg class="ic"><use href="#ic-zec"/></svg><span data-k="tips"></span></p>
        <div class="coin-actions">
          <button class="btn btn-line btn-sm" type="button" data-act="buy">Buy $${esc(c.ticker)}</button>
          <button class="btn btn-zec btn-sm" type="button" data-act="tip"><svg class="ic"><use href="#ic-zec"/></svg>Tip ZEC</button>
        </div>`;
      el.querySelector('[data-act="buy"]').addEventListener('click', e => {
        if (live.on) return tradeUI.open(c);
        burst(e.currentTarget);
        trade(c, 1000);
        toast(`Demo trade: $1,000 of $${c.ticker}. No real money moved.`);
      });
      el.querySelector('[data-act="tip"]').addEventListener('click', () => tipper.open(c));
      const top = el.querySelector('.coin-top');
      top.addEventListener('click', () => player.openCoin(c));
      top.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); player.openCoin(c); } });
      cards.set(keyOf(c), el);
    }
    el.querySelector('[data-k="reels"]').textContent = c.reels;
    el.querySelector('[data-k="fees"]').textContent = usd(c.fees);
    el.querySelector('[data-k="last"]').textContent = c.reels ? ago(c.last) : 'none yet';
    el.querySelector('[data-k="fund"]').textContent = `${usd(c.fund, 2)} / ${usd(REEL_COST)}`;
    el.querySelector('.meter span').style.width = (c.fund / REEL_COST * 100) + '%';
    const tz = c.tipsZecTotal ?? tipTotal(c), tn = c.tipsCountTotal ?? c.tips.length;
    el.querySelector('[data-k="tips"]').textContent = `${zecFmt(tz) || '0'} ZEC tipped · ${tn} tip${tn === 1 ? '' : 's'}`;
    const h = c.hist, mn = Math.min(...h), mx = Math.max(...h), rng = mx - mn || 1;
    const line = h.map((v, i) => `${i ? 'L' : 'M'}${(i / (h.length - 1) * 100).toFixed(1)} ${(27 - (v - mn) / rng * 24).toFixed(1)}`).join(' ');
    el.querySelector('.spark .l').setAttribute('d', line);
    el.querySelector('.spark .a').setAttribute('d', line + ' L100 30 L0 30 Z');
    const tb = el.querySelector('[data-act="tip"]');
    const noTips = !!c.tipsOff || (live.on && !c.zecAddr);
    tb.disabled = noTips;
    tb.title = noTips ? 'This coin is not taking ZEC tips right now' : '';
    return el;
  }
  function sorted() {
    const q = query.trim().toLowerCase().replace(/^\$/, '');
    const list = coins.filter(c => !q || c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q));
    const by = {
      recent: (a, b) => (b.reels ? b.last : b.created || 0) - (a.reels ? a.last : a.created || 0),
      reels: (a, b) => b.reels - a.reels || b.fees - a.fees,
      fees: (a, b) => b.fees - a.fees
    }[sortKey];
    return list.sort(by);
  }
  function render() {
    const list = sorted();
    const keep = new Set(list.map(keyOf));
    for (const [t, el] of cards) if (!keep.has(t) && el.parentNode) el.remove();
    list.forEach((c, i) => {
      const el = cardFor(c);
      if (grid.children[i] !== el) grid.insertBefore(el, grid.children[i] || null);
    });
    emptyEl.hidden = list.length > 0;
    emptyEl.textContent = live.on && !coins.length ? 'No coins yet. Launch the first one from the button at the top.' : 'No coins match that search. Try a shorter name or ticker.';
  }
  $$('.tabs button').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.sort === sortKey));
    b.addEventListener('click', () => {
      sortKey = b.dataset.sort;
      store.set('hr-sort', sortKey);
      $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      render();
    });
  });
  $('#feedSearch').addEventListener('input', e => { query = e.target.value; render(); });

  function trade(c, size) {
    const f = size * FEE;
    c.fees += f;
    c.hist.push(c.fees); if (c.hist.length > 30) c.hist.shift();
    const made = fundJar(c, f * SHARE.reels);
    if (c.mine) saveMine();
    render();
    pushTape(c, size);
    if (dash) dash.onTrade(c, size, made);
    if (size >= 2500) liveChip(c, `<b>$${esc(c.ticker)}</b> ${usd(size)} buy · +${usd(size * FEE * SHARE.reels, 2)} to reels`);
  }
  function fundJar(c, dollars) {
    c.fund += dollars;
    let made = 0;
    while (c.fund >= REEL_COST) { c.fund -= REEL_COST; c.reels++; made++; queue.add(c, c.reels); }
    if (made) {
      c.last = Date.now();
      const el = cards.get(keyOf(c));
      if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    }
    return made;
  }
  function addTip(c, zec, pool, memo) {
    if (live.on) {
      api('/api/tips', { method: 'POST', body: { coin: c.address, zec, pool } }).then(() => refreshStats()).catch(e => toast(e.message));
      const t = { t: Date.now(), zec, pool, memo: '', coin: c, fresh: true, reported: true };
      c.tips.unshift(t); allTips.push(t);
      c.tipsZecTotal = (c.tipsZecTotal || 0) + zec; c.tipsCountTotal = (c.tipsCountTotal || 0) + 1;
      render(); drawZecBoard();
      return 0;
    }
    const t = { t: Date.now(), zec, pool, memo, coin: c, fresh: true };
    c.tips.unshift(t); allTips.push(t);
    const made = fundJar(c, zec * ZEC_USD); // 100% of a tip goes to the reel jar
    if (c.mine) saveMine();
    render(); drawZecBoard();
    tapeItems.unshift({ t: c.ticker, v: zec, zec: true }); tapeItems.length = Math.min(tapeItems.length, 10);
    if (dash) dash.onTip(c, made);
    liveChip(c, `<b>${zecFmt(zec)} ZEC</b> ${pool === 'shielded' ? 'shielded tip' : 'tip'} for $${esc(c.ticker)}`);
    return made;
  }

  /* ---------- coin burst ---------- */
  function burst(el, kind) {
    if (reduced || !el) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < 12; i++) {
      const d = document.createElement('i');
      d.className = 'burst' + (kind === 'zec' ? ' z' : '');
      d.textContent = kind === 'zec' ? 'Z' : '$';
      const a = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 70;
      d.style.left = cx + 'px'; d.style.top = cy + 'px';
      d.style.setProperty('--dx', Math.cos(a) * dist + 'px');
      d.style.setProperty('--dy', Math.sin(a) * dist - 30 + 'px');
      document.body.append(d);
      setTimeout(() => d.remove(), 950);
    }
  }

  /* ---------- render queue ---------- */
  const queue = (() => {
    const list = $('#queueList'), RENDER_MS = 12000, jobs = [];
    function add(c, n) {
      jobs.unshift({ c, n, start: Date.now(), done: false, el: null });
      if (jobs.length > 5) jobs.length = 5;
      draw();
    }
    function draw() {
      list.innerHTML = '';
      if (!jobs.length) { list.innerHTML = '<li class="queue-empty">Nothing rendering. The next reel starts when a coin fills its jar.</li>'; return; }
      jobs.forEach(j => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="qa" style="background:${j.c.color}">${avatarInner(j.c)}</span>
          <div class="qt"><b>$${esc(j.c.ticker)}</b> <small>reel ${j.n} · ${esc(formats[j.n % formats.length].n.toLowerCase())} · host ${esc(hostFor(j.c.ticker + j.n).name)}</small><div class="qbar"><span></span></div></div>
          <span class="qs"></span>`;
        j.el = li; list.append(li); tick1(j);
      });
    }
    function syncLive(list) {
      jobs.length = 0;
      list.filter(r => r.status !== 'posted' || Date.now() - Date.parse(r.updatedAt) < 60000).slice(0, 5).forEach(r => {
        const c = coins.find(x => x.address === r.coin);
        if (c) jobs.push({ c, n: r.n, live: true, status: r.status, done: r.status === 'posted', doneAt: Date.parse(r.updatedAt), el: null });
      });
      draw();
    }
    function tick1(j) {
      if (j.live) {
        const label = { queued: 'Queued', rendering: 'Rendering', posted: 'Posted', failed: 'Failed' }[j.status] || j.status;
        j.el.querySelector('.qbar span').style.width = j.status === 'posted' ? '100%' : j.status === 'queued' ? '4%' : '35%';
        j.el.querySelector('.qs').textContent = label;
        j.el.classList.toggle('done', j.status === 'posted');
        j.el.classList.toggle('indet', j.status === 'rendering');
        return;
      }
      const f = Math.min(1, (Date.now() - j.start) / RENDER_MS);
      j.el.querySelector('.qbar span').style.width = (f * 100) + '%';
      j.el.querySelector('.qs').textContent = f >= 1 ? 'Posted' : Math.round(f * 100) + '%';
      j.el.classList.toggle('done', f >= 1);
      if (f >= 1 && !j.done) {
        j.done = true; j.doneAt = Date.now();
        toast(`New reel posted: $${j.c.ticker} reel ${j.n}`, { label: 'Watch', fn: () => player.openCoin(j.c) });
        liveChip(j.c, `<b>Reel ${j.n}</b> posted for $${esc(j.c.ticker)}`);
      }
    }
    setInterval(() => {
      if (document.hidden) return;
      jobs.forEach(tick1);
      const before = jobs.length;
      for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].done && Date.now() - jobs[i].doneAt > 5000) jobs.splice(i, 1);
      if (jobs.length !== before) draw();
    }, 250);
    draw();
    return { add, syncLive };
  })();


  /* ---------- live decoration: chips, stats, scroll progress ---------- */
  const chipsBox = $('#floatChips');
  let chipSide = 0;
  function liveChip(c, html) {
    if (reduced || !chipsBox || document.hidden) return;
    const el = document.createElement('div');
    const side = chipSide++ % 2 ? 'right' : 'left';
    el.className = 'fchip ' + side;
    el.style.top = (18 + Math.random() * 55) + '%';
    el.innerHTML = `<i style="background:${c.color}">${avatarInner(c)}</i><span>${html}</span>`;
    chipsBox.append(el);
    while (chipsBox.children.length > 4) chipsBox.firstChild.remove();
    setTimeout(() => el.remove(), 4300);
  }
  const statEls = $$('[data-stat]');
  const statNow = {};
  function statValues() {
    if (live.on && live.stats) return { coins: live.stats.coins, reels: live.stats.reels, paid: live.stats.paidUsd, zec: live.stats.zec };
    return {
      coins: coins.length,
      reels: coins.reduce((a, c) => a + c.reels, 0),
      paid: coins.reduce((a, c) => a + c.fees * SHARE.you, 0),
      zec: allTips.reduce((a, t) => a + t.zec, 0)
    };
  }
  const statFmt = { coins: v => Math.round(v).toLocaleString('en-US'), reels: v => Math.round(v).toLocaleString('en-US'), paid: v => usd(v), zec: v => v.toFixed(2) };
  function drawStats(animate) {
    const v = statValues();
    statEls.forEach(el => {
      const k = el.dataset.stat, from = statNow[k] ?? 0, to = v[k];
      if (from === to) return;
      statNow[k] = to;
      if (!animate || reduced) { el.textContent = statFmt[k](to); return; }
      const t0 = performance.now(), D = 900;
      (function step(now) {
        const f = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - f, 3);
        el.textContent = statFmt[k](from + (to - from) * e);
        if (f < 1) requestAnimationFrame(step);
      })(t0);
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    });
  }
  // count up from zero the first time the band scrolls into view
  const statsSec = $('.stats');
  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver(([e]) => { if (e.isIntersecting) { drawStats(true); so.disconnect(); } });
    so.observe(statsSec);
  } else drawStats(false);
  setInterval(() => { if (!document.hidden && Object.keys(statNow).length) drawStats(true); }, 3000);

  const scrollProg = $('#scrollProg');
  const onProg = () => { const h = document.documentElement.scrollHeight - innerHeight; scrollProg.style.width = (h > 0 ? scrollY / h * 100 : 0) + '%'; };
  addEventListener('scroll', onProg, { passive: true }); onProg();
  $('#toTop').addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));
  // FAQ: one answer open at a time
  $$('.faq details').forEach(d => d.addEventListener('toggle', () => { if (d.open) $$('.faq details').forEach(o => { if (o !== d) o.open = false; }); }));

  let dash = null, tipper = null, player = null;
  // simulated market
  setInterval(() => {
    if (document.hidden || live.on) return;
    const c = coins[Math.floor(Math.random() * coins.length)];
    if (Math.random() < .12 && !c.tipsOff) {
      const shielded = Math.random() < .8;
      addTip(c, [0.01, 0.02, 0.05, 0.1][Math.floor(Math.random() * 4)], shielded ? 'shielded' : 'transparent', shielded ? fanMemos[Math.floor(Math.random() * fanMemos.length)] : '');
    } else trade(c, 200 + Math.random() * 4800);
  }, 2400);
  setInterval(render, 30000); // refresh "x minutes ago"
  render();

  /* ---------- tape ---------- */
  const tape = $('#tape');
  const tapeItems = coins.slice(0, 8).map(c => ({ t: c.ticker, v: 400 + Math.random() * 3000 }));
  function drawTape() {
    const html = tapeItems.map(i => i.zec
      ? `<span><b>$${esc(i.t)}</b> <span class="up">${zecFmt(i.v)} ZEC</span> tip</span>`
      : `<span><b>$${esc(i.t)}</b> <span class="up">+${usd(i.v)}</span> traded</span>`).join('');
    tape.innerHTML = html + html; // duplicated for seamless loop
  }
  function pushTape(c, size) {
    tapeItems.unshift({ t: c.ticker, v: size });
    tapeItems.length = Math.min(tapeItems.length, 10);
  }
  drawTape();
  setInterval(drawTape, 20000);

  /* ---------- modals ---------- */
  const modalStack = [];
  function openModal(m) {
    if (!m.hidden) return;
    modalStack.push({ m, focus: document.activeElement });
    m.style.zIndex = 50 + modalStack.length;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    const f = m.querySelector('input, button:not(.modal-x)') || m.querySelector('button');
    setTimeout(() => f && f.focus(), 30);
  }
  function closeModal(m) {
    if (m.hidden) return;
    m.hidden = true;
    const i = modalStack.findIndex(x => x.m === m);
    const entry = i >= 0 ? modalStack.splice(i, 1)[0] : null;
    if (!modalStack.length) document.body.style.overflow = '';
    if (entry && entry.focus && entry.focus.focus) entry.focus.focus({ preventScroll: true });
    m.dispatchEvent(new Event('modalclose'));
  }
  $$('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(m); });
    m.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        const f = $$('button, input, a[href], [tabindex]:not([tabindex="-1"])', m).filter(x => !x.hidden && x.offsetParent !== null && !x.classList.contains('sr'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const top = modalStack[modalStack.length - 1];
    if (top) closeModal(top.m);
  });
  const launch = $('#launch'), license = $('#license');
  $('#licenseLink').addEventListener('click', e => { e.preventDefault(); openModal(license); });



  /* ---------- zcash board ---------- */
  const zecList = $('#zecList');
  function drawZecBoard() {
    const recent = allTips.slice().sort((a, b) => b.t - a.t).slice(0, 6);
    zecList.innerHTML = recent.map(t => `
      <li class="${t.fresh ? 'new' : ''}">
        <span class="zbadge ${t.pool === 'shielded' ? '' : 't'}"><svg class="ic"><use href="#ic-${t.pool === 'shielded' ? 'shield' : 'zec'}"/></svg></span>
        <span class="who"><b>$${esc(t.coin.ticker)}</b> · ${t.pool === 'shielded' ? 'sender hidden' : 'transparent sender'}<small>${t.reported ? (t.verified ? 'verified' : 'reported, not verified yet') : t.memo ? '“' + esc(t.memo) + '”' : (t.pool === 'shielded' ? 'no memo' : 'memos need a shielded tip')} · ${ago(t.t)}</small></span>
        <span class="amt-v">${zecFmt(t.zec)} ZEC</span>
      </li>`).join('');
    allTips.forEach(t => { t.fresh = false; });
    $('#zecTotal').textContent = allTips.reduce((a, t) => a + t.zec, 0).toFixed(2);
  }
  drawZecBoard();
  setInterval(drawZecBoard, 30000);

  /* ---------- copy helper ---------- */
  function copyText(text, label) {
    const done = () => toast(`${label} copied`);
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      ok ? done() : toast('Copy is blocked here. Select the text and copy it by hand.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* ---------- tip dialog ---------- */
  tipper = (() => {
    const m = $('#tip');
    const amtIn = $('#tipAmt'), memo = $('#tipMemo'), err = $('#tipErr');
    const amtBtns = $$('.amt button', m), poolBtns = $$('.seg2 button', m);
    const enc = new TextEncoder();
    let coin = null, pool = 'shielded';

    function addrFor() {
      if (coin.zecAddr) return coin.zecAddr;
      return demoAddr(coin.ticker, pool);
    }
    function allowedPools() {
      if (!coin.zecAddr) return ['shielded', 'transparent'];
      return [checkZec(coin.zecAddr).shielded ? 'shielded' : 'transparent'];
    }
    function b64url(bytes) {
      let bin = '';
      bytes.forEach(b => { bin += String.fromCharCode(b); });
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function parseAmt() {
      const v = amtIn.value.trim().replace(',', '.');
      if (!/^\d*\.?\d+$/.test(v)) return { err: 'Enter an amount in ZEC, like 0.05.' };
      if (/\.\d{9,}$/.test(v)) return { err: 'ZEC has at most 8 decimal places.' };
      const n = Number(v);
      if (n < 0.0001) return { err: 'The smallest tip here is 0.0001 ZEC.' };
      if (n > 100) return { err: 'Tips here are capped at 100 ZEC.' };
      return { n };
    }
    function update() {
      const a = parseAmt();
      const bytes = enc.encode(memo.value);
      const memoOn = pool === 'shielded';
      $('#memoFld').hidden = !memoOn;
      $('#memoCount').textContent = `${bytes.length}/512 bytes`;
      memo.setAttribute('aria-invalid', String(memoOn && bytes.length > 512));
      amtIn.setAttribute('aria-invalid', String(!!a.err));
      amtBtns.forEach(b => b.setAttribute('aria-checked', String(!a.err && Number(b.dataset.amt) === a.n)));
      poolBtns.forEach(b => {
        b.setAttribute('aria-checked', String(b.dataset.pool === pool));
        b.disabled = !allowedPools().includes(b.dataset.pool);
      });
      $('#poolNote').textContent = pool === 'shielded'
        ? 'Shielded: the sender, receiver and amount stay private on chain. The memo is encrypted for the coin owner.'
        : 'Transparent: the tip is public on chain, like Bitcoin. Transparent tips cannot carry a memo.';
      const addr = addrFor();
      $('#tipAddr').textContent = addr;
      $('#tipWarn').textContent = coin.zecAddr
        ? `This is the ${checkZec(coin.zecAddr).kind.toLowerCase()} address the coin's launcher entered. Double-check it in your wallet before sending.`
        : 'Demo address. It is not a real wallet, so do not send funds to it.';
      const problem = a.err || (memoOn && bytes.length > 512 ? `The memo is ${bytes.length} bytes. Shorten it to 512 bytes or less.` : '');
      err.hidden = !problem; err.textContent = problem;
      $('#tipSent').disabled = !!problem;
      if (problem) { $('#tipUsd').textContent = ''; return; }
      $('#tipUsd').textContent = `≈ ${usd(a.n * ZEC_USD, 2)} at the example rate. All of it goes to $${coin.ticker}'s reel jar.`;
      let uri = `zcash:${addr}?amount=${zecFmt(a.n)}`;
      if (memoOn && bytes.length) uri += `&memo=${b64url(bytes)}`;
      $('#tipUri').textContent = uri;
      drawQr(uri);
    }
    function drawQr(uri) {
      const box = $('#tipQr');
      if (typeof window.qrcode !== 'function') { box.innerHTML = '<p class="qr-fallback">The QR code could not load. Copy the payment request below instead.</p>'; return; }
      try {
        const q = window.qrcode(0, uri.length > 600 ? 'L' : 'M');
        q.addData(uri); q.make();
        box.innerHTML = q.createImgTag(4, 0);
        const img = box.querySelector('img');
        img.alt = 'QR code for this Zcash payment request';
      } catch { box.innerHTML = '<p class="qr-fallback">This request is too long for a QR code. Shorten the memo, or copy the request below.</p>'; }
    }
    amtBtns.forEach(b => b.addEventListener('click', () => { amtIn.value = b.dataset.amt; update(); }));
    poolBtns.forEach(b => b.addEventListener('click', () => { if (!b.disabled) { pool = b.dataset.pool; update(); } }));
    amtIn.addEventListener('input', update);
    memo.addEventListener('input', update);
    $('#tipCopyAddr').addEventListener('click', () => copyText(addrFor(), 'Address'));
    $('#tipCopyUri').addEventListener('click', () => copyText($('#tipUri').textContent, 'Payment request'));
    $('#tipSent').addEventListener('click', e => {
      const a = parseAmt();
      if (a.err) return;
      burst(e.currentTarget, 'zec');
      const made = addTip(coin, a.n, pool, pool === 'shielded' ? memo.value.trim() : '');
      closeModal(m);
      toast(live.on
        ? `Tip reported: ${zecFmt(a.n)} ZEC to $${coin.ticker}. It shows as unverified until it is confirmed on the Zcash chain.`
        : `Demo tip recorded: ${zecFmt(a.n)} ZEC (${usd(a.n * ZEC_USD, 2)}) went to $${coin.ticker}'s reel jar${made ? `. Reel ${coin.reels} is rendering.` : '.'}`);
    });
    return {
      open(c) {
        coin = c;
        $('#tipCoin').textContent = '$' + c.ticker;
        $('#tipOff').hidden = !c.tipsOff;
        $('#tipBody').hidden = !!c.tipsOff;
        if (!c.tipsOff) {
          pool = allowedPools()[0];
          amtIn.value = '0.05'; memo.value = '';
          update();
        }
        openModal(m);
      }
    };
  })();
  $('#zecTry').addEventListener('click', () => tipper.open(coins.find(c => c.ticker === 'MOSSY') || coins[0]));


  /* ---------- reel player ---------- */
  player = (() => {
    const m = $('#player'), stage = $('#plStage');
    let list = [], i = 0;
    const r = makeReel($('#plCanvas'), $('#plCap'), $('#plProg'), { loop: false, duration: 9000, onEnd: () => go(1, true) });
    const video = $('#plVideo');
    function load(dir) {
      const c = list[i], n = Math.max(1, c.reels);
      video.hidden = true; video.removeAttribute('src'); stage.classList.remove('has-video');
      if (live.on && c.address) api(`/api/coins/${c.address}/reels`).then(rs => {
        const v = rs.find(x => x.status === 'posted' && x.videoUrl);
        if (v && list[i] === c && !m.hidden) { video.src = v.videoUrl; video.hidden = false; stage.classList.add('has-video'); video.play().catch(() => {}); }
      }).catch(() => {});
      const look = r.set(c, n);
      $('#plChip').textContent = `$${c.ticker} · reel ${n}`;
      $('#plFmt').textContent = formats[n % formats.length].n.toLowerCase();
      $('#plName').textContent = c.name;
      $('#plSub').textContent = `host: ${look.name} · ${usd(c.fees)} in fees`;
      $('#plBuy').textContent = `Buy $${c.ticker}`;
      $('#plTip').disabled = !!c.tipsOff;
      $('#plCount').textContent = `${i + 1} / ${list.length}`;
      if (dir) { stage.style.setProperty('--from', dir > 0 ? '60px' : '-60px'); stage.classList.remove('swap'); void stage.offsetWidth; stage.classList.add('swap'); }
      r.play();
    }
    function go(d, auto) {
      if (!list.length) return;
      if (auto && i === list.length - 1) { i = 0; } else i = (i + d + list.length) % list.length;
      load(d);
    }
    function open(start) {
      list = sorted();
      if (!list.length) list = coins.slice();
      i = Math.max(0, list.indexOf(start));
      openModal(m);
      load(0);
    }
    m.addEventListener('modalclose', () => { r.pause(); video.pause(); });
    $('#plNext').addEventListener('click', () => go(1));
    $('#plPrev').addEventListener('click', () => go(-1));
    $('#plBuy').addEventListener('click', e => { const c = list[i]; if (live.on) { r.pause(); return tradeUI.open(c); } trade(c, 1000); burst(e.currentTarget); toast(`Demo trade: $1,000 of $${c.ticker}. No real money moved.`); $('#plSub').textContent = `host: ${hostFor(c.ticker + Math.max(1, c.reels)).name} · ${usd(c.fees)} in fees`; });
    $('#plTip').addEventListener('click', () => { r.pause(); tipper.open(list[i]); });
    $('#tip').addEventListener('modalclose', () => { if (!m.hidden) r.play(); });
    m.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
    // swipe and wheel
    let y0 = null, wheelLock = 0;
    stage.addEventListener('pointerdown', e => { if (!e.target.closest('button')) y0 = e.clientY; });
    stage.addEventListener('pointerup', e => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (Math.abs(dy) > 50) go(dy < 0 ? 1 : -1); });
    stage.addEventListener('wheel', e => { e.preventDefault(); const t = Date.now(); if (t - wheelLock < 600 || Math.abs(e.deltaY) < 20) return; wheelLock = t; go(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    // double-tap to like
    stage.addEventListener('dblclick', e => {
      if (e.target.closest('button')) return;
      const rct = stage.getBoundingClientRect(), h = document.createElement('i');
      h.textContent = '♥'; h.style.left = (e.clientX - rct.left) + 'px'; h.style.top = (e.clientY - rct.top) + 'px';
      $('#plLike').append(h); setTimeout(() => h.remove(), 950);
    });
    return { openCoin: open };
  })();
  $('#watchFeed').addEventListener('click', () => player.openCoin(sorted()[0]));
  $('#heroWatch').addEventListener('click', () => player.openCoin(sorted()[0]));

  /* ---------- header dropdowns ---------- */
  const dds = $$('.dd');
  function closeDDs(except) {
    dds.forEach(d => {
      if (d === except) return;
      d.querySelector('.dd-btn').setAttribute('aria-expanded', 'false');
      d.querySelector('.dd-menu').hidden = true;
    });
  }
  dds.forEach(d => {
    const btn = d.querySelector('.dd-btn'), menu = d.querySelector('.dd-menu');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = btn.getAttribute('aria-expanded') !== 'true';
      closeDDs(d);
      btn.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
      if (open) menu.querySelector('a').focus({ preventScroll: true });
    });
    menu.addEventListener('click', e => { if (e.target.closest('a')) closeDDs(); });
    d.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); closeDDs(); btn.focus(); }
    });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.dd')) closeDDs(); });
  const jarLink = $('[data-jar]');
  if (jarLink) jarLink.addEventListener('click', () => setTimeout(() => $('#trade1').focus({ preventScroll: true }), 600));

  /* ---------- dashboard ---------- */
  dash = (() => {
    const hosts = ['Juniper', 'Rafa', 'Ines', 'Theo', 'Mika', 'Sol', 'Priya', 'Oskar', 'Lena', 'Kofi'];
    const views = $$('.view'), navBtns = $$('.app-nav button');
    const svg = $('#chartSvg'), tip = $('#chartTip'), chartBox = $('#chart');
    let coin = coins.find(c => c.ticker === 'MOSSY') || coins[0];
    const stub = () => ({ name: 'Your coin', ticker: 'COIN', line: '', reels: 0, fees: 0, fund: 0, color: '#5b5bf0', img: null, tips: [], hist: [0, 0], last: Date.now(), tipsOff: true });
    let range = 7, pts = [], trades = [], payouts = [], withdrawn = 0;

    // seeded random so each coin/range draws the same curve every time
    function rng(seed) { let x = 0; for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }
    const earned = () => coin.fees * SHARE.you;

    function buildPoints() {
      if (live.on) {
        const now = Date.now(), since = now - range * 86400000, h = coin.histPts || [];
        const before = h.filter(p => p.t < since).pop();
        pts = [{ t: since, v: before ? before.v : 0 }, ...h.filter(p => p.t >= since), { t: now, v: earned() }];
        return;
      }
      const n = { 1: 24, 7: 28, 30: 30, 90: 45 }[range];
      const r = rng(coin.ticker + range);
      const total = earned();
      const startFrac = { 1: .93, 7: .62, 30: .3, 90: .05 }[range];
      let v = total * startFrac;
      const raw = [v];
      for (let i = 1; i < n; i++) { v += (total - v) / (n - i) * (0.4 + r() * 1.2); raw.push(v); }
      raw[n - 1] = total;
      const span = range * 86400000, now = Date.now();
      pts = raw.map((val, i) => ({ v: Math.max(0, val), t: now - span + span * i / (n - 1) }));
    }
    function fmtT(t) {
      const d = new Date(t);
      return range === 1 ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    const W = 600, H = 180, PAD = 8;
    let xy = [];
    function drawChart() {
      const min = Math.min(...pts.map(p => p.v)), max = Math.max(...pts.map(p => p.v));
      const lo = min - (max - min) * .15, hi = max + (max - min) * .1 || 1;
      xy = pts.map((p, i) => [i / (pts.length - 1) * W, PAD + (H - PAD * 2) * (1 - (p.v - lo) / (hi - lo || 1))]);
      const line = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
      svg.innerHTML = `
        <defs><linearGradient id="gArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--violet)" stop-opacity=".22"/><stop offset="1" stop-color="var(--violet)" stop-opacity="0"/></linearGradient></defs>
        ${[.25, .5, .75].map(f => `<line class="grid" x1="0" x2="${W}" y1="${H * f}" y2="${H * f}"/>`).join('')}
        <path class="area" d="${line} L${W} ${H} L0 ${H} Z"/>
        <path class="stroke" d="${line}"/>
        <line class="cursor" id="cur" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>
        <circle class="dotp" id="curDot" r="4" cx="${xy[xy.length - 1][0]}" cy="${xy[xy.length - 1][1]}"/>`;
      const first = pts[0].v, last = pts[pts.length - 1].v;
      const pct = first ? (last - first) / first * 100 : 0;
      const d = $('#dashDelta');
      d.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% over ${range === 1 ? '24 hours' : range + ' days'}`;
      d.classList.toggle('neg', pct < 0);
    }
    function hover(clientX) {
      const r = chartBox.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const i = Math.round(f * (pts.length - 1));
      const [x, y] = xy[i];
      const cur = $('#cur'), dot = $('#curDot');
      cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      tip.hidden = false;
      tip.textContent = `${fmtT(pts[i].t)} · ${usd(pts[i].v, 2)}`;
      const px = x / W * r.width;
      tip.style.left = Math.min(r.width - 60, Math.max(60, px)) + 'px';
    }
    chartBox.addEventListener('pointermove', e => hover(e.clientX));
    chartBox.addEventListener('pointerdown', e => hover(e.clientX));
    chartBox.addEventListener('pointerleave', () => { tip.hidden = true; drawChart(); });

    $$('.chips button').forEach(b => b.addEventListener('click', () => {
      range = +b.dataset.range;
      $$('.chips button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      buildPoints(); drawChart();
    }));

    function stats() {
      $('#dashEarned').textContent = usd(earned(), 2);
      $('#dashJar').textContent = usd(coin.fund, 2);
      $('#dashJarBar').style.width = (coin.fund / REEL_COST * 100) + '%';
      $('#dashReels').textContent = coin.reels;
      $('#dashFees').textContent = usd(coin.fees);
      $('#dashNext').textContent = formats[(coin.reels + 1) % formats.length].n;
      if (!live.on) $('#payAvail').textContent = usd(Math.max(0, earned() - withdrawn), 2);
      $('.cs-av').innerHTML = avatarInner(coin);
      $('.cs-av').style.background = coin.color;
      $('.cs-name').textContent = coin.name;
      $('.app-h').textContent = `Good to see you, ${coin.name} team`;
    }
    function reelRows() {
      const r = rng(coin.ticker + 'reels');
      const rows = [];
      for (let n = coin.reels; n > Math.max(0, coin.reels - 8); n--) {
        const fresh = n === coin.reels && Date.now() - coin.last < 8 * 60000;
        rows.push(`<tr><td>Reel ${n}</td><td>${formats[n % formats.length].n}</td><td>${hosts[n % hosts.length]}</td><td class="r">${fresh ? '<span class="pill rend">Rendering</span>' : Math.round(800 + r() * 24000).toLocaleString('en-US')}</td></tr>`);
      }
      $('#tblReels').innerHTML = rows.join('') || '<tr><td colspan="4">No reels yet. The first one renders once the jar reaches $25.</td></tr>';
    }
    function tradeRows() {
      $('#tblTrades').innerHTML = trades.slice(0, 8).map((t, i) =>
        `<tr class="${i === 0 && t.fresh ? 'new' : ''}"><td class="mono">${new Date(t.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</td><td><span class="pill ${t.side}">${t.side === 'buy' ? 'Buy' : 'Sell'}</span></td><td class="r">${usd(t.size)}</td><td class="r">${usd(t.size * FEE * SHARE.you, 2)}</td></tr>`
      ).join('') || '<tr><td colspan="4">Waiting for the next trade…</td></tr>';
      trades.forEach(t => { t.fresh = false; });
    }
    function payRows() {
      $('#tblPay').innerHTML = payouts.map(p => `<tr><td>${new Date(p.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td><td class="mono">${esc($('#dashWallet').textContent)}</td><td class="r">${live.on ? Number(p.v).toFixed(5) + ' ETH' : usd(p.v, 2)}</td></tr>`).join('')
        || '<tr><td colspan="3">No withdrawals yet.</td></tr>';
    }
    function tipRows() {
      const tot = tipTotal(coin), sh = coin.tips.filter(t => t.pool === 'shielded').length;
      $('#dTipZec').textContent = `${zecFmt(tot) || '0'} ZEC`;
      $('#dTipUsd').textContent = `${usd(tot * ZEC_USD, 2)} at the example rate`;
      $('#dTipShield').textContent = coin.tips.length ? Math.round(sh / coin.tips.length * 100) + '%' : '–';
      $('#dTipAddr').textContent = coin.zecAddr || demoAddr(coin.ticker, 'shielded');
      $('#tblTips').innerHTML = coin.tips.slice(0, 10).map(t => `<tr class="${t.freshDash ? 'new' : ''}"><td class="mono">${ago(t.t)}</td><td><span class="pill ${t.pool === 'shielded' ? 'shield' : 'transp'}">${t.pool === 'shielded' ? 'Shielded' : 'Transparent'}</span></td><td class="memo">${t.memo ? esc(t.memo) : '<span>–</span>'}</td><td class="r">${zecFmt(t.zec)} ZEC</td></tr>`).join('')
        || '<tr><td colspan="4">No tips yet. Share the Tip button on the coin card.</td></tr>';
      coin.tips.forEach(t => { t.freshDash = false; });
      $('#setTips').checked = !coin.tipsOff;
    }
    function all() { buildPoints(); drawChart(); stats(); reelRows(); tradeRows(); payRows(); tipRows(); }

    function show(view) {
      navBtns.forEach(b => b.classList.toggle('on', b.dataset.view === view));
      navBtns.forEach(b => b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
      views.forEach(v => { v.hidden = v.dataset.view !== view; });
      if (view === 'overview') drawChart();
    }
    navBtns.forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

    async function loadLive() {
      if (!coin.address) return;
      const c = coin;
      const [tr, hist] = await Promise.all([api(`/api/coins/${c.address}/trades`), api(`/api/coins/${c.address}/history`)]).catch(() => [[], []]);
      if (coin !== c) return;
      trades = tr.map(t => ({ t: Date.parse(t.ts), size: t.usd, side: t.isBuy ? 'buy' : 'sell' }));
      c.histPts = hist.map(h => ({ t: Date.parse(h.ts), v: h.feesUsd * SHARE.you }));
      buildPoints(); drawChart(); tradeRows();
      const w = wallet.get();
      if (w && w.chain === 'evm' && w.addr.toLowerCase() === c.creator) {
        const cl = await api('/api/claimable/' + w.addr).catch(() => ({ eth: '0' }));
        $('#payAvail').textContent = `${Number(cl.eth).toFixed(5)} ETH`;
      } else $('#payAvail').textContent = 'Connect the creator wallet';
    }
    function pickLive() {
      const w = wallet.get(), me = w && w.chain === 'evm' ? w.addr.toLowerCase() : null;
      coin = (me && coins.find(c => c.creator === me)) || coins[0] || stub();
      trades = []; payouts = [];
      all(); loadLive();
    }
    $('#coinSwitch').addEventListener('click', () => {
      if (live.on && !coins.length) { toast('No coins yet.'); return; }
      const i = coins.indexOf(coin);
      coin = coins[(i + 1) % coins.length];
      trades = []; payouts = []; withdrawn = 0;
      all(); if (live.on) loadLive();
      toast(`Showing $${coin.ticker}`);
    });
    $('#appBoost').addEventListener('click', () => {
      if (live.on) { if (coin.address) tradeUI.open(coin); else toast('Launch a coin first.'); return; }
      trade(coin, 2500);
      toast(`Demo trade: $2,500 of $${coin.ticker} added ${usd(2500 * FEE * SHARE.reels, 2)} to the reel jar.`);
    });
    $('#payBtn').addEventListener('click', () => {
      if (live.on) return claimFees(coin, v => { payouts.unshift({ t: Date.now(), v }); payRows(); loadLive(); });
      const avail = Math.max(0, earned() - withdrawn);
      if (avail < 0.01) { toast('Nothing to withdraw yet.'); return; }
      withdrawn += avail;
      payouts.unshift({ t: Date.now(), v: avail });
      stats(); payRows();
      toast(`Demo withdrawal of ${usd(avail, 2)}. No money moved.`);
    });
    const settings = store.get('hr-settings', {});
    $('#setTips').addEventListener('change', async e => {
      if (live.on) {
        const want = !e.target.checked;
        e.target.checked = !coin.tipsOff;
        if (!coin.address) return;
        try {
          await ensureSession();
          const upd = await api('/api/coins/' + coin.address, { method: 'PATCH', body: { tipsOff: want } });
          coin.tipsOff = upd.tipsOff; e.target.checked = !upd.tipsOff; render();
          toast(upd.tipsOff ? `ZEC tips are off for $${coin.ticker}` : `ZEC tips are on for $${coin.ticker}`);
        } catch (err) { toast(err.message); }
        return;
      }
      coin.tipsOff = !e.target.checked;
      if (coin.mine) saveMine();
      render();
      toast(coin.tipsOff ? `ZEC tips are off for $${coin.ticker}` : `ZEC tips are on for $${coin.ticker}`);
    });
    $('#dTipCopy').addEventListener('click', () => copyText($('#dTipAddr').textContent, 'Address'));
    ['setAuto', 'setRotate', 'setMail'].forEach(id => {
      const el = $('#' + id);
      if (typeof settings[id] === 'boolean') el.checked = settings[id];
      el.addEventListener('change', () => { settings[id] = el.checked; store.set('hr-settings', settings); toast('Setting saved'); });
    });

    all();
    return {
      pickLive,
      liveUpdate(c) { if (c === coin) { stats(); loadLive(); } },
      current: () => coin,
      onTip(c, made) {
        if (c !== coin) return;
        c.tips[0].freshDash = true;
        stats(); tipRows();
        if (made) reelRows();
      },
      onTrade(c, size, made) {
        if (c !== coin) return;
        trades.unshift({ t: Date.now(), size, side: Math.random() < .68 ? 'buy' : 'sell', fresh: true });
        trades.length = Math.min(trades.length, 20);
        buildPoints();
        if (tip.hidden) drawChart();
        stats(); tradeRows();
        if (made) reelRows();
      }
    };
  })();

  /* ---------- mobile menu ---------- */
  const menuBtn = $('#menuBtn'), mobileMenu = $('#mobileMenu');
  function closeMenu() { mobileMenu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.setAttribute('aria-label', 'Open menu'); }
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = mobileMenu.hidden;
    mobileMenu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) mobileMenu.querySelector('a').focus({ preventScroll: true });
  });
  mobileMenu.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('click', e => { if (!mobileMenu.hidden && !e.target.closest('#mobileMenu')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !mobileMenu.hidden) { closeMenu(); menuBtn.focus(); } });
  addEventListener('resize', () => { if (innerWidth > 1080) closeMenu(); });

  /* ---------- keyboard: "/" jumps to feed search ---------- */
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea, [contenteditable="true"]') || $$('.modal').some(m => !m.hidden)) return;
    e.preventDefault();
    const fs = $('#feedSearch');
    fs.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    fs.focus({ preventScroll: true });
  });


  /* ---------- wallet connect (read-only: address only, no signing) ---------- */
  const wallet = (() => {
    const m = $('#wallet'), btn = $('#walletBtn'), label = $('#walletLabel'), err = $('#walletErr');
    // Official wallet marks from web3icons (MIT, github.com/0xa3k5/web3icons), used to identify each wallet
    const LOGOS = {"phantom": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSIgdmlld0JveD0iMCAwIDI0IDI0Ij48ZyBjbGlwLXBhdGg9InVybCgjcGhhbnRvbV9fYSkiPjxwYXRoIGZpbGw9IiNBQjlGRjIiIGQ9Ik0yNCAwSDB2MjRoMjR6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTUuODkzIDE4LjRjMi4wNDIgMCAzLjU3Ni0xLjcwNiA0LjQ5Mi0zLjA1NGEyLjUgMi41IDAgMCAwLS4xNzMuODgzYzAgLjc4Ny40NyAxLjM0OCAxLjM5OCAxLjM0OCAxLjI3NSAwIDIuNjM2LTEuMDc0IDMuMzQxLTIuMjNxLS4wNzUuMjUtLjA3NC40NjRjMCAuNTUuMzIyLjg5NS45NzguODk1IDIuMDY2IDAgNC4xNDUtMy41MiA0LjE0NS02LjU5N0MyMCA3LjcxMSAxOC43MzggNS42IDE1LjU3IDUuNiAxMC4wMDIgNS42IDQgMTIuMTM3IDQgMTYuMzZjMCAxLjY1OC45MjggMi4wNCAxLjg5MyAyLjA0bTcuNzU5LTguNTUzYzAtLjU5Ny4zNDctMS4wMTQuODU0LTEuMDE0LjQ5NSAwIC44NDEuNDE3Ljg0MSAxLjAxNCAwIC41OTYtLjM0NiAxLjAyNi0uODQxIDEuMDI2LS41MDggMC0uODU0LS40My0uODU0LTEuMDI2bTIuNjQ4IDBjMC0uNTk3LjM0Ny0xLjAxNC44NTQtMS4wMTQuNDk1IDAgLjg0MS40MTcuODQxIDEuMDE0IDAgLjU5Ni0uMzQ2IDEuMDI2LS44NDEgMS4wMjYtLjUwNyAwLS44NTQtLjQzLS44NTQtMS4wMjYiLz48L2c+PGRlZnM+PGNsaXBQYXRoIGlkPSJwaGFudG9tX19hIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMCAwaDI0djI0SDB6Ii8+PC9jbGlwUGF0aD48L2RlZnM+PC9zdmc+", "solflare": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSIgdmlld0JveD0iMCAwIDI0IDI0Ij48ZyBjbGlwLXBhdGg9InVybCgjc29sZmxhcmVfX2EpIj48cGF0aCBmaWxsPSIjRkZFRjQ2IiBkPSJNMjQgMEgwdjI0aDI0eiIvPjxwYXRoIGZpbGw9IiMwMjA1MEEiIGQ9Im0xMi4wNTYgMTIuNjM2IDEuMDk4LTEuMDY2IDIuMDQ3LjY3M2MxLjM0LjQ0OSAyLjAxIDEuMjcxIDIuMDEgMi40MyAwIC44NzgtLjMzNSAxLjQ1OC0xLjAwNSAyLjIwNWwtLjIwNS4yMjUuMDc1LS41MjRjLjI5Ny0xLjkwNi0uMjYtMi43MjktMi4xMDMtMy4zMjd6TTkuMyA2LjExMmw1LjU4NCAxLjg3LTEuMjEgMS4xNTgtMi45MDMtLjk3MmMtMS4wMDUtLjMzNi0xLjM0LS44NzgtMS40Ny0yLjAxOHptLS4zMzUgOS40OTYgMS4yNjYtMS4yMTYgMi4zODIuNzg2YzEuMjQ3LjQxIDEuNjc1Ljk1MyAxLjU0NSAyLjMxN3ptLTEuNi01LjQyMWMwLS4zNTUuMTg2LS42OTIuNTAyLS45NzIuMzM1LjQ4Ni45MTIuOTE2IDEuODI0IDEuMjE1bDEuOTczLjY1NC0xLjA5OCAxLjA2Ni0xLjkzNS0uNjM2Yy0uODk0LS4yOTktMS4yNjYtLjc0OC0xLjI2Ni0xLjMyN00xMy4yMSAyMGM0LjA5NC0yLjcyOSA2LjI5LTQuNTggNi4yOS02Ljg2IDAtMS41MTQtLjg5My0yLjM1NS0yLjg2Ni0zLjAxbC0xLjQ4OS0uNTA0IDQuMDc2LTMuOTI1LS44MTktLjg3OS0xLjIxIDEuMDY2TDExLjQ4IDRjLTEuNzY4LjU4LTQuMDAxIDIuMjgtNC4wMDEgMy45ODEgMCAuMTg3LjAxOC4zNzQuMDc0LjU4LTEuNDcuODQtMi4wNjYgMS42MjYtMi4wNjYgMi41OTggMCAuOTE2LjQ4NCAxLjgzMiAyLjAyOSAyLjMzNmwxLjIyOC40MTJMNC41IDE4bC44MTkuODc4IDEuMzIxLTEuMjE0eiIvPjwvZz48ZGVmcz48Y2xpcFBhdGggaWQ9InNvbGZsYXJlX19hIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMCAwaDI0djI0SDB6Ii8+PC9jbGlwUGF0aD48L2RlZnM+PC9zdmc+", "backpack": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSIgdmlld0JveD0iMCAwIDI0IDI0Ij48ZyBjbGlwLXBhdGg9InVybCgjYmFja3BhY2tfX2EpIj48cGF0aCBmaWxsPSIjRTMzRTNGIiBkPSJNMjQgMEgwdjI0aDI0eiIvPjxwYXRoIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTEzLjA2MSA1LjI1OGMuNTkyIDAgMS4xNDguMDc4IDEuNjYyLjIyM0MxNC4yMTkgNC4zMjggMTMuMTc0IDQgMTIuMDEgNGMtMS4xNjYgMC0yLjIxMy4zMy0yLjcxNiAxLjQ4N2E2IDYgMCAwIDEgMS42NTQtLjIyOXptLTIuMjQ3IDEuMTU3Yy0yLjgxMiAwLTQuNDE0IDIuMTcyLTQuNDE0IDQuODUydjIuNzUzYzAgLjI2OC4yMjguNDguNTEuNDhoMTAuMThjLjI4MiAwIC41MS0uMjEyLjUxLS40OHYtMi43NTNjMC0yLjY4LTEuODYzLTQuODUyLTQuNjc1LTQuODUyem0xLjE4MiA0Ljg3NmMuOTg0IDAgMS43ODItLjc4MyAxLjc4Mi0xLjc1IDAtLjk2Ni0uNzk4LTEuNzUtMS43ODItMS43NXMtMS43ODIuNzg0LTEuNzgyIDEuNzVjMCAuOTY3Ljc5OCAxLjc1IDEuNzgyIDEuNzVNNi40IDE2LjExOGMwLS4yNjguMjI4LS40ODUuNTEtLjQ4NWgxMC4xOGMuMjgyIDAgLjUxLjIxNy41MS40ODV2Mi45MTJjMCAuNTM1LS40NTYuOTctMS4wMTguOTdINy40MThjLS41NjIgMC0xLjAxOC0uNDM0LTEuMDE4LS45N3oiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvZz48ZGVmcz48Y2xpcFBhdGggaWQ9ImJhY2twYWNrX19hIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMCAwaDI0djI0SDB6Ii8+PC9jbGlwUGF0aD48L2RlZnM+PC9zdmc+", "metamask": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSIgdmlld0JveD0iMCAwIDI0IDI0Ij48ZyBjbGlwLXBhdGg9InVybCgjbWV0YW1hc2tfX2EpIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjQgMEgwdjI0aDI0eiIvPjxwYXRoIGZpbGw9IiNGRjVDMTYiIGQ9Im0xOC45IDE4LjkyNS0zLjQzNC0uOTkzLTIuNTkgMS41MDRoLTEuODA3bC0yLjU5Mi0xLjUwNC0zLjQzMy45OTNMNCAxNS41bDEuMDQ0LTMuODAyTDQgOC40ODQgNS4wNDQgNC41bDUuMzY1IDMuMTE0aDMuMTI3TDE4LjkgNC41bDEuMDQ1IDMuOTg0LTEuMDQ1IDMuMjE0IDEuMDQ1IDMuODAyeiIvPjxwYXRoIGZpbGw9IiNGRjVDMTYiIGQ9Im01LjA0NSA0LjUgNS4zNjQgMy4xMTYtLjIxMyAyLjE0em0zLjQzMyAxMS4wMDEgMi4zNiAxLjc0Ny0yLjM2LjY4NHptMi4xNzItMi44ODgtLjQ1NC0yLjg1Ni0yLjkwNCAxLjk0MmgtLjAwMWwuMDA5IDIgMS4xNzctMS4wODZ6TTE4LjkgNC41bC01LjM2NCAzLjExNi4yMTMgMi4xNHptLTMuNDMzIDExLjAwMS0yLjM2IDEuNzQ3IDIuMzYuNjg0em0xLjE4Ny0zLjgwMXYtLjAwMmgtLjAwMWwtMi45MDQtMS45NDEtLjQ1MyAyLjg1NmgyLjE3MWwxLjE3OCAxLjA4NnoiLz48cGF0aCBmaWxsPSIjRTM0ODA3IiBkPSJtOC40NzcgMTcuOTMyLTMuNDMzLjk5M0w0IDE1LjUwMWg0LjQ3N3ptMi4xNzItNS4zMi42NTYgNC4xMy0uOTEtMi4yOTctMy4wOTctLjc0NiAxLjE3OC0xLjA4N3ptNC44MTggNS4zMiAzLjQzMy45OTMgMS4wNDUtMy40MjRoLTQuNDc4em0tMi4xNzEtNS4zMi0uNjU2IDQuMTMuOTA5LTIuMjk3IDMuMDk3LS43NDYtMS4xNzktMS4wODd6Ii8+PHBhdGggZmlsbD0iI0ZGOEQ1RCIgZD0ibTQgMTUuNSAxLjA0NC0zLjgwMkg3LjI5bC4wMDggMiAzLjA5OC43NDcuOTA5IDIuMjk2LS40NjguNTA1LTIuMzYtMS43NDd6bTE1Ljk0NSAwTDE4LjkgMTEuNjk4aC0yLjI0NWwtLjAwOSAyLTMuMDk3Ljc0Ny0uOTA5IDIuMjk2LjQ2Ny41MDUgMi4zNi0xLjc0N3ptLTYuNDA5LTcuODg2aC0zLjEyN2wtLjIxMyAyLjEzOSAxLjEwOSA2Ljk4NWgxLjMzNWwxLjExLTYuOTg1eiIvPjxwYXRoIGZpbGw9IiM2NjE4MDAiIGQ9Ik01LjA0NCA0LjUgNCA4LjQ4NGwxLjA0NCAzLjIxNEg3LjI5bDIuOTA1LTEuOTQzek0xMCAxMy40NDFIOC45ODJsLS41NTMuNTI4IDEuOTY3LjQ3NHpNMTguOSA0LjVsMS4wNDUgMy45ODQtMS4wNDUgMy4yMTRoLTIuMjQ1bC0yLjkwNi0xLjk0M3ptLTQuOTU0IDguOTQxaDEuMDJsLjU1My41MjktMS45Ny40NzV6bS0xLjA3MSA0LjYzMi4yMzItLjgyNS0uNDY3LS41MDZoLTEuMzM2bC0uNDY3LjUwNi4yMzIuODI1Ii8+PHBhdGggZmlsbD0iI0MwQzRDRCIgZD0iTTEyLjg3NSAxOC4wNzN2MS4zNjRoLTEuODA2di0xLjM2NHoiLz48cGF0aCBmaWxsPSIjRTdFQkY2IiBkPSJtOC40NzggMTcuOTMgMi41OTIgMS41MDZ2LTEuMzYzbC0uMjMyLS44MjZ6bTYuOTkgMC0yLjU5MyAxLjUwNnYtMS4zNjNsLjIzMi0uODI2eiIvPjwvZz48ZGVmcz48Y2xpcFBhdGggaWQ9Im1ldGFtYXNrX19hIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMCAwaDI0djI0SDB6Ii8+PC9jbGlwUGF0aD48L2RlZnM+PC9zdmc+", "coinbase": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSIgdmlld0JveD0iMCAwIDI0IDI0Ij48ZyBjbGlwLXBhdGg9InVybCgjY29pbmJhc2VfX2EpIj48cGF0aCBmaWxsPSIjMEU1QkZGIiBkPSJNMjQgMEgwdjI0aDI0eiIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik00IDEyYTggOCAwIDEgMSAxNiAwIDggOCAwIDAgMS0xNiAwIi8+PHBhdGggZmlsbD0iIzBFNUJGRiIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMTIgMTcuNjY3YTUuNjY3IDUuNjY3IDAgMSAwIDAtMTEuMzM0IDUuNjY3IDUuNjY3IDAgMCAwIDAgMTEuMzM0bS0uNjY3LTcuMzM0YTEgMSAwIDAgMC0xIDF2MS4zMzRhMSAxIDAgMCAwIDEgMWgxLjMzNGExIDEgMCAwIDAgMS0xdi0xLjMzNGExIDEgMCAwIDAtMS0xeiIgY2xpcC1ydWxlPSJldmVub2RkIi8+PC9nPjxkZWZzPjxjbGlwUGF0aCBpZD0iY29pbmJhc2VfX2EiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0wIDBoMjR2MjRIMHoiLz48L2NsaXBQYXRoPjwvZGVmcz48L3N2Zz4=", "rabby": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSIgdmlld0JveD0iMCAwIDI0IDI0Ij48ZyBjbGlwLXBhdGg9InVybCgjcmFiYnlfX2EpIj48cGF0aCBmaWxsPSJ1cmwoI3JhYmJ5X19iKSIgZD0iTTI0IDBIMHYyNGgyNHoiLz48cGF0aCBmaWxsPSJ1cmwoI3JhYmJ5X19jKSIgZD0iTTE5LjkxOCAxMy4wNGMuNjI5LTEuNDYxLTIuNDc4LTUuNTQzLTUuNDQ2LTcuMjQzLTEuODctMS4zMTctMy44Mi0xLjEzNi00LjIxNS0uNTU4LS44NjYgMS4yNyAyLjg2OSAyLjM0NSA1LjM2NyAzLjZhMi45IDIuOSAwIDAgMC0xLjM0IDEuMjM1Yy0uOTMyLTEuMDU4LTIuOTc2LTEuOTY5LTUuMzc1LTEuMjM1LTEuNjE2LjQ5NS0yLjk2IDEuNjYtMy40NzkgMy40MjJhMSAxIDAgMCAwLS40MTItLjA5MWMtLjU2MiAwLTEuMDE4LjQ3NC0xLjAxOCAxLjA1OXMuNDU2IDEuMDU5IDEuMDE4IDEuMDU5Yy4xMDQgMCAuNDMtLjA3My40My0uMDczbDUuMjA0LjA0Yy0yLjA4MiAzLjQzNS0zLjcyNiAzLjkzNy0zLjcyNiA0LjUzMnMxLjU3My40MzQgMi4xNjQuMjEyYzIuODMtMS4wNjIgNS44NjgtNC4zNzIgNi4zODktNS4zMjUgMi4xOS4yODQgNC4wMy4zMTggNC40NC0uNjM0Ii8+PHBhdGggZmlsbD0idXJsKCNyYWJieV9fZCkiIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTE1LjYyNCA4LjgzOWMuMTE2LS4wNDguMDk3LS4yMjUuMDY2LS4zNjUtLjA3My0uMzIxLTEuMzM0LTEuNjE3LTIuNTE4LTIuMTk3LTEuNjE0LS43OTEtMi44MDItLjc1LTIuOTc4LS4zODYuMzI5LjcwMSAxLjg1MyAxLjM2IDMuNDQ0IDIuMDQ3LjY3OS4yOTMgMS4zNy41OTEgMS45ODYuOTAxIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiLz48cGF0aCBmaWxsPSJ1cmwoI3JhYmJ5X19lKSIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMTMuNTc2IDE1Ljg5NGE5IDkgMCAwIDAtMS4xMTQtLjM1N2MuNDQ3LS44MzIuNTQxLTIuMDY0LjExOS0yLjg0My0uNTkyLTEuMDkyLTEuMzM2LTEuNjc0LTMuMDYzLTEuNjc0LS45NSAwLTMuNTA4LjMzMy0zLjU1NCAyLjU1NXEtLjAwOC4zNDkuMDE2LjY0NGw0LjY3Mi4wMzVhMTYuNyAxNi43IDAgMCAxLTEuNzM2IDIuMzk3Yy42Mi4xNjUgMS4xMzEuMzA0IDEuNjAxLjQzMS40NDYuMTIxLjg1NC4yMzIgMS4yOC4zNDVhMjAgMjAgMCAwIDAgMS43OC0xLjUzMyIgY2xpcC1ydWxlPSJldmVub2RkIi8+PHBhdGggZmlsbD0idXJsKCNyYWJieV9fZikiIGQ9Ik01LjM2OCAxMy45OWMuMTkgMS42ODggMS4xMTMgMi4zNSAyLjk5NyAyLjU0NSAxLjg4NC4xOTYgMi45NjQuMDY1IDQuNDAzLjIwMSAxLjIwMi4xMTQgMi4yNzUuNzUxIDIuNjczLjUzLjM1OC0uMTk3LjE1Ny0uOTEzLS4zMjItMS4zNzItLjYyMS0uNTk2LTEuNDgxLTEuMDEtMi45OTQtMS4xNTcuMzAxLS44NTkuMjE3LTIuMDYzLS4yNTEtMi43MTktLjY3OC0uOTQ3LTEuOTI3LTEuMzc2LTMuNTEtMS4xODktMS42NTIuMTk2LTMuMjM1IDEuMDQzLTIuOTk2IDMuMTYxIi8+PC9nPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0icmFiYnlfX2IiIHgxPSI4LjcyMSIgeDI9IjE5Ljg0NiIgeTE9IjExLjc0NiIgeTI9IjE0Ljc3OCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIHN0b3AtY29sb3I9IiM4Njk3RkYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNBQkI3RkYiLz48L2xpbmVhckdyYWRpZW50PjxsaW5lYXJHcmFkaWVudCBpZD0icmFiYnlfX2MiIHgxPSI4LjcyMSIgeDI9IjE5Ljg0NiIgeTE9IjExLjc0NiIgeTI9IjE0Ljc3OCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIHN0b3AtY29sb3I9IiNmZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmYiLz48L2xpbmVhckdyYWRpZW50PjxsaW5lYXJHcmFkaWVudCBpZD0icmFiYnlfX2QiIHgxPSIxNy45MiIgeDI9IjkuNjIxIiB5MT0iMTEuNTI3IiB5Mj0iMy41MzEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj48c3RvcCBzdG9wLWNvbG9yPSIjODY5N0ZGIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjODY5N0ZGIiBzdG9wLW9wYWNpdHk9IjAiLz48L2xpbmVhckdyYWRpZW50PjxsaW5lYXJHcmFkaWVudCBpZD0icmFiYnlfX2UiIHgxPSIxMy43OTkiIHgyPSI1Ljk4MyIgeTE9IjE2LjE4NCIgeTI9IjExLjg2NSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIHN0b3AtY29sb3I9IiM4Njk3RkYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM4Njk3RkYiIHN0b3Atb3BhY2l0eT0iMCIvPjwvbGluZWFyR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJyYWJieV9fZiIgeDE9IjkuMzgyIiB4Mj0iMTQuODIxIiB5MT0iMTEuNjYiIHkyPSIxOC4zMDEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmIi8+PHN0b3Agb2Zmc2V0PSIuOTg0IiBzdG9wLWNvbG9yPSIjRDFEOEZGIi8+PC9saW5lYXJHcmFkaWVudD48Y2xpcFBhdGggaWQ9InJhYmJ5X19hIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMCAwaDI0djI0SDB6Ii8+PC9jbGlwUGF0aD48L2RlZnM+PC9zdmc+"};
    const WALLETS = [
      { id: 'phantom', logo: LOGOS.phantom, name: 'Phantom', chain: 'sol', color: '#ab9ff2', ini: 'P', url: 'https://phantom.com/download',
        get: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) ? window.phantom.solana : (window.solana && window.solana.isPhantom ? window.solana : null) },
      { id: 'solflare', logo: LOGOS.solflare, name: 'Solflare', chain: 'sol', color: '#fc822b', ini: 'S', url: 'https://solflare.com/download',
        get: () => (window.solflare && window.solflare.isSolflare) ? window.solflare : null },
      { id: 'backpack', logo: LOGOS.backpack, name: 'Backpack', chain: 'sol', color: '#e33e3f', ini: 'B', url: 'https://backpack.app/download',
        get: () => (window.backpack && (window.backpack.solana || window.backpack)) || null },
      { id: 'metamask', logo: LOGOS.metamask, name: 'MetaMask', chain: 'evm', rdns: 'io.metamask', color: '#f6851b', ini: 'M', url: 'https://metamask.io/download/', legacy: p => p.isMetaMask && !p.isRabby && !p.isBraveWallet && !p.isCoinbaseWallet },
      { id: 'coinbase', logo: LOGOS.coinbase, name: 'Coinbase Wallet', chain: 'evm', rdns: 'com.coinbase.wallet', color: '#0052ff', ini: 'C', url: 'https://www.coinbase.com/wallet/downloads', legacy: p => p.isCoinbaseWallet },
      { id: 'rabby', logo: LOGOS.rabby, name: 'Rabby', chain: 'evm', rdns: 'io.rabby', color: '#7084ff', ini: 'R', url: 'https://rabby.io/', legacy: p => p.isRabby }
    ];
    // EIP-6963: installed EVM wallets announce themselves with a name, icon and provider
    const announced = new Map();
    addEventListener('eip6963:announceProvider', e => {
      const d = e.detail;
      if (d && d.info && d.info.rdns && d.provider) { announced.set(d.info.rdns, d); if (!m.hidden && !state) drawList(); }
    });
    dispatchEvent(new Event('eip6963:requestProvider'));

    function evmProvider(w) {
      if (w.rdns && announced.has(w.rdns)) return announced.get(w.rdns).provider;
      if (w.provider) return w.provider;
      const eth = window.ethereum;
      if (!eth || !w.legacy) return null;
      const list = Array.isArray(eth.providers) ? eth.providers : [eth];
      return list.find(w.legacy) || null;
    }
    const providerFor = w => w.chain === 'sol' ? w.get() : evmProvider(w);
    function allWallets() {
      const extra = [...announced.values()].filter(d => !WALLETS.some(w => w.rdns === d.info.rdns)).map(d => ({
        id: 'eip:' + d.info.rdns, name: String(d.info.name || 'Browser wallet').slice(0, 40), chain: 'evm', rdns: d.info.rdns, color: '#5b5bf0',
        ini: String(d.info.name || 'W').slice(0, 1).toUpperCase(), icon: /^data:image\//.test(d.info.icon || '') ? d.info.icon : null, provider: d.provider
      }));
      return WALLETS.concat(extra);
    }
    function iconHTML(w) {
      const a = w.rdns && announced.get(w.rdns);
      const src = w.logo || w.icon || (a && /^data:image\//.test(a.info.icon || '') ? a.info.icon : null);
      return `<span class="wicon" style="background:${w.color}">${src ? `<img src="${esc(src)}" alt="">` : esc(w.ini)}</span>`;
    }
    function drawList() {
      const ws = allWallets();
      ['sol', 'evm'].forEach(ch => {
        const box = $(ch === 'sol' ? '#wlSol' : '#wlEvm');
        box.innerHTML = '';
        ws.filter(w => w.chain === ch).forEach(w => {
          const has = !!providerFor(w);
          const el = document.createElement(has ? 'button' : 'a');
          el.className = 'wopt';
          if (has) { el.type = 'button'; el.addEventListener('click', () => connect(w, el)); }
          else { el.href = w.url; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
          el.innerHTML = `${iconHTML(w)}<b>${esc(w.name)}</b><small class="${has ? 'ok' : ''}">${has ? 'Detected' : 'Install ↗'}</small>`;
          box.append(el);
        });
      });
    }
    const short = a => a.length > 12 ? a.slice(0, 5) + '…' + a.slice(-4) : a;
    let state = null, bound = null;
    const changeFns = [];

    function setState(next, silent) {
      state = next;
      if (state) {
        btn.classList.add('on');
        label.textContent = short(state.addr);
        if (!btn.querySelector('.wdot')) btn.insertAdjacentHTML('afterbegin', '<i class="wdot" aria-hidden="true"></i>');
        btn.setAttribute('aria-label', `Wallet connected: ${state.addr}`);
        $('#dashWallet').textContent = short(state.addr);
        store.set('hp-wallet', { id: state.id, chain: state.chain });
        if (!silent) toast(`${state.name} connected: ${short(state.addr)}`);
      } else {
        btn.classList.remove('on');
        label.textContent = 'Connect wallet';
        btn.querySelector('.wdot')?.remove();
        btn.removeAttribute('aria-label');
        $('#dashWallet').textContent = '0x4f2c…a91c';
        store.set('hp-wallet', null);
      }
      drawOn();
      changeFns.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
    }
    function drawOn() {
      $('#walletPick').hidden = !!state; $('#walletOn').hidden = !state;
      if (!state) return;
      $('#wOnIcon').outerHTML = iconHTML(state).replace('class="wicon"', 'class="wicon" id="wOnIcon"');
      $('#wOnName').textContent = `${state.name} · ${state.chain === 'sol' ? 'Solana' : state.chainName}`;
      $('#wOnAddr').textContent = state.addr;
      $('#wExplorer').href = state.chain === 'sol' ? `https://solscan.io/account/${encodeURIComponent(state.addr)}` : `${state.explorer}/address/${encodeURIComponent(state.addr)}`;
    }
    const CHAINS = { '0x1': ['Ethereum', 'https://etherscan.io'], '0x2105': ['Base', 'https://basescan.org'], '0xa4b1': ['Arbitrum', 'https://arbiscan.io'], '0xa': ['Optimism', 'https://optimistic.etherscan.io'], '0x89': ['Polygon', 'https://polygonscan.com'], '0x38': ['BNB Chain', 'https://bscscan.com'] };
    async function evmMeta(prov) {
      let id = '0x1';
      try { id = String(await prov.request({ method: 'eth_chainId' })).toLowerCase(); } catch { /* keep default */ }
      const c = CHAINS[id] || ['EVM chain ' + parseInt(id, 16), 'https://etherscan.io'];
      return { chainName: c[0], explorer: c[1] };
    }
    function bind(w, prov) {
      unbind();
      if (!prov || !prov.on) return;
      if (w.chain === 'evm') {
        const onAcc = accs => { if (!accs || !accs.length) setState(null); else if (state) setState({ ...state, addr: accs[0] }, true); };
        const onChain = async () => { if (state) setState({ ...state, ...(await evmMeta(prov)) }, true); };
        prov.on('accountsChanged', onAcc); prov.on('chainChanged', onChain);
        bound = () => { prov.removeListener?.('accountsChanged', onAcc); prov.removeListener?.('chainChanged', onChain); };
      } else {
        const onAcc = pk => { if (!pk) setState(null); else if (state) setState({ ...state, addr: pk.toString() }, true); };
        const onDis = () => setState(null);
        prov.on('accountChanged', onAcc); prov.on('disconnect', onDis);
        bound = () => { prov.off?.('accountChanged', onAcc) || prov.removeListener?.('accountChanged', onAcc); prov.off?.('disconnect', onDis) || prov.removeListener?.('disconnect', onDis); };
      }
    }
    function unbind() { if (bound) { try { bound(); } catch { /* ignore */ } bound = null; } }

    async function connect(w, el) {
      const prov = providerFor(w);
      if (!prov) { window.open(w.url, '_blank', 'noopener'); return; }
      err.hidden = true;
      el.setAttribute('aria-busy', 'true');
      el.querySelector('small').textContent = 'Check your wallet…';
      try {
        let addr, meta = {};
        if (w.chain === 'sol') {
          const r = await prov.connect();
          const pk = (r && r.publicKey) || prov.publicKey;
          if (!pk) throw new Error('The wallet did not share an address.');
          addr = pk.toString();
        } else {
          const accs = await prov.request({ method: 'eth_requestAccounts' });
          if (!accs || !accs.length) throw new Error('The wallet did not share an address.');
          addr = accs[0];
          meta = await evmMeta(prov);
        }
        bind(w, prov);
        setState({ id: w.id, name: w.name, chain: w.chain, color: w.color, ini: w.ini, icon: w.icon, logo: w.logo, rdns: w.rdns, addr, ...meta });
      } catch (e) {
        const rejected = e && (e.code === 4001 || /reject|denied|cancel/i.test(e.message || ''));
        err.textContent = rejected ? `You cancelled the request in ${w.name}. Try again when you're ready.` : `${w.name} could not connect: ${(e && e.message) || 'unknown error'}.`;
        err.hidden = false;
      } finally {
        el.removeAttribute('aria-busy');
        drawList();
      }
    }
    async function disconnect() {
      if (!state) return;
      const w = allWallets().find(x => x.id === state.id), prov = w && providerFor(w);
      unbind();
      try {
        if (state.chain === 'sol' && prov && prov.disconnect) await prov.disconnect();
        if (state.chain === 'evm' && prov) await prov.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
      } catch { /* not every wallet supports revoking; clearing local state is enough */ }
      const name = state.name;
      setState(null);
      drawList();
      toast(`${name} disconnected`);
    }
    // restore a previous connection without prompting
    async function restore() {
      const saved = store.get('hp-wallet', null);
      if (!saved || !saved.id) return;
      await new Promise(r => setTimeout(r, 300)); // give EIP-6963 wallets time to announce
      const w = allWallets().find(x => x.id === saved.id), prov = w && providerFor(w);
      if (!prov) return;
      try {
        let addr = null, meta = {};
        if (w.chain === 'sol') {
          const r = await prov.connect({ onlyIfTrusted: true });
          const pk = (r && r.publicKey) || prov.publicKey; addr = pk && pk.toString();
        } else {
          const accs = await prov.request({ method: 'eth_accounts' });
          addr = accs && accs[0]; if (addr) meta = await evmMeta(prov);
        }
        if (addr) { bind(w, prov); setState({ id: w.id, name: w.name, chain: w.chain, color: w.color, ini: w.ini, icon: w.icon, logo: w.logo, rdns: w.rdns, addr, ...meta }, true); }
      } catch { /* the wallet wants a fresh prompt; stay disconnected */ }
    }

    function open() { closeMenu(); err.hidden = true; drawList(); drawOn(); openModal(m); }
    btn.addEventListener('click', open);
    $$('[data-wallet]').forEach(b => b.addEventListener('click', open));
    $('#wCopy').addEventListener('click', () => state && copyText(state.addr, 'Address'));
    $('#wDisconnect').addEventListener('click', disconnect);
    restore();
    return {
      get: () => state,
      provider: () => { if (!state) return null; const w = allWallets().find(x => x.id === state.id); return w ? providerFor(w) : null; },
      open,
      onChange: fn => changeFns.push(fn)
    };
  })();


  /* ---------- cookie banner + settings ---------- */
  (() => {
    const bar = $('#cookieBar'), m = $('#cookies');
    const ck = { pref: $('#ckPref'), stats: $('#ckStats'), mkt: $('#ckMkt') };
    function fill() {
      ck.pref.checked = consent ? consent.preferences : true;
      ck.stats.checked = consent ? consent.analytics : false;
      ck.mkt.checked = consent ? consent.marketing : false;
      $('#ckStatus').textContent = consent ? `Last saved ${new Date(consent.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'You have not chosen yet.';
    }
    function done(c, msg) {
      applyConsent(c);
      bar.hidden = true;
      if (!m.hidden) closeModal(m);
      toast(msg);
    }
    $('#cookieAccept').addEventListener('click', () => done({ preferences: true, analytics: true, marketing: true }, 'Cookie choice saved: all allowed'));
    $('#cookieReject').addEventListener('click', () => done({}, 'Cookie choice saved: necessary only'));
    $('#ckReject').addEventListener('click', () => done({}, 'Cookie choice saved: necessary only'));
    $('#ckSave').addEventListener('click', () => done({ preferences: ck.pref.checked, analytics: ck.stats.checked, marketing: ck.mkt.checked }, 'Cookie choices saved'));
    $$('[data-cookies]').forEach(b => b.addEventListener('click', () => { closeMenu(); fill(); openModal(m); }));
    if (!consent) splashDone.then(() => setTimeout(() => { if (!consent) bar.hidden = false; }, 500));
  })();

  /* ---------- login ---------- */
  const login = $('#login');
  $$('[data-login]').forEach(b => b.addEventListener('click', async () => {
    closeMenu();
    if (live.on) {
      try { const a = await ensureSession(); toast(`Signed in as ${a.slice(0, 6)}…${a.slice(-4)}`); }
      catch (e) { toast(e.message); }
      return;
    }
    $('#loginForm').hidden = false; $('#loginDone').hidden = true; $('#loginErr').hidden = true;
    openModal(login);
  }));
  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const em = $('#loginEmail'), v = em.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      $('#loginErr').textContent = 'Enter a full email address, like you@example.com.';
      $('#loginErr').hidden = false; em.setAttribute('aria-invalid', 'true'); em.focus(); return;
    }
    em.removeAttribute('aria-invalid');
    $('#loginTo').textContent = v;
    $('#loginForm').hidden = true; $('#loginDone').hidden = false;
    $('#loginGo').focus();
  });
  $('#loginGo').addEventListener('click', () => { closeModal(login); $('#app').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); });

  /* ---------- launch form ---------- */
  const lf = $('#lf'), lfName = $('#lfName'), lfTicker = $('#lfTicker'), lfLine = $('#lfLine'), lfImg = $('#lfImg');
  const lfErr = $('#lfErr'), lfPrev = $('#lfPrev'), lfDropTxt = $('#lfDropTxt'), lfDrop = $('#lfDrop');
  let imgData = null;

  function resetLaunch(ticker = '') {
    lf.reset(); imgData = null;
    lfPrev.hidden = true; lfPrev.removeAttribute('src');
    lfDropTxt.lastChild.textContent = ' Choose or drop a PNG, JPG or WebP under 2 MB';
    lfTicker.value = ticker;
    $('#lfCount').textContent = '0/80';
    lfErr.hidden = true;
    [lfName, lfLine, lfTicker, $('#lfZec')].forEach(i => i.removeAttribute('aria-invalid'));
    $('#lfZecHint').className = 'hint';
    $('#lfZecHint').textContent = 'Leave empty to skip ZEC tips. Unified (u1), Sapling (zs1) and transparent (t1, t3) addresses work.';
    lfTicker.parentElement.classList.remove('bad');
    $('#launchForm').hidden = false; $('#launchDone').hidden = true;
    pvColor = palette[Math.floor(Math.random() * palette.length)];
    preview();
  }
  $$('[data-open-launch]').forEach(b => b.addEventListener('click', () => { resetLaunch(); openModal(launch); }));

  const cleanTicker = v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const quickBtn = $('#quickForm button[type="submit"]');
  $('#quickTicker').addEventListener('input', () => {
    const t = cleanTicker($('#quickTicker').value);
    quickBtn.textContent = t ? `Launch $${t}` : 'Launch coin';
    $('#quickErr').hidden = true;
  });
  [lfTicker, $('#quickTicker')].forEach(i => i.addEventListener('input', () => {
    const pos = i.selectionStart, before = i.value.length;
    i.value = cleanTicker(i.value);
    const p = Math.max(0, pos - (before - i.value.length));
    try { i.setSelectionRange(p, p); } catch { /* ignore */ }
  }));
  lfLine.addEventListener('input', () => { $('#lfCount').textContent = `${lfLine.value.length}/80`; });
  let pvColor = palette[0];
  function preview() {
    const t = cleanTicker(lfTicker.value), n = lfName.value.trim();
    $('#pvName').textContent = n || 'Your coin';
    $('#pvTicker').textContent = '$' + (t || 'TICKER');
    $('#pvLine').textContent = lfLine.value.trim() || 'Your pitch line shows up here.';
    const av = $('#pvAv');
    av.style.background = pvColor;
    av.innerHTML = imgData ? `<img src="${esc(imgData)}" alt="">` : esc((t || n.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'HP').slice(0, 2));
    $('#lfSubmit').textContent = t ? `Launch $${t}` : 'Launch coin';
  }
  [lfName, lfTicker, lfLine].forEach(i => i.addEventListener('input', preview));
  const lfZec = $('#lfZec'), lfZecHint = $('#lfZecHint');
  const ZEC_HINT = 'Leave empty to skip ZEC tips. Unified (u1), Sapling (zs1) and transparent (t1, t3) addresses work.';
  lfZec.addEventListener('input', () => {
    const r = checkZec(lfZec.value);
    lfZec.removeAttribute('aria-invalid');
    lfZecHint.className = 'hint' + (r ? (r.err ? ' bad' : ' ok') : '');
    lfZecHint.textContent = !r ? ZEC_HINT : r.err ? r.err : `${r.kind} address. The format looks right; this demo does not verify the checksum.`;
  });

  function tickerProblem(t) {
    if (t.length < 2) return 'Tickers need 2 to 8 letters or numbers.';
    if (coins.some(c => c.ticker === t)) return `$${t} is already taken. Try another ticker.`;
    return '';
  }

  $('#quickForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('#quickTicker'), t = cleanTicker(q.value), err = $('#quickErr');
    const p = t ? tickerProblem(t) : 'Type a ticker first, like MOSSY.';
    if (p) { err.textContent = p; err.hidden = false; q.focus(); return; }
    err.hidden = true;
    resetLaunch(t);
    openModal(launch);
    setTimeout(() => lfName.focus(), 40);
  });

  function readImage(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { showErr('That file type is not supported. Use PNG, JPG or WebP.'); return; }
    if (file.size > 2 * 1024 * 1024) { showErr('That image is over 2 MB. Pick a smaller one.'); return; }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      // downscale to 128px square so it fits in local storage
      const S = 128, c = document.createElement('canvas');
      c.width = c.height = S;
      const k = Math.max(S / im.width, S / im.height);
      c.getContext('2d').drawImage(im, (S - im.width * k) / 2, (S - im.height * k) / 2, im.width * k, im.height * k);
      imgData = c.toDataURL('image/webp', .85);
      if (!imgData.startsWith('data:image/webp')) imgData = c.toDataURL('image/png');
      lfPrev.src = imgData; lfPrev.hidden = false;
      preview();
      lfDropTxt.lastChild.textContent = ' ' + file.name;
      URL.revokeObjectURL(url);
      lfErr.hidden = true;
    };
    im.onerror = () => { showErr('That image could not be read. Try another file.'); URL.revokeObjectURL(url); };
    im.src = url;
  }
  lfImg.addEventListener('change', () => readImage(lfImg.files[0]));
  ['dragenter', 'dragover'].forEach(ev => lfDrop.addEventListener(ev, e => { e.preventDefault(); lfDrop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => lfDrop.addEventListener(ev, e => { e.preventDefault(); lfDrop.classList.remove('over'); }));
  lfDrop.addEventListener('drop', e => readImage(e.dataTransfer.files[0]));

  function showErr(msg, field) {
    lfErr.textContent = msg; lfErr.hidden = false;
    if (field) {
      (field === lfTicker ? lfTicker.parentElement : field).classList.add('bad');
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }
  [lfName, lfTicker, lfLine].forEach(i => i.addEventListener('input', () => {
    i.removeAttribute('aria-invalid'); lfTicker.parentElement.classList.remove('bad');
  }));

  lf.addEventListener('submit', e => {
    e.preventDefault();
    const name = lfName.value.trim().replace(/\s+/g, ' ');
    const ticker = cleanTicker(lfTicker.value);
    const line = lfLine.value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return showErr('Give your coin a name of at least 2 characters.', lfName);
    const tp = tickerProblem(ticker);
    if (tp) return showErr(tp, lfTicker);
    if (line.length < 8) return showErr('Write a pitch line of at least 8 characters. The reels are built from it.', lfLine);
    const zr = checkZec(lfZec.value);
    if (zr && zr.err) return showErr(zr.err, lfZec);
    if (live.on) return liveLaunch({ name, ticker, line, zr });
    const coin = {
      name, ticker, line, reels: 0, fees: 0, fund: 0,
      color: pvColor,
      img: imgData, hist: [0, 0], last: Date.now(), created: Date.now(), mine: true,
      zecAddr: zr ? zr.addr : null, tipsOff: !zr, tips: []
    };
    coins.unshift(coin);
    if (!saveMine()) { /* storage unavailable: coin still shows for this visit */ }
    query = ''; $('#feedSearch').value = '';
    sortKey = 'recent';
    $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.sort === 'recent')));
    render();
    $('#doneTicker').textContent = ticker;
    $('#launchForm').hidden = true; $('#launchDone').hidden = false;
    burst($('#doneTicker'));
    $('#doneGo').focus();
  });
  $('#doneGo').addEventListener('click', () => {
    closeModal(launch);
    $('#feed').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });

  /* =====================================================================
     LIVE MODE: real coins on Robinhood Chain through the Hyperpad server
     ===================================================================== */
  const LP_ABI = [
    'function createCoin(string name, string symbol, string metadataURI, uint256 minTokensOut) payable returns (address)',
    'function buy(address token, uint256 minTokensOut, uint256 deadline) payable returns (uint256)',
    'function sell(address token, uint256 tokenAmount, uint256 minEthOut, uint256 deadline) returns (uint256)',
    'function claimCreatorFees() returns (uint256)',
    'event CoinCreated(address indexed token, address indexed creator, string name, string symbol, string metadataURI)'
  ];
  const ERC20_ABI = ['function approve(address spender, uint256 amount) returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)'];
  const shortAddr = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
  function colorFor(addr) { let x = 0; for (const ch of addr) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return palette[x % palette.length]; }
  function txLink(hash) { return live.cfg.chain.explorer ? `${live.cfg.chain.explorer}/tx/${hash}` : null; }
  function friendlyError(e) {
    const code = e && (e.code || e.info?.error?.code);
    if (code === 4001 || code === 'ACTION_REJECTED' || /user rejected|denied/i.test(e?.message || '')) return 'You cancelled the request in your wallet.';
    if (/insufficient funds/i.test(e?.message || '')) return 'Not enough ETH in this wallet to cover the amount and gas.';
    if (/Slippage/.test(e?.message || e?.data || '')) return 'The price moved more than 2% before your trade landed. Try again.';
    if (/CoinGraduated/.test(e?.message || '')) return 'This coin sold out its curve and graduated.';
    return e?.shortMessage || e?.reason || e?.message || 'Something went wrong.';
  }
  function evmWallet() {
    const w = wallet.get();
    if (!w) throw new Error('Connect a wallet first.');
    if (w.chain !== 'evm') throw new Error('Robinhood Chain needs an Ethereum wallet such as MetaMask, Coinbase Wallet or Rabby.');
    return w;
  }
  async function ensureChain(prov) {
    const hex = '0x' + live.cfg.chain.id.toString(16);
    const cur = String(await prov.request({ method: 'eth_chainId' })).toLowerCase();
    if (cur === hex) return;
    try {
      await prov.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    } catch (e) {
      if (e.code !== 4902 && !/unrecognized|not been added|unknown chain/i.test(e.message || '')) throw e;
      await prov.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: hex, chainName: live.cfg.chain.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: [live.cfg.chain.rpc], blockExplorerUrls: live.cfg.chain.explorer ? [live.cfg.chain.explorer] : []
      }] });
    }
  }
  async function signer() {
    if (!window.ethers) throw new Error('The wallet library did not load. Reload the page and try again.');
    const w = evmWallet(), prov = wallet.provider();
    if (!prov) throw new Error('Your wallet is not available in this browser.');
    await ensureChain(prov);
    const s = await new window.ethers.BrowserProvider(prov).getSigner();
    if ((await s.getAddress()).toLowerCase() !== w.addr.toLowerCase()) throw new Error('Your wallet switched accounts. Reconnect and try again.');
    return s;
  }
  async function ensureSession() {
    const w = evmWallet();
    const me = await api('/api/me');
    if (me.address && me.address === w.addr.toLowerCase()) return me.address;
    const { message } = await api('/api/auth/nonce?address=' + w.addr);
    toast('Sign the message in your wallet to log in. It costs nothing.');
    // personal_sign takes the message as hex-encoded UTF-8 (EIP-1193 / MetaMask convention)
    const hex = '0x' + Array.from(new TextEncoder().encode(message), b => b.toString(16).padStart(2, '0')).join('');
    const signature = await wallet.provider().request({ method: 'personal_sign', params: [hex, w.addr] });
    return (await api('/api/auth/verify', { method: 'POST', body: { address: w.addr, message, signature } })).address;
  }

  function mapCoin(a, prev) {
    const o = prev || {};
    const w = wallet.get();
    return Object.assign(o, {
      address: a.address, creator: a.creator, name: a.name, ticker: a.symbol, line: a.line || '',
      reels: a.reels, fees: a.feesUsd, fund: a.reelFundUsd, color: o.color || colorFor(a.address), img: a.image,
      last: Date.parse(a.lastReelAt || a.createdAt), created: Date.parse(a.createdAt),
      mine: !!(w && w.chain === 'evm' && w.addr.toLowerCase() === a.creator),
      zecAddr: a.zecAddr, tipsOff: a.tipsOff, tips: o.tips || [], tipsZecTotal: a.tipsZec, tipsCountTotal: a.tipsCount,
      hist: o.hist && o.hist.length > 1 ? o.hist : [0, a.feesUsd], priceEth: a.priceEth, graduated: a.graduated, volumeEth: a.volumeEth
    });
  }
  async function refreshCoin(addr) {
    const a = await api('/api/coins/' + addr);
    let c = coins.find(x => x.address === addr);
    if (c) { mapCoin(a, c); c.hist.push(a.feesUsd); if (c.hist.length > 30) c.hist.shift(); }
    else { c = mapCoin(a); coins.unshift(c); }
    render();
    return c;
  }
  async function refreshStats() { live.stats = await api('/api/stats').catch(() => live.stats); drawStats(true); }

  /* ---------- buy / sell dialog ---------- */
  const tradeUI = (() => {
    const m = $('#trade'), amt = $('#trAmt'), err = $('#trErr'), go = $('#trGo');
    let coin = null, side = 'buy', quote = null, bal = 0n, qTimer = 0, busy = false;
    const fmtTok = v => Number(window.ethers ? window.ethers.formatEther(v) : 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
    function setSide(sd) {
      side = sd;
      $$('.trade-tabs button', m).forEach(b => b.setAttribute('aria-selected', String(b.dataset.side === sd)));
      $('#trAmtLabel').textContent = sd === 'buy' ? 'Amount in ETH' : `Amount in $${coin.ticker}`;
      go.textContent = sd === 'buy' ? `Buy $${coin.ticker}` : `Sell $${coin.ticker}`;
      const q = $('#trQuick');
      q.innerHTML = sd === 'buy'
        ? ['0.01', '0.05', '0.1', '0.5'].map(v => `<button type="button" data-v="${v}">${v}</button>`).join('')
        : [25, 50, 100].map(p => `<button type="button" data-p="${p}">${p}%</button>`).join('');
      amt.value = sd === 'buy' ? '0.01' : '';
      loadBalance(); requestQuote();
    }
    async function loadBalance() {
      bal = 0n; $('#trBal').textContent = '';
      const w = wallet.get();
      if (!w || w.chain !== 'evm' || side !== 'sell') return;
      const r = await api(`/api/balance?coin=${coin.address}&address=${w.addr}`).catch(() => null);
      if (r) { bal = BigInt(r.tokens); $('#trBal').textContent = `Balance: ${fmtTok(bal)}`; }
    }
    function requestQuote() { clearTimeout(qTimer); qTimer = setTimeout(getQuote, 250); }
    async function getQuote() {
      quote = null; err.hidden = true;
      ['#trOut', '#trFee', '#trReel'].forEach(k => { $(k).textContent = '…'; });
      const v = amt.value.trim().replace(',', '.');
      if (!/^\d*\.?\d+$/.test(v) || Number(v) <= 0) { ['#trOut', '#trFee', '#trReel'].forEach(k => { $(k).textContent = '–'; }); go.disabled = true; return; }
      try {
        const q = await api(`/api/quote?coin=${coin.address}&side=${side}&amount=${encodeURIComponent(v)}`);
        if (amt.value.trim().replace(',', '.') !== v) return; // user typed again
        quote = { ...q, amount: v };
        const E = window.ethers;
        if (side === 'buy') { $('#trOut').textContent = `${fmtTok(q.tokens)} $${coin.ticker}`; }
        else { $('#trOut').textContent = `${Number(E.formatEther(q.eth)).toFixed(6)} ETH`; }
        $('#trFee').textContent = `${Number(E.formatEther(q.fee)).toFixed(6)} ETH`;
        $('#trReel').textContent = `${Number(E.formatEther(q.fee) * 0.5).toFixed(6)} ETH`;
        go.disabled = false;
      } catch (e) { err.textContent = e.message; err.hidden = false; go.disabled = true; ['#trOut', '#trFee', '#trReel'].forEach(k => { $(k).textContent = '–'; }); }
    }
    $$('.trade-tabs button', m).forEach(b => b.addEventListener('click', () => setSide(b.dataset.side)));
    $('#trQuick').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v) amt.value = b.dataset.v;
      else if (window.ethers) amt.value = window.ethers.formatEther(bal * BigInt(b.dataset.p) / 100n);
      requestQuote();
    });
    amt.addEventListener('input', requestQuote);
    go.addEventListener('click', async () => {
      if (busy || !quote) return;
      err.hidden = true;
      try {
        busy = true; go.disabled = true;
        const E = window.ethers;
        go.textContent = 'Confirm in your wallet…';
        const s = await signer();
        const lp = new E.Contract(live.cfg.launchpad, LP_ABI, s);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
        let tx;
        if (side === 'buy') {
          tx = await lp.buy(coin.address, BigInt(quote.tokens) * 98n / 100n, deadline, { value: E.parseEther(quote.amount) });
        } else {
          const amount = E.parseEther(quote.amount);
          const tok = new E.Contract(coin.address, ERC20_ABI, s);
          if ((await tok.allowance(await s.getAddress(), live.cfg.launchpad)) < amount) {
            go.textContent = 'Approve in your wallet…';
            await (await tok.approve(live.cfg.launchpad, amount)).wait();
            go.textContent = 'Confirm the sale in your wallet…';
          }
          tx = await lp.sell(coin.address, amount, BigInt(quote.eth) * 98n / 100n, deadline);
        }
        go.textContent = 'Waiting for Robinhood Chain…';
        await tx.wait();
        closeModal(m);
        burst($('#walletBtn'));
        const link = txLink(tx.hash);
        toast(side === 'buy' ? `Bought $${coin.ticker}.` : `Sold $${coin.ticker}.`, link ? { label: 'View', fn: () => window.open(link, '_blank', 'noopener') } : undefined);
        refreshCoin(coin.address).catch(() => {});
      } catch (e) {
        err.textContent = friendlyError(e); err.hidden = false;
      } finally {
        busy = false; go.disabled = false; go.textContent = side === 'buy' ? `Buy $${coin.ticker}` : `Sell $${coin.ticker}`;
      }
    });
    return {
      open(c) {
        if (c.graduated) { toast(`$${c.ticker} sold out its curve and graduated.`); return; }
        coin = c;
        $('#tradeTitle').textContent = `Trade $${c.ticker}`;
        const av = $('#trAv'); av.style.background = c.color; av.innerHTML = avatarInner(c);
        $('#trPrice').textContent = c.priceEth ? `Price: ${(c.priceEth).toExponential(3)} ETH per token` : '';
        err.hidden = true;
        openModal(m);
        setSide('buy');
        if (!wallet.get()) $('#trNote').textContent = 'Connect an Ethereum wallet to trade. Trades run on Robinhood Chain from your own wallet.';
        else $('#trNote').textContent = live.cfg.chain.id === 46630
          ? 'This runs on Robinhood Chain Testnet: use test ETH only.'
          : 'Trades run on Robinhood Chain from your own wallet. Crypto is risky and you can lose what you put in.';
      }
    };
  })();

  async function claimFees(coin, done) {
    try {
      const w = evmWallet();
      const cl = await api('/api/claimable/' + w.addr);
      if (BigInt(cl.wei || '0') === 0n) { toast('No creator fees to claim for this wallet yet.'); return; }
      toast('Confirm the claim in your wallet.');
      const s = await signer();
      const tx = await new window.ethers.Contract(live.cfg.launchpad, LP_ABI, s).claimCreatorFees();
      await tx.wait();
      const link = txLink(tx.hash);
      toast(`Claimed ${Number(cl.eth).toFixed(5)} ETH to your wallet.`, link ? { label: 'View', fn: () => window.open(link, '_blank', 'noopener') } : undefined);
      done && done(cl.eth);
    } catch (e) { toast(friendlyError(e)); if (/Connect|Ethereum wallet/.test(e.message)) wallet.open(); }
  }

  async function liveLaunch({ name, ticker, line, zr }) {
    const btn = $('#lfSubmit'), label = btn.textContent;
    try {
      evmWallet();
    } catch (e) { showErr(e.message); wallet.open(); return; }
    btn.disabled = true;
    try {
      btn.textContent = 'Saving your coin profile…';
      const meta = await api('/api/meta', { method: 'POST', body: { name, symbol: ticker, line, image: imgData, zecAddr: zr ? zr.addr : null } });
      btn.textContent = 'Confirm the launch in your wallet…';
      const s = await signer();
      const lp = new window.ethers.Contract(live.cfg.launchpad, LP_ABI, s);
      const tx = await lp.createCoin(meta.name, meta.symbol, meta.metadataURI, 0n);
      btn.textContent = 'Waiting for Robinhood Chain…';
      const rc = await tx.wait();
      const ev = rc.logs.map(l => { try { return lp.interface.parseLog(l); } catch { return null; } }).find(e => e && e.name === 'CoinCreated');
      const token = ev ? ev.args.token.toLowerCase() : null;
      btn.textContent = 'Adding it to the feed…';
      let c = null;
      for (let i = 0; token && i < 30 && !c; i++) { try { c = await refreshCoin(token); } catch { await new Promise(r => setTimeout(r, 1000)); } }
      query = ''; $('#feedSearch').value = ''; sortKey = 'recent';
      $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.sort === 'recent')));
      render();
      $('#doneTicker').textContent = ticker;
      $('#launchDone p').textContent = c
        ? 'Your coin is live on Robinhood Chain and at the top of the feed. Its first reel starts once it earns $25 in reel fees.'
        : 'Your launch is confirmed on Robinhood Chain. It will appear in the feed within a minute.';
      $('#launchForm').hidden = true; $('#launchDone').hidden = false;
      burst($('#doneTicker'));
      if (c) dash.pickLive();
    } catch (e) {
      showErr(friendlyError(e));
    } finally { btn.disabled = false; btn.textContent = label; }
  }

  /* ---------- switch to live mode when the server is there ---------- */
  (async () => {
    let cfg = null;
    try { const r = await fetch('/api/config', { signal: AbortSignal.timeout(4000) }); if (r.ok && /json/.test(r.headers.get('content-type') || '')) cfg = await r.json(); } catch { cfg = null; }
    if (!cfg || !cfg.launchpad) return;
    live.on = true; live.cfg = cfg;
    $('.sample-note').textContent = `Coins launched on ${cfg.chain.name}. Prices and fees update as trades land.`;
    $('#watchFeed').closest('.queue').querySelector('.queue-note').textContent = 'Every $25 of a coin\'s reel fees queues a new reel.';
    // drop the example data
    coins = []; allTips.length = 0;
    for (const el of cards.values()) el.remove();
    cards.clear();
    try {
      const [list, tips, reelsList] = await Promise.all([api('/api/coins?sort=recent'), api('/api/tips'), api('/api/reels')]);
      coins = list.map(a => mapCoin(a));
      await Promise.all(coins.slice(0, 12).map(async c => {
        const h = await api(`/api/coins/${c.address}/history`).catch(() => []);
        if (h.length) c.hist = [0, ...h.map(x => x.feesUsd)];
      }));
      tips.forEach(t => { const c = coins.find(x => x.address === t.coin); if (c) allTips.push({ t: Date.parse(t.createdAt), zec: Number(t.zec), pool: t.pool, memo: '', coin: c, reported: true, verified: t.verified }); });
      render(); drawZecBoard(); queue.syncLive(reelsList); dash.pickLive(); refreshStats();
      tapeItems.length = 0;
      coins.slice(0, 8).forEach(c => { if (c.fees > 0) tapeItems.push({ t: c.ticker, v: c.fees / FEE }); });
      drawTape();
    } catch (e) { toast('Could not load coins: ' + e.message); }
    wallet.onChange(() => { coins.forEach(c => { const w = wallet.get(); c.mine = !!(w && w.chain === 'evm' && w.addr.toLowerCase() === c.creator); }); render(); dash.pickLive(); });
    setInterval(refreshStats, 20000);

    // live updates from the server
    if ('EventSource' in window) {
      const es = new EventSource('/api/stream');
      es.addEventListener('trade', async ev => {
        const d = JSON.parse(ev.data);
        const c = await refreshCoin(d.coin).catch(() => null);
        if (!c) return;
        tapeItems.unshift({ t: c.ticker, v: d.usd }); tapeItems.length = Math.min(tapeItems.length, 10);
        if (d.usd >= 50) liveChip(c, `<b>$${esc(c.ticker)}</b> ${d.isBuy ? 'buy' : 'sell'} ${usd(d.usd)} · +${usd(d.feeUsd * 0.5, 2)} to reels`);
        dash.liveUpdate(c); refreshStats();
      });
      es.addEventListener('coin', ev => { refreshCoin(JSON.parse(ev.data).address).catch(() => {}); refreshStats(); });
      es.addEventListener('graduated', ev => { refreshCoin(JSON.parse(ev.data).coin).catch(() => {}); });
      es.addEventListener('reel', async ev => {
        const r = JSON.parse(ev.data);
        queue.syncLive(await api('/api/reels').catch(() => []));
        const c = coins.find(x => x.address === r.coin);
        if (c && r.status === 'posted') {
          toast(`New reel posted: $${c.ticker} reel ${r.n}`, { label: 'Watch', fn: () => player.openCoin(c) });
          liveChip(c, `<b>Reel ${r.n}</b> posted for $${esc(c.ticker)}`);
        }
      });
    }
  })();

})();
