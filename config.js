/* config.js: release settings. Edit here, not in code.
   RevenueCat *public* SDK keys are designed to ship inside apps (they can only read offerings and
   make purchases), so they're safe in a public repo. Leave a key empty to build without the paywall,
   e.g. for internal TestFlight builds before subscriptions are set up. */
window.OC_CONFIG = {
  revenuecat: {
    ios: '',        // appl_…  (RevenueCat → Project → API keys → App Store)
    android: '',    // goog_…  (RevenueCat → Project → API keys → Play Store)
  },
  entitlement: 'pro',           // RevenueCat entitlement every product unlocks
  trialDays: 7,                 // marketing copy only; the real trial is the store's introductory offer
  termsUrl: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
  privacyUrl: 'https://noahfrain.github.io/openCOACH/privacy.html',
  offlineGraceDays: 3,          // keep unlocked this long past expiry when the store can't be reached
};
