# Subscriptions (openCOACH Pro)

Hard paywall with a 7-day free trial, annual pre-selected (pricing from the business plan):

| Package (RevenueCat) | Product ID (both stores) | Price | Trial |
|---|---|---|---|
| `$rc_annual` | `oc_pro_annual` | $239.99 / year | 7 days |
| `$rc_six_month` | `oc_pro_6mo` | $149.99 / 6 months | 7 days |
| `$rc_monthly` | `oc_pro_monthly` | $34.99 / month | 7 days |

All three unlock one entitlement: **`pro`**.

## How it works in the app
- `pro.js` talks to RevenueCat (`@revenuecat/purchases-capacitor`), which runs StoreKit on iOS and Play Billing on Android.
- After the intro tour, a store build with a RevenueCat key shows only the paywall until `pro` is active.
- Prices, per-month amounts, "Save N%" and the trial length all come from the store, so changing a price in App Store Connect / Play Console needs no app update.
- **Offline:** the last known status is cached. A paid user stays unlocked offline until 3 days past expiry (`offlineGraceDays` in `config.js`).
- **Never locked:** the web app, and any build with an empty key in `config.js`. Ship TestFlight builds without keys until the store side is ready.
- **Data is never held hostage:** the paywall shows *Export my data* when there's anything logged.
- Paywall has everything App Review checks: price + period, trial terms, auto-renew/cancel wording, Restore, Terms of Use (Apple's standard EULA) and Privacy Policy links. More tab: status, Manage (store subscription page), Restore.

## Setup, in order

### 1. App Store Connect
1. Agreements, Tax, and Banking: **Paid Applications** agreement active (blocks everything else).
2. Apply to the **App Store Small Business Program** (15% instead of 30% under $1M/yr). The plan's numbers assume it.
3. Your app → Monetization → Subscriptions → create group **openCOACH Pro** → add the three products above. For each: price, localized display name + description, a review screenshot of the paywall.
4. Each product → Introductory Offers → **Free, 1 week**, all territories.
5. Users and Access → Integrations → **In-App Purchase** key (for RevenueCat), download the `.p8`.

### 2. Google Play Console
1. Payments profile set up (merchant account).
2. Monetize → Subscriptions → create `oc_pro_annual`, `oc_pro_6mo`, `oc_pro_monthly`, each with a base plan (auto-renewing) and a **free-trial offer: 7 days, new customers only**.
3. Products only become creatable after an `.aab` with the billing library is uploaded (any track). The Android workflow's bundle includes it.
4. Service account with *View financial data* + *Manage orders and subscriptions* for RevenueCat.

### 3. RevenueCat (app.revenuecat.com, free under $2.5K/mo tracked revenue)
1. New project **openCOACH** → add an App Store app (bundle `com.noahfrain.opencoach`, In-App Purchase key) and a Play Store app (package `com.noahfrain.opencoach`, service-account JSON).
2. Products → import the six products. Entitlements → **`pro`** → attach all of them.
3. Offerings → **default** (mark current) → packages Annual, Six Month, Monthly → map each to its iOS + Android product.
4. API keys → copy the **public** `appl_…` and `goog_…` keys into `config.js`.

### 4. Test before submitting
- iOS: TestFlight builds use the **sandbox**: purchases are free, renewals are sped up (1 year ≈ 1 hour), trials ≈ minutes. Try buy, cancel, restore after reinstall, airplane mode.
- Android: add your Google account under Play Console → Settings → **License testing**, install from the internal/closed track.
- Check the paywall shows store prices (not blank) in every build you submit; App Review rejects paywalls that fail to load.

## Not covered yet
- **The web app is free.** Anyone can use the GitHub Pages version without paying. Options later: RevenueCat Web Billing (Stripe) with an account, or turn Pages into a landing page once the store apps are live.
- Win-back / promo offers, family sharing, price tests.
