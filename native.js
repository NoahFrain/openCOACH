/* native.js: thin bridge to the iOS / Android shell (Capacitor). Loads first; on the web it does nothing
   and window.Native stays null, so every caller writes `window.Native && Native.x()`.
   No bundler: Capacitor injects window.Capacitor into the WebView and exposes installed plugins
   on Capacitor.Plugins, so plain scripts can call them directly. */
(function () {
  'use strict';
  const Cap = window.Capacitor;
  if (!(Cap && Cap.isNativePlatform && Cap.isNativePlatform())) { window.Native = null; return; }

  const P = Cap.Plugins, platform = Cap.getPlatform();
  const KEY = 'opencoach.v1', FILE = 'opencoach.json', TMP = 'opencoach.tmp.json', DIR = 'DATA';
  const TIMER_ID = 4101;
  document.documentElement.classList.add('native', 'native-' + platform);
  const call = (plugin, fn, arg) => { try { const p = P[plugin]; return p && p[fn] ? Promise.resolve(p[fn](arg)).catch(() => null) : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } };

  // ---- durable storage --------------------------------------------------------------------------
  // localStorage stays the working store (synchronous, the whole app is built on it). Every save is
  // mirrored to a JSON file in the app's private data folder, which the OS never evicts and which
  // device backups (iCloud / Google) include. If localStorage ever comes up empty (OS purged WebView
  // data, reinstall from backup), boot restores from the file and reloads once.
  let mirrorOn = false, pending = null, writeT = null;
  async function writeNow() {
    if (pending == null) return;
    const data = pending; pending = null;
    const FS = P.Filesystem; if (!FS) return;
    try {
      await FS.writeFile({ path: TMP, data, directory: DIR, encoding: 'utf8' });
      await FS.rename({ from: TMP, to: FILE, directory: DIR, toDirectory: DIR });
    } catch (e) {
      try { await FS.writeFile({ path: FILE, data, directory: DIR, encoding: 'utf8' }); } catch (e2) { }
    }
  }
  async function restoreCheck() {
    let have = null; try { have = localStorage.getItem(KEY); } catch (e) { }
    if (!have) {
      try {
        const r = await P.Filesystem.readFile({ path: FILE, directory: DIR, encoding: 'utf8' });
        const txt = r && typeof r.data === 'string' ? r.data : '';
        const j = txt && JSON.parse(txt);
        if (j && j.v && !sessionStorage.getItem('oc_restored')) {
          sessionStorage.setItem('oc_restored', '1');
          localStorage.setItem(KEY, txt);
          location.reload();
          return;
        }
      } catch (e) { } // no file yet: first launch
    }
    mirrorOn = true; // only now: an empty first-boot state must never overwrite a good file
    if (have) { pending = have; writeNow(); }
  }

  const Native = window.Native = {
    platform,
    ios: platform === 'ios',
    android: platform === 'android',

    /** Called by Shell.save() with the JSON it just wrote to localStorage. */
    persist(json) {
      pending = json;
      if (!mirrorOn) return;
      clearTimeout(writeT); writeT = setTimeout(writeNow, 800);
    },
    flush() { clearTimeout(writeT); if (mirrorOn) return writeNow(); },

    // ---- haptics ----
    tap() { call('Haptics', 'impact', { style: 'LIGHT' }); },
    thud() { call('Haptics', 'impact', { style: 'MEDIUM' }); },
    success() { call('Haptics', 'notification', { type: 'SUCCESS' }); },

    // ---- rest timer that fires with the phone locked ----
    async timerArm(sec, label) {
      const LN = P.LocalNotifications; if (!LN || !(sec > 0)) return;
      try {
        let st = await LN.checkPermissions();
        if (st.display === 'prompt' || st.display === 'prompt-with-rationale') st = await LN.requestPermissions();
        if (st.display !== 'granted') return;
        await LN.cancel({ notifications: [{ id: TIMER_ID }] }).catch(() => { });
        await LN.schedule({ notifications: [{ id: TIMER_ID, title: 'Rest is up', body: label ? 'Next set: ' + label : 'Time for your next set', schedule: { at: new Date(Date.now() + sec * 1000), allowWhileIdle: true } }] });
      } catch (e) { }
    },
    timerDisarm() { call('LocalNotifications', 'cancel', { notifications: [{ id: TIMER_ID }] }); },

    // ---- screen stays on during a workout ----
    // (iOS WKWebView ignores navigator.wakeLock; the native side honours this via KeepAwake below)
    keepAwake(on) { call('KeepAwake', on ? 'keepAwake' : 'allowSleep'); },

    // ---- system bars follow the in-app theme ----
    bars(theme) {
      // 'DARK' = light glyphs for a dark background, 'LIGHT' = dark glyphs for a light background
      call('SystemBars', 'setStyle', { style: theme === 'light' ? 'LIGHT' : 'DARK' });
    },

    // ---- files: export / backup through the share sheet (WebView downloads go nowhere) ----
    async shareFile(name, text) {
      const FS = P.Filesystem, SH = P.Share; if (!FS || !SH) return false;
      try {
        const w = await FS.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
        await SH.share({ title: name, files: [w.uri] });
      } catch (e) { if (!/cancel/i.test(String(e && e.message))) return false; }
      return true;
    },

    /** Open a link in the system browser rather than inside the app. */
    open(url) { if (P.Browser) return P.Browser.open({ url }); window.open(url, '_blank'); },
  };

  // flush the mirror whenever the app leaves the foreground; nothing is lost if iOS kills it there
  if (P.App && P.App.addListener) {
    P.App.addListener('pause', () => { Native.flush(); });
    P.App.addListener('appStateChange', (s) => { if (s && !s.isActive) Native.flush(); });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Native.flush(); });

  if (P.Filesystem) restoreCheck(); else mirrorOn = true;
  if (P.SplashScreen) setTimeout(() => call('SplashScreen', 'hide'), 150);
})();
