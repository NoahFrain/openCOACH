/* app.js — openCOACH page: tab bar, Today and More tabs, unified tutorial, backup/import, boot.
   Training views come from gains.js (window.GAINS / actions G.*), nutrition and body from
   macros.js (window.MACROS / actions M.*). Both persist through Shell (shell.js). */
(function () {
  'use strict';
  const Shell = window.Shell, GAINS = window.GAINS, MACROS = window.MACROS, MC = window.MCore;
  const BUILD = 'v1.4 · 2026-11-23';
  const TUTORIAL_V = 1; // bump to re-show the tutorial to everyone after a major feature
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = (x) => Math.round((+x || 0) * 10) / 10;
  const toast = Shell.toast;

  const SVG = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const TABS = [
    ['today', SVG('<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>'), 'Today'],
    ['train', SVG('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'), 'Train'],
    ['food', SVG('<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18.5" cy="18" r="2.5"/>'), 'Food'],
    ['body', SVG('<path d="M4 19h16M5 15l4.5-4.5 3.5 3 6-7"/><path d="M15.5 6.5H19V10"/>'), 'Body'],
    ['more', SVG('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'), 'More'],
  ];
  // sub-sections inside a tab, shown as a segmented control under the brand bar
  const SUB = { train: [['train', 'Workout'], ['meso', 'Mesocycle'], ['prog', 'Progress']], food: [['log', 'Log'], ['plan', 'Plan & Coach']] };
  const modOf = (tab) => tab === 'train' ? GAINS : MACROS;

  const ui = { tab: 'today', modal: null, tipHidden: false };

  // ---------- shell rendering ----------
  Shell.topbar = (right) => {
    let h = `<div class="topbar"><span class="brand"><i class="brand-dot"></i><span>open<b>COACH</b></span></span>${right || ''}</div>`;
    const subs = SUB[ui.tab], mod = subs && modOf(ui.tab);
    const inSession = ui.tab === 'train' && GAINS.state().active && GAINS.tab === 'train';
    if (subs && !mod.busy() && !inSession) h += `<div class="seg">${subs.map(([k, l]) => `<button class="${mod.tab === k ? 'on' : ''}" onclick="Shell.sub('${k}')">${l}</button>`).join('')}</div>`;
    return h;
  };
  function render() {
    const y = window.scrollY;
    // hard paywall (store apps with subscriptions configured): after the intro tour, nothing but the paywall
    const pw = window.Pro && Pro.locked() && !(ui.modal && ui.modal.type === 'tour');
    document.body.classList.toggle('paywall', !!pw);
    if (pw) {
      const appEl0 = $('#app'); GAINS.closeModal(); MACROS.closeModal();
      appEl0.innerHTML = Pro.paywallHTML(GAINS.hasData() || MACROS.hasData()); $('#tabs').innerHTML = '';
      return;
    }
    const v = ui.tab === 'train' ? GAINS.view() : ui.tab === 'food' ? MACROS.view() : ui.tab === 'body' ? MACROS.view('body') : ui.tab === 'more' ? viewMore() : viewToday();
    // A running barcode scanner owns a live <video>; rebuilding it would kill the camera mid-scan,
    // so lift the live node out and drop it back into the fresh markup.
    // hold the page height through the swap so the scroll position can't clamp and jump (iOS then
    // repaints fixed bars at the wrong offset for a moment)
    const appEl = $('#app'); appEl.style.minHeight = appEl.offsetHeight + 'px';
    const liveScan = document.querySelector('#app .scan-wrap');
    if (liveScan) liveScan.remove();
    const upd = Shell.updateReady ? `<div class="card notice sm row" style="margin-bottom:10px"><span class="sp"><b>New version ready.</b> Reload to update (your data stays).</span><button class="sm pri" onclick="Shell.reloadNow()">Reload</button></div>` : '';
    $('#app').innerHTML = upd + v + GAINS.modal() + MACROS.modal() + (ui.modal ? shellModal() : '');
    if (liveScan) { const slot = document.querySelector('#app .scan-wrap'); if (slot) slot.replaceWith(liveScan); }
    $('#tabs').innerHTML = TABS.map(([k, i, l]) => `<button class="${ui.tab === k ? 'on' : ''}" onclick="Shell.go('${k}')"><span class="ti">${i}</span>${l}</button>`).join('');
    window.scrollTo(0, y);
    appEl.style.minHeight = '';
  }
  Shell.render = render;
  /** Switch tab from a user tap: closes any open sheet (and the camera) first. */
  Shell.go = (tab) => {
    GAINS.closeModal(); MACROS.closeModal(); if (ui.modal && ui.modal.type !== 'tour') ui.modal = null;
    ui.tab = TABS.some(t => t[0] === tab) ? tab : 'today';
    render(); window.scrollTo(0, 0);
  };
  /** A module moved itself to one of its own views; follow it without closing anything. */
  Shell.focus = (tab) => { ui.tab = tab; };
  Shell.sub = (k) => { const mod = modOf(ui.tab); mod.closeModal(); mod.tab = k; render(); window.scrollTo(0, 0); };

  // ---------- Today ----------
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => !!(window.Native || window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  function viewToday() {
    const now = new Date();
    let h = Shell.topbar() + `<h1 style="margin-bottom:2px">Today</h1><div class="mut xs" style="margin:0 2px 14px">${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>`;
    if (isIOS && !isStandalone() && !ui.tipHidden) h += `<div class="card notice sm row"><div class="sp"><b>Install openCOACH:</b> tap Share → <b>Add to Home Screen</b> for full-screen offline use.</div><button class="sm ghost" onclick="Shell.hideTip()">✕</button></div>`;
    const lots = GAINS.state().sessions.length >= 3 || Object.keys(MACROS.state().logs).length >= 5;
    if (lots && (!Shell.meta.lastBackup || Date.now() - Shell.meta.lastBackup > 14 * 864e5)) h += `<div class="card notice sm row"><span class="sp">No backup in 14+ days.</span><a href="#" onclick="Shell.go('more');return false">Back up now →</a></div>`;
    if (MACROS.checkInDue()) h += `<div class="card notice row"><div class="sp"><b class="sm">Weekly check-in ready</b><div class="xs mut">Review adaptive expenditure &amp; update targets</div></div><button class="pri sm" onclick="M.openCheckIn()">Check in</button></div>`;
    h += GAINS.todayCard() + MACROS.todayCard() + bodyCard();
    return h;
  }
  function bodyCard() {
    const tr = Shell.trend(), last = MACROS.weights().slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const u = Shell.uW(), d = (lb) => r1(Shell.toDisp(lb));
    const t = tr.length ? tr[tr.length - 1].trend : null, t7 = tr.length > 7 ? tr[tr.length - 8].trend : null;
    const today = last && last.date === MC.dateKey();
    return `<div class="card"><div class="row"><div class="sp"><div class="xs mut" style="text-transform:uppercase;letter-spacing:.08em">Bodyweight</div>
      ${t != null ? `<b class="num" style="font-size:16px">${d(t)} ${u}</b> <span class="xs mut">trend${t7 != null ? ` · ${t - t7 >= 0 ? '+' : ''}${d(t - t7)} ${u} (7d)` : ''}</span>` : '<b>No weigh-ins yet</b>'}
      <div class="xs mut" style="margin-top:3px">${today ? 'Weighed in today: ' + d(last.weightLb) + ' ' + u : 'Weigh in most mornings — it drives calorie coaching and bodyweight lifts'}</div></div>
      <button class="${today ? 'sm' : 'pri sm'}" onclick="M.openWeigh()">${today ? 'Edit' : 'Weigh in'}</button></div></div>`;
  }

  // ---------- More ----------
  function viewMore() {
    const g = GAINS.state(), m = MACROS.state(), days = Object.keys(m.logs).filter(k => (m.logs[k] || []).length).length;
    let h = Shell.topbar() + '<h1>More</h1>';
    h += `<div class="card"><div class="row"><div class="sp"><b>Account &amp; sync</b><div class="xs mut" style="margin-top:3px">Sign-in, cloud backup and sync across iPhone and Android are planned. For now everything stays on this device.</div></div><span class="chip">Planned</span></div></div>`;
    h += `<div class="card hero"><b>Backup &amp; export</b><div class="mut xs num" style="margin:4px 0 12px">${g.sessions.length} workout${g.sessions.length === 1 ? '' : 's'} · ${days} food day${days === 1 ? '' : 's'} · ${m.weights.length} weigh-in${m.weights.length === 1 ? '' : 's'}${Shell.meta.lastBackup ? ' · Last backup ' + new Date(Shell.meta.lastBackup).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</div>
      <div class="g2"><button class="pri" onclick="Shell.backup()">Backup JSON</button><label class="btn">Restore / import<input type="file" accept=".json,application/json" style="display:none" onchange="Shell.restore(this)"></label></div>
      <div class="g3" style="margin-top:8px"><button class="sm" onclick="G.expCSV()">Workouts CSV</button><button class="sm" onclick="M.expDiaryCSV()">Food CSV</button><button class="sm" onclick="M.expBioCSV()">Body CSV</button></div>
      <div class="xs mut" style="margin-top:9px">Backup JSON holds everything. Restore also accepts openGAINS and openMACROS backups: each replaces only its own half, and bodyweight entries are merged.</div></div>`;
    if (window.Pro) h += Pro.moreHTML();
    const th = Shell.theme();
    h += `<h2>General</h2><div class="card"><div class="xs mut" style="margin-bottom:4px">Appearance</div><div class="seg theme-seg" style="margin-bottom:12px">${[['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match phone']].map(([k, l]) => `<button class="${th === k ? 'on' : ''}" onclick="Shell.setTheme('${k}')">${l}</button>`).join('')}</div>${MACROS.unitsHTML()}<div class="xs dim" style="margin-top:8px">Weights are stored in lb; kg is converted for display.</div><button style="width:100%;margin-top:12px" onclick="Shell.startTour()">Replay tutorial</button></div>`;
    h += '<h2>Training</h2>' + GAINS.settingsHTML();
    h += '<h2>Food databases</h2>' + MACROS.foodDbHTML();
    h += '<h2>Workout history</h2>' + GAINS.historyHTML();
    h += '<h2>Exercise library</h2>' + GAINS.libraryHTML();
    h += `<h2>Food library (${m.foods.filter(f => !f.hidden).length})</h2>` + MACROS.libraryHTML();
    h += `<div style="height:10px"></div><button class="bad ghost" style="width:100%" onclick="Shell.reset()">Erase all data</button>
      <div class="xs dim" style="text-align:center;margin:16px 0 2px"><a href="https://noahfrain.github.io/openCOACH/privacy.html" target="_blank" rel="noopener" onclick="if(window.Native){Native.open(this.href);return false}">Privacy</a> · <a href="https://noahfrain.github.io/openCOACH/support.html" target="_blank" rel="noopener" onclick="if(window.Native){Native.open(this.href);return false}">Support</a></div><div class="xs dim num" style="text-align:center;margin:0 0 6px">openCOACH · build ${BUILD}${window.Native ? '' : ` · <a href="#" onclick="Shell.checkUpdate();return false">Check for update</a>`}</div>`;
    return h;
  }

  // ---------- backup / import ----------
  function shareOrDownload(name, text, mime) {
    if (window.Native) { window.Native.shareFile(name, text); return; }
    const file = new File([text], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: name }).catch(() => { });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  }
  /** openGAINS kept its own bodyweight list; fold it into the weigh-ins without overwriting a scale entry. */
  function moveLegacyBW() {
    const l = GAINS.takeLegacyBW(); if (!l) return 0;
    const have = new Set(MACROS.weights().map(w => w.date)); let n = 0;
    l.forEach(e => { const dk = MC.dateKey(e.t); if (e.w > 0 && !have.has(dk)) { MACROS.upsertWeight(e.w, dk); have.add(dk); n++; } });
    return n;
  }
  Shell.backup = () => {
    const out = { app: 'openCOACH', v: 1, exported: Date.now(), gains: GAINS.state(), macros: MACROS.exportState(), shell: Object.assign({}, Shell.meta) };
    shareOrDownload('opencoach-backup-' + MC.dateKey() + '.json', JSON.stringify(out), 'application/json');
    Shell.meta.lastBackup = Date.now(); Shell.save(); render();
  };
  Shell.restore = (inp) => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result); let msg;
        if (j && (j.app === 'openCOACH' || (j.gains && j.macros))) {
          if (!confirm('Restore this openCOACH backup?\n\nEverything on this device will be replaced.')) return;
          GAINS.replace(j.gains); MACROS.replace(j.macros); moveLegacyBW();
          Shell.meta = Object.assign({}, j.shell || {}); msg = 'Backup restored';
        } else if (j && j.v && Array.isArray(j.exercises) && Array.isArray(j.sessions)) {
          const n = j.sessions.length;
          if (!confirm(`Import ${n} workout${n === 1 ? '' : 's'} from openGAINS?\n\nTraining data on this device is replaced. Nutrition is untouched; bodyweight is merged.`)) return;
          GAINS.replace(j); const b = moveLegacyBW();
          msg = `Imported ${n} workout${n === 1 ? '' : 's'}` + (b ? ` + ${b} bodyweight entr${b === 1 ? 'y' : 'ies'}` : '');
        } else if (j && j.v && Array.isArray(j.foods) && j.logs && typeof j.logs === 'object') {
          if (!confirm('Import this openMACROS backup?\n\nNutrition and body data on this device are replaced. Training is untouched; weigh-ins on dates the backup lacks are kept.')) return;
          const keep = MACROS.weights().slice(); MACROS.replace(j);
          const have = new Set(MACROS.weights().map(w => w.date));
          keep.forEach(w => { if (!have.has(w.date)) MACROS.weights().push(w); });
          msg = 'Imported openMACROS data';
        } else throw new Error('Not an openCOACH, openGAINS or openMACROS backup');
        Shell.meta.tutorialSeen = TUTORIAL_V; Shell.save(); ui.modal = null; Shell.go('today'); toast(msg);
      } catch (e) { alert('Restore failed: ' + e.message); }
    };
    rd.readAsText(f);
  };
  Shell.reset = () => {
    if (!(confirm('Erase ALL openCOACH data on this device? Back up first if unsure.') && confirm('Really erase everything?'))) return;
    GAINS.reset(); MACROS.reset(); Shell.meta = {}; Shell.save(); Shell.startTour();
  };
  Shell.hideTip = () => { ui.tipHidden = true; render(); };

  // ---------- unified tutorial ----------
  const TI = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  function tourSteps() {
    const steps = [];
    if (isIOS && !isStandalone()) steps.push({
      tab: 'today', icon: TI('<path d="M12 3v12M8 7l4-4 4 4"/><rect x="4" y="11" width="16" height="10" rx="2.5"/>'),
      title: 'Install it first',
      body: 'Tap <b>Share</b> → <b>Add to Home Screen</b>, then open openCOACH from your home screen.',
      points: ['Runs full-screen, keeps the screen awake mid-workout, and works offline', 'Safari and the home-screen app keep <b>separate data</b>. Anything logged here won’t carry over'],
      next: 'Continue in Safari',
    });
    steps.push({
      tab: 'today', icon: TI('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.3 2.3 4.7-5"/>'),
      title: 'Welcome to openCOACH',
      body: 'Training, nutrition and bodyweight in one place. Each one feeds the others: your weigh-ins drive calorie coaching <i>and</i> your pull-up math.',
      demo: `<div class="g3 tour-loop"><div class="kpi"><div class="xs dim">Train</div><b class="sm">Log sets</b></div><div class="kpi"><div class="xs dim">Food</div><b class="sm">Log meals</b></div><div class="kpi"><div class="xs dim">Body</div><b class="sm">Weigh in</b></div></div>`,
      points: ['<b>Today</b> shows your next workout, today’s intake and your trend weight', 'The more consistently you log, the sharper the recommendations get'],
    });
    steps.push({
      tab: 'train', sub: 'meso', icon: TI('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2.5v3M16 2.5v3M3 9.5h18M8 14h3M13 14h3M8 17.5h5"/>'),
      title: 'Build a training block',
      body: 'A mesocycle is 3–8 weeks, usually ending in a deload. <b>Guided setup</b> picks days, muscle priorities and split, then builds exercises and set counts.',
      demo: `<div class="card" style="margin:0;padding:10px 12px"><div class="row" style="padding:3px 0"><span class="sp sm">Back</span><span class="sm num mut">14 / 14</span><span class="chip P" style="margin-left:8px">Priority</span></div><div class="row" style="padding:3px 0"><span class="sp sm">Biceps</span><span class="sm num mut">10 / 10</span><span class="chip N" style="margin-left:8px">Normal</span></div></div>`,
      points: ['Priority muscles get the most weekly sets, Maintain the fewest', 'Edit, swap or reorder anything later under Train → Mesocycle'],
    });
    steps.push({
      tab: 'train', sub: 'train', icon: TI('<path d="M4 6h16M4 12h16M4 18h10"/><path d="M17 16.5l1.8 1.8 3.2-3.6"/>'),
      title: 'Logging a workout',
      body: 'Weights and reps come pre-filled. Adjust if needed, add RIR (reps in reserve) if you track it, then tap <b>○</b> to check the set off and start the rest timer.',
      demo: `<div class="card" style="margin:0;padding:10px 12px"><div class="setrow t-W"><span class="n">W</span><span class="kpi num sm" style="text-align:center;padding:8px 0">95</span><span class="kpi num sm" style="text-align:center;padding:8px 0">8</span><span class="kpi sm dim" style="text-align:center;padding:8px 0">–</span><span class="kpi sm" style="text-align:center;padding:8px 0">○</span></div><div class="setrow done"><span class="n">1</span><span class="kpi num sm" style="text-align:center;padding:8px 0">185</span><span class="kpi num sm" style="text-align:center;padding:8px 0">9</span><span class="kpi num sm" style="text-align:center;padding:8px 0">2</span><span class="kpi sm" style="text-align:center;padding:8px 0;color:var(--ok)">✓</span></div></div>`,
      points: ['Tap a <b>set number</b> to mark warm-up, drop, myo-reps or failure', '<b>⋯</b> on a movement: warm-up ramp, its own rest timer, or skip/remove it'],
    });
    steps.push({
      tab: 'train', sub: 'train', icon: TI('<path d="M4 19h16M5 15l4.5-4.5 3.5 3 6-7"/><path d="M15.5 6.5H19V10"/>'),
      title: 'Weights and volume adjust',
      body: 'Beat the top of the rep range on your last set and that lift’s weight goes up next week. After each muscle’s last set, rate pump, soreness, joints and workload to steer its set count.',
      demo: `<div class="row" style="gap:6px;flex-wrap:wrap"><span class="badge up num">↑ 185 → 200 · range exceeded</span><span class="badge rc num">2 RIR rec · 160 × 14</span><span class="badge up num">+1 set next week</span></div>`,
      points: ['First time in a workout? You get a 2 RIR recommendation from your last 6 sessions of that lift', 'Joint pain or still being sore always backs volume off'],
    });
    steps.push({
      tab: 'food', sub: 'log', icon: TI('<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18.5" cy="18" r="2.5"/>'),
      title: 'Logging food',
      body: 'Tap <b>+ Add</b> on any meal, or <b>Scan</b> a barcode from the top bar.',
      demo: `<div class="card" style="margin:0;padding:10px 12px"><div class="sec-h" style="padding-top:0">★ Favorites</div><div class="li"><div class="sp sm"><span class="fav">★</span> Chicken Breast (Cooked)</div><b class="sm num">186</b></div><div class="sec-h">Recent</div><div class="li"><div class="sp sm">Rolled Oats (Dry)</div><b class="sm num">150</b></div></div>`,
      points: ['Search your library, Open Food Facts, or USDA', '<b>Copy yesterday</b> and <b>Saved Meals</b> for repeat days'],
    });
    steps.push({
      tab: 'food', sub: 'log', icon: TI('<path d="M4 19h16M5 15l4.5-4.5 3.5 3 6-7"/><path d="M15.5 6.5H19V10"/>'),
      title: 'Complete days drive coaching',
      body: 'Your expenditure is estimated from intake vs. weight trend, so only finished, fully logged days count.',
      demo: `<div class="card" style="margin:0;padding:10px 12px"><div class="row" style="gap:6px"><b class="sm">Coaching data</b><span class="chip ok-chip">Counted</span><span class="chip warn-chip">Partial</span></div><div class="xs mut" style="margin-top:4px">Bottom of each day on the Food log</div></div>`,
      points: ['Today never counts until it ends', 'Use <b>Mark complete</b> for a real low day, <b>Exclude</b> for a day you didn’t track'],
    });
    steps.push({
      tab: 'body', icon: TI('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 10a5 5 0 0 1 7 0M12 10l1.5-2"/>'),
      title: 'Weigh in, then check in',
      body: 'Weigh in most mornings. Daily noise is smoothed into a trend, and that trend is the bodyweight used everywhere in the app.',
      demo: `<div class="card notice row" style="margin:0"><div class="sp"><b class="sm">Weekly check-in ready</b><div class="xs mut">Review adaptive expenditure &amp; update targets</div></div><span class="chip sel">Check in</span></div>`,
      points: ['Every 7 days, review the update and <b>Apply</b> or <b>Keep current</b>', 'Pull-ups, dips and assisted machines use your trend weight for 1RM and progression'],
    });
    steps.push({
      tab: 'more', icon: TI('<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"/><path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3"/>'),
      title: 'Your data lives on this phone',
      body: 'No account yet. Back up from <b>More</b> so a reset or a new phone doesn’t cost you your history.',
      points: ['<b>Backup JSON</b> restores everything; CSVs are for spreadsheets', 'Coming from openGAINS or openMACROS? <b>Restore / import</b> takes their backups', 'Replay this tour anytime from More'],
    });
    return steps;
  }
  function showStep(st) { ui.tab = st.tab; if (st.sub) modOf(st.tab).tab = st.sub; }
  function shellModal() {
    if (ui.modal.type !== 'tour') return '';
    const steps = tourSteps(), i = MC.clamp(ui.modal.i || 0, 0, steps.length - 1), st = steps[i], last = i === steps.length - 1;
    const cta = last ? (!MACROS.hasGoal() ? 'Set my nutrition goal' : !GAINS.hasActiveMeso() ? 'Build my first block' : 'Get started') : (st.next || 'Next');
    return `<div class="modal"><div class="sheet tour" ontouchstart="sui_tourT(event,0)" ontouchend="sui_tourT(event,1)">
      <div class="row" style="margin-bottom:4px"><span class="xs dim num sp">${i + 1} of ${steps.length}</span><button class="sm ghost" onclick="Shell.endTour(false)">Skip</button></div>
      <div class="tour-step" key="${i}">
        <div class="tour-ic">${st.icon}</div>
        <b class="tour-h">${st.title}</b>
        <p class="sm mut tour-p">${st.body}</p>
        ${st.demo ? `<div class="tour-demo" aria-hidden="true">${st.demo}</div>` : ''}
        ${st.points ? `<ul class="tour-pts">${st.points.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="tour-dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="g2"><button ${i === 0 ? 'disabled' : ''} onclick="Shell.tourStep(-1)">Back</button><button class="pri" onclick="${last ? 'Shell.endTour(true)' : 'Shell.tourStep(1)'}">${cta}</button></div>
    </div></div>`;
  }
  Shell.startTour = () => { GAINS.closeModal(); MACROS.closeModal(); ui.modal = { type: 'tour', i: 0 }; showStep(tourSteps()[0]); render(); window.scrollTo(0, 0); };
  Shell.tourStep = (d) => {
    if (!ui.modal || ui.modal.type !== 'tour') return;
    const steps = tourSteps(), i = MC.clamp((ui.modal.i || 0) + d, 0, steps.length - 1);
    if (i === ui.modal.i) return;
    ui.modal.i = i; showStep(steps[i]); render(); window.scrollTo(0, 0);
  };
  Shell.endTour = (cta) => { // Skip and finish both count as seen
    Shell.meta.tutorialSeen = TUTORIAL_V; Shell.save(); ui.modal = null;
    if (cta && !MACROS.hasGoal()) { M.startWiz(); return; }
    if (cta && !GAINS.hasActiveMeso()) { G.newMeso(); return; }
    Shell.go('today');
  };
  let tourX = null, tourY = null;
  window.sui_tourT = (e, end) => { // horizontal swipe between tour steps
    const t = e.changedTouches && e.changedTouches[0]; if (!t) return;
    if (!end) { tourX = t.clientX; tourY = t.clientY; return; }
    if (tourX == null) return;
    const dx = t.clientX - tourX, dy = t.clientY - tourY; tourX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) Shell.tourStep(dx < 0 ? 1 : -1);
  };

  // ---------- boot ----------
  // iOS keyboard overlays fixed elements instead of resizing them; track the visible viewport so
  // bottom sheets shrink to the space above the keyboard.
  const vv = window.visualViewport;
  function fitVV() { if (!vv) return; const r = document.documentElement.style; r.setProperty('--vvh', vv.height + 'px'); r.setProperty('--vvt', vv.offsetTop + 'px'); }
  if (vv) { vv.addEventListener('resize', fitVV); vv.addEventListener('scroll', fitVV); fitVV(); }

  // Keyboard up → hide the tab bar and rest timer. On iOS, position:fixed bars follow the layout viewport
  // and get stranded mid-screen while the keyboard is open (or right after it closes).
  const typing = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|range)$/.test(el.type)));
  let kbT = null;
  document.addEventListener('focusin', (e) => { if (typing(e.target)) { clearTimeout(kbT); document.body.classList.add('kb'); } });
  document.addEventListener('focusout', () => {
    clearTimeout(kbT);
    // focus moving input→input fires focusout then focusin; wait a beat before showing the bars again
    kbT = setTimeout(() => {
      if (typing(document.activeElement)) return;
      document.body.classList.remove('kb');
      window.scrollTo(window.scrollX, window.scrollY); // nudge iOS to re-anchor fixed elements
    }, 120);
  });

  Shell.applyTheme();
  if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: light)'); const f = () => { if (Shell.theme() === 'auto') Shell.applyTheme(); }; mq.addEventListener ? mq.addEventListener('change', f) : mq.addListener && mq.addListener(f); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  // ---- updates (web/PWA only; the store apps ship their files inside the app) ----
  // iOS keeps a home-screen app alive in the background for days and never "navigates", so the browser's
  // own update check rarely runs. Check on every resume and every 30 min; when a new version takes over,
  // reload at a safe moment (app backgrounded) or offer a button now.
  if (!window.Native && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      const check = () => reg.update().catch(() => { });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      setInterval(check, 30 * 60e3);
    }).catch(() => { });
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; } // very first install, nothing to refresh
      Shell.updateReady = true;
      if (document.visibilityState === 'hidden') { location.reload(); return; }
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') location.reload(); }, { once: true });
      render();
    });
  }
  Shell.reloadNow = () => location.reload();
  Shell.checkUpdate = async () => {
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (!reg) { location.reload(); return; }
      toast('Checking…'); await reg.update();
      setTimeout(() => { if (!Shell.updateReady && !reg.installing && !reg.waiting) toast('You\'re on the latest version'); }, 2500);
    } catch (e) { toast('Couldn\'t check (offline?)'); }
  };

  const moved = moveLegacyBW();
  // people arriving with data (legacy apps on this origin, or a restore) skip the first-run tour
  if (Shell.meta.tutorialSeen == null) Shell.meta.tutorialSeen = (GAINS.hasData() || MACROS.hasData()) ? TUTORIAL_V : 0;
  Shell.ready = true; Shell.save();
  if (GAINS.state().active) ui.tab = 'train'; // resume a workout in progress
  if ((+Shell.meta.tutorialSeen || 0) < TUTORIAL_V && !GAINS.state().active) { ui.modal = { type: 'tour', i: 0 }; showStep(tourSteps()[0]); }
  render();
  if (window.Pro) Pro.init();
  if (Shell.fromLegacy) toast('Brought over your openGAINS / openMACROS data' + (moved ? ` (+${moved} bodyweight)` : ''));
  window.__S = () => ({ gains: GAINS.state(), macros: MACROS.state(), shell: Shell.meta }); // debug hook for tests
})();
