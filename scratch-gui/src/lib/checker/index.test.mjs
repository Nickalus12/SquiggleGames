import {harness} from './fixtures/load.mjs';

const {createChecker, runChecks, snapshotTarget, buildContext, DELAY_MS, PHONE_DELAY_MS, SLICE_MS} = await import('./index.js');
const {default: RULES} = await import('./rules/index.js');
const {ok, done} = harness();

const emitter = () => {
    const handlers = new Map();
    return {
        on (name, fn) {
            if (!handlers.has(name)) handlers.set(name, new Set());
            handlers.get(name).add(fn);
        },
        off (name, fn) {
            if (handlers.has(name)) handlers.get(name).delete(fn);
        },
        emit (name) {
            (handlers.has(name) ? Array.from(handlers.get(name)) : []).forEach(fn => fn());
        },
        count (name) {
            return handlers.has(name) ? handlers.get(name).size : 0;
        }
    };
};

const makeTarget = (id, name, blocks, extra) => Object.assign({
    id,
    isOriginal: true,
    isStage: id === 'stage',
    sprite: {name},
    blocks: {_blocks: blocks || {}},
    variables: {},
    extensionStorage: {},
    getName: () => name,
    getCostumes: () => [{name: 'c1', assetId: 'a1', asset: {data: new Uint8Array(10)}}],
    getSounds: () => []
}, extra || {});

const loose = {
    s1: {id: 's1', opcode: 'motion_movesteps', next: null, parent: null, inputs: {}, fields: {}, topLevel: true, shadow: false}
};

const makeVm = targets => {
    const vm = emitter();
    vm.runtime = Object.assign(emitter(), {
        targets,
        _hats: {event_whenflagclicked: {}},
        _blockInfo: [{id: 'squiggletools', blocks: [{info: {opcode: 'distanceTo', blockType: 'reporter'}}]}],
        _monitorState: null
    });
    return vm;
};

const clock = () => {
    let t = 0;
    const timers = [];
    const slices = [];
    return {
        now: () => {
            t += 1;
            return t;
        },
        advance: ms => {
            t += ms;
        },
        setTimer: (fn, ms) => {
            const entry = {fn, at: t + ms, live: true};
            timers.push(entry);
            return entry;
        },
        clearTimer: entry => {
            entry.live = false;
        },
        fire (ms) {
            t += ms;
            timers.filter(entry => entry.live && entry.at <= t).forEach(entry => {
                entry.live = false;
                entry.fn();
            });
        },
        scheduler: {
            next: fn => {
                const entry = {fn, live: true};
                slices.push(entry);
                return () => {
                    entry.live = false;
                };
            }
        },
        pendingSlices: () => slices.filter(entry => entry.live).length,
        runSlice () {
            const entry = slices.find(candidate => candidate.live);
            if (!entry) return false;
            entry.live = false;
            entry.fn(null);
            return true;
        }
    };
};

ok('fifteen rules are wired', RULES.length === 15 && new Set(RULES.map(rule => rule.rule)).size === 15);
ok('the timing contract', SLICE_MS === 8 && DELAY_MS === 1500 && PHONE_DELAY_MS === 3000);

const cat = makeTarget('cat', 'Cat', loose);
const snap = snapshotTarget(cat);
ok('snapshot keeps the live block map and asset sizes', snap.blocks === cat.blocks._blocks &&
    snap.costumes[0].bytes === 10 && snap.name === 'Cat' && snap.isRules === false);
const rulesSprite = makeTarget('r', 'Game Rules', {}, {extensionStorage: {together: {role: 'rules', v: 1}}});
ok('snapshot marks the Game Rules sprite', snapshotTarget(rulesSprite).isRules === true &&
    snapshotTarget(rulesSprite).mark.role === 'rules');

const ctx = buildContext(makeVm([]).runtime, {win: null});
ok('context reads hats and reporters from the runtime', ctx.hatOpcodes.has('event_whenflagclicked') &&
    ctx.reporterOpcodes.has('squiggletools_distanceTo'));
ok('squiggle-only covers kits, together and the Thunderbolt builtins', ctx.squiggleOnlyIds.has('squiggletools') &&
    ctx.squiggleOnlyIds.has('together') && ctx.squiggleOnlyIds.has('thunderboltvfx'));
ok('without a world seam there is no world', ctx.world === null && ctx.worldMode === false);
ok('rules lint idles until a schema source exists', ctx.rules === null && ctx.rulesStatus === null);
const seamCtx = buildContext(makeVm([]).runtime, {win: {SquiggleWorld: {
    isWorldMode: () => true,
    scenes: () => ['Title'],
    levels: () => [{name: 'Cave'}],
    createScene: () => {}
}}});
ok('world lists come from window.SquiggleWorld', seamCtx.worldMode && seamCtx.world.scenes[0] === 'Title' &&
    seamCtx.world.levels[0] === 'Cave' && seamCtx.world.canCreateScene && !seamCtx.world.canCreateTile &&
    seamCtx.world.tiles === null);
const throwing = buildContext(makeVm([]).runtime, {win: {SquiggleWorld: {scenes: () => {
    throw new Error('x');
}}}});
ok('a throwing seam reads as no list', throwing.world.scenes === null);

const many = [makeTarget('stage', 'Stage')];
for (let i = 0; i < 30; i++) many.push(makeTarget(`t${i}`, `S${i}`, loose));
const vm = makeVm(many);
const c = clock();
let results = null;
let calls = 0;
let phone = false;
const checker = createChecker({
    vm,
    win: null,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    scheduler: c.scheduler,
    isPhone: () => phone,
    onResult: items => {
        calls++;
        results = items;
    }
});
checker.start();
ok('listens to PROJECT_CHANGED and PROJECT_LOADED', vm.count('PROJECT_CHANGED') === 1 && vm.runtime.count('PROJECT_LOADED') === 1);
c.fire(DELAY_MS - 1);
ok('nothing runs before 1.5 s', c.pendingSlices() === 0);
c.fire(1);
ok('a run is queued at 1.5 s', c.pendingSlices() === 1);
const realNow = c.now;
let sliceCount = 0;
while (c.runSlice()) sliceCount++;
ok('work is split into 8 ms slices', sliceCount >= 5, sliceCount);
ok('results arrive once with one loose-blocks item per sprite', calls === 1 &&
    results.filter(entry => entry.rule === 'loose-blocks').length === 30);
ok('results are sorted by severity', results.every((entry, i) => i === 0 ||
    ['error', 'warn', 'info'].indexOf(results[i - 1].severity) <= ['error', 'warn', 'info'].indexOf(entry.severity)));

vm.emit('PROJECT_CHANGED');
c.fire(500);
vm.emit('PROJECT_CHANGED');
c.fire(DELAY_MS - 1);
ok('a new change restarts the 1.5 s wait', c.pendingSlices() === 0);
c.fire(1);
c.runSlice();
phone = true;
vm.emit('PROJECT_CHANGED');
ok('a change mid-run cancels the slices in flight', c.pendingSlices() === 0 && calls === 1);
c.fire(DELAY_MS);
ok('phones wait 3 s', c.pendingSlices() === 0);
c.fire(PHONE_DELAY_MS - DELAY_MS);
ok('and then run', c.pendingSlices() === 1);
while (c.runSlice()) c.advance(SLICE_MS);
ok('second result delivered', calls === 2 && checker.items() === results);
checker.stop();
ok('stop removes the listeners', vm.count('PROJECT_CHANGED') === 0 && vm.runtime.count('PROJECT_LOADED') === 0);
ok('runChecks is the same pure pipeline', Array.isArray(runChecks({targets: []})) && realNow === c.now);

const boom = () => {
    throw new Error('unexpected block shape');
};
const steady = model => model.targets.map(target => ({
    rule: 'steady', severity: 'info', key: `steady:${target.id}`, targetId: target.id, values: {}
}));
const pure = runChecks({targets: [snap]}, [boom, steady]);
ok('runChecks skips a throwing rule and keeps the rest', pure.length === 1 && pure[0].rule === 'steady');
const c2 = clock();
let guarded = null;
const guardedChecker = createChecker({
    vm: makeVm([makeTarget('stage', 'Stage'), makeTarget('cat2', 'Cat', loose)]),
    win: null,
    now: c2.now,
    setTimer: c2.setTimer,
    clearTimer: c2.clearTimer,
    scheduler: c2.scheduler,
    isPhone: () => false,
    rules: [boom, steady],
    onResult: items => {
        guarded = items;
    }
});
guardedChecker.runNow();
while (c2.runSlice()) {
    c2.advance(0);
}
ok('a throwing rule does not stop the run', Array.isArray(guarded) && guarded.length === 2 &&
    guarded.every(entry => entry.rule === 'steady'), guarded);
let schemaCalls = 0;
const once = buildContext(makeVm([]).runtime, {win: null, getRulesSchema: () => {
    schemaCalls++;
    return {cards: []};
}});
ok('the rules schema getter is read once', schemaCalls === 1 && once.rules.schema.cards.length === 0);
const flaky = buildContext(makeVm([]).runtime, {win: null, getRulesSchema: () => {
    throw new Error('not ready');
}});
ok('a throwing schema getter leaves rules empty', flaky.rules === null);
done();
