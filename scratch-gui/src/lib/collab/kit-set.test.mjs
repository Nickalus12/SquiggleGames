process.removeAllListeners('warning');

const {
    KIT_SET_EVENT,
    MAX_VALUE_BYTES,
    announceKitSet,
    applyKitSet,
    changedKeys,
    fitsKitSet,
    kitSetFrame
} = await import('./kit-set.js');

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
const section = name => console.log(`\n${name}`);

section('frames');
{
    const frame = kitSetFrame({scope: 'target', targetId: 'Game Rules', ext: 'together', path: ['teams'], value: ['Red']});
    ok('a target frame carries scope, targetId, ext, path and value', frame && frame.type === 'kit-set' &&
        frame.scope === 'target' && frame.targetId === 'Game Rules' && frame.ext === 'together' &&
        frame.path[0] === 'teams' && frame.value[0] === 'Red', frame);
    ok('a project frame has no targetId', !('targetId' in kitSetFrame({scope: 'project', ext: 'k', path: ['a'], value: 1})));
    ok('undefined value travels as null', kitSetFrame({scope: 'project', ext: 'k', path: ['a']}).value === null);
    ok('a target frame needs a target', kitSetFrame({scope: 'target', ext: 'k', path: ['a'], value: 1}) === null);
    ok('paths are 1 to 4 keys', kitSetFrame({scope: 'project', ext: 'k', path: [], value: 1}) === null &&
        kitSetFrame({scope: 'project', ext: 'k', path: ['a', 'b', 'c', 'd', 'e'], value: 1}) === null);
    ok('keys are at most 64 characters', kitSetFrame({scope: 'project', ext: 'k', path: ['x'.repeat(65)], value: 1}) === null);
    ok('prototype keys are refused', kitSetFrame({scope: 'project', ext: 'k', path: ['__proto__'], value: 1}) === null);
    ok('a bad scope is refused', kitSetFrame({scope: 'world', ext: 'k', path: ['a'], value: 1}) === null);
    ok('a value up to 16 KiB fits', fitsKitSet(kitSetFrame({scope: 'project', ext: 'k', path: ['a'], value: 'x'.repeat(100)})));
    ok('a bigger value does not', !fitsKitSet(kitSetFrame({scope: 'project', ext: 'k', path: ['a'],
        value: 'x'.repeat(MAX_VALUE_BYTES)})));
}

section('apply');
{
    const rules = {extensionStorage: {together: {role: 'rules', teams: ['Red']}}};
    const runtime = {extensionStorage: {}};
    const find = name => (name === 'Game Rules' ? rules : null);
    ok('a target kit-set lands at its path', applyKitSet(runtime,
        {scope: 'target', targetId: 'Game Rules', ext: 'together', path: ['teams'], value: ['Red', 'Blue']}, find) &&
        rules.extensionStorage.together.teams.join() === 'Red,Blue' && rules.extensionStorage.together.role === 'rules');
    ok('a nested path builds its parents', applyKitSet(runtime,
        {scope: 'project', ext: 'kit', path: ['a', 'b'], value: 3}, find) && runtime.extensionStorage.kit.a.b === 3);
    ok('null deletes', applyKitSet(runtime, {scope: 'project', ext: 'kit', path: ['a', 'b'], value: null}, find) &&
        !('b' in runtime.extensionStorage.kit.a));
    ok('an unknown target is not applied', !applyKitSet(runtime,
        {scope: 'target', targetId: 'Nope', ext: 'together', path: ['teams'], value: []}, find));
    ok('a prototype path is not applied', !applyKitSet(runtime,
        {scope: 'project', ext: 'kit', path: ['__proto__', 'x'], value: 1}, find) && !({}).x);
    ok('a missing value is not applied', !applyKitSet(runtime, {scope: 'project', ext: 'kit', path: ['z']}, find));
}

section('announce');
{
    ok('changed keys compare by value', changedKeys({a: 1, b: [1], c: 2}, {a: 1, b: [2], d: 3}).join() === 'b,c,d');
    const seen = [];
    const runtime = {emit: (name, change) => seen.push({name, change})};
    const target = {getName: () => 'Game Rules'};
    announceKitSet(runtime, {scope: 'target', target, ext: 'together', before: {teams: ['Red'], v: 1},
        after: {teams: ['Red', 'Blue'], v: 1}});
    ok('one event per changed key', seen.length === 1 && seen[0].name === KIT_SET_EVENT &&
        seen[0].change.path[0] === 'teams' && seen[0].change.value.length === 2, seen);
    seen.length = 0;
    announceKitSet(runtime, {scope: 'target', target, ext: 'together', before: {teams: ['Red']}, after: {}});
    ok('a removed key announces null', seen.length === 1 && seen[0].change.value === null);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
