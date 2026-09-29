/* Hypereel landing page. Plain JS, no build step. Matter.js (optional) drives the reel jar. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
  };
  const REEL_COST = 25;       // dollars of reel fees per reel
  const FEE = 0.01;           // 1% of each trade
  const SHARE = { you: 0.3, reels: 0.5, house: 0.2 };
  const usd = (n, d = 0) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- toast ---------- */
  const toastEl = $('#toast');
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.style.animation = 'none'; void toastEl.offsetWidth; toastEl.style.animation = '';
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  /* ---------- theme ---------- */
  const themeBtn = $('#themeBtn');
  const root = document.documentElement;
  function isDark() {
    const t = root.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function syncThemeIcon() {
    themeBtn.querySelector('use').setAttribute('href', isDark() ? '#ic-sun' : '#ic-moon');
    themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  }
  const savedTheme = store.get('hr-theme', null);
  if (savedTheme === 'dark' || savedTheme === 'light') root.dataset.theme = savedTheme;
  syncThemeIcon();
  themeBtn.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    store.set('hr-theme', root.dataset.theme);
    syncThemeIcon();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeIcon);

  /* ---------- header ---------- */
  const bar = $('#bar');
  const onScroll = () => bar.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- rotating word ---------- */
  const words = ['sell', 'pitch', 'hype', 'shill'];
  const rotWrap = $('.rot');
  let wi = 0;
  if (!reduced) setInterval(() => {
    const cur = rotWrap.querySelector('span');
    cur.classList.add('out');
    setTimeout(() => {
      wi = (wi + 1) % words.length;
      const n = document.createElement('span');
      n.id = 'rotWord'; n.className = 'in'; n.textContent = words[wi];
      cur.replaceWith(n);
    }, 330);
  }, 2600);

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

  /* ---------- live counter ---------- */
  const liveCount = $('#liveCount');
  let live = 1284;
  setInterval(() => { live += Math.random() < .5 ? 1 : 0; liveCount.textContent = live.toLocaleString('en-US'); }, 3000);

  /* ---------- hero reel (canvas, original host character) ---------- */
  const reel = (() => {
    const cv = $('#reelCanvas');
    const ctx = cv.getContext('2d');
    const cap = $('#caption');
    const prog = $('#reelProg');
    const W = cv.width, H = cv.height;
    const script = [
      'okay so I found a coin called MOSSY',
      'it is green, it is small, it likes grass',
      'every trade pays for the next video',
      'this one cost twenty five dollars. hi'
    ];
    const hot = new Set(['mossy', 'green', 'twenty', 'five', 'dollars.']);
    const DUR = 10000;
    let t0 = performance.now(), lineIdx = -1, wordsShown = 0, running = true;

    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

    function draw(now) {
      const t = (((now - t0) % DUR + DUR) % DUR) / DUR;
      const s = now / 1000;
      // backdrop: soft studio wall
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2d3a7a'); g.addColorStop(1, '#131832');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // bokeh
      for (let i = 0; i < 9; i++) {
        const x = (i * 83 + s * 6) % (W + 60) - 30, y = 90 + (i * 57) % 260;
        ctx.fillStyle = `rgba(${i % 2 ? '255,110,140' : '140,160,255'},.12)`;
        ctx.beginPath(); ctx.arc(x, y, 18 + (i % 3) * 10, 0, 7); ctx.fill();
      }
      // slow handheld sway
      const sx = Math.sin(s * .9) * 4, sy = Math.cos(s * 1.3) * 3;
      ctx.save(); ctx.translate(W / 2 + sx, 0 + sy);
      // body
      ctx.fillStyle = '#e2ff6b';
      roundRect(-120, 430, 240, 260, 90); ctx.fill();
      ctx.fillStyle = '#c8e24f'; roundRect(-40, 430, 80, 40, 20); ctx.fill();
      // neck + head
      ctx.fillStyle = '#b77a57'; ctx.fillRect(-22, 380, 44, 60);
      ctx.beginPath(); ctx.ellipse(0, 320, 78, 92, 0, 0, 7); ctx.fill();
      // hair
      ctx.fillStyle = '#1d1a2b';
      ctx.beginPath(); ctx.ellipse(0, 262, 86, 52, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-60, 280, 26, 40, .3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(62, 276, 22, 34, -.4, 0, 7); ctx.fill();
      // eyes (blink every ~3.2s)
      const blink = (s % 3.2) < .12 ? .1 : 1;
      const look = Math.sin(s * .7) * 3;
      ctx.fillStyle = '#1d1a2b';
      ctx.beginPath(); ctx.ellipse(-28 + look, 318, 7, 9 * blink, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(28 + look, 318, 7, 9 * blink, 0, 0, 7); ctx.fill();
      // brows
      ctx.strokeStyle = '#1d1a2b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      const br = Math.sin(s * 2.2) > .7 ? -4 : 0;
      ctx.beginPath(); ctx.moveTo(-40, 298 + br); ctx.lineTo(-16, 294 + br); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, 294 + br); ctx.lineTo(40, 298 + br); ctx.stroke();
      // mouth: talks while a caption line is on screen
      const talking = running && (t % .25) < .21;
      const open = talking ? 4 + Math.abs(Math.sin(s * 14)) * 12 : 3;
      ctx.fillStyle = '#5a1f2c';
      ctx.beginPath(); ctx.ellipse(0, 362, 20, open, 0, 0, 7); ctx.fill();
      ctx.restore();
      // held-up coin sign
      const ly = 480 + Math.sin(s * 1.6) * 6;
      ctx.save(); ctx.translate(W / 2 + 96 + sx, ly + sy); ctx.rotate(-.12 + Math.sin(s) * .04);
      ctx.fillStyle = '#b77a57'; ctx.beginPath(); ctx.ellipse(-10, 40, 22, 18, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3fae5a'; ctx.beginPath(); ctx.arc(0, 0, 48, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a8a44'; ctx.beginPath(); ctx.arc(0, 0, 38, 0, 7); ctx.fill();
      ctx.fillStyle = '#eaffd9'; ctx.font = '800 22px "Bricolage Grotesque", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$M', 0, 1);
      ctx.restore();
      // grain
      ctx.fillStyle = 'rgba(255,255,255,.025)';
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);

      // captions
      const li = Math.max(0, Math.min(script.length - 1, Math.floor(t * script.length)));
      const lt = t * script.length - li;
      const ws = script[li].split(' ');
      const want = Math.min(ws.length, Math.ceil(lt * ws.length * 1.4));
      if (li !== lineIdx) { lineIdx = li; wordsShown = 0; cap.textContent = ''; }
      while (wordsShown < want) {
        const w = ws[wordsShown];
        const sp = document.createElement('span');
        sp.className = 'w' + (hot.has(w.toLowerCase()) ? ' hot' : '');
        sp.textContent = w;
        cap.append(sp, ' ');
        wordsShown++;
      }
      prog.style.width = (t * 100).toFixed(2) + '%';
    }
    function loop(now) { draw(now); if (running) requestAnimationFrame(loop); }
    if (reduced) { cap.textContent = script[0]; draw(t0 + 1200); running = false; }
    else requestAnimationFrame(loop);
    // pause when off-screen
    if ('IntersectionObserver' in window && !reduced) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !running) { running = true; requestAnimationFrame(loop); }
        else if (!e.isIntersecting) running = false;
      }).observe(cv);
    }
  })();

  $('#buyMossy').addEventListener('click', () => {
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
    const M = window.Matter;
    let engine, walls = [], bodies = [];

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
    if (M) {
      engine = M.Engine.create();
      engine.gravity.y = 1.1;
    }
    size();
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
  $('#trade1').addEventListener('click', () => jar.drop(500));
  $('#trade5').addEventListener('click', () => jar.drop(5000));

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
    name, ticker, line, reels, fees, color: palette[i % palette.length], img: null,
    last: now - minsAgo * 60000, fund: (fees * SHARE.reels) % REEL_COST, mine: false
  }));
  const mine = store.get('hr-coins', []);
  if (Array.isArray(mine)) {
    mine.filter(c => c && typeof c.ticker === 'string' && !coins.some(x => x.ticker === c.ticker))
      .forEach(c => coins.unshift({ ...c, mine: true }));
  }
  function saveMine() { store.set('hr-coins', coins.filter(c => c.mine)); }

  let sortKey = store.get('hr-sort', 'recent');
  if (!['recent', 'reels', 'fees'].includes(sortKey)) sortKey = 'recent';
  let query = '';
  const grid = $('#feedGrid'), emptyEl = $('#feedEmpty');
  const cards = new Map();

  function ago(ts) {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    return h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago';
  }
  function cardFor(c) {
    let el = cards.get(c.ticker);
    if (!el) {
      el = document.createElement('article');
      el.className = 'coin enter';
      el.addEventListener('animationend', e => { if (e.animationName === 'cardIn') el.classList.remove('enter'); });
      el.innerHTML = `
        <div class="coin-top">
          <div class="avatar" style="background:${c.color}">${c.img ? `<img src="${esc(c.img)}" alt="">` : esc(c.ticker.slice(0, 2))}</div>
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
        <div class="meter" aria-hidden="true"><span></span></div>
        <div class="meter-label mono"><span>next reel</span><span data-k="fund"></span></div>
        <button class="btn btn-line btn-sm" type="button">Buy $${esc(c.ticker)}</button>`;
      el.querySelector('button').addEventListener('click', () => {
        trade(c, 1000);
        toast(`Demo trade: $1,000 of $${c.ticker}. No real money moved.`);
      });
      cards.set(c.ticker, el);
    }
    el.querySelector('[data-k="reels"]').textContent = c.reels;
    el.querySelector('[data-k="fees"]').textContent = usd(c.fees);
    el.querySelector('[data-k="last"]').textContent = c.reels ? ago(c.last) : 'none yet';
    el.querySelector('[data-k="fund"]').textContent = `${usd(c.fund, 2)} / ${usd(REEL_COST)}`;
    el.querySelector('.meter span').style.width = (c.fund / REEL_COST * 100) + '%';
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
    const keep = new Set(list.map(c => c.ticker));
    for (const [t, el] of cards) if (!keep.has(t) && el.parentNode) el.remove();
    list.forEach((c, i) => {
      const el = cardFor(c);
      if (grid.children[i] !== el) grid.insertBefore(el, grid.children[i] || null);
    });
    emptyEl.hidden = list.length > 0;
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
    c.fund += f * SHARE.reels;
    let made = 0;
    while (c.fund >= REEL_COST) { c.fund -= REEL_COST; c.reels++; made++; }
    if (made) {
      c.last = Date.now();
      const el = cards.get(c.ticker);
      if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    }
    if (c.mine) saveMine();
    render();
    pushTape(c, size);
  }
  // simulated market
  setInterval(() => {
    if (document.hidden) return;
    const c = coins[Math.floor(Math.random() * coins.length)];
    trade(c, 200 + Math.random() * 4800);
  }, 2400);
  setInterval(render, 30000); // refresh "x minutes ago"
  render();

  /* ---------- tape ---------- */
  const tape = $('#tape');
  const tapeItems = coins.slice(0, 8).map(c => ({ t: c.ticker, v: 400 + Math.random() * 3000 }));
  function drawTape() {
    const html = tapeItems.map(i => `<span><b>$${esc(i.t)}</b> <span class="up">+${usd(i.v)}</span> traded</span>`).join('');
    tape.innerHTML = html + html; // duplicated for seamless loop
  }
  function pushTape(c, size) {
    tapeItems.unshift({ t: c.ticker, v: size });
    tapeItems.length = Math.min(tapeItems.length, 10);
  }
  drawTape();
  setInterval(drawTape, 20000);

  /* ---------- modals ---------- */
  let lastFocus = null;
  function openModal(m) {
    lastFocus = document.activeElement;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    const f = m.querySelector('input, button:not(.modal-x)') || m.querySelector('button');
    setTimeout(() => f && f.focus(), 30);
  }
  function closeModal(m) {
    m.hidden = true;
    if ($$('.modal').every(x => x.hidden)) document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
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
    const open = $$('.modal').filter(m => !m.hidden).pop();
    if (open) closeModal(open);
  });
  const launch = $('#launch'), license = $('#license');
  $('#licenseLink').addEventListener('click', e => { e.preventDefault(); openModal(license); });

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
    [lfName, lfLine, lfTicker].forEach(i => i.removeAttribute('aria-invalid'));
    lfTicker.parentElement.classList.remove('bad');
    $('#launchForm').hidden = false; $('#launchDone').hidden = true;
  }
  $$('[data-open-launch]').forEach(b => b.addEventListener('click', () => { resetLaunch(); openModal(launch); }));

  const cleanTicker = v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  [lfTicker, $('#quickTicker')].forEach(i => i.addEventListener('input', () => {
    const pos = i.selectionStart, before = i.value.length;
    i.value = cleanTicker(i.value);
    const p = Math.max(0, pos - (before - i.value.length));
    try { i.setSelectionRange(p, p); } catch { /* ignore */ }
  }));
  lfLine.addEventListener('input', () => { $('#lfCount').textContent = `${lfLine.value.length}/80`; });

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
    const coin = {
      name, ticker, line, reels: 0, fees: 0, fund: 0,
      color: palette[Math.floor(Math.random() * palette.length)],
      img: imgData, last: Date.now(), created: Date.now(), mine: true
    };
    coins.unshift(coin);
    if (!saveMine()) { /* storage unavailable: coin still shows for this visit */ }
    query = ''; $('#feedSearch').value = '';
    sortKey = 'recent';
    $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.sort === 'recent')));
    render();
    $('#doneTicker').textContent = ticker;
    $('#launchForm').hidden = true; $('#launchDone').hidden = false;
    $('#doneGo').focus();
  });
  $('#doneGo').addEventListener('click', () => {
    closeModal(launch);
    $('#feed').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });
})();
