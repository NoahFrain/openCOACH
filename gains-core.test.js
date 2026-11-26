const C = require('./gains-core.js');
const assert = require('assert');
const S = (w, r, rir) => ({ w, r, rir: rir ?? '', done: true });

// 1) recommend: single instance, 8 reps @ 180, RIR logged 2 -> e1 = 180*(1+10/30)=240; target 6-10 mid 8 +2 => 240/(1+10/30)=180
let r = C.recommend([{ sets: [S(180, 8, 2)] }], { min: 6, max: 10 }, { inc: 10 });
assert.strictEqual(r.w, 180); assert.strictEqual(r.reps, 8); assert.strictEqual(r.n, 1);

// 2) Same history, but 12-15 range: mid 13.5 -> 14 reps +2 = 16 -> 240/(1+16/30)=156.5 -> round to 10 = 160
r = C.recommend([{ sets: [S(180, 8, 2)] }], { min: 12, max: 15 }, { inc: 10 });
assert.strictEqual(r.reps, 14); assert.strictEqual(r.w, 160);

// 3) missing RIR assumes 1
r = C.recommend([{ sets: [S(180, 9)] }], { min: 6, max: 10 }, { inc: 5 }); // eff 10 -> same e1 240
assert.strictEqual(r.e1, 240);

// 4) only last 6 instances, newest weighted more
const inst = [300, 240, 240, 240, 240, 240, 9999].map(w => ({ sets: [S(w, 10, 0)] })); // 7th ignored
r = C.recommend(inst, { min: 8, max: 12 }, { inc: 0.01 });
const W = C.REC_WEIGHTS, e = [300, 240, 240, 240, 240, 240].map(w => w * (1 + 10 / 30));
const exp = e.reduce((a, v, i) => a + v * W[i], 0) / W.reduce((a, b) => a + b, 0);
assert.ok(Math.abs(r.e1 - exp) < 0.02, r.e1 + ' vs ' + exp); assert.strictEqual(r.n, 6);

// 5) best set per instance, bodyweight-only history -> null
assert.strictEqual(C.recommend([{ sets: [S(0, 12)] }], { min: 8, max: 12 }, {}), null);
r = C.recommend([{ sets: [S(100, 12, 0), S(100, 8, 0)] }], { min: 8, max: 12 }, { inc: 5 });
assert.strictEqual(r.e1, 140);

// 6) high reps past 20 still count (cap 30)
r = C.recommend([{ sets: [S(20, 22, 2)] }], { min: 12, max: 20 }, { inc: 2.5 });
assert.ok(r && r.w > 0);

// 7) suggest: no same-workout prev + rec -> mode rec
let sg = C.suggest({ min: 12, max: 15 }, null, { n: 3, rec: { w: 160, reps: 14 } });
assert.strictEqual(sg.mode, 'rec'); assert.deepStrictEqual(sg.sets[0], { w: 160, r: 14 });
// no prev, no rec -> new
assert.strictEqual(C.suggest({ min: 12, max: 15 }, null, { n: 3 }).mode, 'new');
// same-workout prev present -> double progression unchanged, rec ignored for prefill
sg = C.suggest({ min: 6, max: 10 }, [S(185, 8), S(185, 8), S(185, 11)], { n: 3, rir: 2, trigger: 'exceed', inc: 5, rec: { w: 100, reps: 8 } });
assert.strictEqual(sg.mode, 'up'); assert.strictEqual(sg.to, 200);

// ---------- v8 ----------
// set types: warm-ups and drop sets don't drive progression
sg = C.suggest({ min: 6, max: 10 }, [{ w: 95, r: 15, done: true, t: 'W' }, S(185, 8), S(185, 8), { w: 135, r: 14, done: true, t: 'D' }], { n: 3, rir: 2, trigger: 'exceed', inc: 5 });
assert.strictEqual(sg.mode, 'hold', 'drop set must not trigger an increase'); assert.strictEqual(sg.from, 185);
r = C.recommend([{ sets: [{ w: 300, r: 10, done: true, t: 'W' }, S(180, 8, 2)] }], { min: 6, max: 10 }, { inc: 10 });
assert.strictEqual(r.e1, 240, 'warm-up excluded from rec');
// failure set with blank RIR counts as 0 RIR
r = C.recommend([{ sets: [{ w: 180, r: 10, done: true, t: 'F', rir: '' }] }], { min: 6, max: 10 }, { inc: 10 });
assert.strictEqual(r.e1, 240);
// volume: warm-ups excluded, drop sets counted
const exById = { a: { muscle: 'Back' } };
assert.deepStrictEqual(C.hardSetsByMuscle([{ items: [{ exId: 'a', sets: [{ done: true, t: 'W' }, { done: true }, { done: true, t: 'D' }] }] }], exById), { Back: 2 });

// load model
assert.strictEqual(C.effW(25, 'bw', 180), 205); assert.strictEqual(C.effW(60, 'assist', 180), 120); assert.strictEqual(C.effW(60, 'assist', 0), 0);
assert.strictEqual(C.fromEff(130, 'assist', 180, 10), 50); assert.strictEqual(C.fromEff(198, 'bw', 180, 5), 20);
// weighted pull-ups: BW 180 +0 for 13 on 6-10 -> added load goes up
sg = C.suggest({ min: 6, max: 10 }, [S(0, 10), S(0, 11), S(0, 13)], { n: 3, rir: 2, trigger: 'exceed', inc: 5, load: 'bw', bw: 180 });
assert.strictEqual(sg.mode, 'up'); assert.ok(sg.to >= 5 && sg.to <= 20, 'added ' + sg.to);
// assisted pull-up: assist 60, beat range -> less assistance
sg = C.suggest({ min: 6, max: 10 }, [S(60, 11), S(60, 11), S(60, 12)], { n: 3, rir: 2, trigger: 'exceed', inc: 10, load: 'assist', bw: 180 });
assert.strictEqual(sg.mode, 'up'); assert.ok(sg.to < 60 && sg.to >= 40, 'assist ' + sg.to);
// assisted, no bodyweight: one step less assistance
sg = C.suggest({ min: 6, max: 10 }, [S(60, 12)], { n: 1, trigger: 'exceed', inc: 10, load: 'assist', bw: 0 });
assert.strictEqual(sg.to, 50);
// assisted, below range with dropBelow -> MORE assistance
sg = C.suggest({ min: 6, max: 10 }, [S(40, 4)], { n: 1, trigger: 'exceed', inc: 10, load: 'assist', bw: 180, dropBelow: true });
assert.strictEqual(sg.mode, 'down'); assert.strictEqual(sg.to, 50);
// analytics use effective load: bodyweight pull-ups at 0 added now produce an e1RM
const ser = C.exerciseSeries([{ start: 1, items: [{ exId: 'p', sets: [S(0, 10)] }] }], 'p', { mode: 'bw', bwAt: () => 180 });
assert.strictEqual(ser.length, 1); assert.strictEqual(ser[0].e1, 240);

// warm-ups
assert.deepStrictEqual(C.warmups(225, { inc: 5, bar: 45 }), [{ w: 110, r: 8 }, { w: 155, r: 4 }, { w: 190, r: 2 }]);
assert.deepStrictEqual(C.warmups(65, { inc: 5, bar: 45 }), [{ w: 45, r: 8 }, { w: 55, r: 2 }]); // bar floor, dedupe
assert.deepStrictEqual(C.warmups(20, { inc: 5 }), [{ w: 10, r: 8 }, { w: 15, r: 2 }]);
assert.deepStrictEqual(C.warmups(5, { inc: 5 }), []);

// feedback -> delta
const F = (pump, sore, joint, work) => ({ pump, sore, joint, work });
assert.strictEqual(C.volumeDelta(F('mod', 'early', 'none', 'good')), 0, 'moderate pump + good workload holds');
assert.strictEqual(C.volumeDelta(F('low', 'none', 'none', 'easy')), 1, 'never more than +1');
assert.strictEqual(C.volumeDelta(F('low', 'early', 'none', 'good')), 1);
assert.strictEqual(C.volumeDelta(F('mod', 'none', 'none', 'easy')), 1);
assert.strictEqual(C.volumeDelta(F('great', 'early', 'none', 'easy')), 0, 'great pump holds');
assert.strictEqual(C.volumeDelta(F('low', 'early', 'none', 'hard')), 0, 'pushed limits holds');
assert.strictEqual(C.volumeDelta(F('low', 'ontime', 'none', 'easy')), 0);
assert.strictEqual(C.volumeDelta(F('low', 'none', 'some', 'easy')), 0);
assert.strictEqual(C.volumeDelta(F('great', 'none', 'high', 'easy')), -1);
assert.strictEqual(C.volumeDelta(F('mod', 'still', 'none', 'good')), -1);
assert.strictEqual(C.volumeDelta(F('low', 'none', 'none', 'easy'), 'M'), 0, 'maintain never adds');
assert.strictEqual(C.volumeDelta({ pump: 'low' }), 0, 'incomplete answers do nothing');
// distribution: adds to fewest, cuts from most, respects cap and floor of 1
let its = [{ sets: 3 }, { sets: 2 }];
assert.deepStrictEqual(C.distributeSets(its, 2, 9), [{ i: 0, from: 3, to: 4 }, { i: 1, from: 2, to: 3 }]);
its = [{ sets: 4 }, { sets: 4 }]; assert.deepStrictEqual(C.distributeSets(its, 1, 8), []);
its = [{ sets: 1 }, { sets: 3 }]; assert.deepStrictEqual(C.distributeSets(its, -1), [{ i: 1, from: 3, to: 2 }]);
its = [{ sets: 1 }]; assert.deepStrictEqual(C.distributeSets(its, -1), []);

// CSV keeps original column order and appends new columns
assert.deepStrictEqual(C.CSV_COLS.slice(-4), ['Set Type', 'Load Type', 'Bodyweight', 'Effective Load']);
const csv = C.toCSV([{ start: 0, name: 'Pull', items: [{ exId: 'p', min: 6, max: 10, sets: [{ w: 25, r: 8, done: true, t: '' }] }] }], { p: { name: 'Pull Up', muscle: 'Back', load: 'bw' } }, {}, 'lb', () => 180);
assert.ok(csv.split('\n')[1].endsWith('Working,Bodyweight + added,180,205'), csv);

// ---------- volume model v9 ----------
// overlap: donor sets credit receivers at their fraction
assert.strictEqual(C.indirectSets('Biceps', { Back: 12 }), 6);
assert.strictEqual(C.indirectSets('Glutes', { Quads: 10, Hamstrings: 8 }), 9);
assert.strictEqual(C.indirectSets('Chest', { Back: 12 }), 0);
const dt = C.directTargets({});
assert.strictEqual(dt.Biceps, 4, 'biceps 10 effective - 6 from 12 back sets');
assert.strictEqual(dt.Triceps, 5, 'triceps 10 effective - 5 from 10 chest sets');
assert.strictEqual(dt.Glutes, 0, 'squats + hinges cover Normal glutes');
assert.ok(Object.values(dt).every(v => v !== 1), 'no lone weekly sets');
// Priority keeps direct work even when compounds would cover it
assert.ok(C.directTargets({ Glutes: 'P' }).Glutes >= Math.ceil(C.weeklyTarget('Glutes', 'P') * 0.4));
// a smaller donor means more direct work for the receiver
assert.ok(C.directTargets({ Back: 'M' }).Biceps > dt.Biceps);
// effective volume adds half of donor sets
assert.strictEqual(C.effectiveVolume({ Back: 12, Biceps: 4 }).Biceps, 10);
// all-Normal weekly direct total stays in a sane band
const tot = Object.values(dt).reduce((a, b) => a + b, 0);
assert.ok(tot >= 65 && tot <= 90, 'weekly direct total ' + tot);

// priority limit
assert.strictEqual(C.nextPrio({}, 'Chest'), 'P');
assert.strictEqual(C.nextPrio({ Chest: 'P', Back: 'P', Quads: 'P' }, 'Biceps'), 'M', '4th priority skips to maintain');
assert.strictEqual(C.nextPrio({ Chest: 'P', Back: 'P', Quads: 'P' }, 'Chest'), 'M');
assert.strictEqual(C.nextPrio({ Chest: 'M' }, 'Chest'), 'N');
assert.strictEqual(C.prioCount({ Chest: 'P', Back: 'N', Quads: 'P' }), 2);

// generated plans: sessions balanced and sized sensibly for 2-6 days
const lib = Object.keys(C.VOL).flatMap(m => [1, 2, 3, 4].map(i => ({ id: m + i, muscle: m, min: 8, max: 12 })));
const byId = Object.fromEntries(lib.map(e => [e.id, e]));
const PRIOS = [{}, { Chest: 'P', Back: 'P', 'Side Delts': 'P' }, { Quads: 'P', Hamstrings: 'P', Glutes: 'P' }];
for (const prio of PRIOS) for (const type of ['full', 'upper-lower']) for (let n = 2; n <= 6; n++) {
  const plan = C.generatePlan({ days: n, prio, type, exercises: lib });
  const per = plan.map(d => d.items.reduce((a, it) => a + it.sets, 0));
  const tag = type + ' ' + n + 'd ' + JSON.stringify(prio) + ' ' + per.join('/');
  assert.strictEqual(plan.length, n, tag);
  if (n >= 3) assert.ok(Math.max(...per) <= 32, 'session too big: ' + tag);
  if (type === 'full') assert.ok(Math.max(...per) - Math.min(...per) <= 4, 'unbalanced: ' + tag);
  // no muscle over its per-session cap in any day
  for (const d of plan) {
    const pm = {}; d.items.forEach(it => { const mu = byId[it.exId].muscle; pm[mu] = (pm[mu] || 0) + it.sets; });
    for (const mu in pm) assert.ok(pm[mu] <= C.sessionCap(mu, prio[mu] || 'N'), mu + ' over cap: ' + tag);
  }
}
// all-Normal 3-day full body: the old generator built 46/40/48
const p3 = C.generatePlan({ days: 3, prio: {}, type: 'full', exercises: lib }).map(d => d.items.reduce((a, it) => a + it.sets, 0));
assert.ok(Math.max(...p3) <= 28, '3-day full body ' + p3.join('/'));

// feedback room: per-session cap, weekly ceiling, session size
assert.strictEqual(C.addRoom({ muscle: 'Chest', prio: 'N', items: [{ sets: 3 }], weekSets: 10, daySets: 20 }), 6);
assert.strictEqual(C.addRoom({ muscle: 'Chest', prio: 'N', items: [{ sets: 3 }], weekSets: 16, daySets: 20 }), 3, 'weekly ceiling reached');
assert.strictEqual(C.addRoom({ muscle: 'Chest', prio: 'N', items: [{ sets: 3 }], weekSets: 10, daySets: 30 }), 3, 'session full');
assert.strictEqual(C.addRoom({ muscle: 'Chest', prio: 'P', items: [{ sets: 3 }], weekSets: 10, daySets: 20 }), 8, 'priority cap +2');
its = [{ sets: 3 }]; assert.deepStrictEqual(C.distributeSets(its, 1, C.addRoom({ muscle: 'Chest', prio: 'N', items: its, weekSets: 10, daySets: 30 })), []);
console.log('core v9: all tests passed');
