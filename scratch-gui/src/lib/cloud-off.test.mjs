process.removeAllListeners('warning');

const fs = await import('node:fs');
const {createRequire} = await import('node:module');
await import('./rules/json-hook.mjs');

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');
vmLog.warn = () => {};
vmLog.info = () => {};

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    const more = !cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : '';
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${more}`);
};

const sockets = [];
globalThis.WebSocket = class {
    constructor (url) {
        sockets.push(url);
    }
};

const CLOUD = ['\u2601 score', 'cloudVar'];
const block = (opcode, next, parent, inputs) => ({
    opcode,
    next,
    parent,
    inputs,
    fields: opcode === 'event_whenflagclicked' ? {} : {VARIABLE: CLOUD},
    shadow: false,
    topLevel: parent === null,
    x: 0,
    y: 0
});
const BACKDROP = 'cd21514d0531fdffb22204e0ec5ed84a';
const project = {
    targets: [{
        isStage: true,
        name: 'Stage',
        variables: {cloudVar: [CLOUD[0], 0, true]},
        lists: {},
        broadcasts: {},
        blocks: {
            flag: block('event_whenflagclicked', 'set', null, {}),
            set: block('data_setvariableto', 'add', 'flag', {VALUE: [1, [10, '5']]}),
            add: block('data_changevariableby', null, 'set', {VALUE: [1, [4, '2']]})
        },
        comments: {},
        currentCostume: 0,
        costumes: [{
            name: 'backdrop1',
            dataFormat: 'svg',
            assetId: BACKDROP,
            md5ext: `${BACKDROP}.svg`,
            rotationCenterX: 240,
            rotationCenterY: 180
        }],
        sounds: [],
        volume: 100,
        layerOrder: 0
    }],
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
};

const vm = new VM();
await vm.loadProject(JSON.stringify(project));
const stage = vm.runtime.getTargetForStage();
const cloud = stage.lookupVariableById('cloudVar');
ok('a project with a cloud variable loads', !!cloud && cloud.name === '☁ score');
vm.greenFlag();
for (let i = 0; i < 5; i++) vm.runtime._step();
ok('the cloud variable works like a normal variable', Number(cloud.value) === 7, cloud.value);
ok('nothing opened a socket', sockets.length === 0, sockets);
ok('the project still saves the variable', JSON.parse(vm.toJSON()).targets[0].variables.cloudVar[1] === 7);

const guiText = fs.readFileSync(new URL('../playground/render-gui.jsx', import.meta.url), 'utf8');
ok('the editor names no cloud host', !/clouddata|wss?:\/\//.test(guiText) && /cloudHost=""/.test(guiText));
ok('the editor turns cloud off', /canUseCloud=\{false\}/.test(guiText) && /hasCloudPermission=\{false\}/.test(guiText));
ok('no ?cloud_host override', !/cloud_host/.test(guiText));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
