/* pro.js: subscriptions (openCOACH Pro) through RevenueCat → StoreKit / Google Play Billing.
   Hard paywall with a free trial: after the intro tour, the app needs an active "pro" entitlement.
   Active only in the store apps with a RevenueCat key set (config.js); the web app and key-less
   builds are never locked. Exporting your data always works, paid or not. */
(function () {
  'use strict';
  const CFG = window.OC_CONFIG || {}, Native = window.Native;
  const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases;
  const apiKey = Native ? ((CFG.revenuecat || {})[Native.platform] || '') : '';
  const ENT = CFG.entitlement || 'pro', GRACE = (CFG.offlineGraceDays || 3) * 864e5, CACHE = 'opencoach.pro';

  const st = { status: 'unknown', exp: null, packages: [], sel: null, busy: false, err: '', mgmt: null, offline: false, product: null, willRenew: true };
  let cache = {}; try { cache = JSON.parse(localStorage.getItem(CACHE)) || {}; } catch (e) { }
  const rerender = () => { if (window.Shell && Shell.render && Shell.ready) Shell.render(); };

  function apply(info) {
    const e = info && info.entitlements && info.entitlements.active && info.entitlements.active[ENT];
    st.status = e ? 'active' : 'none';
    st.exp = e && e.expirationDate ? Date.parse(e.expirationDate) : null;
    st.willRenew = e ? e.willRenew !== false : true;
    st.product = e ? e.productIdentifier : null;
    st.mgmt = (info && info.managementURL) || null;
    cache = { active: !!e, exp: st.exp, at: Date.now() };
    try { localStorage.setItem(CACHE, JSON.stringify(cache)); } catch (x) { }
  }
  const cancelled = (e) => !!(e && (e.userCancelled || e.code === '1' || e.code === 1 || /cancel/i.test(String(e.message || e))));

  const Pro = window.Pro = {
    enabled: !!(Native && P && apiKey),
    st,
    /** True when the app should show the paywall instead of the app. */
    locked() {
      if (!Pro.enabled) return false;
      if (st.status === 'active') return false;
      if (st.status === 'unknown' && cache.active && (!cache.exp || cache.exp + GRACE > Date.now())) return false; // offline, recently paid
      return true;
    },
    isPro() { return !Pro.enabled || !Pro.locked(); },

    async init() {
      if (!Pro.enabled) return;
      try {
        await P.configure({ apiKey });
        if (P.addCustomerInfoUpdateListener) P.addCustomerInfoUpdateListener((info) => { apply(info); rerender(); });
        const r = await P.getCustomerInfo(); apply(r && r.customerInfo ? r.customerInfo : r);
      } catch (e) { st.offline = true; }
      rerender();
      Pro.loadOfferings();
      // re-check when coming back from the App Store / Settings (renewals, cancellations, refunds)
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible') return;
        try { const r = await P.getCustomerInfo(); apply(r && r.customerInfo ? r.customerInfo : r); st.offline = false; rerender(); } catch (e) { }
      });
    },
    async loadOfferings() {
      try {
        const o = await P.getOfferings(), cur = o && (o.current || (o.all && Object.values(o.all)[0]));
        const order = { ANNUAL: 0, SIX_MONTH: 1, THREE_MONTH: 2, MONTHLY: 3, WEEKLY: 4 };
        st.packages = (cur && cur.availablePackages || []).slice().sort((a, b) => (order[a.packageType] ?? 9) - (order[b.packageType] ?? 9));
        if (!st.sel && st.packages.length) st.sel = st.packages[0].identifier; // annual pre-selected
        st.err = st.packages.length ? '' : 'Plans are unavailable right now. Check your connection and try again.';
        st.offline = false;
      } catch (e) { st.err = 'Can\'t reach the ' + (Native && Native.android ? 'Play Store' : 'App Store') + '. Connect to the internet and try again.'; st.offline = true; }
      rerender();
    },
    pick(id) { st.sel = id; rerender(); },
    async buy() {
      const pkg = st.packages.find(p => p.identifier === st.sel); if (!pkg || st.busy) return;
      st.busy = true; st.err = ''; rerender();
      try {
        const r = await P.purchasePackage({ aPackage: pkg }); apply(r && r.customerInfo);
        if (st.status === 'active') { if (Native) Native.success(); Shell.toast('Welcome to openCOACH Pro'); }
      } catch (e) { if (!cancelled(e)) st.err = (e && e.message) || 'Purchase didn\'t go through. You weren\'t charged.'; }
      st.busy = false; rerender();
    },
    async restore() {
      if (st.busy) return; st.busy = true; st.err = ''; rerender();
      try {
        const r = await P.restorePurchases(); apply(r && r.customerInfo ? r.customerInfo : r);
        Shell.toast(st.status === 'active' ? 'Subscription restored' : 'No active subscription found for this ' + (Native.android ? 'Google' : 'Apple') + ' account');
      } catch (e) { st.err = (e && e.message) || 'Restore failed. Try again.'; }
      st.busy = false; rerender();
    },
    manage() {
      const url = st.mgmt || (Native && Native.android ? 'https://play.google.com/store/account/subscriptions' : 'https://apps.apple.com/account/subscriptions');
      if (Native) Native.open(url); else window.open(url, '_blank');
    },
  };

  // ---------- views ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PERIOD = { ANNUAL: ['Yearly', 'year'], SIX_MONTH: ['6 months', '6 months'], THREE_MONTH: ['3 months', '3 months'], MONTHLY: ['Monthly', 'month'], WEEKLY: ['Weekly', 'week'] };
  const per = (p) => (PERIOD[p.packageType] || [p.product && p.product.title || p.identifier, 'period']);
  /** Free-trial length from the store's intro offer (e.g. "P1W" → "1-week"), else null. */
  function trialText(prod) {
    const ip = prod && prod.introPrice; if (!ip || ip.price > 0) return null;
    const n = ip.periodNumberOfUnits || 1, u = String(ip.periodUnit || '').toUpperCase();
    if (u === 'DAY') return n + '-day'; if (u === 'WEEK') return (n * 7) + '-day'; if (u === 'MONTH') return n + '-month';
    return (CFG.trialDays || 7) + '-day';
  }
  const where = () => Native && Native.android ? 'Google Play → Subscriptions' : 'Settings → your name → Subscriptions';
  const link = (href, txt) => `<a href="${href}" onclick="if(window.Native){Native.open(this.href);return false}" target="_blank" rel="noopener">${txt}</a>`;

  Pro.paywallHTML = function (hasData) {
    const pk = st.packages, sel = pk.find(p => p.identifier === st.sel) || pk[0];
    const prod = sel && sel.product, trial = trialText(prod), monthly = pk.find(p => p.packageType === 'MONTHLY');
    const saveVs = (p) => { // "Save 43%" against paying monthly for the same span
      if (!monthly || p === monthly || !p.product || !monthly.product) return '';
      const months = { ANNUAL: 12, SIX_MONTH: 6, THREE_MONTH: 3 }[p.packageType]; if (!months) return '';
      const pct = Math.round((1 - p.product.price / (monthly.product.price * months)) * 100);
      return pct >= 5 ? `<span class="chip ok-chip">Save ${pct}%</span>` : '';
    };
    const feats = [
      ['Training that progresses itself', 'Weights, reps and weekly sets adjust from every workout you log.'],
      ['Calories that learn from you', 'Adaptive expenditure and weekly check-ins from your weigh-in trend.'],
      ['Training & rest-day targets', 'More carbs when you lift, fewer when you don\'t, same weekly average.'],
      ['Yours, on your phone', 'No account, works offline, back up any time.'],
    ];
    let h = `<div class="pw"><div class="topbar"><span class="brand"><i class="brand-dot"></i><span>open<b>COACH</b></span></span><button class="sm ghost" onclick="Pro.restore()">Restore</button></div>
      <h1 style="font-size:28px;margin-top:8px">${trial ? `Try openCOACH Pro free for ${trial.replace('-', ' ')}s`.replace('1 months', '1 month') : 'Unlock openCOACH Pro'}</h1>
      <div class="pw-feats">${feats.map(([t, d]) => `<div class="row" style="align-items:flex-start;gap:12px;margin-bottom:12px"><span class="pw-tick">✓</span><div><b class="sm">${t}</b><div class="xs mut">${d}</div></div></div>`).join('')}</div>`;
    if (!pk.length) {
      h += `<div class="card notice sm" style="margin-top:8px">${esc(st.err || 'Loading plans…')}</div>${st.err ? '<button style="width:100%" onclick="Pro.loadOfferings()">Try again</button>' : ''}`;
    } else {
      h += pk.map(p => {
        const [name] = per(p), on = sel && p.identifier === sel.identifier, pm = p.packageType !== 'MONTHLY' && p.product.pricePerMonthString;
        return `<button class="pw-plan ${on ? 'on' : ''}" onclick="Pro.pick('${esc(p.identifier)}')"><span class="pw-radio"></span><span class="sp" style="text-align:left"><b>${esc(name)}</b>${pm ? `<span class="xs mut" style="display:block">${esc(pm)}/mo</span>` : ''}</span>${saveVs(p)}<b class="num">${esc(p.product.priceString)}</b></button>`;
      }).join('');
      const [, unit] = per(sel);
      h += `<button class="pri" style="width:100%;min-height:52px;font-size:16px;margin-top:6px" ${st.busy ? 'disabled' : ''} onclick="Pro.buy()">${st.busy ? 'Working…' : trial ? 'Start free trial' : 'Subscribe'}</button>
        <div class="xs mut" style="text-align:center;margin:10px 4px 0">${trial ? `Free for ${trial.replace('-', ' ')}s, then ${esc(prod.priceString)} per ${unit}.`.replace('1 months', '1 month') : `${esc(prod.priceString)} per ${unit}.`} Renews automatically until cancelled. Cancel any time in ${where()} at least 24 hours before the ${trial ? 'trial ends' : 'period ends'}.</div>`;
      if (st.err) h += `<div class="card notice xs" style="color:var(--warn);margin-top:10px">${esc(st.err)}</div>`;
    }
    h += `<div class="xs dim" style="text-align:center;margin-top:16px">${link(CFG.termsUrl, 'Terms of Use')} · ${link(CFG.privacyUrl, 'Privacy Policy')}${hasData ? ' · <a href="#" onclick="Shell.backup();return false">Export my data</a>' : ''}</div></div>`;
    return h;
  };

  /** More-tab card. */
  Pro.moreHTML = function () {
    if (!Pro.enabled) return '';
    const exp = st.exp ? new Date(st.exp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const line = st.status === 'active' ? `Active${exp ? (st.willRenew ? ' · renews ' : ' · ends ') + exp : ''}` : st.status === 'unknown' ? 'Checking…' : 'Not subscribed';
    return `<h2>Subscription</h2><div class="card"><div class="row"><div class="sp"><b class="sm">openCOACH Pro</b><div class="xs mut">${line}</div></div><button class="sm" onclick="Pro.manage()">Manage</button><button class="sm ghost" onclick="Pro.restore()">Restore</button></div></div>`;
  };
})();
