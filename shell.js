/* shell.js — openCOACH infrastructure shared by both modules: storage, units, shared bodyweight.
   Loaded before gains.js / macros.js. The page UI (tabs, Today, More, tutorial) is in app.js. */
(function () {
  'use strict';
  const KEY = 'opencoach.v1';
  // Pre-merge apps. Only readable if they were served from this same origin (e.g. a browser, not an
  // installed iPhone web app, which keeps isolated storage); otherwise users import a backup file.
  const LEGACY = { gains: 'hypertrophy.v1', macros: 'openmacros.v1' };
  const LB_PER_KG = 2.20462;

  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
  let fromLegacy = false;
  if (!raw || !raw.v) {
    raw = { v: 1, shell: {} };
    for (const k in LEGACY) {
      try { const j = JSON.parse(localStorage.getItem(LEGACY[k])); if (j && j.v) { raw[k] = j; fromLegacy = true; } } catch (e) { }
    }
  }

  let bwTrend = null; // cached daily trend from the weigh-ins; cleared on every save

  const Shell = window.Shell = {
    KEY,
    fromLegacy,
    ready: false,                   // app.js flips this once both modules have loaded
    meta: raw.shell || {},          // { tutorialSeen, lastBackup }
    part: (k) => raw[k] || null,    // a module's stored state at boot

    save() {
      bwTrend = null;
      if (!Shell.ready) return;
      try {
        localStorage.setItem(KEY, JSON.stringify({ v: 1, app: 'openCOACH', gains: window.GAINS.state(), macros: window.MACROS.state(), shell: Shell.meta }));
      } catch (e) { Shell.toast('Could not save — storage full or blocked'); }
    },

    // ---- units: every weight is stored in lb; kg is display-only ----
    unit: () => (window.MACROS ? window.MACROS.unit() : 'lb'),
    uW: () => Shell.unit(),
    toDisp: (lb) => Shell.unit() === 'kg' ? lb / LB_PER_KG : lb,
    fromDisp: (x) => Shell.unit() === 'kg' ? x * LB_PER_KG : x,
    LB_PER_KG,

    // ---- shared bodyweight: the nutrition weigh-ins, smoothed ----
    trend() { if (!bwTrend) bwTrend = window.MCore.trendWeights(window.MACROS.weights()); return bwTrend; },
    /** Trend bodyweight (lb) in effect at time t: latest day on/before t, else the first day, else 0. */
    bwAt(t) {
      const tr = Shell.trend(); if (!tr.length) return 0;
      const dk = window.MCore.dateKey(t);
      let lo = 0, hi = tr.length - 1, ans = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (tr[mid].date <= dk) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
      return Math.round((ans < 0 ? tr[0] : tr[ans]).trend * 10) / 10;
    },
    /** Log today's scale weight (lb) from anywhere in the app. */
    logWeight(lb, dk) { window.MACROS.upsertWeight(lb, dk); Shell.save(); },

    // ---- training vs. rest day (drives nutrition targets when cycling is on) ----
    /** 'train' | 'rest' for a date: manual mark first, then a logged/started workout, then the fixed weekly schedule; async defaults to rest. */
    dayKind(dk) {
      dk = dk || window.MCore.dateKey();
      const mark = window.MACROS.dayType(dk);
      if (mark) return mark === 'T' ? 'train' : 'rest';
      const i = window.GAINS.dayInfo(dk);
      if (i.trained) return 'train';
      return i.fixed && i.scheduled.length ? 'train' : 'rest';
    },
    trainDaysPerWeek() { return window.GAINS.dayInfo().perWeek || 4; },
    /** Nutrition targets for a date, with the training/rest-day split applied when it's on. */
    dayPlan(dk) {
      const M = window.MACROS, plan = M.plan(); if (!plan) return null;
      const c = M.cycle();
      return window.MCore.dayTargets(plan, { on: c.on, shift: c.shift, trainDays: Shell.trainDaysPerWeek(), kind: c.on ? Shell.dayKind(dk) : null });
    },

    // ---- theme: 'dark' | 'light' | 'auto' (follows the phone) ----
    theme: () => Shell.meta.theme || 'dark',
    applyTheme() {
      let t = Shell.theme();
      if (t === 'auto') t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      const mc = document.getElementById('themeColor'); if (mc) mc.content = t === 'light' ? '#e8e7ed' : '#111114';
    },
    setTheme(t) { Shell.meta.theme = t; Shell.save(); Shell.applyTheme(); if (Shell.render) Shell.render(); },

    // ---- prefilled numbers clear on focus so typing replaces them; blur with nothing typed puts the value back ----
    fzIn(el) { if (el.value === '') return; el.dataset.o = el.value; el.dataset.ph = el.placeholder; el.placeholder = el.value; el.value = ''; el.classList.add('fz'); },
    fzOut(el) {
      if (el.dataset.o == null) return;
      if (el.value === '') el.value = el.dataset.o;
      el.placeholder = el.dataset.ph || ''; delete el.dataset.o; delete el.dataset.ph; el.classList.remove('fz');
    },

    toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); },
    // render / go / focus / topbar are installed by app.js
  };
})();
