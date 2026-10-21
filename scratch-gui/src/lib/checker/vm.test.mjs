import {createRequire} from 'node:module';
import {harness} from './fixtures/load.mjs';

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');

vmLog.warn = () => {};
vmLog.info = () => {};

const {buildContext, runChecks, snapshotTarget} = await import('./index.js');
const {ok, done} = harness();

const base = {
    variables: {}, lists: {}, broadcasts: {}, comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100
};

const catBlocks = {
    flag: {opcode: 'event_whenflagclicked', next: 'send', parent: null, inputs: {}, fields: {},
        shadow: false, topLevel: true, x: 0, y: 0},
    send: {opcode: 'event_broadcast', next: 'call', parent: 'flag',
        inputs: {BROADCAST_INPUT: [1, [11, 'win', 'msgwin']]}, fields: {}, shadow: false, topLevel: false},
    call: {opcode: 'procedures_call', next: 'loop', parent: 'send', inputs: {}, fields: {}, shadow: false, topLevel: false,
        mutation: {tagName: 'mutation', children: [], proccode: 'spin %n', argumentids: '["a1"]', warp: 'false'}},
    loop: {opcode: 'control_forever', next: null, parent: 'call', inputs: {SUBSTACK: [2, 'clone']}, fields: {},
        shadow: false, topLevel: false},
    clone: {opcode: 'control_create_clone_of', next: 'tset', parent: 'loop', inputs: {CLONE_OPTION: [1, 'cmenu']},
        fields: {}, shadow: false, topLevel: false},
    cmenu: {opcode: 'control_create_clone_of_menu', next: null, parent: 'clone', inputs: {},
        fields: {CLONE_OPTION: ['_myself_', null]}, shadow: true, topLevel: false},
    tset: {opcode: 'together_broadcastGameMessage', next: null, parent: 'clone',
        inputs: {NAME: [1, [10, 'pos']], VALUE: [1, [10, '1']]}, fields: {}, shadow: false, topLevel: false},
    lone: {opcode: 'motion_movesteps', next: null, parent: null, inputs: {STEPS: [1, [4, '10']]}, fields: {},
        shadow: false, topLevel: true, x: 300, y: 0},
    hear: {opcode: 'event_whenbroadcastreceived', next: null, parent: null, inputs: {},
        fields: {BROADCAST_OPTION: ['ghost', 'msgghost']}, shadow: false, topLevel: true, x: 0, y: 300},
    say: {opcode: 'looks_say', next: null, parent: null, inputs: {MESSAGE: [3, [12, 'speed', 'vspeed'], [10, '']]},
        fields: {}, shadow: false, topLevel: true, x: 0, y: 500}
};

const project = {
    targets: [
        Object.assign({}, base, {isStage: true, name: 'Stage', layerOrder: 0, blocks: {},
            broadcasts: {msgwin: 'win', msgghost: 'ghost'}, variables: {vunused: ['nobody reads me', 0]}}),
        Object.assign({}, base, {isStage: false, name: 'Cat', layerOrder: 1, blocks: catBlocks,
            variables: {vspeed: ['speed', 3]}, visible: true, x: 0, y: 0, size: 100, direction: 90,
            draggable: false, rotationStyle: 'all around'})
    ],
    monitors: [],
    extensions: ['together'],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
};

const vm = new VM();
vm.extensionManager.addBuiltinExtension('together', class {
    getInfo () {
        return {id: 'together', name: 'Together', blocks: [
            {opcode: 'broadcastGameMessage', blockType: 'command', text: 'send [NAME] [VALUE]'},
            {opcode: 'myPlayerName', blockType: 'reporter', text: 'me'}
        ]};
    }
    broadcastGameMessage () {}
    myPlayerName () {
        return '';
    }
});
await vm.loadProject(JSON.stringify(project));
const runtime = vm.runtime;
const model = Object.assign(buildContext(runtime, {win: null}), {
    targets: runtime.targets.filter(target => target.isOriginal).map(snapshotTarget)
});
const items = runChecks(model);
const find = (rule, blockId) => items.find(entry => entry.rule === rule && (!blockId || entry.blockId === blockId));
const cat = model.targets.find(target => target.name === 'Cat');

ok('the live VM block map is read as is', cat && cat.blocks === runtime.getSpriteTargetByName('Cat').blocks._blocks);
ok('a broadcast primitive becomes a menu the rule can read', !!find('message-not-received', 'send') &&
    find('message-not-received', 'send').fixData.broadcastId === 'msgwin');
ok('a receiver nothing sends', !!find('message-not-sent', 'hear'));
ok('the custom block mutation is read', find('custom-block-missing', 'call') &&
    find('custom-block-missing', 'call').values.name === 'spin ()');
ok('create clone of myself in forever with no delete', !!find('clone-runaway', 'clone'));
ok('a Together send in the same forever with no wait', !!find('together-flood', 'tset'));
const loose = find('loose-blocks');
ok('the lone motion stack is loose, the reporter-only say is a command so it counts too',
    loose && loose.values.count === 2, loose && loose.values);
ok('a global variable nobody uses can be deleted', find('variable-unused') &&
    items.some(entry => entry.rule === 'variable-unused' && entry.values.name === 'nobody reads me' &&
        entry.fix === 'delete-variable'));
ok('a variable read by a reporter is not unused', !items.some(entry => entry.values.name === 'speed'));
ok('together is flagged squiggle-only', items.some(entry => entry.rule === 'squiggle-only' && entry.targetId === cat.id));
ok('an extension reporter is learned from the runtime block info', model.reporterOpcodes.has('together_myPlayerName'));
done();
