# openCOACH

Training, nutrition and bodyweight in one offline-first web app for iPhone and Android. Installs to the home screen, runs full-screen, works without a connection, and keeps all data on the device. No account, no server.

## Tabs

| Tab | What's there |
|---|---|
| **Today** | Next workout this week (or resume one in progress), today's intake vs. targets, trend weight + weigh-in. Install tip, backup reminder and weekly check-in appear here |
| **Train** | Workout · Mesocycle · Progress. The sub-nav hides mid-workout and inside the mesocycle wizard |
| **Food** | Log · Plan & Coach |
| **Body** | Weigh-ins, trend weight, body composition, adaptive expenditure, intake history |
| **More** | Appearance (dark / light / match phone), backup / restore, CSV exports, units, training settings, food databases, workout history, exercise library, food library, replay tutorial, erase all |

## Store apps (iOS / Android)

The same files ship as native apps through **Capacitor 8**. `npm run build` copies the web app into `www/`; `npx cap sync` puts it into `ios/` and `android/`. GitHub Actions builds both: no Mac needed. Full checklist, secrets and timeline: **[docs/LAUNCH.md](docs/LAUNCH.md)**.

```
npm ci            # once
npm test
npm run sync      # build www/ + copy into ios/ and android/
npm run assets    # regenerate icons/splash from assets/
npm run version:set -- 1.4.0
```

`native.js` is the only native-aware file. It does nothing on the web (`window.Native === null`); in the apps it adds a lock-screen rest-timer notification, haptics, keep-awake during workouts, share-sheet exports, system-bar styling, and mirrors every save to a JSON file in app storage (restored automatically if the WebView's storage is ever cleared). Callers guard with `if (window.Native)`.

## Files

```
index.html          page + all CSS
config.js           release settings: RevenueCat keys, entitlement, links
pro.js              subscriptions + paywall (window.Pro)
native.js           iOS/Android bridge (no-op on the web)
shell.js            storage, units, shared bodyweight (window.Shell). Loads before the modules
gains-core.js       training logic, pure (window.GCore / node module)
gains.js            training module: views + actions (window.GAINS, actions G.*)
macros-core.js      nutrition logic, pure (window.MCore / node module)
macros.js           nutrition + body module (window.MACROS, actions M.*)
app.js              tab bar, Today, More, tutorial, backup/restore, boot
sw.js               offline cache (network-first, 2.5 s timeout)
vendor/             html5-qrcode (barcode fallback when BarcodeDetector is missing)
gains-core.test.js  node gains-core.test.js
macros-core.test.js node --test macros-core.test.js
```

Script order matters: `config → native → gains-core → macros-core → shell → gains → macros → pro → app`.

## Architecture

- **Plain scripts, no framework, no build step.** Views are HTML strings; each render rebuilds the active tab and preserves scroll.
- **Two modules, one shell.**
  - Training actions live on `G.*`, nutrition and body actions on `M.*`.
  - Each module exposes a small interface (`view`, `modal`, `closeModal`, `busy`, `tab`, `state`, `replace`, `reset`, plus sections for Today and More). `app.js` composes the page from those.
  - A module's `render()` calls `Shell.render()`, which draws the active tab plus any open sheet.
  - A module moving itself to another of its views calls `Shell.focus()`. A tab tap calls `Shell.go()`, which closes open sheets and stops the camera.
- **Storage.** One `localStorage` key, `opencoach.v1`: `{ v, app, gains, macros, shell: { tutorialSeen, lastBackup, theme } }`. `Shell.save()` writes both modules.
- **Units.** Every weight is stored in **lb**. The unit setting (More → General, shared with tape measurements) changes display only. Training converts at the edges: `fw()` to display, `fromDisp()` when parsing input. Step sizes and the empty bar (45 lb) are lb-based, so kg users see converted steps (e.g. 2.3 kg).
- **One bodyweight.** The weigh-in log is the only bodyweight store. Training uses its smoothed trend (`Shell.bwAt(t)`: trend on or before that date, else the first day). That trend drives bodyweight and assisted lifts, 1RM, recommendations and the CSV. Logging bodyweight from a lift card writes today's weigh-in.

### Training state

```js
gains: {
  settings: { trigger, dropBelow, rest, warm },
  exercises: [ { id, name, muscle, type, load, min, max, inc, rest? } ],   // load: ext | bw | assist
  mesos: [ { id, name, start, weeks, deload, week, prio, sched?, days: [ { id, name, dow?, items: [ { pid, exId, sets, min, max } ] } ] } ],
  activeMesoId, active,                                                    // active = workout in progress
  sessions: [ { id, mesoId, week, dayId, name, start, end, note, bw, fb, items: [ { exId, pid, min, max, note, sets: [ { w, r, rir, done, t } ] } ] } ],
}
```

- `mesos[].days[].items[]` is the **plan**; `sessions[].items[].sets[]` is the **log**.
- `prio` maps muscle → `'P'` priority, `'N'` normal, `'M'` maintain.
- Set type `t`: `''` working, `W` warm-up, `D` drop, `M` myo-reps, `F` failure.

### Nutrition state

```js
macros: {
  settings: { unit, waterUnit, showRemaining, waterGoalOz, usdaKey, cycle, cycleShift },     // usdaKey never exported
  profile, goal, plan, lastCheckIn,
  foods:   [ { id, name, cat, srvLabel, srvG, kcal, p, c, f, fiber, na, k, ca, fe, vitd, barcode?, source?, fav?, hidden? } ],  // per 100 g
  recipes: [ { id, name, servings, items: [ { foodId, grams } ] } ],
  dayType: { 'YYYY-MM-DD': 'T' | 'R' },                                   // manual training/rest marks
  logs:    { 'YYYY-MM-DD': [ { id, meal, foodId, grams, snap } | { id, meal, quick: true, name, kcal, p, c, f, fiber } ] },
  dayMeta: { 'YYYY-MM-DD': 'done' | 'skip' },
  water:   { 'YYYY-MM-DD': oz },
  weights: [ { id, date, weightLb, bf, waist, neck, chest, arms, hips, note } ],   // tape in inches
}
```

- `snap` is a frozen per-100 g copy of the food at log time, so editing or deleting a food never rewrites history.
- Deleting a food sets `hidden: true` so past entries and saved meals still resolve.

## Training

### Mesocycle builder

- **Custom:** blank, or seeded from a template.
- **Guided:** four screens.
  1. **Days per week** (1–7).
  2. **Muscle priority:** Priority / Normal / Maintain per muscle, with weekly sets shown live.
  3. **Split type:** Full Body; Upper/Lower (an odd day goes to upper); or Freestyle (pick muscle groups per day; anything left untrained triggers a prompt).
  4. **Exercises:** the generated plan, fully editable, with a weekly-sets panel flagging any muscle the layout caps.

Within a day, priority muscles come first, and a muscle's exercises sit together.

### Volume model

Targets are **effective weekly sets**: direct sets plus half of each set from a compound that also trains the muscle (fractional counting, as in Pelland/Remmert et al. 2025). The planner converts them to **direct** targets by subtracting that credit, so arms, rear delts, traps and glutes aren't double-dosed on top of presses, rows, squats and hinges.

| Receiver | Credit from |
|---|---|
| Triceps | Chest × 0.5 |
| Biceps, Rear Delts | Back × 0.5 |
| Traps | Back × 0.25 |
| Forearms | Back × 0.25, Biceps × 0.25 |
| Glutes | Quads × 0.5, Hamstrings × 0.5 |

| Priority | Effective weekly sets |
|---|---|
| Maintain | near the minimum effective floor |
| Normal | the productive middle (all-Normal ≈ 78 direct sets/week) |
| Priority | upper MAV; keeps at least 40% as direct work and +2 on the per-session cap |

- **Priority is limited to 3 muscles.** Tapping a fourth skips to Maintain.
- A computed direct target of 1 becomes 2 (0 on Maintain); a lone weekly set isn't worth a slot.
- Each muscle has a per-session cap (5–7 direct sets; ~11 fractional sets/session is where extra sets stop showing a detectable benefit) and a weekly frequency cap.
- **Balancing:** weekly totals are set first (donors before receivers), then the biggest blocks are placed on the lightest eligible days, preferring the widest spacing. A 3-day all-Normal full body comes out 27 / 26 / 25 sets.
- The draft's weekly-sets panel shows effective sets vs. target and the sets per session, warning above 30.

Sets per muscle per day are split into movements:

| Sets that day | Movements |
|---|---|
| 1–4 | 1 |
| 5–8 | 2 |
| 9–13 | 3 |
| 14+ | 4 |

Set counts start flat and change only through feedback (below). The deload week halves them.

### Volume feedback (per muscle, per workout)

When every working set for a muscle in a workout is checked off, its card asks four questions:
- **Pump:** low / moderate / great
- **Soreness since last time:** never sore / healed early / healed on time / still sore
- **Joint pain:** none / some / a lot
- **Workload:** easy / good / pushed limits / too much

| Answers | Next week, this workout |
|---|---|
| Joint pain *a lot*, workload *too much*, or *still sore* | −1 set |
| Joint pain *some*, or *healed on time* | Hold |
| Great pump, or *pushed limits* | Hold |
| Low pump or *easy*, and never sore / healed early, no joint pain | +1 set |
| Otherwise (moderate pump, good workload) | Hold: it's working |

- Maintain-priority muscles never go up. Never more than +1.
- **At most one added set per muscle per week**, however many sessions train it.
- Adds go to that muscle's movement with the fewest sets and stop at the first of: the per-session cap, the weekly ceiling (Priority target; +4 for Priority muscles), or 30 working sets in that workout. Cuts come off the movement with the most sets, never below 1.
- The card previews the exact change ("Lat Pulldown 3 → 4"). It is applied when you tap **Finish workout**, so a discarded workout changes nothing.
- Hidden in deload weeks; can be skipped per muscle.
- `volumeDelta`, `addRoom` and `distributeSets` in `gains-core.js` hold the rules.

### Progression: double progression

Keyed to the **movement in a specific workout**, week over week: the app looks only at the last time that lift was done in the same workout slot. Lat pulldowns at 6–10 in Workout 1 and at 12–15 in Workout 4 progress independently.

| Last working set vs. range | Next week |
|---|---|
| Exceeds max | ↑ weight, reps reset to range minimum |
| Inside range | Hold weight, beat last week's reps |
| Below min | Hold, or ↓ one increment (optional setting) |
| Deload week | Hold weight, ~half the sets |

- **Which sets count:** only working and failure sets. Warm-ups, drop sets and myo-reps are ignored.
- **Size of the jump:** solved from estimated 1RM (Epley) for the weight at which the range minimum sits at the target RIR. It's clamped to at least one increment and at most one increment above +10%, then rounded to the exercise's step. Logged RIR on the triggering set feeds the estimate.
- **Worked example:** `185×8, 8, 11` on a 6–10 range → next week `200×6, 6, 6`. Log `200×8, 8, 9` → holds 200 and asks for `9, 9, 10`.

**Bodyweight and assisted lifts.** Each exercise has a load type:
- **External:** the number you log is the load.
- **Bodyweight + added:** pull-ups, dips. Log the added load (0 = bodyweight).
- **Assisted:** assisted pull-up and dip machines. Log the assistance.

Progression, recommendations and 1RM run on the load actually moved (using trend bodyweight on that date), then convert back to the number you log. On assisted lifts, "up" means less assistance. Without any weigh-ins, assisted lifts step assistance down one increment and get no recommendation.

### 2-RIR recommendation

Every movement with loaded history gets a recommended weight for the **middle of the target rep range at 2 RIR**:
1. Take the last 6 sessions the movement appeared in, in any workout or mesocycle (working and failure sets only).
2. For each, take the best set's estimated 1RM using reps + RIR. A set logged without RIR assumes 1; a failure set assumes 0.
3. Average them with recency weights `1.0, 0.9, 0.8, 0.7, 0.6, 0.5` (`REC_WEIGHTS` in `gains-core.js`).
4. Solve for the weight at mid-range reps + 2, rounded to the exercise's step.

If the workout slot has its own history, double progression prefills the weights and the recommendation shows as a reference line. Otherwise (first time in the slot, a new mesocycle, a swap) the recommendation prefills. The card's "Last" line shows this slot's previous sets, or the most recent sets anywhere with that workout's name in brackets.

### Logging a workout

- Set-by-set check-off with weight, reps and optional RIR.
- Rest timer, which chimes at zero while the app is open.
- Add/remove sets, notes per exercise and per workout, previous performance inline.
- The screen stays awake during a session.
- Consecutive movements for the same muscle share one card, labelled on its top border.
- Swapping an exercise mid-workout asks whether the swap is permanent or for this session only.

**Set types.** Tap a set's number:

| Type | Volume | Progression / rec / 1RM | Rest after |
|---|---|---|---|
| Working (default) | ✓ | ✓ | exercise rest |
| Warm-up `W` | – | – | min(60 s, exercise rest) |
| Drop set `D` | ✓ | – | none |
| Myo-reps `M` | ✓ | – | 20 s |
| Failure `F` (RIR 0) | ✓ | ✓ | exercise rest |

Types carry to the same position next week; drop and myo sets keep last week's numbers. The set counter excludes warm-ups.

**⋯ menu** on each movement (add items to `ITEM_MENU` in `gains.js`):
- **Add warm-up sets:** ramp to the first working weight.
  - Presets in More → Training: Standard 50/70/85% (×8/4/2), Light 60/80%, Thorough 40/55/70/85%.
  - Rounded down to the exercise step, never below the empty bar on barbell lifts, duplicates dropped.
  - Re-running replaces unchecked warm-ups. Not offered on bodyweight or assisted lifts.
- **Rest timer:** per-exercise rest, also editable in the library. Blank means the default.
- **Skip / remove:** drop the movement from this workout only, or from the mesocycle plan (the weekly set loss is shown). Plan slots have a stable `pid`, so removals and permanent swaps hit the right slot.

### Progress

- **Strength index by muscle:** estimated 1RM (load actually moved) indexed to the first session at 100.
- **Sets this week:** logged vs. target per muscle, scrubbable by week.
- **Muscle summary:** percentage change and stalled-lift flags.
- **Per exercise:** e1RM trend plus recent sessions.

Filterable by priority tier and by current mesocycle vs. all time.

## Nutrition and body

- **Goal and plan builder:** fat loss, maintenance or muscle gain.
  - Inputs: body stats with optional body fat %, target weight, weekly pace or target date, protein tier, carb/fat split.
- **Adaptive expenditure and weekly check-in:** an EWMA weight trend (gaps linearly interpolated) plus rolling intake gives an adaptive TDEE. Every 7 days, review the proposed targets and **Apply** or **Keep current**.
- **Coaching days.** Only finished days feed the expenditure model.
  - A day counts when it's before today and either marked **complete** or logged at ≥ max(400 kcal, 50% of target).
  - **Exclude** removes a day regardless.
  - The status card at the bottom of each Log day shows and overrides this.
- **Logging:** + Add per meal.
  - Favorites, Recent and Frequent lists.
  - Quick Add, Copy yesterday, Saved Meals / recipes.
  - Water tracking; fiber, sodium, potassium, calcium, iron and vitamin D bars.
- **Food databases:**
  - **Open Food Facts** works with no key: text search and UPC/EAN barcodes.
  - **USDA FoodData Central** with a free personal key (More → Food databases), stored only on the device.
  - Any online food you log or scan is cached locally for offline reuse.
- **Barcode and QR scanner:**
  - Uses the native `BarcodeDetector` where available, and lazy-loads the bundled `html5-qrcode` otherwise. Manual entry is also available.
  - Handles UPC/EAN codes, product URLs and JSON food QR codes. Barcode formats are normalized, so cached products match offline.
- **Body:**
  - Charts: scale vs. trend weight, adaptive expenditure, 14-day intake vs. target.
  - Measurements history, plus a US Navy body-fat estimator from tape measurements.

## Backup and export

- **Backup JSON** (More): everything, in one file. The USDA key is never included.
- **Restore** replaces everything with a backup's contents. It also accepts training-only and nutrition-only backup files:
  - Each replaces only its own half.
  - Weigh-ins on dates the file lacks are kept.
  - Bodyweight entries in a training file are merged into weigh-ins without overwriting a day that has one.
- **CSV exports:**
  - **Workouts:** one row per completed set: date, time, mesocycle, week, deload flag, workout, duration, exercise, muscle, equipment, rep range, set number, weight, unit, reps, RIR, est. 1RM, volume, notes, set type, load type, bodyweight, effective load.
  - **Food:** diary.
  - **Body:** weigh-ins and measurements.
- A reminder appears on Today after 14 days without a backup.

## Tutorial

8 steps (9 in iPhone Safari, which adds *Install it first*):
1. Welcome
2. Build a training block
3. Logging a workout
4. Weights and volume adjust
5. Logging food
6. Complete days drive coaching
7. Weigh in, then check in
8. Your data

Each step opens the tab it describes. The last button goes to goal setup if there's no nutrition goal, otherwise to building a first block.

Shown when `shell.tutorialSeen < TUTORIAL_V` (in `app.js`). Anyone arriving with existing data skips it. *Erase all data* shows it again; replay from More.

## Testing

```
node gains-core.test.js
node --test macros-core.test.js
```

## Deploying

Static files: upload the folder to any HTTPS host (e.g. GitHub Pages), open it in Safari or Chrome, and add it to the home screen. Bump `V` in `sw.js` and `BUILD` in `app.js` on each release.

## Changelog

### v1.4 — 2026-11-23
- **openCOACH Pro subscriptions:** hard paywall after the intro tour with a 7-day trial (annual / 6-month / monthly) via RevenueCat → StoreKit / Play Billing. Off on the web and in builds without keys (`config.js`). Offline grace, Restore, Manage, Export my data from the paywall. See `docs/SUBSCRIPTIONS.md`.

### v1.3 — 2026-11-23
- **Native apps:** Capacitor 8 iOS + Android projects, CI that builds both on every PR, TestFlight and Play release workflows, privacy and support pages, launch checklist (`docs/LAUNCH.md`).
- **Updates actually arrive:** the service worker skips GitHub Pages' 10-minute HTTP cache when filling and refreshing its cache, the app checks for a new version on every resume and every 30 min, and a new version reloads when the app is backgrounded or from a *Reload* banner. More shows the build and a *Check for update* link.

### v1.2 — 2026-11-23
- **Light / dark / match-phone theme** (More → General). Light is a soft off-white, not pure white. Set before first paint, so no flash.
- **Weekly schedule** (Train → Mesocycle → Schedule): *Fixed weekdays* pins each training day to a weekday; *Asynchronous* runs days in order whenever you train. In fixed mode Today shows today's workout or a rest day with what's next, and session cards show their weekday.
- **Training / rest-day nutrition** (Food → Plan & Coach): training days get +N kcal from carbs, rest days give it back so the weekly average equals the plan. Day type: manual mark → a workout logged/started that day → the fixed schedule → rest. Toggle on Today and on each Log day. `dayTargets` in `macros-core.js`; coaching math still uses the base plan.
- **Volume feedback collapses:** a **Done** button appears once all four questions are answered; the card folds to a one-line summary with **Edit**.
- **Set inputs clear on focus:** the prefilled number shows as a hint; leaving the box empty puts it back (`Shell.fzIn/fzOut`).
- **Tab bar no longer strands mid-screen on iOS:** tab bar and rest timer hide while the keyboard is up; renders hold page height so the scroll can't jump.
- **Scanner:** the live camera survives re-renders; clear messages for blocked permission / busy / missing camera; falls back to a back-camera id when `facingMode` is refused; new **Photo of barcode** option decodes a still image (works even when the live camera can't start).
- **Food search:** timeouts, one retry, readable errors (rate limit, overload, blocker/offline) instead of Safari's raw parse errors; Open Food Facts failures fall back to USDA when a key is saved. Barcode lookups distinguish "not found" from "couldn't reach".

### v1.0 — 2026-11-22
- Initial release: training and nutrition in one app with five tabs (Today, Train, Food, Body, More), one store, one backup and one tutorial
- Today tab: next workout / resume, intake vs. targets, trend weight + weigh-in, check-in and backup prompts
- Single bodyweight source (weigh-in trend) shared by nutrition coaching and bodyweight/assisted lifts
- All weights stored in lb; kg is display-only

## Notes and limits

- Data lives in `localStorage` on one device (~5 MB). Moving to IndexedDB is the next step before sync.
- No accounts or sync yet (More shows it as planned).
- Step sizes are lb-based, so kg users see converted steps.
- Estimated 1RM uses Epley and gets unreliable above ~15 reps.
- The rest timer can't alert when the phone is locked; iOS web apps can't vibrate.
- Volume landmarks and expenditure estimates are population models, not prescriptions.
