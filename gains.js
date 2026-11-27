/* gains.js — openCOACH training module (formerly openGAINS v8). State is persisted by Shell.
   Weights are stored in lb; fw()/fromDisp() convert at the edges for kg users. */
(function () {
  'use strict';
  const C = window.GCore;
  const Shell = window.Shell;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // weight display: stored lb -> user's unit (kg shown to 0.1)
  const fw = (x) => (x === '' || x == null) ? '' : String(Shell.unit() === 'kg' ? Math.round(Shell.toDisp(x) * 10) / 10 : Math.round(x * 100) / 100);
  const fromDisp = (v) => { const n = parseFloat(v); return isNaN(n) ? '' : Math.round(Shell.fromDisp(n) * 100) / 100; };
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? '' : n; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const PALETTE = ['#9d86d1', '#c48cb3', '#7c9bc4', '#6bbf9b', '#d9b464', '#9e9db0', '#d97a82', '#6bb0b8', '#b8a8e0', '#b59d8a'];

  const ICONS = {
    train: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
    meso: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2.5v3M16 2.5v3M3 9.5h18M8 14h3M13 14h3M8 17.5h5"/></svg>',
    prog: '<svg viewBox="0 0 24 24"><path d="M4 19h16M5 15l4.5-4.5 3.5 3 6-7"/><path d="M15.5 6.5H19V10"/></svg>',
    data: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"/><path d="M4.5 12v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6"/></svg>',
    swap: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l4 4-4 4"/><path d="M20 7H8"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h12"/></svg>',
    more: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
    fire: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-3.9 0-7-2.7-7-6.5 0-3 2-4.9 3.5-6.5.3 1.6 1.2 2.6 2.3 3C10.4 8 12 5 15 3c-.4 2.6.6 4.4 2 6 1.2 1.4 2 3 2 5.3C19 18.2 15.9 21 12 21z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  };
  const brandBar = (right) => Shell.topbar(right);

  // ---------- state ----------
  function fresh() {
    return { v: 1, settings: { unit: 'lb', trigger: 'exceed', dropBelow: false, rest: 120, warm: 'std' }, exercises: C.seedExercises(), mesos: [], activeMesoId: null, sessions: [], active: null, lastBackup: null,
      seedV: C.SEED_V, lbStored: true };
  }
  /** Normalize any stored or restored state to the current schema. */
  function migrate(j) {
    const m = Object.assign(fresh(), j);
    m.settings = Object.assign(fresh().settings, j.settings || {});
    // openGAINS (pre-openCOACH) kept a bodyweight list; Shell moves it into the shared weigh-ins
    m._legacyBW = Array.isArray(j.bw) && j.bw.length ? j.bw : null; delete m.bw;
    // openGAINS stored weights in the display unit; openCOACH stores lb
    if (!j.lbStored) {
      const K = 2.20462, cv = (w) => (w === '' || w == null) ? w : Math.round(+w * K * 100) / 100;
      if (j.settings && j.settings.unit === 'kg') {
        m.sessions.forEach(s => s.items.forEach(it => it.sets.forEach(st => { st.w = cv(st.w); })));
        if (m.active) m.active.items.forEach(it => it.sets.forEach(st => { st.w = cv(st.w); }));
        m.exercises.forEach(e => { e.inc = cv(e.inc); });
        if (m._legacyBW) m._legacyBW = m._legacyBW.map(e => ({ t: e.t, w: cv(e.w) }));
      }
      m.lbStored = true;
    }
    delete m.tutorialSeen;
    (m.exercises || []).forEach(e => { if (!e.type) e.type = C.inferType(e.name); if (!e.load) e.load = C.inferLoad(e.name, e.type); });
    // library additions from later builds, merged once so deleting one later sticks
    const have = new Set(m.exercises.map(e => e.name)), seeds = C.seedExercises();
    for (let v = (j.seedV || 1) + 1; v <= C.SEED_V; v++) (C.SEED_ADDED[v] || []).forEach(n => { const e = seeds.find(x => x.name === n); if (e && !have.has(n)) m.exercises.push(e); });
    m.seedV = C.SEED_V;
    return m;
  }
  function load(j) {
    try { if (j && j.v) return migrate(j); } catch (e) { console.error(e); }
    return fresh();
  }
  let S = load(Shell.part('gains'));
  function save() { Shell.save(); }
  const ui = { tab: 'train', wiz: null, draft: null, modal: null, scope: 'meso', pf: 'all', pw: null, exSel: '', openSess: null, histAll: false, tipHidden: false };
  let EX = {}; function reindex() { EX = Object.fromEntries(S.exercises.map(e => [e.id, e])); } reindex();
  const activeMeso = () => S.mesos.find(m => m.id === S.activeMesoId && !m.ended) || null;
  const prioOf = (m, muscle) => (m && m.prio && m.prio[muscle]) || 'N';
  // ---- weekly schedule: 'fixed' pins each training day to a weekday (day.dow 0=Sun..6=Sat); anything else is asynchronous
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const isFixed = (m) => !!(m && m.sched === 'fixed');
  const dkOf = (t) => window.MCore.dateKey(t);
  const dowOf = (dk) => new Date(dk + 'T12:00:00').getDay();
  /** Training-day facts for a date: scheduled days (fixed mode), whether a workout was logged/started, sessions per week. */
  function dayInfo(dk) {
    dk = dk || dkOf(Date.now());
    const m = activeMeso(), fixed = isFixed(m);
    const scheduled = fixed ? m.days.filter(d => d.dow === dowOf(dk)) : [];
    const trained = S.sessions.some(s => dkOf(s.start) === dk) || !!(S.active && dkOf(S.active.start) === dk);
    const perWeek = !m ? null : fixed ? new Set(m.days.map(d => d.dow).filter(x => Number.isInteger(x))).size || m.days.length : m.days.length;
    return { hasMeso: !!m, fixed, scheduled, trained, perWeek };
  }
  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }

  // ---------- helpers ----------
  const newest = () => [...S.sessions].sort((a, b) => b.start - a.start);
  const hasDone = (i) => i.sets.some(x => x.done);
  /** Last time this movement was done in THIS workout (same meso + same day slot). Drives up/hold/down. */
  function sameDayPrev(exId, mesoId, dayId, pid) {
    for (const s of newest()) {
      if (s.mesoId !== mesoId || s.dayId !== dayId) continue;
      const it = (pid && s.items.find(i => i.exId === exId && i.pid === pid && hasDone(i))) || s.items.find(i => i.exId === exId && hasDone(i));
      if (it) return { it, s };
    }
    return null;
  }
  /** Most recent instance of the movement anywhere (for the "Last:" line when this workout has none). */
  function lastAny(exId) {
    for (const s of newest()) { const it = s.items.find(i => i.exId === exId && hasDone(i)); if (it) return { it, s }; }
    return null;
  }
  /** Newest-first, one entry per session the movement appears in, any workout / any meso. */
  function instances(exId, max) {
    const out = [];
    for (const s of newest()) {
      const sets = s.items.filter(i => i.exId === exId).flatMap(i => i.sets.filter(x => x.done));
      if (sets.length) out.push({ sets, s }); if (out.length >= max) break;
    }
    return out;
  }
  const bwAt = (t) => Shell.bwAt(t);
  const curBW = () => Shell.bwAt(Date.now());
  const loadOf = (ex) => (ex && ex.load) || 'ext';
  const TLBL = { W: 'W', D: 'D', M: 'M', F: 'F' };
  const setStr = (sets) => sets.filter(x => x.done && x.t !== 'W').map(x => (x.t ? x.t + ' ' : '') + fw(x.w) + '×' + x.r + (Number.isFinite(x.rir) ? ' (' + x.rir + ')' : '')).join(', ');
  const restOf = (ex) => (ex && Number.isFinite(ex.rest)) ? ex.rest : S.settings.rest;
  const mmss = (sec) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  function lastMeso() { return [...S.mesos].sort((x, y) => y.start - x.start)[0] || null; }
  function lastRanges() {
    const out = {}; const m = lastMeso(); if (!m) return out;
    m.days.forEach(d => d.items.forEach(it => { out[it.exId] = { min: it.min, max: it.max }; }));
    return out;
  }
  function buildItem(m, week, exId, tmpl, dayId) {
    const ex = EX[exId], n = C.plannedSets(tmpl.sets, prioOf(m, ex.muscle), week, m);
    const L = loadOf(ex), bw = curBW();
    const prev = sameDayPrev(exId, m.id, dayId, tmpl.pid);
    // recommendation runs on load actually moved (bodyweight at the time of each session), then converts back
    const hist = instances(exId, 50).map(x => ({ sets: x.sets.map(st => Object.assign({}, st, { w: C.effW(st.w, L, bwAt(x.s.start)) })) }));
    let rec = (L === 'ext' || bw > 0) ? C.recommend(hist, { min: tmpl.min, max: tmpl.max }, { rir: 2, inc: ex.inc }) : null;
    if (rec && L !== 'ext') rec = Object.assign({}, rec, { w: C.fromEff(rec.w, L, bw, ex.inc) });
    const sg = C.suggest({ min: tmpl.min, max: tmpl.max }, prev && prev.it.sets, { n, rir: 2, deload: C.isDeload(m, week), trigger: S.settings.trigger, dropBelow: S.settings.dropBelow, inc: ex.inc, rec, load: L, bw });
    const other = prev ? null : lastAny(exId);
    // carry set types forward by position (e.g. last set as a drop set); drop/myo sets keep last week's numbers
    const pw = prev ? prev.it.sets.filter(x => x.done && x.t !== 'W') : [];
    return { exId, pid: tmpl.pid || null, min: tmpl.min, max: tmpl.max, mode: sg.mode, from: sg.from, to: sg.to, base: tmpl.sets, note: '',
      rec: rec ? { w: rec.w, reps: rec.reps, n: rec.n } : null,
      prev: prev ? setStr(prev.it.sets) : other ? setStr(other.it.sets) : '',
      prevFrom: !prev && other ? other.s.name : '',
      sets: sg.sets.map((st, j) => {
        const t = (pw[j] && pw[j].t) || '', keep = (t === 'D' || t === 'M') && sg.mode !== 'deload';
        return { w: keep ? pw[j].w : st.w, r: keep ? pw[j].r : st.r, rir: '', done: false, t };
      }) };
  }
  /** Give each plan slot a stable id so a session item can find its slot even after swaps/reorders. */
  function ensurePids(m) { let ch = false; m.days.forEach(d => d.items.forEach(it => { if (!it.pid) { it.pid = C.uid(); ch = true; } })); return ch; }
  function shareOrDownload(name, text, mime) {
    if (window.Native) { window.Native.shareFile(name, text); S.lastBackup = Date.now(); save(); return; }
    const file = new File([text], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(() => { });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    }
    S.lastBackup = Date.now(); save();
  }
  const dstr = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const tstr = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // ---------- rest timer / wake lock ----------
  let timerEnd = 0, timerIv = null, wake = null;
  function startTimer(sec) { if (window.Native) window.Native.timerArm(sec); document.body.classList.add('has-timer'); timerBeeped = false; timerEnd = Date.now() + sec * 1000; clearInterval(timerIv); timerIv = setInterval(tickTimer, 250); tickTimer(); }
  function stopTimer() { if (window.Native) window.Native.timerDisarm(); clearInterval(timerIv); timerEnd = 0; $('#timer').innerHTML = ''; document.body.classList.remove('has-timer'); }
  function tickTimer() {
    const left = Math.ceil((timerEnd - Date.now()) / 1000), el = $('#timer');
    if (!timerEnd) return;
    const mm = Math.floor(Math.abs(left) / 60), ss = String(Math.abs(left) % 60).padStart(2, '0');
    el.innerHTML = `<div class="timer ${left <= 0 ? 'zero' : ''}"><span class="mut xs" style="text-transform:uppercase;letter-spacing:.08em">Rest</span><b>${left < 0 ? '+' : ''}${mm}:${ss}</b><span class="sp"></span><button class="sm" onclick="G.tAdd(30)">+30s</button><button class="sm ghost" onclick="G.tStop()">✕</button></div>`;
    if (left <= 0 && !timerBeeped) { timerBeeped = true; beep(); if (window.Native) window.Native.success(); }
    if (left < -60) stopTimer();
  }
  // short chime when rest is up (only audible while the app is open; iOS web apps can't vibrate)
  let actx = null, timerBeeped = false;
  function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { } }
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach(dt => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, actx.currentTime + dt); g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dt + 0.15); o.connect(g).connect(actx.destination); o.start(actx.currentTime + dt); o.stop(actx.currentTime + dt + 0.16); });
    } catch (e) { }
  }
  async function lock() { if (window.Native) window.Native.keepAwake(true); try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.active) lock(); });

  // ---------- charts ----------
  let chartSeq = 0;
  function lineChart(series, o) {
    o = o || {}; const W = 340, H = 192, L = 36, R = 10, T = 10, B = 24;
    const pts = series.flatMap(s => s.pts); if (!pts.length) return '<div class="mut sm" style="padding:24px 0;text-align:center">No data yet</div>';
    let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
    if (x1 === x0) { x0 -= 0.5; x1 += 0.5; } const pad = Math.max((y1 - y0) * 0.14, y1 * 0.01 || 1); y0 -= pad; y1 += pad;
    const X = (x) => L + (x - x0) / (x1 - x0) * (W - L - R), Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    const gid = 'og_g_' + (++chartSeq);
    let defs = '';
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = y0 + (y1 - y0) * i / 4, y = Y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" style="stroke:var(--line)" stroke-width="1" ${i ? 'stroke-dasharray="3 3"' : ''}/><text x="${L - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${(o.yFmt || (v => Math.round(v)))(v)}</text>`;
    }
    const xs = [...new Set(pts.map(p => p.x))].sort((a, b) => a - b); const step = Math.ceil(xs.length / 6);
    xs.forEach((x, i) => { if (i % step === 0 || i === xs.length - 1) g += `<text x="${X(x).toFixed(1)}" y="${H - 6}" text-anchor="middle">${o.xLab ? o.xLab(x) : x}</text>`; });
    series.forEach((s, si) => {
      const d = s.pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
      if (series.length === 1 && s.pts.length > 1) {
        defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${s.color}" stop-opacity=".26"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`;
        const first = s.pts[0], last = s.pts[s.pts.length - 1], baseY = (H - B).toFixed(1);
        g += `<path d="${d} L${X(last.x).toFixed(1)} ${baseY} L${X(first.x).toFixed(1)} ${baseY} Z" fill="url(#${gid})"/>`;
      }
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
        + s.pts.map(p => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="${s.color}" style="stroke:var(--card)" stroke-width="1.5"/>`).join('');
    });
    const leg = series.length > 1 ? `<div class="chips" style="margin-top:8px">${series.map(s => `<span class="chip"><i style="display:inline-block;width:7px;height:7px;border-radius:99px;background:${s.color};margin-right:5px"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${defs}${g}</svg>${leg}`;
  }

  // ---------- views ----------
  function viewTrain() {
    if (S.active) return viewSession();
    const m = activeMeso();
    let h = brandBar() + '<h1>Train</h1>';
    if (!m) return h + `<div class="card hero"><p style="margin-bottom:14px">No active mesocycle yet. Build a guided or custom training block to start logging.</p><div class="g2"><button class="pri" onclick="G.newMeso()">Create mesocycle</button><button onclick="Shell.go('more')">Restore backup</button></div></div>`;
    const dl = C.isDeload(m, m.week);
    const wkSessions = S.sessions.filter(s => s.mesoId === m.id && s.week === m.week);
    const doneDays = new Set(wkSessions.map(s => s.dayId));
    const pct = Math.round(doneDays.size / m.days.length * 100);
    h += `<div class="card hero"><div class="row"><div class="sp"><div class="xs mut" style="text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Active block</div><b style="font-size:17px">${esc(m.name)}</b></div><span class="chip ${dl ? '' : 'sel'} num">${dl ? 'Deload' : 'Week ' + m.week + ' / ' + m.weeks}</span></div>
      <div class="prog" style="margin:13px 0 9px"><i style="width:${pct}%"></i></div>
      <div class="row xs mut num"><span class="sp">${doneDays.size} of ${m.days.length} sessions completed${dl ? ' · deload (~half volume)' : ''}</span><span>${pct}%</span></div></div>`;
    h += '<h2>Sessions</h2>';
    m.days.forEach(d => {
      const done = doneDays.has(d.id), sets = d.items.reduce((a, it) => a + C.plannedSets(it.sets, prioOf(m, EX[it.exId] && EX[it.exId].muscle), m.week, m), 0);
      const wd = isFixed(m) && Number.isInteger(d.dow) ? `<span class="chip ${d.dow === new Date().getDay() ? 'sel' : ''}">${DOW[d.dow]}</span>` : '';
      h += `<div class="card row"><div class="sp"><b style="font-size:15px">${esc(d.name)}</b><div class="mut xs num" style="margin-top:3px">${d.items.length} exercises · ${sets} sets</div></div>${wd}${done ? '<span class="chip ok-chip">✓ Done</span>' : ''}<button class="${done ? 'sm' : 'pri sm'}" onclick="G.start('${d.id}')">${done ? 'Redo' : 'Start'}</button></div>`;
    });
    if (doneDays.size >= m.days.length) h += m.week < m.weeks ? `<button class="pri" style="width:100%;margin-top:6px" onclick="G.nextWeek()">Advance to Week ${m.week + 1} →</button>` : `<button class="pri" style="width:100%;margin-top:6px" onclick="G.endMeso()">Complete &amp; archive mesocycle</button>`;
    else if (m.week < m.weeks) h += `<button class="ghost" style="width:100%;margin-top:4px" onclick="G.nextWeek()">Skip to Week ${m.week + 1}</button>`;
    return h;
  }

  function viewSession() {
    const a = S.active, m = S.mesos.find(x => x.id === a.mesoId);
    const dl = m && C.isDeload(m, a.week);
    const cnt = (f) => a.items.reduce((c, it) => c + it.sets.filter(st => st.t !== 'W' && f(st)).length, 0);
    const doneSets = cnt(st => st.done), totalSets = cnt(() => true);
    let h = brandBar(`<button class="sm ghost bad" onclick="G.discard()">Discard</button>`)
      + `<div class="row" style="margin-bottom:4px"><h1 class="sp" style="margin-bottom:0">${esc(a.name)}</h1><span class="chip sel num">${doneSets}/${totalSets} sets</span></div>`
      + `<div class="mut xs num" style="margin:0 2px 14px">Week ${a.week}${dl ? ' · Deload' : ''} · Started ${tstr(a.start)}</div>`;
    // feedback goes on the last card for each muscle in this workout
    const lastRun = {}; a.items.forEach((it, i) => { const ex = EX[it.exId]; if (ex) lastRun[ex.muscle] = i; });
    // consecutive movements for the same muscle share one card; each keeps its own controls
    let curMu = null, lastI = -1;
    const close = () => { if (curMu === null) return; if (lastRun[curMu] === lastI) h += feedbackHTML(curMu); h += '</div>'; curMu = null; };
    const bw = curBW();
    a.items.forEach((it, i) => {
      const ex = EX[it.exId]; if (!ex) return;
      if (ex.muscle !== curMu) { close(); curMu = ex.muscle; h += `<div class="card grp"><span class="grp-lbl">${esc(ex.muscle)}</span>`; }
      else h += '<div class="mv-sep"></div>';
      lastI = i;
      const L = loadOf(ex), asst = L === 'assist';
      h += `<div class="mv"><div class="row" style="align-items:flex-start"><button class="ex-hd sp" title="History and details" onclick="G.exInfo(${i})"><b style="font-size:15px">${esc(ex.name)}</b><span class="ex-chev" aria-hidden="true">›</span><span class="xs mut num" style="display:block;margin-top:3px">${it.min}–${it.max} reps</span></button><button class="ico ghost" title="Swap exercise" onclick="G.swap(${i})">${ICONS.swap}</button><button class="ico ghost" title="More" aria-label="More options" onclick="G.more(${i})">${ICONS.more}</button></div>
        <div style="height:8px"></div>
        <div class="lbl"><span>Set</span><span>${asst ? 'Assist' : L === 'bw' ? '+' + Shell.uW() : Shell.uW()}</span><span>Reps</span><span>RIR</span><span>Done</span></div>`;
      let wn = 0;
      it.sets.forEach((st, j) => {
        const lab = st.t ? TLBL[st.t] : String(++wn);
        h += `<div class="setrow ${st.done ? 'done' : ''} ${st.t ? 't-' + st.t : ''}"><button class="n" title="Set type" onclick="G.stAsk(${i},${j})">${lab}</button>
          <input id="w_${i}_${j}" type="number" inputmode="decimal" step="any" value="${fw(st.w)}" placeholder="0" onfocus="Shell.fzIn(this)" onblur="Shell.fzOut(this)" oninput="G.sv(${i},${j},'w',this.value)">
          <input id="r_${i}_${j}" type="number" inputmode="numeric" value="${st.r === '' ? '' : st.r}" onfocus="Shell.fzIn(this)" onblur="Shell.fzOut(this)" oninput="G.sv(${i},${j},'r',this.value)">
          <input id="i_${i}_${j}" type="number" inputmode="numeric" min="0" max="10" value="${st.rir === '' || st.rir == null ? '' : st.rir}" placeholder="${st.t === 'W' ? '' : '–'}" onfocus="Shell.fzIn(this)" onblur="Shell.fzOut(this)" oninput="G.sv(${i},${j},'rir',this.value)">
          <button class="chk" onclick="G.chk(${i},${j})">${st.done ? '✓' : '○'}</button></div>`;
      });
      h += `<div class="row" style="margin-top:10px;gap:6px"><button class="sm" onclick="G.addSet(${i})">+ Set</button><button class="sm ghost" onclick="G.rmSet(${i})">− Set</button><input style="min-height:34px;padding:6px 10px;font-size:13px" placeholder="Exercise note…" value="${esc(it.note)}" oninput="G.note(${i},this.value)"></div></div>`;
    });
    close();
    h += `<textarea rows="2" placeholder="Workout notes…" oninput="G.wnote(this.value)">${esc(a.note || '')}</textarea><div style="height:12px"></div><button class="pri" style="width:100%" onclick="G.finish()">Finish workout</button>`;
    return h;
  }

  /** Plan items for one muscle in today's workout (what feedback adjusts). */
  function fbTargets(mu) {
    const a = S.active, m = S.mesos.find(x => x.id === a.mesoId), day = m && m.days.find(d => d.id === a.dayId);
    return { m, day, items: day ? day.items.filter(it => EX[it.exId] && EX[it.exId].muscle === mu) : [] };
  }
  /** Most sets this muscle may reach in today's workout plan: per-session cap, weekly ceiling, session size. */
  function fbRoom(m, mu, items) {
    const day = m.days.find(d => d.id === S.active.dayId);
    const weekSets = m.days.reduce((a, d) => a + d.items.reduce((b, it) => b + (EX[it.exId] && EX[it.exId].muscle === mu ? +it.sets || 0 : 0), 0), 0);
    const daySets = day ? day.items.reduce((a, it) => a + (+it.sets || 0), 0) : 0;
    return C.addRoom({ muscle: mu, prio: prioOf(m, mu), items, weekSets, daySets });
  }
  /** Preview of what the answers do next week: {delta, changes:[{name, from, to}], capped} */
  function fbPreview(mu) {
    const a = S.active, f = (a.fb || {})[mu], { m, items } = fbTargets(mu);
    if (!m || !C.fbComplete(f)) return null;
    const raw = C.volumeDelta(f, prioOf(m, mu));
    // at most one added set per muscle per week, however many sessions train it
    const weekly = raw > 0 && S.sessions.some(s => s.mesoId === m.id && s.week === a.week && s.fb && s.fb[mu] && s.fb[mu].delta > 0);
    const delta = weekly ? 0 : raw, copy = items.map(it => ({ sets: it.sets }));
    const ch = C.distributeSets(copy, delta, fbRoom(m, mu, items));
    return { delta, weekly, changes: ch.map(c => ({ name: EX[items[c.i].exId].name, from: c.from, to: c.to })), capped: delta > 0 && !ch.length };
  }
  function feedbackHTML(mu) {
    const a = S.active, m = S.mesos.find(x => x.id === a.mesoId);
    if (!m || C.isDeload(m, a.week) || !fbTargets(mu).items.length) return '';
    const f = (a.fb || {})[mu];
    if (f && f.skip) return `<div class="fb fb-min"><span class="xs dim sp">Feedback skipped</span><button class="sm ghost" onclick="G.fbSkip('${esc(mu)}',false)">Rate ${esc(mu)}</button></div>`;
    // appears once every working set for this muscle is checked off
    const sets = a.items.filter(it => EX[it.exId] && EX[it.exId].muscle === mu).flatMap(it => it.sets.filter(st => st.t !== 'W'));
    if (!f && !(sets.length && sets.every(st => st.done))) return '';
    const cur = f || {};
    if (f && f.closed && C.fbComplete(f)) {
      const pv = fbPreview(mu), net = pv ? pv.changes.reduce((x, c) => x + c.to - c.from, 0) : 0;
      return `<div class="fb fb-min"><span class="xs mut sp">✓ ${esc(mu)} rated${pv ? ` · <b class="num" style="color:var(--tx2)">${net > 0 ? '+' + net : net < 0 ? net : '±0'} set${Math.abs(net) === 1 ? '' : 's'}</b> next week` : ''}</span><button class="sm ghost" onclick="G.fbOpen('${esc(mu)}')">Edit</button></div>`;
    }
    let h = `<div class="fb"><div class="row" style="margin-bottom:4px"><b class="sm sp">How did ${esc(mu)} feel?</b><button class="sm ghost" onclick="G.fbSkip('${esc(mu)}',true)">Skip</button></div>`;
    Object.entries(C.FB_Q).forEach(([k, q]) => {
      h += `<div class="fb-q"><div class="xs mut">${q.label}</div><div class="fb-opts">${q.opts.map(([v, l]) => `<button class="chip ${cur[k] === v ? 'sel' : ''}" onclick="G.fb('${esc(mu)}','${k}','${v}')">${l}</button>`).join('')}</div></div>`;
    });
    const pv = fbPreview(mu);
    if (pv) {
      const txt = pv.weekly ? `${esc(mu)} already gained a set this week — holding.` : pv.capped ? `${esc(mu)} is at its session, weekly or workout-size limit — holding sets.`
        : pv.delta === 0 || !pv.changes.length ? (pv.delta < 0 ? 'Every movement is already at 1 set — holding.' : `Holding ${esc(mu)} sets next week.`)
        : pv.changes.map(c => `${esc(c.name)} ${c.from} → ${c.to}`).join(' · ');
      const cls = pv.delta > 0 && pv.changes.length ? 'up' : pv.delta < 0 && pv.changes.length ? 'dn' : 'hd';
      const net = pv.changes.reduce((x, c) => x + c.to - c.from, 0);
      h += `<div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><span class="badge ${cls} num">${net > 0 ? '+' + net : net < 0 ? net : '±0'} set${Math.abs(net) === 1 ? '' : 's'} next week</span><span class="xs mut num">${txt}</span></div>`
        + `<div class="xs dim" style="margin-top:4px">Applies to this workout's plan when you finish.</div>`;
    }
    if (C.fbComplete(cur)) h += `<button class="ok" style="width:100%;margin-top:12px" onclick="G.fbDone('${esc(mu)}')">Done</button>`;
    return h + '</div>';
  }

  // --- mesocycle tab
  function viewMeso() {
    if (ui.wiz) return viewWiz();
    if (ui.draft) return viewDraft();
    const m = activeMeso();
    let h = brandBar() + '<h1>Mesocycle</h1>';
    if (!m) h += `<div class="card"><p style="margin-bottom:0">No active mesocycle.</p></div>`;
    else {
      h += `<div class="card hero"><div class="row"><b class="sp" style="font-size:17px">${esc(m.name)}</b><span class="chip sel num">Week ${m.week}/${m.weeks}</span></div>
        <div class="mut xs" style="margin:5px 0 11px">Started ${dstr(m.start)}${m.deload ? ' · Deload final week' : ''}</div>
        <div class="chips">${[...new Set(m.days.flatMap(d => d.items.map(i => EX[i.exId] && EX[i.exId].muscle)))].filter(Boolean).map(mu => `<span class="chip ${prioOf(m, mu)}">${esc(mu)} · ${{ P: 'Priority', N: 'Normal', M: 'Maintain' }[prioOf(m, mu)]}</span>`).join('')}</div>
        <div class="row" style="margin-top:14px"><button class="sm" onclick="G.editMeso()">Edit plan</button><button class="sm" onclick="G.nextWeek()">Next week</button><span class="sp"></span><button class="sm ghost bad" onclick="G.endMeso()">End</button></div></div>`;
      const fx = isFixed(m);
      h += `<h2>Schedule</h2><div class="card"><div class="seg" style="margin-bottom:10px"><button class="${fx ? 'on' : ''}" onclick="G.schedMode('fixed')">Fixed weekdays</button><button class="${fx ? '' : 'on'}" onclick="G.schedMode('async')">Asynchronous</button></div>`
        + (fx ? m.days.map(d => `<div class="row sm" style="padding:6px 0;border-top:1px solid var(--line)"><span class="sp" style="color:var(--tx2)">${esc(d.name)}</span><select style="width:auto;min-height:36px;padding:4px 10px" onchange="G.dow('${d.id}',this.value)"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 0].map(k => `<option value="${k}" ${d.dow === k ? 'selected' : ''}>${DOW[k]}</option>`).join('')}</select></div>`).join('')
          + '<div class="xs mut" style="margin-top:8px">Today shows the workout pinned to today, or a rest day. Training/rest-day calories (Food → Plan &amp; Coach) follow this schedule.</div>'
          : '<div class="xs mut">Workouts run in order, whenever you train. Mark today as a training or rest day on the Today tab to switch between training- and rest-day calories.</div>')
        + '</div>';
      h += '<h2>Training days</h2>';
      m.days.forEach(d => {
        h += `<div class="card"><div class="row" style="margin-bottom:8px"><b class="sp">${esc(d.name)}</b><span class="xs dim num">${d.items.length} lifts</span></div>`
          + d.items.map(it => `<div class="row sm" style="padding:6px 0;border-top:1px solid var(--line)"><span class="sp" style="color:var(--tx2)">${esc(EX[it.exId] ? EX[it.exId].name : '?')}</span><span class="mut xs num">${it.sets} × ${it.min}–${it.max}</span></div>`).join('') + '</div>';
      });
    }
    h += `<button class="pri" style="width:100%;margin-top:6px" onclick="G.newMeso()">+ New mesocycle</button>`;
    const old = S.mesos.filter(x => x.ended);
    if (old.length) {
      h += '<h2>Archived</h2>';
      old.slice().reverse().forEach(x => { h += `<div class="card sm row"><b class="sp">${esc(x.name)}</b><span class="mut xs num">${dstr(x.start)} · ${S.sessions.filter(s => s.mesoId === x.id).length} sessions</span></div>`; });
    }
    return h;
  }

  function viewDraft() {
    const d = ui.draft, muscles = [...new Set(d.days.flatMap(x => x.items.map(i => EX[i.exId] && EX[i.exId].muscle)))].filter(Boolean);
    const vol = C.effectiveVolume(C.planVolume(d.days, EX));
    muscles.push(...Object.keys(vol).filter(mu => muscles.indexOf(mu) < 0 && vol[mu] > 0));
    const perDay = d.days.map(x => x.items.reduce((a, it) => a + (+it.sets || 0), 0));
    let h = brandBar()
      + (d.fromWiz && !d.editing ? `<div class="row" style="margin:2px 0 4px"><button class="sm ghost" style="padding-left:4px" onclick="G.wizStep('${d.fromWiz === 'freestyle' ? 'free' : 'split'}')">‹ Back</button><span class="sp"></span><span class="mut xs">Step 4 of 4</span></div>` : '')
      + `<h1>${d.editing ? 'Edit mesocycle' : d.fromWiz ? 'Exercises' : 'New mesocycle'}</h1>`;
    h += `<div class="card"><input value="${esc(d.name)}" placeholder="Mesocycle name" oninput="gui_d('name',this.value)">
      <div class="g2" style="margin-top:10px"><label class="xs mut">Weeks<select onchange="gui_d('weeks',+this.value)">${[3, 4, 5, 6, 7, 8].map(n => `<option ${n === d.weeks ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="xs mut">Deload final week<div class="row" style="min-height:44px;margin-top:4px"><input type="checkbox" ${d.deload ? 'checked' : ''} onchange="gui_d('deload',this.checked)"><span class="sm" style="color:var(--tx2)">Half volume</span></div></label></div></div>`;
    if (!d.editing && !d.fromWiz) h += `<div class="card"><label class="xs mut">Load template<select onchange="G.tmpl(this.value);this.selectedIndex=0"><option value="">Choose a preset…</option>${Object.keys(C.TEMPLATES).map(k => `<option>${esc(k)}</option>`).join('')}</select></label></div>`;
    h += '<h2>Weekly sets</h2>';
    h += muscles.length ? `<div class="card">${muscles.slice().sort((x, y) => C.DAY_ORDER.indexOf(x) - C.DAY_ORDER.indexOf(y)).map(mu => {
      const p = d.prio[mu] || 'N', t = C.weeklyTarget(mu, p), v = vol[mu] || 0, off = v - t;
      return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="sp sm">${esc(mu)}</span>
        <span class="sm num" style="width:64px;text-align:right;color:${Math.abs(off) <= 2 ? 'var(--mut)' : off < 0 ? 'var(--warn)' : 'var(--acc-hi)'}">${v} / ${t}</span>
        <button class="chip ${p}" style="min-height:30px;width:88px" onclick="G.cyc('${esc(mu)}')">${{ P: 'Priority', N: 'Normal', M: 'Maintain' }[p]}</button></div>`;
    }).join('')}<div class="xs mut" style="margin-top:10px">Effective weekly sets (direct + half of overlapping compound sets) vs. target. Amber means the day layout caps that muscle — spread it across another day to hit target. Sets per session: <b class="num">${perDay.join(' / ')}</b>${Math.max(...perDay) > C.SESSION_MAX ? ' <span style="color:var(--warn)">— over ' + C.SESSION_MAX + ', consider another day</span>' : ''}.</div></div>` : '<div class="card mut sm">Add exercises below to calculate weekly volume.</div>';
    h += '<h2>Days</h2>';
    d.days.forEach((day, di) => {
      h += `<div class="card"><div class="row"><input value="${esc(day.name)}" oninput="gui_day(${di},this.value)"><button class="ico" title="Duplicate day" onclick="G.dupDay(${di})">⧉</button><button class="ico ghost bad" title="Delete day" onclick="G.delDay(${di})">✕</button></div>`;
      day.items.forEach((it, ii) => {
        const ex = EX[it.exId];
        h += `<div style="padding:10px 0;border-top:1px solid var(--line);margin-top:10px"><div class="row"><b class="sp sm">${esc(ex ? ex.name : '?')}</b><span class="chip">${esc(ex ? ex.muscle : '')}</span><button class="ico ghost" onclick="G.swapD(${di},${ii})">${ICONS.swap}</button><button class="ico ghost" onclick="G.up(${di},${ii})">↑</button><button class="ico ghost bad" onclick="G.delItem(${di},${ii})">✕</button></div>
          <div class="g3" style="margin-top:8px"><label class="xs mut">Sets<input type="number" inputmode="numeric" value="${it.sets}" oninput="G.it(${di},${ii},'sets',this.value)"></label><label class="xs mut">Min reps<input type="number" inputmode="numeric" value="${it.min}" oninput="G.it(${di},${ii},'min',this.value)"></label><label class="xs mut">Max reps<input type="number" inputmode="numeric" value="${it.max}" oninput="G.it(${di},${ii},'max',this.value)"></label></div></div>`;
      });
      h += `<button class="sm" style="margin-top:10px" onclick="G.addEx(${di})">+ Exercise</button></div>`;
    });
    h += `<button onclick="G.addDay()" style="width:100%">+ Add day</button><div class="g2" style="margin-top:12px"><button onclick="G.cancelDraft()">Cancel</button><button class="pri" onclick="G.saveDraft()">${d.editing ? 'Save changes' : 'Start mesocycle'}</button></div>`;
    return h;
  }

  // ---------- new mesocycle wizard ----------
  const SPLITS = { full: 'Full Body', 'upper-lower': 'Upper / Lower', freestyle: 'Freestyle' };
  function wizHead(title, sub, back) {
    return brandBar() + `<div class="row" style="margin:2px 0 4px"><button class="sm ghost" style="padding-left:4px" onclick="G.wizStep('${back}')">‹ Back</button><span class="sp"></span><span class="mut xs">${esc(sub)}</span></div><h1>${esc(title)}</h1>`;
  }
  function viewWiz() {
    const w = ui.wiz;
    if (w.step === 'mode') return brandBar() + `<h1>New mesocycle</h1>
      <div class="card tap hero" onclick="G.wizMode('guided')"><div class="row"><div class="sp"><b style="font-size:16px">Guided setup</b><div class="mut sm" style="margin-top:3px">Days → priorities → split type. Builds the plan and set counts for you, then you fine-tune exercises.</div></div><span class="chev">›</span></div></div>
      <div class="card tap" onclick="G.wizMode('custom')"><div class="row"><div class="sp"><b style="font-size:16px">Custom builder</b><div class="mut sm" style="margin-top:3px">Jump straight to the exercise builder or start from a preset template.</div></div><span class="chev">›</span></div></div>
      <button class="ghost" style="width:100%;margin-top:4px" onclick="G.cancelDraft()">Cancel</button>`;

    if (w.step === 'days') return wizHead('Training days per week', 'Step 1 of 4', 'mode')
      + `<div class="card"><div class="chips" style="gap:8px">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button class="chip ${w.days === n ? 'sel' : ''} num" style="min-height:52px;min-width:54px;font-size:17px;font-weight:600" onclick="G.wizDays(${n})">${n}</button>`).join('')}</div>
      <div class="xs mut" style="margin-top:12px">Choose how many sessions you want each week. You can rename or reorder days later.</div></div>
      <button class="pri" style="width:100%" onclick="G.wizStep('prio')">Next: priorities ›</button>`;

    if (w.step === 'prio') {
      const dt = C.directTargets(w.prio), np = C.prioCount(w.prio);
      const rows = C.DAY_ORDER.map(mu => {
        const p = w.prio[mu] || 'N', ind = C.indirectSets(mu, dt);
        return `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)"><span class="sp sm">${esc(mu)}</span>
          <span class="mut xs num" style="width:92px;text-align:right">${dt[mu]} sets${ind ? `<span class="dim"> +${Math.round(ind * 2) / 2}</span>` : ''}</span>
          <button class="chip ${p}" style="min-height:32px;width:94px" onclick="G.wizPrio('${esc(mu)}')">${{ P: 'Priority', N: 'Normal', M: 'Maintain' }[p]}</button></div>`;
      }).join('');
      return wizHead('Muscle priority', 'Step 2 of 4', 'days')
        + `<div class="card">${rows}<div class="xs mut" style="margin-top:12px">Direct weekly sets per muscle; <span class="dim">+n</span> is credit from compounds (presses for triceps, rows for biceps and rear delts, squats and hinges for glutes) counted at half a set. Maintain holds near minimum effective volume, Normal sits in the productive middle, Priority pushes toward the top of MAV. Priority: <b class="num">${np}/${C.MAX_PRIO}</b>.</div></div>
        <button class="pri" style="width:100%" onclick="G.wizStep('split')">Next: split type ›</button>`;
    }

    if (w.step === 'split') return wizHead('Split type', 'Step 3 of 4', 'prio')
      + `<div class="card tap" onclick="G.wizSplit('full')"><div class="row"><div class="sp"><b>Full Body</b><div class="mut sm" style="margin-top:3px">Upper and lower every session, volume spread across your ${w.days} days in contiguous muscle clusters.</div></div><span class="chev">›</span></div></div>
      <div class="card tap" onclick="G.wizSplit('upper-lower')"><div class="row"><div class="sp"><b>Upper / Lower</b><div class="mut sm" style="margin-top:3px">${w.days % 2 ? `${Math.ceil(w.days / 2)} upper, ${w.days - Math.ceil(w.days / 2)} lower — odd day goes to upper.` : `${w.days / 2} upper, ${w.days / 2} lower.`}</div></div><span class="chev">›</span></div></div>
      <div class="card tap" onclick="G.wizSplit('freestyle')"><div class="row"><div class="sp"><b>Freestyle</b><div class="mut sm" style="margin-top:3px">Pick which muscle groups you want to train on each day.</div></div><span class="chev">›</span></div></div>`;

    if (w.step === 'free') {
      const rows = w.free.map((day, di) => `<div class="card"><div class="row"><b class="sp">Day ${di + 1}</b><span class="mut xs num">${day.filter(Boolean).length} groups</span></div>
        ${day.map((mu, si) => `<div class="row" style="margin-top:8px"><select onchange="G.freeSet(${di},${si},this.value)"><option value="">— none —</option>${C.DAY_ORDER.filter(x => x === mu || !day.some((o, k) => k !== si && o === x)).map(x => `<option ${x === mu ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>${day.length > 1 ? `<button class="ico ghost bad" onclick="G.freeDel(${di},${si})">✕</button>` : ''}</div>`).join('')}
        ${day.length < 5 ? `<button class="sm" style="margin-top:10px" onclick="G.freeAdd(${di})">+ Muscle group</button>` : '<div class="xs mut" style="margin-top:8px">Max 5 per day</div>'}</div>`).join('');
      const empty = w.free.some(d => !d.filter(Boolean).length);
      return wizHead('Muscle groups per day', 'Step 3 of 4', 'split') + rows
        + (empty ? '<div class="card sm" style="color:var(--warn);border-color:rgba(217,180,100,.35)">Every day needs at least one muscle group.</div>' : '')
        + `<button class="pri" style="width:100%" ${empty ? 'disabled' : ''} onclick="G.wizGen()">Build plan ›</button>`;
    }
    return '';
  }

  // --- progress tab
  function viewProg() {
    const m = activeMeso();
    let h = brandBar() + '<h1>Progress</h1>';
    const scope = m ? ui.scope : 'all';
    const sess = scope === 'meso' ? S.sessions.filter(s => s.mesoId === m.id) : S.sessions;
    if (m) h += `<div class="seg"><button class="${scope === 'meso' ? 'on' : ''}" onclick="gui_set('scope','meso')">This meso</button><button class="${scope === 'all' ? 'on' : ''}" onclick="gui_set('scope','all')">All time</button></div>`;
    h += `<div class="seg">${[['all', 'All'], ['P', 'Priority'], ['N', 'Normal'], ['M', 'Maintain']].map(([k, l]) => `<button class="${ui.pf === k ? 'on' : ''}" onclick="gui_set('pf','${k}')">${l}</button>`).join('')}</div>`;
    if (!sess.length) return h + '<div class="card mut sm">Log a workout to see progress, or restore a JSON backup in Data.</div>';
    const t0 = scope === 'meso' ? Math.min(m.start, ...sess.map(s => s.start)) : Math.min(...sess.map(s => s.start));
    const have = [...C.MUSCLES, 'Other'].filter(mu => S.exercises.some(e => e.muscle === mu && sess.some(s => s.items.some(i => i.exId === e.id))));
    const muscles = have.filter(mu => ui.pf === 'all' || (m && prioOf(m, mu) === ui.pf));
    // chart: strength index
    const series = muscles.map((mu, i) => ({ name: mu, color: PALETTE[i % PALETTE.length], pts: C.muscleIndex(sess, S.exercises, mu, t0, bwAt) })).filter(s => s.pts.length);
    h += `<h2>Strength index <span class="xs dim" style="text-transform:none;letter-spacing:0">(est. 1RM · start = 100)</span></h2><div class="card">${lineChart(series, { yFmt: v => Math.round(v), xLab: x => scope === 'meso' ? 'W' + (x + 1) : dstr(t0 + x * C.WEEK) })}</div>`;
    // weekly sets
    if (m) {
      const wk = ui.pw || m.week;
      const done = C.hardSetsByMuscle(S.sessions, EX, s => s.mesoId === m.id && s.week === wk);
      const tgt = {}; m.days.forEach(d => d.items.forEach(it => { const mu = EX[it.exId] && EX[it.exId].muscle; if (mu) tgt[mu] = (tgt[mu] || 0) + C.plannedSets(it.sets, prioOf(m, mu), wk, m); }));
      const ms = Object.keys(tgt).filter(mu => ui.pf === 'all' || prioOf(m, mu) === ui.pf).sort((a, b) => C.MUSCLES.indexOf(a) - C.MUSCLES.indexOf(b));
      h += `<h2>Sets this week</h2><div class="card"><div class="row" style="margin-bottom:10px"><button class="ico" onclick="gui_pw(-1)">‹</button><b class="sp num" style="text-align:center">Week ${wk}${C.isDeload(m, wk) ? ' · Deload' : ''}</b><button class="ico" onclick="gui_pw(1)">›</button></div>`;
      ms.forEach(mu => { const d = done[mu] || 0, t = tgt[mu]; h += `<div class="row" style="padding:6px 0"><span style="width:94px" class="sm">${esc(mu)}</span><span class="chip ${prioOf(m, mu)}" style="width:24px;text-align:center;padding:2px 0">${prioOf(m, mu)}</span><div class="bar sp"><i style="width:${Math.min(100, d / t * 100)}%;background:${d >= t ? 'var(--ok)' : 'var(--acc)'}"></i></div><span class="sm num mut" style="width:46px;text-align:right">${d}/${t}</span></div>`; });
      h += '</div>';
    }
    // table
    h += '<h2>Muscle summary</h2><div class="card"><table><tr><th>Muscle</th><th>Tier</th><th>Index</th><th>Status</th></tr>';
    muscles.forEach(mu => {
      const pts = C.muscleIndex(sess, S.exercises, mu, t0, bwAt); if (!pts.length) return;
      const ch = pts[pts.length - 1].y - 100;
      const exs = S.exercises.filter(e => e.muscle === mu).map(e => C.exerciseSeries(sess, e.id, { mode: e.load, bwAt })).filter(a => a.length);
      const st = exs.filter(C.stalled).length;
      h += `<tr><td>${esc(mu)}</td><td><span class="chip ${m ? prioOf(m, mu) : ''}">${m ? prioOf(m, mu) : '–'}</span></td><td class="num" style="font-weight:600;color:${ch >= 0 ? 'var(--ok)' : 'var(--bad)'}">${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%</td><td class="xs ${st ? '' : 'mut'}" style="${st ? 'color:var(--warn)' : ''}">${st ? '⚠ ' + st + ' stalled' : exs.length + (exs.length === 1 ? ' lift' : ' lifts')}</td></tr>`;
    });
    h += '</table></div>';
    // exercise detail
    const exWith = S.exercises.filter(e => C.exerciseSeries(sess, e.id, { mode: e.load, bwAt }).length).sort((a, b) => a.name.localeCompare(b.name));
    const sel = ui.exSel && exWith.find(e => e.id === ui.exSel) ? ui.exSel : (exWith[0] && exWith[0].id);
    if (sel) {
      const ser = C.exerciseSeries(sess, sel, { mode: EX[sel].load, bwAt });
      h += `<h2>Exercise trend</h2><div class="card"><select onchange="gui_set('exSel',this.value)">${exWith.map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select><div style="height:10px"></div>`
        + lineChart([{ name: 'e1RM', color: PALETTE[0], pts: ser.map((p, i) => ({ x: i, y: Shell.toDisp(p.e1) })) }], { xLab: x => dstr(ser[x] ? ser[x].t : 0), yFmt: v => Math.round(v) });
      const rows = sess.filter(s => s.items.some(i => i.exId === sel)).sort((a, b) => b.start - a.start).slice(0, 6);
      h += '<table style="margin-top:10px">' + rows.map(s => `<tr><td class="mut xs" style="width:68px">${dstr(s.start)}</td><td class="sm num">${esc(setStr(s.items.filter(i => i.exId === sel).flatMap(i => i.sets)))}</td></tr>`).join('') + '</table>'
        + (loadOf(EX[sel]) !== 'ext' ? `<div class="xs dim" style="margin-top:8px">1RM uses bodyweight ${loadOf(EX[sel]) === 'assist' ? '− assistance' : '+ added load'}.</div>` : '') + '</div>';
    }
    return h;
  }

  // --- sections for the shell's More tab
  function settingsHTML() {
    return `<div class="card">
      <label class="xs mut">Default rest timer (s)<input type="number" inputmode="numeric" value="${S.settings.rest}" onchange="G.setting('rest',+this.value||0)"></label>
      <label class="xs mut" style="display:block;margin-top:10px">Increase weight when last set…<select onchange="G.setting('trigger',this.value)"><option value="exceed" ${S.settings.trigger === 'exceed' ? 'selected' : ''}>exceeds max reps (e.g. 13 on 8–12)</option><option value="hit" ${S.settings.trigger === 'hit' ? 'selected' : ''}>reaches max reps (12 on 8–12)</option></select></label>
      <label class="row" style="margin-top:12px;cursor:pointer"><input type="checkbox" ${S.settings.dropBelow ? 'checked' : ''} onchange="G.setting('dropBelow',this.checked)"><span class="sm" style="color:var(--tx2)">Drop one increment if last set falls below min reps</span></label>
      <label class="xs mut" style="display:block;margin-top:10px">Warm-up ramp<select onchange="G.setting('warm',this.value)">${Object.entries(C.WARMUP_SCHEMES).map(([k, v]) => `<option value="${k}" ${S.settings.warm === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label></div>`;
  }
  function historyHTML() {
    const list = [...S.sessions].sort((a, b) => b.start - a.start); const shown = ui.histAll ? list : list.slice(0, 15);
    let h = '<div class="card" style="padding:4px 15px">' + (shown.map(s => {
      const open = ui.openSess === s.id, n = s.items.reduce((a, i) => a + i.sets.filter(x => x.done && x.t !== 'W').length, 0);
      return `<div class="li" style="display:block"><div class="row" onclick="G.openS('${s.id}')"><div class="sp"><b>${esc(s.name)}</b><div class="mut xs num">${dstr(s.start)}${s.week ? ' · W' + s.week : ''} · ${n} sets</div></div><span class="chev">${open ? '▾' : '▸'}</span></div>
        ${open ? s.items.map(i => `<div class="sm" style="margin-top:8px"><b>${esc(EX[i.exId] ? EX[i.exId].name : '?')}</b><div class="mut xs num" style="margin-top:2px">${esc(setStr(i.sets))}${i.sets.some(x => x.t === 'W' && x.done) ? ` <span class="dim">+ ${i.sets.filter(x => x.t === 'W' && x.done).length} warm-up</span>` : ''}</div></div>`).join('')
          + (s.fb ? `<div class="xs mut" style="margin-top:8px">Feedback: ${Object.entries(s.fb).filter(([, f]) => !f.skip).map(([mu, f]) => esc(mu) + (f.delta ? ' ' + (f.delta > 0 ? '+' : '') + f.delta + ' sets' : ' held')).join(' · ') || 'skipped'}</div>` : '') + `<button class="sm bad" style="margin-top:10px" onclick="G.delSess('${s.id}')">Delete workout</button>` : ''}</div>`;
    }).join('') || '<div class="mut sm" style="padding:12px 0">No workouts logged yet.</div>') + '</div>';
    if (list.length > 15 && !ui.histAll) h += `<button class="ghost" style="width:100%" onclick="gui_set('histAll',true)">Show all ${list.length}</button>`;
    return h;
  }
  function libraryHTML() {
    return `<div class="card"><button class="sm pri" onclick="G.exEdit(null)">+ New exercise</button><div style="margin-top:8px">${[...C.MUSCLES, 'Other'].map(mu => { const l = S.exercises.filter(e => e.muscle === mu); return l.length ? `<div class="xs dim" style="margin-top:14px;text-transform:uppercase;letter-spacing:.08em;font-weight:600">${mu}</div>` + l.map(e => `<div class="li" onclick="G.exEdit('${e.id}')"><span class="sp sm">${esc(e.name)}</span><span class="mut xs num">${esc(e.type || 'Other')}${e.load === 'bw' ? ' · BW+' : e.load === 'assist' ? ' · Assist' : ''} · ${e.min}–${e.max} · +${fw(e.inc)}${Number.isFinite(e.rest) ? ' · ' + mmss(e.rest) : ''}</span></div>`).join('') : ''; }).join('')}</div></div>`;
  }
  /** Today-tab card: resume, next session this week, or set up a block */
  function todayCard() {
    if (S.active) {
      const a = S.active, done = a.items.reduce((c, it) => c + it.sets.filter(x => x.done && x.t !== 'W').length, 0), tot = a.items.reduce((c, it) => c + it.sets.filter(x => x.t !== 'W').length, 0);
      return `<div class="card hero"><div class="row"><div class="sp"><div class="xs mut" style="text-transform:uppercase;letter-spacing:.08em">Workout in progress</div><b style="font-size:17px">${esc(a.name)}</b><div class="xs mut num" style="margin-top:3px">${done}/${tot} sets · started ${tstr(a.start)}</div></div><button class="pri sm" onclick="G.go('train')">Resume</button></div></div>`;
    }
    const m = activeMeso();
    if (!m) return `<div class="card"><div class="row"><div class="sp"><div class="xs mut" style="text-transform:uppercase;letter-spacing:.08em">Training</div><b>No active training block</b><div class="xs mut" style="margin-top:3px">Build a mesocycle to get weights and volume planned for you.</div></div><button class="pri sm" onclick="G.newMeso()">Create</button></div></div>`;
    const doneDays = new Set(S.sessions.filter(s => s.mesoId === m.id && s.week === m.week).map(s => s.dayId));
    const next = m.days.find(d => !doneDays.has(d.id)), dl = C.isDeload(m, m.week);
    const todayDone = S.sessions.filter(s => C.fmtDate(s.start) === C.fmtDate(Date.now()));
    const head = `<div class="xs mut" style="text-transform:uppercase;letter-spacing:.08em">${esc(m.name)} · ${dl ? 'Deload' : 'Week ' + m.week + '/' + m.weeks} · ${doneDays.size}/${m.days.length} done</div>`;
    if (!next) return `<div class="card"><div class="row"><div class="sp">${head}<b>Week complete</b>${todayDone.length ? `<div class="xs mut" style="margin-top:3px">Trained today: ${esc(todayDone.map(s => s.name).join(', '))}</div>` : ''}</div><button class="pri sm" onclick="G.go('train')">${m.week < m.weeks ? 'Next week' : 'Finish block'}</button></div></div>`;
    let pick = next, label = 'Next';
    if (isFixed(m)) {
      const td = new Date().getDay(), todays = m.days.filter(d => d.dow === td && !doneDays.has(d.id));
      if (todays.length) { pick = todays[0]; label = 'Today'; }
      else {
        // rest day (or today's already done): point at the next pinned, unfinished workout this week
        const ahead = m.days.filter(d => Number.isInteger(d.dow) && !doneDays.has(d.id)).sort((a, b) => ((a.dow - td + 7) % 7) - ((b.dow - td + 7) % 7));
        const up = ahead[0] || next;
        const restTitle = m.days.some(d => d.dow === td) ? 'Done for today' : 'Rest day';
        return `<div class="card"><div class="row"><div class="sp">${head}<b style="font-size:16px">${restTitle}</b><div class="xs mut num" style="margin-top:3px">Up next: ${esc(up.name)}${Number.isInteger(up.dow) ? ' · ' + DOW[up.dow] : ''}${todayDone.length ? ' · trained today: ' + esc(todayDone.map(s => s.name).join(', ')) : ''}</div></div><button class="sm" onclick="G.start('${up.id}');G.go('train')">Start anyway</button></div></div>`;
      }
    }
    const sets = pick.items.reduce((a, it) => a + C.plannedSets(it.sets, prioOf(m, EX[it.exId] && EX[it.exId].muscle), m.week, m), 0);
    return `<div class="card"><div class="row"><div class="sp">${head}<b style="font-size:16px">${label}: ${esc(pick.name)}</b><div class="xs mut num" style="margin-top:3px">${pick.items.length} exercises · ${sets} sets${todayDone.length ? ' · trained today: ' + esc(todayDone.map(s => s.name).join(', ')) : ''}</div></div><button class="pri sm" onclick="G.start('${pick.id}');G.go('train')">Start</button></div></div>`;
  }

  // --- modals
  function modalHTML() {
    const q = ui.modal;
    if (q.type === 'stype') {
      const it = S.active && S.active.items[q.i], st = it && it.sets[q.j]; if (!st) return '';
      const sub = { '': 'Counts toward volume and drives progression', W: 'Not counted in volume, progression or 1RM', D: 'Counts toward volume; no rest timer; no progression', M: 'Counts toward volume; short rest; no progression', F: 'Taken to failure (0 RIR); drives progression' };
      return `<div class="modal" onclick="if(event.target===this)G.closeModal()"><div class="sheet"><div class="xs mut" style="text-transform:uppercase;letter-spacing:.08em;margin:0 2px 8px">${esc(EX[it.exId].name)} · set ${q.j + 1}</div>
        <div class="menu">${Object.entries(C.SET_TYPES).map(([k, l]) => `<button class="mi ${(st.t || '') === k ? 'on' : ''}" onclick="G.stSet(${q.i},${q.j},'${k}')"><span class="mi-ic st-ic t-${k || 'N'}">${k || '#'}</span><span class="sp" style="text-align:left">${l}<span class="xs mut" style="display:block;font-weight:400;margin-top:1px">${sub[k]}</span></span></button>`).join('')}</div>
        <button class="ghost" style="width:100%;margin-top:8px" onclick="G.closeModal()">Cancel</button></div></div>`;
    }
    if (q.type === 'exinfo') return exInfoHTML(q.i);
    if (q.type === 'rest') {
      const it = S.active && S.active.items[q.i], ex = it && EX[it.exId]; if (!ex) return '';
      const cur = Number.isFinite(ex.rest) ? ex.rest : null;
      return `<div class="modal" onclick="if(event.target===this)G.closeModal()"><div class="sheet"><h1 style="font-size:20px;margin-bottom:4px">Rest timer</h1><div class="sm mut" style="margin-bottom:12px">${esc(ex.name)} · saved for this exercise everywhere</div>
        <div class="chips" style="gap:8px">${[45, 60, 90, 120, 150, 180, 240, 300].map(sec => `<button class="chip num ${cur === sec ? 'sel' : ''}" style="min-height:42px;min-width:64px" onclick="G.restSet(${q.i},${sec})">${mmss(sec)}</button>`).join('')}</div>
        <div class="row" style="margin-top:12px"><input id="rest_c" type="number" inputmode="numeric" placeholder="Custom seconds" value="${cur != null && ![45, 60, 90, 120, 150, 180, 240, 300].includes(cur) ? cur : ''}"><button onclick="G.restSet(${q.i},+document.getElementById('rest_c').value)">Set</button></div>
        <div class="g2" style="margin-top:12px"><button onclick="G.restSet(${q.i},null)" ${cur == null ? 'disabled' : ''}>Use default (${mmss(S.settings.rest)})</button><button class="ghost" onclick="G.closeModal()">Close</button></div></div></div>`;
    }
    if (q.type === 'pick') {
      return `<div class="modal" onclick="if(event.target===this)G.closeModal()"><div class="sheet pick"><div class="pick-hd"><div class="row"><input id="pq" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Search exercises…" value="${esc(q.q)}" oninput="G.pq(this.value)" onkeydown="if(event.key==='Enter')this.blur()" style="flex:1"><button class="pri" onclick="G.exEdit(null,true)">＋</button></div>
        <div class="chips hscroll" id="pmc" style="margin-top:10px">${pickChips('m')}</div><div class="chips hscroll" id="ptc" style="margin-top:6px">${pickChips('t')}</div></div><div id="pl" class="pick-list">${pickList()}</div></div></div>`;
    }
    if (q.type === 'menu') {
      const it = S.active && S.active.items[q.i], ex = it && EX[it.exId]; if (!ex) return '';
      return `<div class="modal" onclick="if(event.target===this)G.closeModal()"><div class="sheet"><div class="xs mut" style="text-transform:uppercase;letter-spacing:.08em;margin:0 2px 8px">${esc(ex.name)}</div>
        <div class="menu">${ITEM_MENU.map(o => { const sub = typeof o.sub === 'function' ? o.sub(it, ex) : o.sub, off = o.off && o.off(it, ex); return `<button class="mi ${o.cls || ''}" ${off ? 'disabled' : ''} onclick="${o.act}(${q.i})"><span class="mi-ic">${o.icon}</span><span class="sp" style="text-align:left">${esc(o.label)}<span class="xs mut" style="display:block;font-weight:400;margin-top:1px">${esc(off || sub)}</span></span></button>`; }).join('')}</div>
        <button class="ghost" style="width:100%;margin-top:8px" onclick="G.closeModal()">Cancel</button></div></div>`;
    }
    if (q.type === 'remove') {
      const a = S.active, it = a && a.items[q.i], ex = it && EX[it.exId]; if (!ex) return '';
      const m = S.mesos.find(x => x.id === a.mesoId), day = m && m.days.find(d => d.id === a.dayId), slot = planSlot(day, it);
      const done = it.sets.filter(s => s.done).length, only = day && day.items.length <= 1;
      return `<div class="modal" onclick="if(event.target===this)G.closeModal()"><div class="sheet"><h1 style="font-size:20px;margin-bottom:6px">Remove ${esc(ex.name)}?</h1>
        ${done ? `<div class="card sm" style="color:var(--warn);border-color:rgba(217,180,100,.35);background:var(--warn-bg);margin:8px 0">${done} logged set${done === 1 ? '' : 's'} on this movement will be discarded.</div>` : ''}
        <div class="menu" style="margin-top:10px">
          <button class="mi" onclick="G.rmDo(${q.i},false)"><span class="sp" style="text-align:left">This workout only<span class="xs mut" style="display:block;font-weight:400;margin-top:1px">Skip it today. It stays in the plan for next week.</span></span></button>
          <button class="mi bad" ${slot && !only ? '' : 'disabled'} onclick="G.rmDo(${q.i},true)"><span class="sp" style="text-align:left">Remove from mesocycle<span class="xs mut" style="display:block;font-weight:400;margin-top:1px">${!slot ? 'Not part of this workout’s plan.' : only ? 'It’s the only movement in this workout.' : `Deletes it from ${esc(day.name)} for the rest of ${esc(m.name)} (−${slot.sets} ${esc(ex.muscle)} sets/week).`}</span></span></button>
        </div>
        <button class="ghost" style="width:100%;margin-top:8px" onclick="G.closeModal()">Cancel</button></div></div>`;
    }
    if (q.type === 'missing') {
      return `<div class="modal" onclick="if(event.target===this)G.closeModal()"><div class="sheet"><h1 style="font-size:20px;margin-bottom:8px">Untrained muscle groups</h1>
        <p class="sm mut">These groups aren't assigned to any day yet:</p>
        <div class="chips" style="margin:10px 0">${q.list.map(m => `<span class="chip" style="color:var(--warn);border-color:rgba(217,180,100,.4);background:var(--warn-bg)">${esc(m)}</span>`).join('')}</div>
        <p class="sm mut">That's fine if intentional. Otherwise go back and add them to a day.</p>
        <div class="g2" style="margin-top:14px"><button class="pri" onclick="G.closeModal()">Go back</button><button onclick="G.wizGen(true)">Proceed anyway</button></div></div></div>`;
    }
    if (q.type === 'ex') {
      const e = q.ex;
      return `<div class="modal" onclick="if(event.target===this)G.closeModal()"><div class="sheet"><h1 style="font-size:20px;margin-bottom:12px">${q.id ? 'Edit' : 'New'} exercise</h1>
        <input id="e_name" value="${esc(e.name)}" placeholder="Name e.g. Cable Row (Cable)" style="margin-bottom:10px">
        <div class="g2" style="margin-bottom:10px"><label class="xs mut">Muscle<select id="e_mu">${[...C.MUSCLES, 'Other'].map(mu => `<option ${mu === e.muscle ? 'selected' : ''}>${mu}</option>`).join('')}</select></label>
        <label class="xs mut">Equipment<select id="e_type">${C.TYPES.map(t => `<option ${t === (e.type || 'Other') ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
        <div class="g3"><label class="xs mut">Min reps<input id="e_min" type="number" value="${e.min}"></label><label class="xs mut">Max reps<input id="e_max" type="number" value="${e.max}"></label><label class="xs mut">Step<input id="e_inc" type="number" step="any" value="${e.inc}"></label></div>
        <div class="g2" style="margin-top:10px"><label class="xs mut">Load<select id="e_load">${Object.entries(C.LOADS).map(([k, l]) => `<option value="${k}" ${k === (e.load || C.inferLoad(e.name, e.type)) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="xs mut">Rest (s)<input id="e_rest" type="number" inputmode="numeric" placeholder="Default ${S.settings.rest}" value="${Number.isFinite(e.rest) ? e.rest : ''}"></label></div>
        <div class="g2" style="margin-top:14px">${q.id ? '<button class="bad" onclick="G.exDel()">Delete</button>' : '<button onclick="G.closeModal()">Cancel</button>'}<button class="pri" onclick="G.exSave()">Save</button></div></div></div>`;
    }
    return '';
  }
  /** Exercise detail sheet opened by tapping the name on a workout card: today's guidance + history. */
  function exInfoHTML(i) {
    const it = S.active && S.active.items[i], ex = it && EX[it.exId]; if (!ex) return '';
    const L = loadOf(ex), asst = L === 'assist', bw = curBW(), pre = asst ? 'assist ' : L === 'bw' ? '+' : '';
    const ar = (from, to) => asst ? `Assist ${fw(from)} → ${fw(to)}` : `${fw(from)} → ${fw(to)}`;
    const badge = { new: '<span class="badge hd">New — enter weight</span>', rec: `<span class="badge rc num">2 RIR rec · ${pre}${fw(it.to)} × ${it.rec ? it.rec.reps : it.min}</span>`, up: `<span class="badge up num">↑ ${ar(it.from, it.to)} · range exceeded</span>`, hold: '<span class="badge hd">Beat last week</span>', down: `<span class="badge dn num">↓ ${ar(it.from, it.to)}</span>`, deload: '<span class="badge dl">Deload</span>' }[it.mode] || '';
    const recLine = it.rec && it.mode !== 'rec' ? `<span class="xs mut num">2 RIR rec: ${pre}${fw(it.rec.w)} × ${it.rec.reps}</span>` : '';
    const recSrc = it.rec ? `<span class="xs dim num">from last ${it.rec.n} session${it.rec.n === 1 ? '' : 's'}</span>` : '';
    const kv = (k, v) => `<div class="ex-kv"><span class="xs mut">${k}</span><b class="num">${v}</b></div>`;
    // history: newest first, best e1RM on load actually moved
    const hist = instances(it.exId, 30).map(x => {
      const work = x.sets.filter(st => st.t !== 'W');
      const e1 = Math.round(Math.max(0, ...work.filter(st => st.t !== 'D' && st.t !== 'M').map(st => C.e1rm(C.effW(st.w, L, bwAt(x.s.start)), st.r))) || 0);
      return { s: x.s, str: setStr(x.sets), e1, n: work.length };
    });
    const best = Math.max(0, ...hist.map(x => x.e1));
    const rows = hist.map(x => `<div class="ex-hist"><div class="row"><span class="sp sm"><b>${dstr(x.s.start)}</b> <span class="mut">· ${esc(x.s.name)}${x.s.week ? ' · W' + x.s.week : ''}</span></span>${x.e1 ? `<span class="xs num ${x.e1 === best ? 'ok-tx' : 'mut'}">e1RM ${fw(x.e1)}${x.e1 === best ? ' ★' : ''}</span>` : ''}</div><div class="xs mut num" style="margin-top:3px">${esc(x.str)}</div></div>`).join('');
    return `<div class="modal" onclick="if(event.target===this)G.closeModal()"><div class="sheet ex-sheet">
      <div class="row" style="align-items:flex-start"><div class="sp"><h1 style="font-size:20px;margin-bottom:2px">${esc(ex.name)}</h1><div class="sm mut">${esc(ex.muscle)} · ${esc(ex.type || 'Other')} · ${esc(C.LOADS[L] || L)}</div></div><button class="ico ghost" aria-label="Close" onclick="G.closeModal()">✕</button></div>
      <h2 style="margin-top:14px">Today</h2>
      <div class="card" style="margin-bottom:0">
        ${badge || recLine ? `<div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px">${badge}${recLine}${recSrc}</div>` : ''}
        <div class="ex-kvs">${kv('Rep range', it.min + '–' + it.max)}${kv('Sets', it.sets.filter(st => st.t !== 'W').length)}${kv('Rest', `<button class="link" onclick="G.restAsk(${i})">${mmss(restOf(ex))}</button>`)}${L !== 'ext' ? kv('Bodyweight', bw > 0 ? fw(bw) + ' ' + Shell.uW() : '—') : ''}</div>
        ${it.prev ? `<div class="xs mut num" style="margin-top:10px">Last${it.prevFrom ? ' (' + esc(it.prevFrom) + ')' : ''}: ${esc(it.prev)}</div>` : ''}
        ${L !== 'ext' && !(bw > 0) ? `<div class="card notice xs" style="margin:10px 0 0;padding:9px 11px"><div class="row" style="gap:6px"><span class="sp">Log bodyweight to track 1RM and get recommendations on ${asst ? 'assisted' : 'bodyweight'} lifts.</span><input id="bw_s_${i}" type="number" inputmode="decimal" step="any" placeholder="${Shell.uW()}" style="width:74px;min-height:34px;padding:4px 8px"><button class="sm" onclick="G.logBW('bw_s_${i}')">Save</button></div></div>` : ''}
      </div>
      <h2 style="margin-top:16px">History</h2>
      ${hist.length ? `<div class="ex-kvs" style="margin-bottom:8px">${kv('Sessions', hist.length + (hist.length >= 30 ? '+' : ''))}${kv('Best e1RM', best ? fw(best) : '—')}${kv('Last e1RM', hist[0].e1 ? fw(hist[0].e1) : '—')}</div>
        <div class="card" style="padding:4px 14px">${rows}</div>` : '<div class="sm mut" style="padding:6px 2px">No logged sets yet. Your first session sets the baseline.</div>'}
    </div></div>`;
  }
  function pickChips(k) {
    const q = ui.modal;
    return k === 'm' ? C.MUSCLES.map(mu => `<button class="chip ${q.muscle === mu ? 'sel' : ''}" onmousedown="event.preventDefault()" onclick="G.pm('${mu}')">${mu}</button>`).join('')
      : C.TYPES.map(t => `<button class="chip ${q.tf === t ? 'sel' : ''}" onmousedown="event.preventDefault()" onclick="G.pt('${t}')">${t}</button>`).join('');
  }
  /** Per-movement ⋯ menu. Add future actions here: {icon,label,sub,cls,act} where act(i) is a global handler. */
  const ITEM_MENU = [
    { icon: ICONS.fire, label: 'Add warm-up sets', act: 'G.warm',
      sub: () => (C.WARMUP_SCHEMES[S.settings.warm] || C.WARMUP_SCHEMES.std).label + ' of first working set',
      off: (it, ex) => loadOf(ex) !== 'ext' ? 'Not used on bodyweight or assisted lifts' : null },
    { icon: ICONS.clock, label: 'Rest timer', act: 'G.restAsk',
      sub: (it, ex) => Number.isFinite(ex.rest) ? mmss(ex.rest) + ' for this exercise' : mmss(S.settings.rest) + ' (default)' },
    { icon: ICONS.trash, label: 'Skip / remove movement', sub: 'Drop it from today, or from the mesocycle', cls: 'bad', act: 'G.rmAsk' },
  ];
  /** The mesocycle plan slot a session item came from. */
  function planSlot(day, it) {
    if (!day) return null;
    return (it.pid && day.items.find(x => x.pid === it.pid)) || day.items.find(x => x.exId === it.exId) || null;
  }
  function pickList() {
    const q = ui.modal, s = (q.q || '').toLowerCase();
    return S.exercises.filter(e => (!q.muscle || e.muscle === q.muscle) && (!q.tf || (e.type || 'Other') === q.tf) && e.name.toLowerCase().includes(s)).map(e => `<div class="li" onclick="G.pick('${e.id}')"><span class="sp sm">${esc(e.name)}</span><span class="chip">${esc(e.type || 'Other')}</span><span class="chip">${esc(e.muscle)}</span></div>`).join('') || '<div class="mut sm" style="padding:14px 2px">No match — tap ＋ to create it.</div>';
  }

  // ---------- render (the shell draws the page; this module supplies its views) ----------
  function render() { Shell.render(); }
  const VIEWS = { train: () => viewTrain(), meso: () => viewMeso(), prog: () => viewProg() };
  function setTab(t) { ui.tab = VIEWS[t] ? t : 'train'; Shell.focus('train'); }

  // ---------- actions ----------
  window.gui_set = (k, v) => { ui[k] = v; render(); };
  window.gui_pw = (d) => { const m = activeMeso(); const w = (ui.pw || m.week) + d; ui.pw = Math.min(m.weeks, Math.max(1, w)); render(); };
  window.gui_d = (k, v) => { ui.draft[k] = v; if (k === 'weeks' || k === 'deload') { } };
  window.gui_day = (di, v) => { ui.draft.days[di].name = v; };

  function newDraft() { return { id: C.uid(), name: 'Meso ' + (S.mesos.length + 1), start: Date.now(), weeks: 5, deload: true, startRIR: 3, week: 1, prio: {}, days: [{ id: C.uid(), name: 'Day 1', items: [] }] }; }
  const G = window.G = {
    go(t) { if (t === 'data') { Shell.go('more'); return; } ui.tab = VIEWS[t] ? t : 'train'; ui.modal = null; Shell.go('train'); },
    // --- session
    start(dayId) {
      const m = activeMeso(), d = m.days.find(x => x.id === dayId);
      ensurePids(m);
      S.active = { id: C.uid(), mesoId: m.id, week: m.week, dayId, name: d.name, start: Date.now(), note: '', items: d.items.filter(it => EX[it.exId]).map(it => buildItem(m, m.week, it.exId, it, dayId)) };
      save(); lock(); render(); window.scrollTo(0, 0);
    },
    sv(i, j, f, v) {
      const set = S.active.items[i].sets[j], old = set[f]; set[f] = f === 'w' ? fromDisp(v) : num(v);
      if (f === 'w') S.active.items[i].sets.forEach((s, k) => { if (k > j && !s.done && (s.w === '' || s.w === old)) { s.w = set.w; const el = document.getElementById(`w_${i}_${k}`); if (el) el.value = fw(set.w); } });
      save();
    },
    chk(i, j) {
      const it = S.active.items[i], s = it.sets[j]; s.done = !s.done;
      if (s.done) {
        unlockAudio(); if (window.Native) window.Native.tap();
        if (s.w === '') s.w = 0; if (s.r === '') s.r = 0;
        // warm-ups rest short, drop sets go straight on, myo-rep clusters rest briefly
        const base = restOf(EX[it.exId]), sec = s.t === 'W' ? Math.min(60, base) : s.t === 'D' ? 0 : s.t === 'M' ? 20 : base;
        if (sec > 0) startTimer(sec); else stopTimer();
        const work = it.sets.map((x, k) => C.isWork(x) ? k : -1).filter(k => k >= 0), lastW = work[work.length - 1];
        if (j === lastW && C.isWork(s) && !C.isDeload(S.mesos.find(m => m.id === S.active.mesoId), S.active.week)) {
          const exceeded = S.settings.trigger === 'hit' ? s.r >= it.max : s.r > it.max;
          if (exceeded) toast(loadOf(EX[it.exId]) === 'assist' ? '↑ Less assistance next week in this workout' : '↑ Weight goes up next week in this workout');
        }
      }
      save(); render();
    },
    addSet(i) { const it = S.active.items[i], l = [...it.sets].reverse().find(x => x.t !== 'W') || it.sets[it.sets.length - 1] || { w: '', r: it.min }; it.sets.push({ w: l.w, r: l.r, rir: '', done: false, t: '' }); save(); render(); },
    // --- set types
    stAsk(i, j) { ui.modal = { type: 'stype', i, j }; render(); },
    stSet(i, j, t) { const st = S.active.items[i].sets[j]; st.t = t; if (t === 'F' && st.rir === '') st.rir = 0; ui.modal = null; save(); render(); },
    // --- warm-ups: replaces any unchecked warm-up sets with a fresh ramp to the first working set
    warm(i) {
      const it = S.active.items[i], ex = EX[it.exId];
      const first = it.sets.find(x => x.t !== 'W'), w = first ? +first.w || 0 : 0;
      ui.modal = null;
      if (!(w > 0)) { render(); toast('Enter a working weight first'); return; }
      const bar = ex.type === 'Barbell' ? 45 : 0; // lb
      const ramp = C.warmups(w, { inc: ex.inc, scheme: S.settings.warm, bar });
      if (!ramp.length) { render(); toast('Too light for a warm-up ramp'); return; }
      it.sets = ramp.map(x => ({ w: x.w, r: x.r, rir: '', done: false, t: 'W' })).concat(it.sets.filter(x => x.t !== 'W' || x.done));
      save(); render(); toast(`Added ${ramp.length} warm-up set${ramp.length === 1 ? '' : 's'}`);
    },
    // --- per-exercise rest
    restAsk(i) { ui.modal = { type: 'rest', i }; render(); },
    exInfo(i) { ui.modal = { type: 'exinfo', i }; render(); },
    restSet(i, sec) {
      const ex = EX[S.active.items[i].exId];
      if (sec == null) delete ex.rest; else if (sec > 0) ex.rest = Math.round(sec); else { toast('Enter seconds'); return; }
      ui.modal = null; save(); render(); toast(sec == null ? 'Using default rest' : 'Rest set to ' + mmss(ex.rest));
    },
    // --- per-muscle feedback
    fb(mu, k, v) { const a = S.active; a.fb = a.fb || {}; const f = a.fb[mu] = Object.assign({}, a.fb[mu], { [k]: v }); delete f.skip; save(); render(); },
    fbDone(mu) { const f = S.active && (S.active.fb || {})[mu]; if (f) { f.closed = true; save(); render(); } },
    fbOpen(mu) { const f = S.active && (S.active.fb || {})[mu]; if (f) { delete f.closed; save(); render(); } },
    fbSkip(mu, on) { const a = S.active; a.fb = a.fb || {}; if (on) a.fb[mu] = { skip: true }; else delete a.fb[mu]; save(); render(); },
    // --- bodyweight (one entry per day; re-logging the same day replaces it)
    logBW(id) {
      const el = document.getElementById(id), w = fromDisp(el && el.value);
      if (!(w > 0)) { toast('Enter your bodyweight'); return; }
      Shell.logWeight(w);
      // rebuild untouched bodyweight/assisted lifts so recommendations pick up the new weight
      if (S.active) S.active.items.forEach((it, k) => { if (loadOf(EX[it.exId]) !== 'ext' && !it.sets.some(x => x.done)) { const m = S.mesos.find(x => x.id === S.active.mesoId); const nu = buildItem(m, S.active.week, it.exId, { sets: it.base, min: it.min, max: it.max, pid: it.pid }, S.active.dayId); nu.note = it.note; S.active.items[k] = nu; } });
      save(); render(); toast('Bodyweight logged');
    },
    rmSet(i) { const it = S.active.items[i]; if (it.sets.length > 1 && !it.sets[it.sets.length - 1].done) it.sets.pop(); save(); render(); },
    note(i, v) { S.active.items[i].note = v; save(); }, wnote(v) { S.active.note = v; save(); },
    swap(i) { ui.modal = { type: 'pick', mode: 'swap', i, q: '', muscle: EX[S.active.items[i].exId].muscle }; render(); },
    more(i) { ui.modal = { type: 'menu', i }; render(); },
    rmAsk(i) { ui.modal = { type: 'remove', i }; render(); },
    rmDo(i, perm) {
      const a = S.active, it = a.items[i]; if (!it) return;
      const name = EX[it.exId] ? EX[it.exId].name : 'Movement';
      if (perm) {
        const m = S.mesos.find(x => x.id === a.mesoId), day = m && m.days.find(d => d.id === a.dayId), slot = planSlot(day, it);
        if (slot && day.items.length > 1) day.items.splice(day.items.indexOf(slot), 1);
      }
      a.items.splice(i, 1); ui.modal = null; save(); render();
      toast(perm ? name + ' removed from mesocycle' : name + ' skipped');
    },
    finish() {
      const a = S.active, n = a.items.reduce((c, it) => c + it.sets.filter(s => s.done).length, 0);
      if (!n) { if (confirm('No completed sets. Discard this workout?')) G.discard(true); return; }
      const open = a.items.some(it => it.sets.some(s => !s.done)); if (open && !confirm('Some sets are unchecked and will be dropped. Finish?')) return;
      // apply per-muscle feedback to this workout's plan for next week
      const fbMsg = [];
      if (a.fb) Object.keys(a.fb).forEach(mu => {
        const pv = fbPreview(mu); if (!pv || !pv.changes.length) return;
        const { m: fm, items } = fbTargets(mu), ch = C.distributeSets(items, pv.delta, fbRoom(fm, mu, items));
        const net = ch.reduce((x, c) => x + c.to - c.from, 0); if (net) fbMsg.push(mu + ' ' + (net > 0 ? '+' : '') + net);
        a.fb[mu].delta = net;
      });
      a.bw = curBW() || undefined;
      a.items.forEach(it => { it.sets = it.sets.filter(s => s.done); });
      a.items = a.items.filter(it => it.sets.length); a.end = Date.now();
      S.sessions.push(a); S.active = null; stopTimer(); if (window.Native) window.Native.keepAwake(false); try { wake && wake.release(); } catch (e) { }
      save(); toast(fbMsg.length ? 'Saved · sets next week: ' + fbMsg.join(', ') : 'Workout saved'); render(); window.scrollTo(0, 0);
    },
    discard(skip) { if (skip || confirm('Discard this workout?')) { S.active = null; stopTimer(); if (window.Native) window.Native.keepAwake(false); save(); render(); } },
    tAdd(s) { timerEnd += s * 1000; timerBeeped = false; if (window.Native) window.Native.timerArm(Math.ceil((timerEnd - Date.now()) / 1000)); tickTimer(); }, tStop: stopTimer,
    nextWeek() { const m = activeMeso(); if (m.week >= m.weeks) { G.endMeso(); return; } if (confirm('Advance to week ' + (m.week + 1) + '?')) { m.week++; ui.pw = null; save(); render(); } },
    endMeso() { const m = activeMeso(); if (m && confirm('Archive "' + m.name + '"? Your logged data stays.')) { m.ended = Date.now(); S.activeMesoId = null; save(); render(); } },
    // --- builder
    newMeso() { ui.draft = null; ui.wizSaved = null; ui.wiz = { step: 'mode', days: 4, prio: {}, type: null, free: [] }; setTab('meso'); render(); window.scrollTo(0, 0); },
    wizMode(m) {
      if (m === 'custom') { ui.wiz = null; ui.draft = newDraft(); }
      else ui.wiz.step = 'days';
      render(); window.scrollTo(0, 0);
    },
    wizDays(n) { ui.wiz.days = n; render(); },
    wizStep(s) {
      if (s === 'mode' && ui.wiz && ui.wiz.step === 'mode') { G.cancelDraft(); return; }
      if (!ui.wiz) ui.wiz = ui.wizSaved ? Object.assign(clone(ui.wizSaved), { step: s }) : { step: s, days: (ui.draft && ui.draft.days.length) || 4, prio: (ui.draft && ui.draft.prio) || {}, type: null, free: [] };
      else ui.wiz.step = s;
      ui.draft = null; render(); window.scrollTo(0, 0);
    },
    wizPrio(mu) { G.setPrio(ui.wiz.prio, mu); },
    wizSplit(t) {
      const w = ui.wiz; w.type = t;
      if (t === 'freestyle') { w.free = Array.from({ length: w.days }, (_, i) => (w.free[i] && w.free[i].length) ? w.free[i] : ['', '', '']); w.step = 'free'; render(); window.scrollTo(0, 0); }
      else G.wizGen();
    },
    freeSet(di, si, v) { ui.wiz.free[di][si] = v; render(); },
    freeAdd(di) { const d = ui.wiz.free[di]; if (d.length < 5) d.push(''); render(); },
    freeDel(di, si) { const d = ui.wiz.free[di]; if (d.length > 1) d.splice(si, 1); render(); },
    wizGen(force) {
      const w = ui.wiz, prev = lastMeso();
      if (w.type === 'freestyle' && !force) {
        const miss = C.missingMuscles(w.free);
        if (miss.length) { ui.modal = { type: 'missing', list: miss }; render(); return; }
      }
      ui.modal = null;
      const prefer = new Set(prev ? prev.days.flatMap(d => d.items.map(i => i.exId)) : []);
      const days = C.generatePlan({ days: w.days, prio: w.prio, type: w.type, free: w.free, exercises: S.exercises, prefer, ranges: lastRanges() });
      const d = newDraft();
      d.days = days; d.prio = clone(w.prio); d.fromWiz = w.type;
      d.name = SPLITS[w.type] + ' ' + w.days + 'd';
      ui.wizSaved = clone(w); ui.draft = d; ui.wiz = null; save(); render(); window.scrollTo(0, 0);
    },
    schedMode(mode) {
      const m = activeMeso(); if (!m) return;
      m.sched = mode === 'fixed' ? 'fixed' : 'async';
      // first switch to fixed: spread the days Mon/Tue/Thu/Fri-style so there's a sensible starting point
      if (m.sched === 'fixed' && !m.days.some(d => Number.isInteger(d.dow))) {
        const lay = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] }[Math.min(7, m.days.length)] || [];
        m.days.forEach((d, k) => { if (lay[k] != null) d.dow = lay[k]; });
      }
      save(); render();
    },
    dow(dayId, v) {
      const m = activeMeso(), d = m && m.days.find(x => x.id === dayId); if (!d) return;
      if (v === '') delete d.dow; else d.dow = +v;
      save(); render();
    },
    editMeso() { ui.draft = Object.assign(clone(activeMeso()), { editing: true }); render(); window.scrollTo(0, 0); },
    cancelDraft() { ui.draft = null; ui.wiz = null; render(); },
    cyc(mu) { G.setPrio(ui.draft.prio, mu); },
    setPrio(prio, mu) {
      const was = prio[mu] || 'N', nx = C.nextPrio(prio, mu); prio[mu] = nx;
      if (was === 'N' && nx === 'M') toast('Priority is limited to ' + C.MAX_PRIO + ' muscles');
      render();
    },
    tmpl(name) {
      if (!name) return; const d = ui.draft, T = C.TEMPLATES[name]; const byName = Object.fromEntries(S.exercises.map(e => [e.name, e]));
      d.days = T.map(([dn, items]) => ({ id: C.uid(), name: dn, items: items.filter(([n]) => byName[n]).map(([n, s]) => ({ exId: byName[n].id, sets: s, min: byName[n].min, max: byName[n].max })) }));
      render();
    },
    addDay() { ui.draft.days.push({ id: C.uid(), name: 'Day ' + (ui.draft.days.length + 1), items: [] }); render(); },
    dupDay(di) { const d = clone(ui.draft.days[di]); d.id = C.uid(); d.name += ' (2)'; ui.draft.days.splice(di + 1, 0, d); render(); },
    delDay(di) { if (confirm('Remove this day?')) { ui.draft.days.splice(di, 1); render(); } },
    delItem(di, ii) { ui.draft.days[di].items.splice(ii, 1); render(); },
    up(di, ii) { const l = ui.draft.days[di].items; if (ii > 0) { [l[ii - 1], l[ii]] = [l[ii], l[ii - 1]]; render(); } },
    it(di, ii, f, v) { ui.draft.days[di].items[ii][f] = Math.max(1, parseInt(v) || 1); },
    addEx(di) { ui.modal = { type: 'pick', mode: 'add', di, q: '', muscle: '' }; render(); },
    saveDraft() {
      const d = ui.draft; if (!d) return;
      if (!d.days.some(x => x.items.length)) { toast('Add at least one exercise'); return; }
      d.days = d.days.filter(x => x.items.length);
      const bad = d.days.flatMap(x => x.items).find(i => i.min > i.max); if (bad) { toast('Min reps must be ≤ max reps'); return; }
      const wasEditing = d.editing; delete d.editing; delete d.fromWiz;
      if (wasEditing) { const k = S.mesos.findIndex(m => m.id === d.id); S.mesos[k] = d; if (d.week > d.weeks) d.week = d.weeks; }
      else { const old = activeMeso(); if (old) old.ended = Date.now(); d.start = Date.now(); S.mesos.push(d); S.activeMesoId = d.id; }
      ui.draft = null; setTab(wasEditing ? 'meso' : 'train'); save(); render(); window.scrollTo(0, 0);
    },
    // --- picker / exercise editor
    pq(v) { ui.modal.q = v; $('#pl').innerHTML = pickList(); },
    // filter chips refresh in place so the search field keeps focus (and the keyboard stays up)
    pm(mu) { ui.modal.muscle = ui.modal.muscle === mu ? '' : mu; $('#pmc').innerHTML = pickChips('m'); $('#pl').innerHTML = pickList(); $('#pl').scrollTop = 0; },
    pt(t) { ui.modal.tf = ui.modal.tf === t ? '' : t; $('#ptc').innerHTML = pickChips('t'); $('#pl').innerHTML = pickList(); $('#pl').scrollTop = 0; },
    swapD(di, ii) { ui.modal = { type: 'pick', mode: 'dswap', di, ii, q: '', muscle: EX[ui.draft.days[di].items[ii].exId].muscle }; render(); },
    pick(exId) {
      const q = ui.modal, ex = EX[exId];
      if (q.mode === 'add') ui.draft.days[q.di].items.push({ exId, sets: 3, min: ex.min, max: ex.max });
      else if (q.mode === 'dswap') ui.draft.days[q.di].items[q.ii].exId = exId; // keeps sets + rep range you set
      else {
        const a = S.active, m = S.mesos.find(x => x.id === a.mesoId), old = a.items[q.i], oldId = old.exId;
        if (oldId !== exId) {
          a.items[q.i] = buildItem(m, a.week, exId, { sets: old.base || old.sets.length, min: old.min, max: old.max, pid: old.pid }, a.dayId);
          const day = m.days.find(d => d.id === a.dayId), t = planSlot(day, old);
          if (t && confirm('Also replace it in the mesocycle for future sessions?\n\nOK = permanent swap\nCancel = this workout only')) t.exId = exId;
          save();
        }
      }
      ui.modal = null; render();
    },
    closeModal() { ui.modal = null; render(); },
    exEdit(id, fromPick) {
      const ex = id ? clone(EX[id]) : { name: '', muscle: (ui.modal && ui.modal.muscle) || 'Chest', type: (ui.modal && ui.modal.tf) || 'Other', min: 8, max: 12, inc: 5 };
      ui.modal = { type: 'ex', id, ex, fromPick: !!fromPick, back: fromPick ? ui.modal : null }; render();
    },
    exSave() {
      const q = ui.modal, rest = parseInt($('#e_rest').value);
      const e = { name: $('#e_name').value.trim(), muscle: $('#e_mu').value, type: $('#e_type').value, min: +$('#e_min').value || 1, max: +$('#e_max').value || 1, inc: +$('#e_inc').value || 5, load: $('#e_load').value };
      if (rest > 0) e.rest = rest; else if (q.id) delete EX[q.id].rest;
      if (!e.name) { toast('Name required'); return; } if (e.min > e.max) { toast('Min reps must be ≤ max'); return; }
      if (q.id) Object.assign(EX[q.id], e); else S.exercises.push(Object.assign(e, { id: 'u' + C.uid() }));
      save(); reindex(); ui.modal = q.back || null; if (q.back) q.back.q = e.name; render();
    },
    exDel() {
      const id = ui.modal.id; if (S.sessions.some(s => s.items.some(i => i.exId === id)) && !confirm('This exercise has logged history. Delete it anyway? (History rows will show "?")')) return;
      S.exercises = S.exercises.filter(e => e.id !== id); save(); ui.modal = null; render();
    },
    // --- data
    expCSV() { shareOrDownload('opengains-' + new Date().toISOString().slice(0, 10) + '.csv', C.toCSV(S.sessions, EX, Object.fromEntries(S.mesos.map(m => [m.id, m])), 'lb', bwAt), 'text/csv'); render(); },
    setting(k, v) { S.settings[k] = v; save(); render(); },
    openS(id) { ui.openSess = ui.openSess === id ? null : id; render(); },
    delSess(id) { if (confirm('Delete this workout?')) { S.sessions = S.sessions.filter(s => s.id !== id); save(); render(); } },
  };

  if (S.active) lock();

  /** Module interface used by the shell */
  window.GAINS = {
    view() { reindex(); return (VIEWS[ui.tab] || VIEWS.train)(); },
    modal() { reindex(); return ui.modal ? modalHTML() : ''; },
    closeModal() { ui.modal = null; },
    busy() { return !!(ui.wiz || ui.draft); },
    get tab() { return ui.tab; },
    set tab(t) { ui.tab = VIEWS[t] ? t : 'train'; },
    state: () => S,
    replace(j) { S = load(j); S.active = null; reindex(); return S; },
    reset() { S = fresh(); reindex(); stopTimer(); },
    takeLegacyBW() { const l = S._legacyBW; delete S._legacyBW; return l || null; },
    hasData: () => !!(S.sessions.length || S.mesos.length),
    hasActiveMeso: () => !!activeMeso(),
    dayInfo,
    settingsHTML, historyHTML, libraryHTML, todayCard,
  };
})();
