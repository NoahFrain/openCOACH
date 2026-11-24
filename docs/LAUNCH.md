# openCOACH store launch

iOS first, Android in parallel. One codebase: the repo root is the web app (GitHub Pages), and Capacitor wraps the same files into the iOS and Android apps. No Mac is needed; GitHub's hosted Macs build and upload the iOS app.

```
repo root (index.html, *.js)  ──npm run build──▶  www/  ──cap sync──▶  ios/  android/
        │                                                          │        │
   GitHub Pages (PWA)                                   GitHub Actions: TestFlight · Play
```

## Status

| Piece | State |
|---|---|
| Capacitor 8 iOS + Android projects | ✅ in repo (`ios/`, `android/`), bundle ID `com.noahfrain.opencoach` |
| Native features | ✅ rest-timer notification when locked, haptics, screen stays awake, share-sheet export, system bars follow theme, data mirrored to a file the OS never evicts |
| App icon + splash | ⚠️ generated from the 512 px icon upscaled to 1024. Export a true 1024×1024 (no transparency) to `assets/icon-only.png` and run `npm run assets` |
| CI build check (every PR) | ✅ `ci.yml`: tests, Android debug APK, iOS simulator build |
| iOS → TestFlight pipeline | ✅ `ios.yml`, needs the 4 Apple secrets below |
| Android → Play pipeline | ✅ `android.yml`, needs the keystore secrets below |
| Privacy policy / support pages | ✅ `privacy.html`, `support.html` (served by Pages) |
| Subscriptions (StoreKit / Play Billing) | ✅ paywall + RevenueCat wired; store products and keys still to create ([SUBSCRIPTIONS.md](SUBSCRIPTIONS.md)) |

## Phase 1: accounts (start today; these have waiting periods)

### Apple
1. **Apple Developer Program** ($99/yr): developer.apple.com/programs/enroll.
   - *Individual*: fastest, store shows your legal name as the seller.
   - *Organization*: store shows the company name; needs an LLC and a D-U-N-S number (free, can take 1–2 weeks). Can't easily switch later without transferring the app.
2. **App Store Connect → Agreements, Tax, and Banking**: sign the *Paid Applications* agreement and add bank + tax info. Required before any subscription can be sold; approval can take days.
3. **App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → +**: role **Admin**. Download the `.p8` (one chance), note the Key ID and Issuer ID.
4. **Certificates, IDs & Profiles → Identifiers → +**: App ID `com.noahfrain.opencoach` (explicit). Capabilities: none needed yet (Push isn't used; local notifications need no capability).
5. **App Store Connect → Apps → +**: New iOS app, name *openCOACH* (or the store name you want; 30 chars), bundle ID above, SKU `opencoach`.

### Google
1. **Play Console** ($25 once): play.google.com/console.
   - *Personal account*: must run a **closed test with ≥12 testers opted in for 14 consecutive days** before production is unlocked. Start recruiting testers now (gym friends, family, coworkers; they need a Google account and must stay opted in).
   - *Organization account*: exempt from the 12-tester rule; needs D-U-N-S. Worth it if you're forming an LLC anyway.
   - Identity verification takes a few days either way.
2. Create the app, package name `com.noahfrain.opencoach`.
3. Enroll in **Play App Signing** (default). The key you generate below becomes the *upload* key.

## Phase 2: wire up the pipelines

### GitHub secrets (repo → Settings → Secrets and variables → Actions)

| Secret | How to get it |
|---|---|
| `APPLE_TEAM_ID` | developer.apple.com → Account → Membership details |
| `ASC_KEY_ID` | From step 3 above |
| `ASC_ISSUER_ID` | Top of the API keys page |
| `ASC_KEY_P8_BASE64` | PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))` |
| `ANDROID_KEYSTORE_BASE64` | Keystore from the command below, base64 the same way |
| `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | What you chose when creating it |
| `PLAY_SERVICE_ACCOUNT_JSON` (later) | Google Cloud service account JSON, invited in Play Console → Users & permissions with release rights |

Create the Android upload keystore once (needs a JDK; Android Studio ships one). **Back up the `.jks` and passwords in a password manager.** Losing them means a key-reset request to Google.

```powershell
keytool -genkeypair -v -keystore opencoach-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

### Running a release
- **iOS:** Actions → *iOS → TestFlight* → Run workflow. ~15 min later the build appears in App Store Connect → TestFlight (processing adds 5–30 min). Install via the TestFlight app on your phone.
- **Android:** Actions → *Android → Play* → Run workflow → download the `.aab` artifact. The **first** upload goes in by hand (Play Console → Testing → Closed testing → Create release). After that, with `PLAY_SERVICE_ACCOUNT_JSON` set, runs upload automatically.
- Tag a release (`git tag v1.3.0 && git push --tags`) to run both.
- Build numbers come from the GitHub run number. Bump the marketing version with `npm run version:set -- 1.4.0`.

## Phase 3: subscriptions

Built: hard paywall + 7-day trial through RevenueCat (`pro.js`). Store-side setup, product IDs and testing: **[SUBSCRIPTIONS.md](SUBSCRIPTIONS.md)**. The paywall turns on when the RevenueCat keys go into `config.js`.

## Phase 4: store listing

| Item | iOS | Android |
|---|---|---|
| Name | ≤30 chars | ≤30 chars |
| Subtitle / short description | ≤30 chars | ≤80 chars |
| Description | ≤4,000 chars | ≤4,000 chars |
| Keywords | ≤100 chars, comma-separated | (from description) |
| Screenshots | 6.9″ iPhone (1320×2868 or 1290×2796), 3–10 | phone, 2–8 |
| Feature graphic | — | 1024×500 |
| Privacy policy URL | https://noahfrain.github.io/openCOACH/privacy.html | same |
| Support URL | https://noahfrain.github.io/openCOACH/support.html | same (email also required) |
| Category | Health & Fitness | Health & Fitness |
| Age rating | questionnaire (no objectionable content → 4+) | IARC questionnaire |
| Privacy | App Privacy: **Data Not Collected** (no developer servers, no analytics) | Data safety: no data collected/shared; food searches go to Open Food Facts / USDA on request |
| Export compliance | answered in Info.plist (`ITSAppUsesNonExemptEncryption = NO`) | — |

The app is iPhone-only (no iPad screenshots needed); it still runs on iPads in iPhone mode.

### Review notes (paste into App Review Information)
> openCOACH works fully offline with no account. To try it: tap Skip on the intro, then Train → Create mesocycle → Guided, and Food → Set goal. The camera is used only for the barcode scanner (Food → Scan). Health numbers are labelled as estimates, not medical advice.

### Draft listing copy
**Subtitle:** Lift, eat, adapt.
**Promo line:** Training blocks that progress themselves and calorie targets that learn from your weigh-ins.
**Description (start):**
openCOACH plans your training and your nutrition, then adjusts both from what you actually log.

TRAIN
• Build a mesocycle in four taps: days per week, muscle priorities, split, done
• Weights and reps progress automatically, set by set
• Per-muscle feedback (pump, soreness, joint pain, workload) adds or removes sets next week
• Warm-up ramps, drop sets, myo-reps, rest timer that alerts you on the lock screen

EAT
• Adaptive calorie targets from your weigh-in trend and intake
• Training-day and rest-day targets that average out over the week
• Barcode scanner, Open Food Facts and USDA databases, saved meals

YOUR DATA
• No account. Everything stays on your phone. Back up and restore any time.

## Review risks to avoid
- **4.2 Minimum functionality (web wrappers):** covered by offline use, local notifications, haptics, native share and camera, but keep adding native polish rather than less.
- **Health claims:** keep "estimate" wording; no medical or diagnostic claims in the listing.
- **Broken links:** privacy/support pages must load at review time.
- **Crashes on first launch / empty states:** test a clean install from TestFlight before submitting.

## Timeline to a mid-December launch (target Dec 15)

| When | iOS | Android |
|---|---|---|
| Nov 23–25 | Enroll; agreements/tax/banking; API key; secrets | Create Play account; verify identity; start recruiting 12+ testers |
| Nov 25–28 | First TestFlight build; test on your phone | First `.aab` → closed testing; testers opt in (**14-day clock starts**) |
| Nov 28–Dec 5 | Screenshots, listing, subscription products + RevenueCat paywall | Same paywall via Play Billing |
| Dec 5–8 | Submit for review (usually 1–2 days; leave room for one rejection) | Keep testers active |
| ~Dec 12 | Release | 14 days done if testing started by Nov 28 → apply for production (review a few days) |
| Dec 15–22 | Live | Live (organization account: skip the 14 days) |
