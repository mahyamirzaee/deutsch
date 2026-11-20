/* Mias Jahr – one 50-minute session per story: Wiederholen → Neue Wörter → Lesen → Schreiben → Sprechen. */
(function () {
  'use strict';
  const ST = window.STORIES;
  const byN = {}; ST.forEach(s => (byN[s.n] = s));
  const KEY = 'mias-jahr-v1';
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const BOX_WAIT = [0, 10 * HOUR, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 40 * DAY]; // wait after reaching box i
  const BOX_NAME = ['', 'Neu', '1 Tag', '3 Tage', '1 Woche', '2 Wochen', 'Gemeistert'];
  const REVIEW_CAP = 25;
  const STEPS = [
    { id: 'review', de: 'Wiederholen', min: 8 },
    { id: 'words', de: 'Neue Wörter', min: 10 },
    { id: 'read', de: 'Lesen & Hören', min: 12 },
    { id: 'write', de: 'Schreiben', min: 10 },
    { id: 'speak', de: 'Sprechen', min: 10 },
  ];
  const XP = { review: 1, learn: 2, read: 10, write: 15, speak: 20, session: 20 };

  // ---------- state ----------
  const DEV = (() => { try { let d = localStorage.getItem('wortgarten-device'); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem('wortgarten-device', d); } return d; } catch (e) { return 'x'; } })();
  const totalXP = s => Object.values(s.xpBy || {}).reduce((a, b) => a + b, 0);
  let S = load();
  if (!S.xpBy) { S.xpBy = S.xp ? { [DEV]: S.xp } : {}; }
  function fresh() { return { v: 1, start: null, done: {}, cards: {}, xp: 0, days: {}, log: [], writing: {}, active: null, rate: 0.9 }; }
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v) return Object.assign(fresh(), s); } catch (e) {} return fresh(); }
  function save(quiet) { S.u = Date.now(); if (S.active) S.active.u = S.u; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save – storage full?'); } if (!quiet) syncSoon(); }

  // ---------- sync between devices (a secret GitHub gist on her own account) ----------
  const SKEY = 'wortgarten-sync'; // { token, gist, last } – kept apart from the backup file
  const SFILE = 'wortgarten-progress.json';
  let SY = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })();
  const saveSY = () => { try { localStorage.setItem(SKEY, JSON.stringify(SY)); } catch (e) {} };
  let syncTimer = null, syncing = false, syncErr = '';
  function syncSoon() { if (!SY.token) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 8000); }
  async function gh(path, opts = {}) {
    const r = await fetch('https://api.github.com' + path, { ...opts, headers: { Authorization: 'Bearer ' + SY.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error(r.status === 401 ? 'The token is not valid any more.' : 'GitHub said ' + r.status);
    return r.json();
  }
  function merge(a, b) { // combine two progress states without losing anything
    if (!b || !b.v) return a; if (!a || !a.v) return b;
    const m = Object.assign(fresh(), a);
    m.start = a.start || b.start;
    m.done = { ...b.done }; for (const [n, d] of Object.entries(a.done)) if (!m.done[n] || m.done[n].skipped) m.done[n] = d;
    m.cards = { ...b.cards }; for (const [id, c] of Object.entries(a.cards)) { const o = m.cards[id]; if (!o || c.r + c.w > o.r + o.w || (c.r + c.w === o.r + o.w && c.d > o.d)) m.cards[id] = c; }
    m.xpBy = { ...(b.xpBy || {}) }; for (const [d, n] of Object.entries(a.xpBy || {})) m.xpBy[d] = Math.max(n, m.xpBy[d] || 0);
    m.xp = totalXP(m);
    m.days = { ...b.days }; for (const [d, n] of Object.entries(a.days)) m.days[d] = Math.max(n, m.days[d] || 0);
    const k = l => `${l.n}|${l.date}|${l.min}|${l.xp}`, seen = new Set(), log = [];
    for (const l of [...b.log, ...a.log]) if (!seen.has(k(l))) { seen.add(k(l)); log.push(l); }
    m.log = log;
    m.writing = { ...b.writing }; for (const [n, w] of Object.entries(a.writing)) if (!m.writing[n] || (w.t || 0) >= (m.writing[n].t || 0)) m.writing[n] = w;
    const act = [a.active, b.active].filter(x => x && !m.done[x.n]).sort((x, y) => (y.u || 0) - (x.u || 0));
    m.active = act[0] || null;
    m.u = Math.max(a.u || 0, b.u || 0);
    return m;
  }
  async function sync(manual) {
    if (!SY.token || syncing) return; syncing = true; syncErr = '';
    try {
      if (!SY.gist) {
        const list = await gh('/gists?per_page=100');
        const found = list.find(g => g.files && g.files[SFILE]);
        SY.gist = found ? found.id : (await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Wortgarten progress (do not edit)', public: false, files: { [SFILE]: { content: JSON.stringify(S) } } }) })).id;
        saveSY();
      }
      const g = await gh('/gists/' + SY.gist);
      let remote = null; try { remote = JSON.parse(g.files[SFILE].content); } catch (e) {}
      const before = JSON.stringify(S);
      S = merge(S, remote); save(true);
      if (JSON.stringify(remote) !== JSON.stringify(S)) await gh('/gists/' + SY.gist, { method: 'PATCH', body: JSON.stringify({ files: { [SFILE]: { content: JSON.stringify(S) } } }) });
      SY.last = Date.now(); saveSY();
      if (before !== JSON.stringify(S) && view !== 'session') render();
      if (manual) toast('Synced ✓');
    } catch (e) { syncErr = e.message || 'Sync failed'; if (manual) toast(syncErr); }
    syncing = false;
    if (view === 'more') { const el = document.getElementById('syncst'); if (el) el.innerHTML = syncStatus(); }
  }
  function syncStatus() {
    if (!SY.token) return 'Not connected.';
    if (syncErr) return `<span class="no">${esc(syncErr)}</span>`;
    return SY.last ? `<span class="ok">✓ Connected</span> · last sync ${new Date(SY.last).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : 'Connecting…';
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); else if (syncTimer) { clearTimeout(syncTimer); sync(); } });
  const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD

  // ---------- content helpers ----------
  const items = s => [...s.w.map((r, i) => ['w', i, r]), ...s.c.map((r, i) => ['c', i, r]), ...s.x.map((r, i) => ['x', i, r])];
  const cardId = (n, t, i) => `${n}:${t}:${i}`;
  function cardData(id) { const [n, t, i] = id.split(':'); const s = byN[n]; const r = s && s[t] && s[t][+i]; return r ? { de: r[0], en: r[1], ex: r[2], n: +n, t } : null; }
  const gender = de => (de.match(/^(der|die|das) /) || [])[1] || '';
  const head = de => de.split(/,|\(/)[0].trim(); // "der Tisch, die Tische" -> "der Tisch"
  const variants = de => head(de).split('/').map(x => x.trim()).filter(Boolean);
  const norm = s => s.toLowerCase().replace(/[.,!?…:;„“"'()]/g, '').replace(/\s+/g, ' ').trim();
  function stemOf(de) { let w = variants(de)[0].replace(/^(der|die|das|sich) /, '').split(' ')[0].toLowerCase().replace(/[^a-zäöüß]/g, ''); return w.length > 5 ? w.slice(0, w.length - 2) : w; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const deHtml = de => { const g = gender(de); return g ? `<span class="${g}">${esc(de)}</span>` : esc(de); };

  function nextStory() { for (const s of ST) if (!S.done[s.n] && s.n >= (S.start || 1)) return s; return null; }
  function addCard(id, box) { if (!S.cards[id]) S.cards[id] = { b: box || 1, d: Date.now() + BOX_WAIT[box || 1], r: 0, w: 0 }; }
  function grade(id, ok) {
    const c = S.cards[id] || (S.cards[id] = { b: 1, d: 0, r: 0, w: 0 });
    if (ok) { c.b = Math.min(6, c.b + 1); c.r++; } else { c.b = 1; c.w++; }
    c.d = Date.now() + BOX_WAIT[c.b];
  }
  function dueIds() {
    const now = Date.now();
    return Object.entries(S.cards).filter(([, c]) => c.d <= now).sort((a, b) => a[1].b - b[1].b || a[1].d - b[1].d).map(([id]) => id);
  }
  function streak() {
    let n = 0; const d = new Date();
    if (!S.days[today()]) d.setDate(d.getDate() - 1);
    while (S.days[d.toLocaleDateString('sv')]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function pace() { // sessions per active day over the last 14 days with sessions
    const ds = Object.keys(S.days).sort().slice(-14); if (!ds.length) return 0;
    return ds.reduce((a, d) => a + S.days[d], 0) / ds.length;
  }
  function addXP(n) { S.xpBy = S.xpBy || {}; S.xpBy[DEV] = (S.xpBy[DEV] || 0) + n; S.xp = totalXP(S); if (S.active) S.active.xp = (S.active.xp || 0) + n; }

  // ---------- speech ----------
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices().filter(v => /^de/i.test(v.lang));
    voice = vs.find(v => /google/i.test(v.name)) || vs.find(v => /natural|online/i.test(v.name)) || vs.find(v => /katja|anna|hedda|petra/i.test(v.name)) || vs[0] || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text, opts = {}) {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    if (!opts.queue) speechSynthesis.cancel();
    return new Promise(res => {
      const u = new SpeechSynthesisUtterance(text.replace(/[„“]/g, ''));
      u.lang = 'de-DE'; if (voice) u.voice = voice; u.rate = opts.rate || S.rate;
      u.onend = u.onerror = () => res(); speechSynthesis.speak(u);
    });
  }
  const stopSay = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };

  // ---------- recordings (IndexedDB) ----------
  function db() { return new Promise((res, rej) => { const r = indexedDB.open('mias-jahr', 1); r.onupgradeneeded = () => r.result.createObjectStore('rec', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function putRec(rec) { const d = await db(); return new Promise(res => { const tx = d.transaction('rec', 'readwrite'); tx.objectStore('rec').put(rec); tx.oncomplete = res; }); }
  async function recsFor(n) { const d = await db(); return new Promise(res => { const out = []; const c = d.transaction('rec').objectStore('rec').openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); if (cur.value.n === n) out.push(cur.value); cur.continue(); }; }); }

  // ---------- ui basics ----------
  const $app = document.getElementById('app');
  let view = 'home', viewArg = null, timerInt = null;
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
  function go(v, arg) { stopSay(); document.onkeydown = null; view = v; viewArg = arg; render(); window.scrollTo(0, 0); }
  const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    path: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h6a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h6"/>',
    box: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 13h6"/>',
    more: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
  };
  function tabbar() {
    const el = document.getElementById('tabbar');
    if (view === 'session') { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    const t = [['home', 'Heute'], ['path', 'Mein Weg'], ['box', 'Wortkiste'], ['more', 'Ich']];
    el.innerHTML = '<div>' + t.map(([id, l]) => `<button class="${view === id ? 'on' : ''}" data-go="${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>${l}</button>`).join('') + '</div>';
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go, g.dataset.arg ? +g.dataset.arg : null); return; }
    const sp = e.target.closest('[data-say]'); if (sp) { e.stopPropagation(); say(sp.dataset.say); }
  });

  function render() {
    clearInterval(timerInt);
    if (!S.start && view !== 'more') { onboarding(); tabbar(); return; }
    ({ home, path, box, more, session, story, done: doneView })[view](viewArg);
    tabbar();
  }

  // ---------- onboarding ----------
  function onboarding() {
    $app.innerHTML = `
      <div class="gap"></div><h1>Willkommen, Mahya! 👋</h1>
      <p class="muted">Every session follows one story from <b>Mias Jahr in Freiburg</b>: new words, reading and listening, writing, then speaking. About 50 minutes, then a 10-minute break.</p>
      <div class="card">
        <h2>Which story do you start with?</h2>
        <p class="muted small">Stories 1–50 are A1, 51–100 are A2.</p>
        <input type="number" id="ob-n" min="1" max="100" value="7">
        <label class="check"><input type="checkbox" id="ob-old" checked><span>Put the words of the stories I already read into my memory box, so I review them.</span></label>
        <div class="gap"></div>
        <button class="btn primary big" id="ob-go">Los geht's</button>
      </div>`;
    document.getElementById('ob-go').onclick = () => {
      const n = Math.max(1, Math.min(100, +document.getElementById('ob-n').value || 1));
      S.start = n;
      for (const s of ST) if (s.n < n) {
        S.done[s.n] = { date: today(), skipped: true };
        if (document.getElementById('ob-old').checked) items(s).forEach(([t, i]) => { const id = cardId(s.n, t, i); addCard(id, 1); S.cards[id].d = Date.now(); });
      }
      save(); go('home');
    };
  }

  // ---------- home ----------
  function levelStats(lvl) {
    const ss = ST.filter(s => s.l === lvl), done = ss.filter(s => S.done[s.n]).length;
    return { total: ss.length, done, chapters: [0, 1, 2, 3, 4].map(k => ss.slice(k * 10, k * 10 + 10).filter(s => S.done[s.n]).length / 10) };
  }
  function home() {
    const s = nextStory(), a = S.active, due = dueIds().length, st = streak(), todayN = S.days[today()] || 0;
    const lvl = s ? s.l : 'A2', L = levelStats(lvl), left = L.total - L.done, p = pace();
    const known = Object.values(S.cards).filter(c => c.b >= 4).length, total = Object.keys(S.cards).length;
    const eta = p ? `At your pace (${p.toFixed(1)} sessions a day) you finish ${lvl} in about <b>${Math.ceil(left / p)} days</b>.` : `${left} sessions to finish ${lvl}. The more sessions you do, the sooner you are there.`;
    $app.innerHTML = `
      <div class="spread" style="margin-top:6px"><div><div class="muted small">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Hallo Mahya!</h1></div>
        <div class="row"><span class="chip warm" title="days in a row">🔥 ${st}</span><span class="chip">⭐ ${S.xp}</span></div></div>
      <div class="gap"></div>
      ${s ? `<div class="card">
        <div class="muted small">${a && a.n === s.n ? 'Weitermachen' : 'Nächste Session'} · Geschichte ${s.n} · ${s.l}${s.review ? ' · Wiederholung' : ''}</div>
        <h2 style="font-size:24px;margin:4px 0 2px">${esc(s.t)}</h2>
        ${stepsBar(s, a && a.n === s.n ? a.step : -1)}
        <div class="gap"></div>
        <button class="btn primary big" id="start">${a && a.n === s.n ? '▶ Weiter' : '▶ Session starten'}</button>
        <p class="muted small center" style="margin:8px 0 0">${todayN ? `Today: ${todayN} session${todayN > 1 ? 's' : ''} done 💪` : 'About 50 minutes · then 10 minutes rest'}</p>
      </div>` : `<div class="card center"><div class="celebrate">🎓</div><h2>Alle 100 Geschichten geschafft!</h2><p>Keep your memory box warm with a review now and then.</p></div>`}
      <div class="card">
        <div class="spread"><h3>${lvl} · ${L.done} / ${L.total} Geschichten</h3><span class="muted small">${Math.round(L.done / L.total * 100)}%</span></div>
        <div class="segs">${L.chapters.map(f => `<i><b style="width:${f * 100}%"></b></i>`).join('')}</div>
        <p class="muted small" style="margin:10px 0 0">${eta}</p>
      </div>
      <div class="grid2">
        <div class="card" data-go="box" style="cursor:pointer"><h3>Wortkiste</h3><div class="big-num">${total}</div><div class="muted small">words · ${known} solid</div></div>
        <div class="card" ${due ? 'id="quick"' : ''} style="cursor:pointer"><h3>Heute fällig</h3><div class="big-num" style="color:${due ? 'var(--warm)' : 'var(--good)'}">${due}</div><div class="muted small">${due ? 'tap for a 5-min review' : 'all caught up ✓'}</div></div>
      </div>`;
    const b = document.getElementById('start'); if (b) b.onclick = () => startSession(s.n);
    const q = document.getElementById('quick'); if (q) q.onclick = () => go('session', 'quick');
  }
  function stepsBar(s, cur) {
    return `<div class="steps">${STEPS.map((st, i) => {
      const skip = s && s.review && st.id === 'words';
      return `<div class="${skip ? 'skip' : i < cur ? 'done' : i === cur ? 'now' : ''}"><i></i>${st.de}</div>`;
    }).join('')}</div>`;
  }

  // ---------- path ----------
  function path() {
    const nx = nextStory();
    let html = '<div class="gap"></div><h1>Mein Weg</h1><p class="muted">100 stories, 10 chapters. Every 10th story is a review. Tap a story to read it again or hear your recordings.</p>';
    for (let c = 0; c < 10; c++) {
      const ss = ST.slice(c * 10, c * 10 + 10), d = ss.filter(s => S.done[s.n]).length;
      html += `<div class="card"><div class="spread"><h3>Kapitel ${c + 1} · ${ss[0].l}</h3><span class="small ${d === 10 ? 'ok' : 'muted'}">${d === 10 ? '🏅 geschafft' : d + '/10'}</span></div>
        <div class="path">${ss.map(s => `<div class="dot ${S.done[s.n] ? 'done' : ''} ${nx && nx.n === s.n ? 'now' : ''} ${s.review ? 'rv' : ''}" data-go="story" data-arg="${s.n}" title="${esc(s.t)}">${s.n}</div>`).join('')}</div></div>`;
    }
    $app.innerHTML = html;
  }

  // ---------- story detail ----------
  async function story(n) {
    const s = byN[n], w = S.writing[n];
    $app.innerHTML = `<div class="gap"></div><button class="btn ghost" data-go="path">← Mein Weg</button>
      <div class="muted small">Geschichte ${s.n} · ${s.l}</div><h1>${esc(s.t)}</h1>
      <div class="card">${reader(s)}</div>
      ${w && (w.fixed || w.text) ? `<div class="card"><h3>Mein Text</h3><p style="white-space:pre-wrap">${esc(w.fixed || w.text)}</p></div>` : ''}
      <div class="card"><h3>Meine Aufnahmen</h3><div id="recs" class="muted small">…</div></div>
      <button class="btn big" id="again">↻ Diese Session nochmal machen</button>`;
    wireReader(s);
    document.getElementById('again').onclick = () => startSession(n);
    const rs = await recsFor(n).catch(() => []);
    document.getElementById('recs').innerHTML = rs.length ? rs.sort((a, b) => a.t - b.t).map(r => `<div class="small">${new Date(r.t).toLocaleString('de-DE')}</div><audio controls src="${URL.createObjectURL(r.blob)}"></audio>`).join('') : 'No recordings yet.';
  }

  // ---------- word box ----------
  function box() {
    const cs = Object.entries(S.cards), counts = [0, 0, 0, 0, 0, 0, 0];
    cs.forEach(([, c]) => counts[c.b]++);
    const max = Math.max(1, ...counts.slice(1));
    $app.innerHTML = `<div class="gap"></div><h1>Wortkiste</h1>
      <p class="muted">Every word moves one box to the right when you know it, and back to the start when you don't. The further right, the longer it waits before it comes back.</p>
      <div class="card"><div class="boxes">${counts.slice(1).map(c => `<div style="height:${8 + c / max * 92}%"><b>${c}</b></div>`).join('')}</div>
        <div class="boxlbl">${BOX_NAME.slice(1).map(b => `<span>${b}</span>`).join('')}</div></div>
      <input type="text" id="q" placeholder="Search a word (German or English)">
      <div class="card" id="wl" style="margin-top:12px"></div>`;
    const list = () => {
      const q = norm(document.getElementById('q').value);
      const rows = cs.map(([id, c]) => ({ id, c, d: cardData(id) })).filter(x => x.d && (!q || norm(x.d.de).includes(q) || norm(x.d.en).includes(q)))
        .sort((a, b) => b.d.n - a.d.n).slice(0, 200);
      document.getElementById('wl').innerHTML = rows.length ? rows.map(x => `<div class="wl"><span><b data-say="${esc(head(x.d.de))}" style="cursor:pointer">${deHtml(x.d.de)}</b><br><span class="muted small">${esc(x.d.en)}</span></span><span class="lv">${BOX_NAME[x.c.b]}<br>G${x.d.n}</span></div>`).join('') : '<p class="muted">No words yet. They arrive with your sessions.</p>';
    };
    document.getElementById('q').oninput = list; list();
  }

  // ---------- me / settings ----------
  function more() {
    const sessions = S.log.length, mins = S.log.reduce((a, l) => a + (l.min || 0), 0);
    const chapters = [...Array(10)].map((_, c) => ST.slice(c * 10, c * 10 + 10).every(s => S.done[s.n] && !S.done[s.n].skipped)).filter(Boolean).length;
    $app.innerHTML = `<div class="gap"></div><h1>Ich</h1>
      <div class="grid2">
        <div class="card"><h3>Sessions</h3><div class="big-num">${sessions}</div><div class="muted small">${Math.round(mins / 60)} hours learning</div></div>
        <div class="card"><h3>Streak</h3><div class="big-num">🔥 ${streak()}</div><div class="muted small">days in a row</div></div>
        <div class="card"><h3>Punkte</h3><div class="big-num">⭐ ${S.xp}</div></div>
        <div class="card"><h3>Kapitel</h3><div class="big-num">🏅 ${chapters}</div><div class="muted small">finished in the app</div></div>
      </div>
      <div class="card"><h3>Stimme</h3><p class="small muted">Voice: ${voice ? esc(voice.name) : 'no German voice found – install one in your system settings'}</p>
        <div class="row"><span class="small">Speed</span><input type="range" id="rate" min="0.6" max="1.2" step="0.05" value="${S.rate}" class="grow"><button class="btn" data-say="Hallo! Ich bin Mia. Ich wohne in Freiburg.">🔊 Test</button></div></div>
      <div class="card"><h3>Start story</h3><p class="small muted">Currently from story ${S.start || '–'}. Change it if you want to jump ahead.</p>
        <div class="row"><input type="number" id="st" min="1" max="100" value="${S.start || 1}" style="max-width:120px"><button class="btn" id="stb">Save</button></div></div>
      <div class="card"><h3>Sync phone ↔ computer</h3>
        <p class="small muted">Your progress is kept in a private note on your GitHub account, so every device shows the same words, stories and points. Recordings stay on the device where you made them.</p>
        <p class="small" id="syncst">${syncStatus()}</p>
        ${SY.token ? `<div class="row wrap"><button class="btn" id="syncnow">↻ Sync now</button><button class="btn ghost" id="syncoff">Disconnect</button></div>` : `
        <ol class="small" style="padding-left:20px;margin:0 0 10px">
          <li>Open <a href="https://github.com/settings/tokens/new?scopes=gist&description=Wortgarten" target="_blank" rel="noopener">this GitHub page</a> (signed in).</li>
          <li>Expiration: <b>No expiration</b>. Only <b>gist</b> is ticked. Click <b>Generate token</b>.</li>
          <li>Copy the token (starts with <code>ghp_</code>) and paste it here. Do the same on your other device.</li>
        </ol>
        <div class="row"><input type="text" id="tok" placeholder="ghp_…" autocomplete="off" spellcheck="false"><button class="btn primary" id="tokgo">Connect</button></div>`}
      </div>
      <div class="card"><h3>Backup file</h3><p class="small muted">Extra safety: save all your progress as a file.</p>
        <div class="row wrap"><button class="btn" id="exp">⬇ Save backup</button><label class="btn">⬆ Load backup<input type="file" id="imp" accept=".json" hidden></label></div></div>
      <button class="btn ghost" id="reset">Reset everything</button>`;
    const tg = document.getElementById('tokgo');
    if (tg) tg.onclick = async () => { const t = document.getElementById('tok').value.trim(); if (t.length < 20) return toast('Paste the whole token'); SY = { token: t }; saveSY(); go('more'); await sync(true); if (syncErr) { SY = {}; saveSY(); toast(syncErr); go('more'); } };
    const sn = document.getElementById('syncnow'); if (sn) sn.onclick = () => sync(true);
    const so = document.getElementById('syncoff'); if (so) so.onclick = () => { if (confirm('Stop syncing on this device? Your progress stays here and on GitHub.')) { SY = {}; saveSY(); go('more'); } };
    document.getElementById('rate').oninput = e => { S.rate = +e.target.value; save(); };
    document.getElementById('stb').onclick = () => {
      const n = Math.max(1, Math.min(100, +document.getElementById('st').value || 1)); S.start = n;
      ST.forEach(s => { if (s.n < n && !S.done[s.n]) S.done[s.n] = { date: today(), skipped: true }; if (s.n >= n && S.done[s.n] && S.done[s.n].skipped) delete S.done[s.n]; });
      save(); toast('Saved'); };
    document.getElementById('exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = `wortgarten-backup-${today()}.json`; a.click(); };
    document.getElementById('imp').onchange = async e => { try { const s = JSON.parse(await e.target.files[0].text()); if (!s.v) throw 0; S = Object.assign(fresh(), s); save(); toast('Backup loaded'); go('home'); } catch (err) { toast('That file is not a backup'); } };
    document.getElementById('reset').onclick = () => { if (confirm('Delete all progress on this device?')) { S = fresh(); save(); go('home'); } };
  }

  // ---------- session ----------
  function startSession(n) {
    if (!S.active || S.active.n !== n) {
      const s = byN[n];
      S.active = { n, step: 0, ms: 0, xp: 0, st: {} };
      if (s.review) S.active.skipWords = true;
    }
    save(); go('session');
  }
  function session(arg) {
    if (arg === 'quick') return quickReview();
    const a = S.active; if (!a) return go('home');
    const s = byN[a.n];
    if (a.step === 1 && a.skipWords) a.step = 2;
    let t0 = Date.now();
    const top = `<div class="top"><div class="spread"><button class="btn ghost" id="pause" style="padding-left:0">✕ Pause</button>
      <span class="small muted">Geschichte ${s.n} · <b id="clock">${clock(a.ms)}</b> / 50:00</span></div>${stepsBar(s, a.step)}</div>`;
    $app.innerHTML = top + '<div id="step"></div>';
    document.getElementById('pause').onclick = () => { a.ms += Date.now() - t0; save(); go('home'); };
    timerInt = setInterval(() => { const el = document.getElementById('clock'); if (el) el.textContent = clock(a.ms + Date.now() - t0); }, 1000);
    const next = () => { a.ms += Date.now() - t0; a.step++; save(); if (a.step >= STEPS.length) finish(); else go('session'); };
    const stepEl = document.getElementById('step');
    ({ review: stepReview, words: stepWords, read: stepRead, write: stepWrite, speak: stepSpeak })[STEPS[a.step].id](stepEl, s, a, next);
  }
  const clock = ms => { const m = Math.floor(ms / 60000), sec = Math.floor(ms / 1000) % 60; return `${m}:${String(sec).padStart(2, '0')}`; };

  // --- flash card (shared by review + new words) ---
  function flash(el, queue, opts, onDone) {
    // queue: card ids. opts.requeue: wrong ones come back. opts.onGrade(id, ok)
    let i = 0, right = 0; const total = queue.length;
    const show = () => {
      if (i >= queue.length) return onDone(right);
      const id = queue[i], d = cardData(id), isNoun = !!gender(d.de);
      el.innerHTML = `<div class="card center">
        <div class="muted small">${Math.min(i + 1, total)} / ${total}${i >= total ? ' · nochmal' : ''}</div>
        <div class="word" style="font-size:26px">${esc(d.en)}</div>
        <p class="muted small">${isNoun ? 'Noun: with der / die / das' : d.t === 'c' ? 'Phrase' : '&nbsp;'}</p>
        <input type="text" id="ans" placeholder="Type it, or just think of it" autocomplete="off" autocapitalize="off" spellcheck="false">
        <div class="gap"></div><button class="btn primary big" id="show">Zeigen</button></div>`;
      const inp = document.getElementById('ans'); inp.focus();
      const reveal = () => {
        const typed = norm(inp.value), vs = variants(d.de).map(norm);
        let verdict = '';
        if (typed) {
          if (vs.includes(typed)) verdict = '<div class="ok">✓ Richtig!</div>';
          else if (vs.some(v => v.replace(/^(der|die|das) /, '') === typed.replace(/^(der|die|das) /, ''))) verdict = `<div class="no">Almost: the article is <span class="${gender(d.de)}">${gender(d.de)}</span></div>`;
          else verdict = `<div class="no">You wrote: ${esc(inp.value)}</div>`;
        }
        const autoOk = typed && vs.includes(typed);
        el.innerHTML = `<div class="card center">
          <div class="muted small">${esc(d.en)}</div>
          <div class="word">${deHtml(d.de)} <button class="btn icon ghost" data-say="${esc(head(d.de))}">🔊</button></div>
          ${verdict}
          ${d.ex ? `<p class="ex" data-say="${esc(d.ex)}" style="cursor:pointer">„${esc(d.ex)}“ 🔊</p>` : ''}
          <div class="grid2"><button class="btn bad big" id="no">✗ Nochmal</button><button class="btn good big" id="yes">✓ Gewusst</button></div>
          <p class="muted small" style="margin:8px 0 0">Enter = ${typed && !autoOk ? 'Nochmal' : 'Gewusst'}</p></div>`;
        say(head(d.de));
        const act = ok => { document.onkeydown = null; opts.onGrade(id, ok); if (ok) right++; else if (opts.requeue) queue.push(id); i++; save(); show(); };
        document.getElementById('yes').onclick = () => act(true);
        document.getElementById('no').onclick = () => act(false);
        document.onkeydown = e => { if (e.key === 'Enter') act(!(typed && !autoOk)); };
      };
      document.getElementById('show').onclick = reveal;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); reveal(); } };
    };
    show();
  }

  function stepReview(el, s, a, next) {
    if (!a.st.reviewQ) { a.st.reviewQ = dueIds().slice(0, s.review ? 40 : REVIEW_CAP); save(); }
    const q = a.st.reviewQ.filter(id => S.cards[id] && S.cards[id].d <= Date.now());
    if (!q.length) {
      el.innerHTML = `<div class="card center"><div class="celebrate">✨</div><h2>Nothing to review right now</h2><p class="muted">Your memory box is up to date. On to the new words.</p><button class="btn primary big" id="nx">Weiter</button></div>`;
      document.getElementById('nx').onclick = next; return;
    }
    el.innerHTML = '';
    const intro = document.createElement('div');
    intro.innerHTML = `<p class="muted small">Words from earlier stories. Say the German out loud, then check.${dueIds().length > q.length ? ` (${dueIds().length - q.length} more wait for next time, no stress.)` : ''}</p>`;
    el.before(intro);
    flash(el, q.slice(), { onGrade: (id, ok) => { grade(id, ok); if (ok) addXP(XP.review); } }, right => {
      intro.remove(); delete a.st.reviewQ;
      el.innerHTML = `<div class="card center"><div class="celebrate">💪</div><h2>${right} / ${q.length} gewusst</h2><p class="muted">The ones you missed go back to box 1 and come again soon.</p><button class="btn primary big" id="nx">Weiter: Neue Wörter</button></div>`;
      document.getElementById('nx').onclick = next;
    });
  }

  function stepWords(el, s, a, next) {
    const all = items(s).map(([t, i]) => cardId(s.n, t, i));
    a.st.learn = a.st.learn || 0;
    const learnOne = () => {
      if (a.st.learn >= all.length) return check();
      const id = all[a.st.learn], d = cardData(id);
      el.innerHTML = `<p class="muted small">Look, listen, say it out loud twice. ${a.st.learn + 1} / ${all.length}${d.t === 'x' ? ' · extra word from the A1/A2 list' : ''}</p>
        <div class="card center">
          <div class="word" style="font-size:34px">${deHtml(d.de)}</div>
          <button class="btn" data-say="${esc(head(d.de))}">🔊 Anhören</button>
          <p style="font-size:20px;margin:14px 0 6px">${esc(d.en)}</p>
          ${d.ex ? `<p class="ex muted" data-say="${esc(d.ex)}" style="cursor:pointer">„${esc(d.ex)}“ 🔊</p>` : ''}
        </div>
        <div class="grid2"><button class="btn big" id="known">Kenne ich schon</button><button class="btn primary big" id="nx">Weiter →</button></div>`;
      say(head(d.de)).then(() => d.ex && setTimeout(() => say(d.ex, { queue: true }), 300));
      const go2 = known => { if (known) { addCard(id, 3); } a.st.learn++; save(); learnOne(); };
      document.getElementById('nx').onclick = () => go2(false);
      document.getElementById('known').onclick = () => go2(true);
      document.onkeydown = e => { if (e.key === 'Enter') { document.onkeydown = null; go2(false); } };
    };
    const check = () => {
      document.onkeydown = null;
      const q = all.filter(id => !S.cards[id]);
      if (!q.length) return finishWords();
      el.innerHTML = '';
      const intro = document.createElement('div');
      intro.innerHTML = '<p class="muted small">Now from memory: English → German. Missed words come back at the end.</p>';
      el.before(intro);
      flash(el, q.slice(), { requeue: true, onGrade: (id, ok) => { if (ok && !S.cards[id]) { addCard(id, 1); addXP(XP.learn); } } }, () => { intro.remove(); finishWords(); });
    };
    const finishWords = () => {
      el.innerHTML = `<div class="card center"><div class="celebrate">📦</div><h2>${all.length} Wörter in der Wortkiste</h2><p class="muted">They come back tomorrow, then in 3 days, a week, two weeks… until they stay.</p><button class="btn primary big" id="nx">Weiter: Lesen & Hören</button></div>`;
      document.getElementById('nx').onclick = next;
    };
    learnOne();
  }

  function reader(s) {
    return `<div style="margin-bottom:10px"><button class="btn primary" id="play">🔊 Ganze Geschichte anhören</button></div>
      <div id="paras">${s.p.map((p, i) => `<div class="para" data-i="${i}">${p.length > 1 ? `<span class="sp">${esc(p[0])}:</span> ${esc(p[1])}` : esc(p[0])}</div>`).join('')}</div>
      <p class="muted small">Tip: tap a line to hear just that line.</p>`;
  }
  function wireReader(s) {
    const paras = [...document.querySelectorAll('.para')];
    let playing = false;
    const mark = i => paras.forEach((p, k) => p.classList.toggle('on', k === i));
    const btn = document.getElementById('play');
    const setBtn = on => { btn.textContent = on ? '■ Stop' : '🔊 Ganze Geschichte anhören'; btn.classList.toggle('primary', !on); };
    const stop = () => { playing = false; stopSay(); mark(-1); setBtn(false); };
    const playFrom = async i => {
      playing = true; setBtn(true);
      for (let k = i; k < s.p.length && playing; k++) { mark(k); paras[k].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); await say(s.p[k][s.p[k].length - 1], { queue: k > i }); }
      if (playing) stop();
    };
    paras.forEach((p, i) => (p.onclick = () => { stop(); mark(i); say(s.p[i][s.p[i].length - 1]).then(() => mark(-1)); }));
    btn.onclick = () => (playing ? stop() : (stopSay(), playFrom(0)));
  }

  function stepRead(el, s, a, next) {
    const g = s.g;
    el.innerHTML = `<div class="hint">1) Listen to the whole story once with the text. 2) Read it again aloud, especially the dialogues. 3) Answer the questions out loud, then check.</div>
      <h2>${esc(s.t)}</h2>
      <div class="card">${reader(s)}</div>
      ${g[0] ? `<div class="card"><h3>Grammatik · ${esc(g[0])}</h3>${g[1].map(l => `<p class="small">${esc(l)}</p>`).join('')}</div>` : ''}
      <div class="card"><h3>${s.q.length > 5 ? 'Quiz' : 'Fragen'}</h3>${s.q.map((q, i) => `<div class="qa"><b>${i + 1}.</b> ${esc(q)} ${i === s.q.length - 1 && /Und du/.test(q) ? '<span class="chip plain small">you write about this next</span>' : ''}
        <div><button class="btn ghost small" data-ans="${i}" style="padding-left:0">Antwort zeigen</button></div><div class="ans" id="ans${i}" hidden>${esc(s.a[i] || '')}</div></div>`).join('')}</div>
      <button class="btn primary big" id="nx">✓ Gelesen · weiter zum Schreiben</button>`;
    wireReader(s);
    el.querySelectorAll('[data-ans]').forEach(b => (b.onclick = () => { document.getElementById('ans' + b.dataset.ans).hidden = false; b.remove(); }));
    document.getElementById('nx').onclick = () => { stopSay(); addXP(XP.read); next(); };
  }

  function stepWrite(el, s, a, next) {
    const W = S.writing[s.n] = S.writing[s.n] || { sent: ['', '', ''], pick: null, text: '', fixed: '' };
    const lastQ = s.q[s.q.length - 1] || '';
    const exam = s.exam;
    const prompt = exam ? exam.task : lastQ.replace(/^Und du\?\s*/, '');
    const goal = exam ? `${exam.words}+ words` : s.l === 'A1' ? '4–6 sentences' : '6–8 sentences';
    const newWords = items(s).map(([t, i, r]) => r[0]);
    if (!W.pick && !exam) { const w = s.w.map(r => r[0]); W.pick = [0, 1, 2].map(k => w[Math.floor((k + 0.5) * w.length / 3)]); }
    el.innerHTML = `
      ${exam ? '' : `<div class="card"><h3>A · 3 Sätze</h3><p class="small muted">Write one short sentence with each word. About you, not about Mia.</p>
        ${W.pick.map((w, k) => `<div style="margin:10px 0"><div class="spread"><b>${deHtml(w)}</b><span id="ok${k}"></span></div><input type="text" class="sent" data-k="${k}" value="${esc(W.sent[k])}" placeholder="Ich …"></div>`).join('')}</div>`}
      <div class="card"><h3>${exam ? 'Prüfungsaufgabe · Schreiben' : 'B · Mein Text'}</h3>
        <p style="font-size:19px"><b>${esc(prompt)}</b></p>
        ${exam ? `<ul>${exam.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul><p class="small muted">${esc(exam.en)} Like the real ${s.l} exam: cover all 3 points.</p>` : ''}
        <p class="small muted">Goal: ${goal}. This text becomes your speaking text, so write about yourself, in simple sentences you can say.</p>
        <textarea id="txt" placeholder="Ich …">${esc(W.text)}</textarea>
        <div class="spread small muted"><span id="cnt"></span><span id="used"></span></div>
        <div class="gap"></div>
        <div class="check"><input type="checkbox"><span>The verb is in position 2 (<i>Heute <b>gehe</b> ich …</i>)</span></div>
        <div class="check"><input type="checkbox"><span>All nouns start with a capital letter</span></div>
        <div class="check"><input type="checkbox"><span>I checked der / die / das and the endings (den, dem …)</span></div>
      </div>
      <div class="card"><h3>C · Korrektur</h3>
        <p class="small muted">Get your text corrected, then paste the correct version below. You will learn to say that version by heart.</p>
        <button class="btn" id="claude">✨ Copy & check with Claude</button>
        <div class="gap"></div>
        <textarea id="fix" placeholder="Paste the corrected text here (optional)" style="min-height:110px">${esc(W.fixed)}</textarea>
      </div>
      <button class="btn primary big" id="nx">Weiter: Sprechen</button>`;
    const txt = document.getElementById('txt');
    const upd = () => {
      W.text = txt.value; W.t = Date.now();
      const words = (txt.value.match(/[A-Za-zÄÖÜäöüß]+/g) || []).length, sents = (txt.value.match(/[.!?](\s|$)/g) || []).length;
      const low = txt.value.toLowerCase(), used = newWords.filter(w => { const st = stemOf(w); return st.length > 2 && low.includes(st); });
      document.getElementById('cnt').textContent = `${words} words · ${sents} sentences`;
      document.getElementById('used').innerHTML = !newWords.length ? '' : used.length ? `<span class="ok">${used.length} new word${used.length > 1 ? 's' : ''} used ✓</span>` : 'Try to use 2 new words';
      el.querySelectorAll('.sent').forEach(inp => { const k = +inp.dataset.k; W.sent[k] = inp.value; const st = stemOf(W.pick[k]); document.getElementById('ok' + k).innerHTML = inp.value.trim() ? (inp.value.toLowerCase().includes(st) ? '<span class="ok">✓</span>' : '<span class="no small">word missing</span>') : ''; });
      save();
    };
    txt.oninput = upd; el.querySelectorAll('.sent').forEach(i => (i.oninput = upd)); upd();
    document.getElementById('fix').oninput = e => { W.fixed = e.target.value; W.t = Date.now(); save(); };
    document.getElementById('claude').onclick = async () => {
      const all = [...W.sent.filter(Boolean).map((x, k) => `${k + 1}. ${x}`), W.sent.some(Boolean) ? '' : null, W.text].filter(x => x !== null).join('\n');
      const p = `I am learning German (level ${s.l}). Please correct my text.\n1) First give me ONLY the corrected text of the last paragraph, nothing else, so I can copy it.\n2) Then list my mistakes in simple English (max 5), with the rule.\nKeep my words and ideas; only fix mistakes. Task: ${prompt}\n\nMy text:\n${all}`;
      try { await navigator.clipboard.writeText(p); toast('Copied! Paste it in Claude'); } catch (e) { toast('Copy did not work – select the text manually'); }
      window.open('https://claude.ai/new', '_blank');
    };
    document.getElementById('nx').onclick = () => {
      if ((W.text || '').trim().split(/\s+/).length < 8 && !confirm('Your text is very short. Go on anyway?')) return;
      addXP(XP.write); save(); next();
    };
  }

  function stepSpeak(el, s, a, next) {
    const W = S.writing[s.n] || {};
    let text = (W.fixed || W.text || '').trim();
    if (text.split(/\s+/).length < 5) { const ex = (s.a[s.a.length - 1] || '').replace(/^Example:\s*/, ''); text = ex; }
    let round = a.st.round || 0;
    const tokens = text.split(/(\s+)/);
    const sentStart = new Set(); let idx = 0, start = true;
    tokens.forEach((t, k) => { if (/\S/.test(t)) { if (start) sentStart.add(k); start = /[.!?:]$/.test(t); idx++; } });
    const ROUNDS = ['1 · Mitlesen', '2 · ⅓ weg', '3 · ⅔ weg', '4 · Frei'];
    const shown = () => { let w = 0; return tokens.map((t, k) => {
      if (!/\S/.test(t)) return t;
      const i = w++, hide = round === 1 ? i % 3 === 1 : round === 2 ? i % 3 !== 0 : round === 3 ? !sentStart.has(k) : false;
      return hide ? `<span class="hid" data-f="${esc(t[0])}">${esc(t)}</span>` : esc(t);
    }).join(''); };
    const draw = () => {
      el.innerHTML = `<div class="hint">${['Listen, then read it aloud with the voice.', 'Some words are hidden. Say the whole text. Tap a gap if you are stuck.', 'Most words are hidden. Say it from memory.', 'Only the first word of each sentence. Tell it, don’t read it. Then record.'][round]}</div>
        <div class="tabs">${ROUNDS.map((r, i) => `<button class="btn ${i === round ? 'on' : ''}" data-r="${i}">${r}</button>`).join('')}</div>
        <div class="card"><div class="speech">${shown()}</div><div class="gap"></div>
          <div class="row"><button class="btn" id="listen">🔊 Anhören</button><button class="btn ghost" id="slow">🐢 langsam</button></div></div>
        ${round < 3 ? `<button class="btn primary big" id="nr">Nächste Runde →</button>` : `
        <div class="card center"><h3>Aufnahme</h3><p class="small muted">Say your text without reading. Then listen to yourself.</p>
          <button class="rec" id="rec">● REC</button><div id="recout"></div></div>`}
        <div class="gap"></div>
        <button class="btn ${round === 3 ? 'primary' : ''} big" id="fin">✓ Session beenden</button>`;
      el.querySelectorAll('[data-r]').forEach(b => (b.onclick = () => { round = a.st.round = +b.dataset.r; save(); draw(); }));
      el.querySelectorAll('.hid').forEach(h => (h.onclick = () => h.classList.add('show')));
      document.getElementById('listen').onclick = () => say(text);
      document.getElementById('slow').onclick = () => say(text, { rate: 0.7 });
      const nr = document.getElementById('nr'); if (nr) nr.onclick = () => { round = a.st.round = round + 1; save(); draw(); window.scrollTo(0, 0); };
      const rb = document.getElementById('rec'); if (rb) wireRec(rb, s, text);
      document.getElementById('fin').onclick = () => { if (!a.st.recorded && !confirm('You have not recorded yourself yet. Finish anyway?')) return; addXP(a.st.recorded ? XP.speak : 5); next(); };
      if (round === 0) say(text);
    };
    draw();
  }

  function wireRec(btn, s, text) {
    const out = document.getElementById('recout');
    if (!navigator.mediaDevices || !window.MediaRecorder) { out.innerHTML = '<p class="no small">This browser cannot record. Open the app in Chrome or Safari.</p>'; btn.disabled = true; return; }
    let mr = null, chunks = [], rec = null, heard = '';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    btn.onclick = async () => {
      if (mr && mr.state === 'recording') { mr.stop(); if (rec) try { rec.stop(); } catch (e) {} return; }
      stopSay();
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { out.innerHTML = '<p class="no small">The microphone is blocked. Allow it in the browser’s address bar.</p>'; return; }
      chunks = []; heard = '';
      mr = new MediaRecorder(stream); mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); btn.classList.remove('on'); btn.textContent = '● REC';
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        await putRec({ id: `${s.n}-${Date.now()}`, n: s.n, t: Date.now(), blob }).catch(() => {});
        S.active.st.recorded = true; save();
        let score = '';
        if (heard) {
          const want = norm(text).split(' '), got = new Set(norm(heard).split(' '));
          const pct = Math.round(want.filter(w => got.has(w)).length / want.length * 100);
          score = `<p><b>${pct}%</b> of your words were understood ${pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '– try once more, a bit slower'}</p><p class="small muted">Heard: „${esc(heard)}“</p>`;
        }
        out.innerHTML = `<audio controls src="${URL.createObjectURL(blob)}"></audio>${score}<p class="small muted">Saved. You can listen to all your recordings in <b>Mein Weg</b> and hear yourself improve.</p>`;
      };
      mr.start(); btn.classList.add('on'); btn.textContent = '■ Stop';
      if (SR) { try { rec = new SR(); rec.lang = 'de-DE'; rec.continuous = true; rec.interimResults = false; rec.onresult = e => { heard = [...e.results].map(r => r[0].transcript).join(' '); }; rec.onerror = () => {}; rec.start(); } catch (e) { rec = null; } }
    };
  }

  function finish() {
    const a = S.active, s = byN[a.n], d = today();
    addXP(XP.session);
    const first = !S.done[a.n] || S.done[a.n].skipped;
    S.done[a.n] = { date: d };
    S.days[d] = (S.days[d] || 0) + 1;
    S.log.push({ n: a.n, date: d, min: Math.round(a.ms / 60000), xp: a.xp });
    S.lastDone = { n: a.n, xp: a.xp, min: Math.round(a.ms / 60000), first };
    S.active = null; save(); go('done');
  }
  function doneView() {
    const L = S.lastDone || {}, s = byN[L.n], nx = nextStory();
    const chap = s ? Math.ceil(s.n / 10) : 0, chapDone = s ? ST.slice((chap - 1) * 10, chap * 10).every(x => S.done[x.n]) : false;
    $app.innerHTML = `<div class="gap"></div><div class="celebrate">${chapDone && s.n % 10 === 0 ? '🏅' : '🎉'}</div>
      <h1 class="center">Geschichte ${L.n} geschafft!</h1>
      ${chapDone && s.n % 10 === 0 ? `<p class="center"><span class="chip warm">Kapitel ${chap} komplett!</span></p>` : ''}
      <div class="grid2"><div class="card center"><div class="big-num">+${L.xp || 0}</div><div class="muted small">Punkte</div></div><div class="card center"><div class="big-num">🔥 ${streak()}</div><div class="muted small">Tage in Folge</div></div></div>
      <div class="card center"><h3>Pause</h3><div class="big-num" id="brk">10:00</div><p class="muted small">Stand up, drink water, look out of the window.</p>
        <button class="btn" id="bstart">Start break</button></div>
      ${nx ? `<button class="btn primary big" id="nx">▶ Nächste Session: ${esc(nx.t)}</button>` : ''}
      <div class="gap"></div><button class="btn big" data-go="home">Fertig für jetzt</button>`;
    document.getElementById('bstart').onclick = e => {
      e.target.remove(); let left = 600;
      timerInt = setInterval(() => { left--; const el = document.getElementById('brk'); if (!el) return clearInterval(timerInt); el.textContent = clock(left * 1000); if (left <= 0) { clearInterval(timerInt); el.textContent = 'Los! 💪'; try { navigator.vibrate && navigator.vibrate(400); } catch (x) {} } }, 1000);
    };
    const b = document.getElementById('nx'); if (b) b.onclick = () => startSession(nx.n);
  }

  function quickReview() {
    const q = dueIds().slice(0, 20);
    $app.innerHTML = `<div class="top"><div class="spread"><button class="btn ghost" data-go="home" style="padding-left:0">✕ Close</button><span class="small muted">Quick review</span></div></div><div id="step"></div>`;
    const el = document.getElementById('step');
    if (!q.length) { el.innerHTML = '<div class="card center"><h2>All caught up ✓</h2></div>'; return; }
    flash(el, q, { onGrade: (id, ok) => { grade(id, ok); if (ok) addXP(XP.review); } }, right => {
      save(); el.innerHTML = `<div class="card center"><div class="celebrate">💪</div><h2>${right} / ${q.length} gewusst</h2><button class="btn primary big" data-go="home">Zurück</button></div>`;
    });
  }

  // ---------- boot ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
  sync();
})();
