process.removeAllListeners('warning');

const crypto = await import('crypto');
const {MAX_HASHED_TARGETS, canonical, driftedTargets, projectHashes, sendableHashes} = await import('./hash.js');

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
ok('one hash per target and nothing else',
    JSON.stringify(Object.keys(base).sort()) === JSON.stringify(['Cat', 'Stage']), base);
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
ok('project-level extensionStorage is not in the manifest', driftedTargets(base, await projectHashes(marks)).length === 0);

const layered = project();
layered.targets[1] = target({layerOrder: 4, direction: 45, size: 50, visible: false, volume: 10});
ok('layer order and other live values are not hashed', driftedTargets(base, await projectHashes(layered)).length === 0);

const styled = project();
styled.targets[1] = target({rotationStyle: 'left-right'});
ok('rotation style is hashed', driftedTargets(base, await projectHashes(styled)).includes('Cat'));

const golden = target({
    comments: {k: {text: 'hi', x: 1}},
    sounds: [{md5ext: `${'e'.repeat(32)}.wav`}],
    variables: {v2: ['b', 1], v1: ['a', 2, true]},
    broadcasts: {b1: 'go'},
    extensionStorage: {together: {role: 'player', v: 1}},
    rotationStyle: 'all around',
    draggable: true
});
const expected = '{"blocks":{"a":{"fields":{},"inputs":{},"next":null,"opcode":"motion_movesteps","parent":null,' +
    '"topLevel":true,"x":0,"y":0}},"broadcasts":[["b1","go"]],"comments":{"k":{"text":"hi","x":1}},' +
    `"costumes":["${'c'.repeat(32)}.svg"],"draggable":true,"extensionStorage":{"together":{"role":"player","v":1}},` +
    '"isStage":false,"lists":[["l1","names"]],"name":"Cat","rotationStyle":"all around",' +
    `"sounds":["${'e'.repeat(32)}.wav"],"variables":[["v1","a"],["v2","b"]]}`;
const goldenHashes = await projectHashes({targets: [golden]});
ok('the manifest hash is SHA-256 of the PROTOCOL canonical form',
    goldenHashes.Cat === crypto.createHash('sha256').update(expected, 'utf8').digest('hex'));

ok('hashes go out for up to 512 targets', sendableHashes(base) === base);
const tooMany = {};
for (let i = 0; i <= MAX_HASHED_TARGETS; i++) tooMany[`t${i}`] = 'x';
ok('more than 512 targets send none', sendableHashes(tooMany) === null);
ok('a name over 128 characters sends none', sendableHashes({['n'.repeat(129)]: 'x'}) === null);

const extra = project();
extra.targets.push(target({name: 'Dog'}));
ok('a missing target is drift', JSON.stringify(driftedTargets(base, await projectHashes(extra))) === '["Dog"]');
ok('no remote hashes means no compare', driftedTargets(base, null).length === 0);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
