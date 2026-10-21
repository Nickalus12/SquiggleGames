import {createRequire} from 'node:module';

process.removeAllListeners('warning');

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');

vmLog.warn = () => {};
vmLog.info = () => {};

const {
    installProjectSeam,
    preserveExtensionStorage,
    loadStoredKits,
    isRulesTarget,
    markRulesTarget,
    RULES_KEY
} = await import('./project-seam.js');

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

const sprite = (name, layerOrder, extra) => Object.assign({
    isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder, visible: true,
    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
}, extra);

const project = extraTargets => ({
    targets: [
        {
            isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0
        },
        sprite('Hero', 1),
        sprite('Game Rules', 2, {visible: false})
    ].concat(extraTargets || []),
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const load = async json => {
    const vm = new VM();
    await vm.loadProject(typeof json === 'string' || json instanceof ArrayBuffer ? json : JSON.stringify(json));
    return vm;
};
const named = (vm, name) => vm.runtime.targets.find(target => target.isOriginal && target.getName() === name);

section('marker helpers');
const plain = {extensionStorage: {}};
ok('a target without the mark is not the rules sprite', !isRulesTarget(plain) && !isRulesTarget(null));
const mark = markRulesTarget(plain);
ok('markRulesTarget writes {role: rules, v: 1} under together', RULES_KEY === 'together' &&
    JSON.stringify(plain.extensionStorage.together) === '{"role":"rules","v":1}' && mark === plain.extensionStorage.together);
ok('isRulesTarget reads it', isRulesTarget(plain));
const decorated = {extensionStorage: {together: {secret: ['a'], role: 'old'}}};
markRulesTarget(decorated);
ok('markRulesTarget keeps other mark fields', decorated.extensionStorage.together.secret[0] === 'a' &&
    decorated.extensionStorage.together.role === 'rules');

section('without the seam the mark is lost (the reason this file exists)');
const bare = await load(project());
markRulesTarget(named(bare, 'Game Rules'));
const bareJson = JSON.parse(bare.toJSON());
ok('stock toJSON drops the mark of a rules sprite with no blocks',
    !bareJson.targets.find(target => target.name === 'Game Rules').extensionStorage);

section('whole project');
const vm = await load(project());
ok('install returns the vm and is idempotent', installProjectSeam(vm) === vm && installProjectSeam(vm) === vm);
const untouched = vm.toJSON();
ok('a project without marks serializes byte for byte as before', untouched === VM.prototype.toJSON.call(vm));
markRulesTarget(named(vm, 'Game Rules'));
named(vm, 'Hero').extensionStorage.other = {keep: false};
const json = JSON.parse(vm.toJSON());
const rulesJson = json.targets.find(target => target.name === 'Game Rules');
ok('the rules mark is saved', rulesJson.extensionStorage && rulesJson.extensionStorage.together.role === 'rules');
ok('storage of other unused extensions is still dropped',
    !json.targets.find(target => target.name === 'Hero').extensionStorage);
ok('extensions list is unchanged', Array.isArray(json.extensions) && json.extensions.length === 0, json.extensions);
const reloaded = await load(JSON.stringify(json));
ok('deserialize brings the mark back', isRulesTarget(named(reloaded, 'Game Rules')) &&
    !isRulesTarget(named(reloaded, 'Hero')));

section('values that stock JSON would make invalid');
named(vm, 'Game Rules').extensionStorage.together.limit = Infinity;
const sanitized = JSON.parse(vm.toJSON());
ok('non-finite numbers save as 0 like StringUtil.stringify',
    sanitized.targets.find(target => target.name === 'Game Rules').extensionStorage.together.limit === 0);
delete named(vm, 'Game Rules').extensionStorage.together.limit;

section('runtime level storage');
preserveExtensionStorage('squiggleworld');
vm.runtime.extensionStorage.squiggleworld = {format: 1, levels: [{w: 2, rows: ['2a']}]};
vm.runtime.extensionStorage.unusedthing = {x: 1};
const levelJson = JSON.parse(vm.toJSON());
ok('a preserved runtime key is saved', levelJson.extensionStorage && levelJson.extensionStorage.squiggleworld.format === 1);
ok('unpreserved runtime keys are still dropped', !('unusedthing' in levelJson.extensionStorage));
const levelVm = await load(JSON.stringify(levelJson));
ok('runtime storage reloads', levelVm.runtime.extensionStorage.squiggleworld.levels[0].rows[0] === '2a');
let threw = false;
try {
    preserveExtensionStorage('');
} catch (e) {
    threw = true;
}
ok('preserveExtensionStorage needs an id', threw);

section('kit storage survives in a session that never loaded the kit');
vm.runtime.extensionStorage.squigglescenes = {format: 1, scenes: [{id: 's1', name: 'Start'}]};
named(vm, 'Hero').extensionStorage.squiggle3d = {fov: 66};
const kitJson = JSON.parse(vm.toJSON());
ok('a registered kit key is saved without preserveExtensionStorage',
    kitJson.extensionStorage.squigglescenes.scenes[0].id === 's1');
ok('a kit key on a sprite is saved too',
    kitJson.targets.find(target => target.name === 'Hero').extensionStorage.squiggle3d.fov === 66);
ok('keys that are not kits are still dropped', !('unusedthing' in kitJson.extensionStorage));
delete vm.runtime.extensionStorage.squigglescenes;
delete named(vm, 'Hero').extensionStorage.squiggle3d;

section('kits whose storage exists load with the project');
const Scenes = class {
    constructor (runtime) {
        this.runtime = runtime;
    }
    getInfo () {
        return {id: 'squigglescenes', name: 'Scenes', blocks: []};
    }
};
const autoVm = installProjectSeam(new VM());
autoVm.extensionManager.addBuiltinExtension('squigglescenes', Scenes);
await autoVm.loadProject(JSON.stringify(Object.assign(project(), {
    extensionStorage: {squigglescenes: {format: 1, scenes: []}, squiggleworld: {format: 1, levels: []}}
})));
ok('a builtin kit with stored data is loaded after loadProject',
    autoVm.extensionManager.isExtensionLoaded('squigglescenes'));
ok('a kit that is not builtin here is skipped without throwing',
    !autoVm.extensionManager.isExtensionLoaded('squiggleworld'));
ok('loadStoredKits reports nothing more to load', loadStoredKits(autoVm).length === 0);
ok('its storage is still there', autoVm.runtime.extensionStorage.squiggleworld.format === 1);

section('a single sprite (rules upload and sprite export)');
const spriteJson = JSON.parse(vm.toJSON(named(vm, 'Game Rules').id));
ok('toJSON(targetId) keeps the mark', spriteJson.extensionStorage && spriteJson.extensionStorage.together.role === 'rules');
ok('toJSON(targetId) for another sprite adds nothing',
    !JSON.parse(vm.toJSON(named(vm, 'Hero').id)).extensionStorage);

section('collab snapshot path: saveProjectSb3 then loadProject');
const zipped = await vm.saveProjectSb3('arraybuffer');
const peer = await load(zipped);
ok('the mark crosses a snapshot', isRulesTarget(named(peer, 'Game Rules')));
ok('level data crosses a snapshot', peer.runtime.extensionStorage.squiggleworld.format === 1);
installProjectSeam(peer);
const again = await load(await peer.saveProjectSb3('arraybuffer'));
ok('and a second hop', isRulesTarget(named(again, 'Game Rules')));

section('marks next to used extensions');
const used = project([sprite('Sender', 3, {
    blocks: {
        a: {opcode: 'together_myPlayerName', next: null, parent: null, inputs: {}, fields: {}, shadow: false,
            topLevel: true, x: 0, y: 0}
    }
})]);
const usedVm = new VM();
usedVm.extensionManager.addBuiltinExtension('together', class {
    getInfo () {
        return {id: 'together', name: 'Together', blocks: [{opcode: 'myPlayerName', blockType: 'reporter', text: 'me'}]};
    }
    myPlayerName () {
        return '';
    }
});
await usedVm.loadProject(JSON.stringify(used));
installProjectSeam(usedVm);
markRulesTarget(named(usedVm, 'Game Rules'));
const usedJson = JSON.parse(usedVm.toJSON());
ok('when together blocks exist the stock path saves the mark and the seam leaves it alone',
    usedJson.targets.find(target => target.name === 'Game Rules').extensionStorage.together.role === 'rules' &&
    usedJson.extensions.indexOf('together') !== -1);

section('addSprite keeps project storage (sb3.js deserialize assigns runtime.extensionStorage from a sprite3)');
const rulesUpload = sprite('Rules Two', 3, {visible: false, extensionStorage: {together: {role: 'rules', v: 1}}});
const stockHost = await load(project());
stockHost.runtime.extensionStorage.squiggleworld = {format: 1, levels: []};
await stockHost.addSprite(JSON.stringify(rulesUpload));
ok('stock addSprite loses project storage and shares the sprite object (the bug)',
    !stockHost.runtime.extensionStorage.squiggleworld &&
    stockHost.runtime.extensionStorage === named(stockHost, 'Rules Two').extensionStorage);
const host = await load(project());
installProjectSeam(host);
host.runtime.extensionStorage.squiggleworld = {format: 1, levels: []};
await host.addSprite(JSON.stringify(rulesUpload));
ok('with the seam the project storage survives addSprite',
    host.runtime.extensionStorage.squiggleworld && host.runtime.extensionStorage.squiggleworld.format === 1);
ok('the added sprite keeps its mark in its own object',
    isRulesTarget(named(host, 'Rules Two')) && named(host, 'Rules Two').extensionStorage !== host.runtime.extensionStorage);
let rejected = false;
try {
    await host.addSprite('not a sprite');
} catch (e) {
    rejected = true;
}
ok('a failed addSprite still rejects and keeps project storage',
    rejected && host.runtime.extensionStorage.squiggleworld.format === 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
