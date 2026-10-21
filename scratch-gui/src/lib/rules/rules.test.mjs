import './json-hook.mjs';
import {createRequire} from 'node:module';

process.removeAllListeners('warning');

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');

vmLog.warn = () => {};
vmLog.info = () => {};

const {installProjectSeam, isRulesTarget, RULES_KEY} = await import('../collab/project-seam.js');
const {ensureRulesSprite, RULES_NAME} = await import('./ensure-sprite.js');
const {installRulesGuard, settle} = await import('./guard.js');
const {ruleOpcodeSet, menuItems} = await import('./rule-blocks.js');
const {filterCategories, tokenize, MODE_RULES, MODE_DEVICE} = await import('./toolbox-mode.js');
const {createRulesStatus, kidText, parseRulesStatus, rulesStatus} = await import('./status.js');
const {buildRulesUpload, createRulesUploader, putRules, uploadRules, OPCODE_SET} = await import('./package.js');
const TogetherBlocks = (await import('../libraries/extensions/together/index.js')).default;
const expansions = {
    squigglescores: (await import('../libraries/extensions/squigglescores/index.js')).default,
    squiggleteams: (await import('../libraries/extensions/squiggleteams/index.js')).default,
    squigglearena: (await import('../libraries/extensions/squigglearena/index.js')).default
};

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

const stage = {
    isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0
};
const hero = {
    isStage: false, name: 'Hero', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
};
const project = {
    targets: [stage, hero], monitors: [], extensions: [], meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
};

const makeVM = async json => {
    const vm = new VM();
    installProjectSeam(vm);
    installRulesGuard(vm);
    vm.extensionManager.addBuiltinExtension('together', TogetherBlocks);
    Object.keys(expansions).forEach(id => vm.extensionManager.addBuiltinExtension(id, expansions[id]));
    await vm.loadProject(JSON.stringify(json));
    return vm;
};
const rulesOf = vm => vm.runtime.targets.filter(target => target.isOriginal && isRulesTarget(target));

section('ensureRulesSprite');
const vm = await makeVM(project);
const target = await ensureRulesSprite(vm);
ok('creates one marked sprite', rulesOf(vm).length === 1 && rulesOf(vm)[0] === target);
ok('named Game Rules', target.getName() === RULES_NAME);
ok('mark is {role: rules, v: 1}', JSON.stringify(target.extensionStorage[RULES_KEY]) === '{"role":"rules","v":1}');
ok('the project storage is not replaced by the sprite storage', vm.runtime.extensionStorage !== target.extensionStorage);
ok('pinned right after the stage', vm.runtime.targets[1] === target);
ok('hidden and not draggable', target.visible === false && target.draggable === false);
ok('not executable', vm.runtime.executableTargets.indexOf(target) === -1);
ok('a second call returns the same sprite', await ensureRulesSprite(vm) === target && rulesOf(vm).length === 1);
const [a, b] = await Promise.all([ensureRulesSprite(vm), ensureRulesSprite(vm)]);
ok('concurrent calls share one sprite', a === target && b === target && rulesOf(vm).length === 1);

section('save and load');
target.extensionStorage[RULES_KEY].teams = ['Red', 'Blue'];
target.extensionStorage[RULES_KEY].players = [{name: 'coins', default: 0, see: 'self', save: true}];
const saved = vm.toJSON();
const reloaded = await makeVM(JSON.parse(saved));
const again = rulesOf(reloaded);
ok('mark survives a whole-project save and load', again.length === 1 &&
    again[0].extensionStorage[RULES_KEY].role === 'rules' && again[0].extensionStorage[RULES_KEY].v === 1);
ok('declarations survive too', again.length === 1 &&
    JSON.stringify(again[0].extensionStorage[RULES_KEY].teams) === '["Red","Blue"]');
ok('reloaded rules sprite is not executable', again.length === 1 &&
    reloaded.runtime.executableTargets.indexOf(again[0]) === -1);
const spriteOnly = JSON.parse(vm.toJSON(target.id));
ok('sprite export keeps the mark', spriteOnly.extensionStorage && spriteOnly.extensionStorage[RULES_KEY].role === 'rules');

section('guard');
const extra = reloaded.runtime.targets.find(t => t.isOriginal && t.getName() === 'Hero');
extra.extensionStorage[RULES_KEY] = {role: 'rules', v: 1};
settle(reloaded.runtime);
ok('a second mark is cleared, the first stays', rulesOf(reloaded).length === 1 && !isRulesTarget(extra));

section('rule menus');
ok('player values come from the mark', JSON.stringify(menuItems(reloaded.runtime, 'playerValues')) ===
    '[{"text":"coins","value":"coins"}]');
ok('teams come from the mark', menuItems(reloaded.runtime, 'teams').map(i => i.value).join() === 'Red,Blue');
ok('an empty menu still has one item', menuItems(vm.runtime, 'boards').length === 1);

section('toolbox mode with the real extensions (dispatch serves the newest VM)');
['together', 'squigglescores', 'squiggleteams', 'squigglearena']
    .forEach(id => reloaded.extensionManager.loadExtensionIdSync(id));
const xml = reloaded.runtime.getBlocksXML(rulesOf(reloaded)[0]);
const typesIn = categories => categories.map(c => tokenize(c.xml.slice(c.xml.indexOf('>') + 1))
    .filter(item => item.name === 'block')
    .map(item => item.openTag.match(/type="([^"]*)"/)[1])).flat();
const ruleSet = ruleOpcodeSet();
const rulesView = filterCategories(xml, MODE_RULES);
const deviceView = filterCategories(xml, MODE_DEVICE);
const rulesTypes = typesIn(rulesView);
const deviceTypes = typesIn(deviceView);
ok('rules mode shows only rule blocks', rulesTypes.length > 0 && rulesTypes.every(t => ruleSet.has(t)), rulesTypes.filter(t => !ruleSet.has(t)));
ok('rules mode shows every rule block', rulesTypes.length === ruleSet.size, [rulesTypes.length, ruleSet.size]);
ok('device mode shows no rule blocks', deviceTypes.every(t => !ruleSet.has(t)));
ok('device mode keeps the 16 legacy blocks', deviceTypes.filter(t => t.startsWith('together_')).length === 16,
    deviceTypes.filter(t => t.startsWith('together_')));
ok('the game server blocks stay hidden until the game socket lands',
    !deviceTypes.some(t => /^together_(tellGame|whenGameSays|gameValue|myPlayerValue|gameRound|myTeam|timeLeft|inGame)$/
        .test(t)) && !/Game server/.test(xml.map(c => c.xml).join('')));
ok('expansions in device mode show only the Open Game Rules button', deviceView
    .filter(c => c.id !== 'together')
    .every(c => !/<block/.test(c.xml) && /callbackData="[a-z]+_openGameRules"/.test(c.xml)));
ok('rules mode drops the Open Game Rules button', rulesView.every(c => !/openGameRules/.test(c.xml)));
ok('rule blocks are gold-edged', /"colourTertiary":"#ffc53d"/.test(JSON.stringify(reloaded.runtime.getBlocksJSON())));

section('a viewer opening Game Rules');
{
    const viewerVm = new VM();
    viewerVm.addSprite = () => Promise.resolve();
    const quiet = console.warn;
    console.warn = () => {};
    const together = await new TogetherBlocks(viewerVm.runtime).openGameRules().then(r => ({r}), e => ({e}));
    const scores = await new expansions.squigglescores(viewerVm.runtime).openGameRules().then(r => ({r}), e => ({e}));
    console.warn = quiet;
    ok('the together button settles to null instead of throwing', !together.e && together.r === null, together);
    ok('an expansion button settles to null instead of throwing', !scores.e && scores.r === null, scores);
}

section('packaging');
const empty = await buildRulesUpload(vm);
ok('no upload while the rules sprite holds no blocks', empty === null);
target.blocks.createBlock({
    id: 'hat', opcode: 'together_ruleWhenGameStarts', next: null, parent: null,
    inputs: {}, fields: {}, shadow: false, topLevel: true, x: 10, y: 20
});
const body = await buildRulesUpload(vm);
ok('upload carries an integer opcodeSet, hash, sprite and levels', body && Number.isInteger(body.opcodeSet) &&
    body.opcodeSet === OPCODE_SET && /^[0-9a-f]{64}$/.test(body.hash) && body.sprite.blocks.hat &&
    Array.isArray(body.levels) && body.levels.length === 0, body && Object.keys(body));
ok('no format field travels', body && !('format' in body));
ok('the sprite mark carries the same opcodeSet', body.sprite.extensionStorage[RULES_KEY].opcodeSet === body.opcodeSet &&
    body.sprite.extensionStorage[RULES_KEY].role === 'rules');
ok('nothing is stamped before the PUT', !(vm.runtime.extensionStorage[RULES_KEY] || {}).rulesHash);
ok('a rebuild hashes the same', (await buildRulesUpload(vm)).hash === body.hash);
const calls = [];
const fakeFetch = (url, init) => {
    calls.push({url, init});
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({hash: body.hash, ok: true, errors: []})});
};
await putRules({slug: 'cat-maze', body, fetchImpl: fakeFetch});
ok('PUT /api/rooms/<slug>/rules with JSON', calls[0].url === '/api/rooms/cat-maze/rules' &&
    calls[0].init.method === 'PUT' && JSON.parse(calls[0].init.body).hash === body.hash);
const sentKeys = Object.keys(JSON.parse(calls[0].init.body)).sort()
    .join();
ok('the body is opcodeSet, hash, sprite and levels', sentKeys === 'hash,levels,opcodeSet,sprite', sentKeys);

const failing = () => Promise.resolve({ok: false, status: 403, json: () => Promise.resolve({error: 'forbidden'})});
const refused = await uploadRules({vm, slug: 'cat-maze', fetchImpl: failing}).then(() => null, e => e.status);
ok('a failed PUT rejects with its status', refused === 403, refused);
ok('a failed PUT shows its status', rulesStatus.get().compile.errors[0].code === 'upload-failed' &&
    /\(403\)/.test(rulesStatus.get().compile.errors[0].text), rulesStatus.get().compile);
ok('a failed PUT stamps nothing', !(vm.runtime.extensionStorage[RULES_KEY] || {}).rulesHash);
await uploadRules({vm, slug: 'cat-maze', fetchImpl: fakeFetch});
ok('a good PUT stamps the project with the hash', vm.runtime.extensionStorage[RULES_KEY].rulesHash === body.hash &&
    vm.runtime.extensionStorage[RULES_KEY].opcodeSet === OPCODE_SET);
ok('the stamp stays off the rules sprite', !target.extensionStorage[RULES_KEY].rulesHash);
calls.length = 1;

target.extensionStorage[RULES_KEY] = Object.assign({}, target.extensionStorage[RULES_KEY], {opcodeSet: OPCODE_SET + 1});
const callsBefore = calls.length;
const newer = await uploadRules({vm, slug: 'cat-maze', fetchImpl: fakeFetch, raise: true});
ok('a mark newer than the tab is not uploaded', newer && newer.newer === true && calls.length === callsBefore);
ok('it shows the opcode-set text at once', rulesStatus.get().compile.errors[0].code === 'opcode-set');
ok('an edit never lowers the mark', target.extensionStorage[RULES_KEY].opcodeSet === OPCODE_SET + 1);
target.extensionStorage[RULES_KEY] = Object.assign({}, target.extensionStorage[RULES_KEY], {opcodeSet: 0});
const raised = await buildRulesUpload(vm, {raise: true});
ok('an edit raises an older mark to the newest set', raised.opcodeSet === OPCODE_SET &&
    target.extensionStorage[RULES_KEY].opcodeSet === OPCODE_SET);
ok('the hash covers the raised mark', raised.hash === body.hash);
let clock = 0;
const timers = [];
let editRights = true;
const uploader = createRulesUploader({
    vm, slug: 'cat-maze', fetchImpl: fakeFetch, canEdit: () => editRights,
    now: () => clock,
    setTimer: (fn, ms) => {
        timers.push({fn, at: clock + ms});
        return timers.length;
    },
    clearTimer: id => {
        timers[id - 1].fn = null;
    }
});
uploader.edited();
uploader.edited();
ok('edits wait 500 ms and coalesce', timers.length === 2 && timers[0].fn === null && timers[1].at === 500);
clock = 500;
await timers[1].fn();
ok('the coalesced edit uploads once', calls.length === 2);
uploader.edited();
clock = 1000;
await timers[2].fn();
ok('an unchanged hash is not uploaded again', calls.length === 2);
target.blocks.createBlock({
    id: 'hat2', opcode: 'together_ruleWhenGameStarts', next: null, parent: null,
    inputs: {}, fields: {}, shadow: false, topLevel: true, x: 10, y: 120
});
editRights = false;
uploader.edited();
clock = 1500;
await timers[timers.length - 1].fn();
ok('without edit rights nothing goes up', calls.length === 2);
editRights = true;
uploader.edited();
clock = 1700;
const gapTimer = timers[timers.length - 1];
await gapTimer.fn();
ok('a changed hash goes up', calls.length === 3, calls.length);
uploader.sendNow();
await Promise.resolve();
ok('a second send inside 500 ms waits its turn', calls.length === 3 && timers[timers.length - 1].at === 2200,
    timers[timers.length - 1]);

section('rules-status');
const status = createRulesStatus();
const seen = [];
status.subscribe(s => seen.push(s));
status.apply({hash: 'h', ok: false, errors: [{blockId: 'b1', code: 'global-var', detail: {name: 'x'}}]});
ok('compile errors block the game', status.blocking() && seen.length === 1);
ok('errors carry kid text and a message id', status.get().compile.errors[0].text === kidText('global-var') &&
    status.get().compile.errors[0].id === 'sq.rules.err.global-var');
status.apply({hash: 'h', ok: true, phase: 'run', errors: [{code: 'too-much', n: 3}]});
ok('run errors keep the compile result', status.blocking() && status.get().run.errors[0].n === 3);
ok('unknown codes fall back to plain words', parseRulesStatus({errors: [{code: 'zzz'}]}).errors[0].text.length > 0);
{
    const {errorText} = await import('./status.js');
    ok('a limit names its max and what it limits',
        errorText('limit', {limit: 'timers', max: 4}, 1) === 'Game Rules can have at most 4 timers. Remove some.',
        errorText('limit', {limit: 'timers', max: 4}, 1));
    ok('an unknown limit falls back to plain words', !/\{/.test(errorText('limit', {limit: 'zzz', max: 4}, 1)));
    ok('repeats are counted', /Happened 3 times\.$/.test(errorText('deferred', null, 3)));
    ok('one time says nothing extra', errorText('deferred', null, 1) === 'The game was busy, so this rule ran a moment late.');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
