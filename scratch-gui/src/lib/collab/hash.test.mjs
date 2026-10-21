process.removeAllListeners('warning');

const {RUNTIME_ENTRY, canonical, driftedTargets, projectHashes} = await import('./hash.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${typeof detail === 'undefined' ? '' : ` : ${JSON.stringify(detail)}`}`);
    }
};

const target = extra => Object.assign({
    isStage: false,
    name: 'Cat',
    layerOrder: 1,
    blocks: {a: {opcode: 'motion_movesteps', next: null, parent: null, inputs: {}, fields: {}, topLevel: true, x: 0, y: 0}},
    costumes: [{assetId: 'c'.repeat(32), md5ext: `${'c'.repeat(32)}.svg`, dataFormat: 'svg', name: 'one'}],
    sounds: [],
    variables: {v1: ['score', 7]},
    lists: {l1: ['names', ['x']]},
    broadcasts: {},
    x: 10,
    y: 20,
    currentCostume: 0
}, extra);
const project = extra => Object.assign({
    targets: [target({isStage: true, name: 'Stage', layerOrder: 0, blocks: {}}), target()],
    extensions: ['pen'],
    extensionStorage: {together: {mode: 'rules'}}
}, extra);

ok('canonical sorts keys and drops undefined', canonical({b: 1, a: [true, null], c: undefined}) === '{"a":[true,null],"b":1}');

const base = await projectHashes(JSON.stringify(project()));
ok('one hash per target plus the runtime entry',
    JSON.stringify(Object.keys(base).sort()) === JSON.stringify([RUNTIME_ENTRY, 'Cat', 'Stage'].sort()), base);
ok('hashes are 64 hex', Object.values(base).every(h => /^[0-9a-f]{64}$/.test(h)));

const moved = project();
moved.targets[1] = target({x: 99, y: -5, currentCostume: 0, variables: {v1: ['score', 1000]}, lists: {l1: ['names', []]}});
ok('live values do not count as drift', driftedTargets(base, await projectHashes(moved)).length === 0,
    driftedTargets(base, await projectHashes(moved)));

const edited = project();
edited.targets[1] = target({blocks: {}});
ok('a block change drifts only that target',
    JSON.stringify(driftedTargets(base, await projectHashes(edited))) === '["Cat"]');

const renamedVar = project();
renamedVar.targets[1] = target({variables: {v1: ['lives', 7]}});
ok('a renamed variable is drift', driftedTargets(base, await projectHashes(renamedVar)).includes('Cat'));

const newCostume = project();
newCostume.targets[1] = target({costumes: [{assetId: 'd'.repeat(32), dataFormat: 'png'}]});
ok('a costume md5ext change is drift', driftedTargets(base, await projectHashes(newCostume)).includes('Cat'));

const marks = project({extensionStorage: {together: {mode: 'arena'}}});
ok('project extensionStorage drifts the runtime entry',
    JSON.stringify(driftedTargets(base, await projectHashes(marks))) === JSON.stringify([RUNTIME_ENTRY]));

const extra = project();
extra.targets.push(target({name: 'Dog'}));
ok('a missing target is drift', JSON.stringify(driftedTargets(base, await projectHashes(extra))) === '["Dog"]');
ok('no remote hashes means no compare', driftedTargets(base, null).length === 0);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
