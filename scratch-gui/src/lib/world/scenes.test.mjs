import {createRequire} from 'node:module';
import {ok, section, done, stubRenderer, fakeCanvas} from './harness.mjs';

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');
const RenderWebGL = require('scratch-render/src/RenderWebGL.js');
const twgl = createRequire(require.resolve('scratch-render/src/RenderWebGL.js'))('twgl.js');

vmLog.warn = () => {};
vmLog.info = () => {};
globalThis.document = {hidden: true};

const {installWorldSeams} = await import('./seams.js');
const {getWorld} = await import('./world.js');
const {getScenes, PHASES, HALF_MS} = await import('./scenes.js');
const {FLAGS, createGrid, addTexture, setCell, encodeLevel} = await import('./tilemap.js');
const {default: SquiggleScenesBlocks} = await import('../libraries/extensions/squigglescenes/index.js');
const {default: SquiggleWorldBlocks} = await import('../libraries/extensions/squiggleworld/index.js');
const {getKit} = await import('../kits/registry.js');

const logTo = (id, item) => ({
    opcode: 'data_addtolist', next: null, parent: id, inputs: {ITEM: [3, `${id}r`, [10, '']]},
    fields: {LIST: ['log', 'logid']}, shadow: false, topLevel: false
});

const reporter = parent => ({
    opcode: 'squigglescenes_currentScene', next: null, parent, inputs: {},
    fields: {PROP: ['name', null]}, shadow: false, topLevel: false
});

const hat = (opcode, scene, tag) => {
    const blocks = {};
    blocks[`${tag}h`] = {opcode, next: `${tag}a`, parent: null, inputs: {}, fields: {SCENE: [scene, null]},
        shadow: false, topLevel: true, x: 0, y: 0};
    blocks[`${tag}a`] = logTo(`${tag}a`);
    blocks[`${tag}a`].parent = `${tag}h`;
    blocks[`${tag}ar`] = reporter(`${tag}a`);
    return blocks;
};

const sprite = (name, extra) => Object.assign({
    isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
}, extra);

const bossLoop = {
    g: {opcode: 'event_whenflagclicked', next: 'f', parent: null, inputs: {}, fields: {}, shadow: false,
        topLevel: true, x: 0, y: 0},
    f: {opcode: 'control_forever', next: null, parent: 'g', inputs: {SUBSTACK: [2, 'c']}, fields: {},
        shadow: false, topLevel: false},
    c: {opcode: 'motion_changexby', next: null, parent: 'f', inputs: {DX: [1, [4, '1']]}, fields: {},
        shadow: false, topLevel: false}
};

const cave = () => {
    const grid = createGrid({id: 'cave', name: 'Cave', cols: 40, rows: 20, tileSize: 16});
    const wall = addTexture(grid, 'wall', FLAGS.solid);
    for (let c = 0; c < 40; c++) setCell(grid, 'main', c, 19, wall);
    return grid;
};

const scenesData = () => ({
    format: 1,
    scenes: [
        {id: 'one', name: 'One', backdrop: 'day', level: '', spawns: [
            {sprite: 'Hero', x: -100, y: 0, shown: true}, {sprite: 'Boss', x: 50, y: 50, shown: true}
        ]},
        {id: 'two', name: 'Two', backdrop: 'night', level: 'cave',
            bounds: {left: -240, right: 400, top: 180, bottom: -140},
            spawns: [{sprite: 'Hero', x: 10, y: 20, shown: true}, {sprite: 'Coin', x: 30, y: 40, shown: false}]},
        {id: 'three', name: 'Three', backdrop: 'day', keepClones: true, spawns: [{sprite: 'Hero', x: 0, y: 0}]}
    ],
    allScenes: ['Hud']
});

const project = () => ({
    targets: [
        {
            isStage: true, name: 'Stage', variables: {}, lists: {logid: ['log', []]}, broadcasts: {},
            blocks: Object.assign({}, hat('squigglescenes_whenSceneEnds', '_any_', 'e'),
                hat('squigglescenes_whenSceneStarts', 'Two', 's'), hat('squigglescenes_whenSceneStarts', '_any_', 'y')),
            comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
            videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        sprite('Hero', {x: 0, y: 0}),
        sprite('Boss', {x: 0, y: 0, blocks: bossLoop, layerOrder: 2}),
        sprite('Coin', {x: 0, y: 0, layerOrder: 3}),
        sprite('Hud', {x: 200, y: 160, layerOrder: 4})
    ],
    monitors: [],
    extensions: ['squigglescenes'],
    extensionStorage: {squigglescenes: scenesData(), squiggleworld: {format: 1, levels: [encodeLevel(cave())]}},
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const settle = () => new Promise(resolve => setImmediate(resolve));

const vm = new VM();
const renderer = stubRenderer(RenderWebGL, twgl);
const effects = [];
renderer.updateDrawableEffect = (id, effect, value) => effects.push({id, effect, value});
vm.attachRenderer(renderer);
const seam = installWorldSeams(vm);
vm.extensionManager.addBuiltinExtension('squigglescenes', SquiggleScenesBlocks);
vm.extensionManager.addBuiltinExtension('squiggleworld', SquiggleWorldBlocks);
getWorld(vm.runtime, {createCanvas: fakeCanvas, loadImage: () => null}).attach(seam);
await vm.loadProject(JSON.stringify(project()));
const runtime = vm.runtime;
const stage = runtime.getTargetForStage();
const costume = (name, skinId) => ({name, skinId, assetId: name, md5: `${name}.svg`, dataFormat: 'svg',
    rotationCenterX: 240, rotationCenterY: 180, bitmapResolution: 1});
stage.sprite.costumes_ = [costume('day', 1), costume('night', 2)];
const scenes = getScenes(runtime);
const ext = new SquiggleScenesBlocks(runtime);
const named = name => runtime.getSpriteTargetByName(name);
const log = () => stage.lookupVariableByNameAndType('log', 'list').value.slice();
const phases = [];
scenes.events.on('phase', p => phases.push(p.phase));

const runUntil = async (promise, maxSteps) => {
    let finished = false;
    let value;
    promise.then(v => {
        finished = true;
        value = v;
    });
    for (let i = 0; i < (maxSteps || 60) && !finished; i++) {
        runtime._step();
        await settle();
    }
    return {finished, value};
};

section('kit');
const kit = getKit('squigglescenes');
ok('squigglescenes registers with its extension and colour', kit.extension === SquiggleScenesBlocks &&
    kit.color === '#5b6ee1' && kit.provides.indexOf('scenes') !== -1);
const info = ext.getInfo();
const texts = info.blocks.filter(b => b.text).map(b => b.text);
ok('block text matches the design', ['switch to scene [SCENE] with [FX]', 'next scene', 'reset to spawns',
    'when scene [SCENE] starts', 'when scene [SCENE] ends', 'current scene [PROP]'].every(t => texts.indexOf(t) !== -1),
texts);
ok('hat menu offers any scene first', ext.hatSceneMenu()[0].value === '_any_' && ext.hatSceneMenu().length === 4);
ok('no scene yet', ext.currentScene({PROP: 'name'}) === '' && ext.currentScene({PROP: 'number'}) === 0);

section('first switch');
vm.greenFlag();
runtime._step();
const boss = named('Boss');
ok('the boss loop runs', boss.x > 0 && runtime.threads.some(t => t.target === boss));
let r = await runUntil(scenes.switchTo('One'));
ok('switch to scene One finishes', r.finished && r.value.scene.name === 'One');
ok('phases run in the design order without ends on the first switch', phases.join() === PHASES.slice(1).join(), phases);
ok('spawns place the sprites', named('Hero').x === -100 && boss.x === 50 && boss.y === 50);
ok('a sprite outside the table hides', named('Coin').visible === false);
ok('an all scenes sprite keeps its state', named('Hud').visible === true && named('Hud').x === 200);
ok('current scene name and number', ext.currentScene({PROP: 'name'}) === 'One' && ext.currentScene({PROP: 'number'}) === 1);
for (let i = 0; i < 3; i++) runtime._step();
ok('the any-scene start hat ran with One current', log().join() === 'One', log());

section('switch order');
const hero = named('Hero');
const clone = hero.makeClone();
runtime.addTarget(clone);
ok('a clone exists before the switch', runtime.targets.indexOf(clone) !== -1);
phases.length = 0;
const before = log().length;
r = await runUntil(scenes.switchTo('two'));
ok('switch by id finishes', r.finished && r.value.scene.name === 'Two');
ok('phases run in the design order', phases.join() === PHASES.join(), phases);
for (let i = 0; i < 3; i++) runtime._step();
const after = log().slice(before);
ok('ends hats ran while the old scene was current, starts hats after', after[0] === 'One' &&
    after.slice(1).sort()
        .join() === 'Two,Two', after);
ok('clones are deleted by default', runtime.targets.indexOf(clone) === -1);
ok('scripts of sprites leaving the scene stop', !runtime.threads.some(t => t.target === boss && t.status !== 4));
ok('the backdrop swaps', stage.currentCostume === 1);
const world = getWorld(runtime);
ok('the level swaps', world.currentId() === 'cave');
ok('the camera resets into the scene bounds', world.camera.state.keepInside === true &&
    world.camera.state.bounds.right === 400 && world.camera.state.follow === null);
ok('spawns apply with shown false', hero.x === 10 && named('Coin').visible === false && named('Coin').x === 30);
ok('the boss is not in Two and hides', boss.visible === false);

section('keep clones, next, reset');
const clone2 = hero.makeClone();
runtime.addTarget(clone2);
r = await runUntil(ext.nextScene({}, {target: stage, thread: null}));
ok('next scene goes to Three', ext.currentScene({PROP: 'name'}) === 'Three');
ok('a scene marked keep clones keeps them', runtime.targets.indexOf(clone2) !== -1);
ok('Three has no level so the world clears', world.currentId() === '' || world.current() === null);
r = await runUntil(ext.nextScene({}, {target: stage, thread: null}));
ok('next scene wraps to One', ext.currentScene({PROP: 'number'}) === 1);
hero.setXY(99, 99);
ext.resetToSpawns();
ok('reset to spawns puts sprites back', hero.x === -100 && hero.y === 0);

section('a leaving caller stops itself');
vm.greenFlag();
runtime._step();
const bossThread = runtime.threads.find(t => t.target === boss);
r = await runUntil(ext.switchTo({SCENE: 'Two', FX: 'cut'}, {target: boss, thread: bossThread}));
ok('the switch still completes', r.finished && ext.currentScene({PROP: 'name'}) === 'Two');
ok('the leaving caller thread is stopped after', !runtime.threads.some(t => t.target === boss && t.status !== 4));

section('transitions');
effects.length = 0;
r = await runUntil(ext.switchTo({SCENE: 'One', FX: 'fade'}, {target: stage, thread: null}), 120);
const bright = effects.filter(e => e.effect === 'brightness');
ok('fade darkens through brightness', r.finished && bright.some(e => e.value <= -99));
const lastById = new Map();
bright.forEach(e => lastById.set(e.id, e.value));
ok('fade restores every drawable', Array.from(lastById.values()).every(v => v === 0),
    Array.from(lastById.entries()).filter(e => e[1] !== 0));
const steps = Math.ceil(HALF_MS / (runtime.currentStepTime || 33));
ok('a fade takes two half ramps of frames', bright.length >= steps * 2, {count: bright.length, steps});
effects.length = 0;
r = await runUntil(ext.switchTo({SCENE: 'Two', FX: 'pixelate'}, {target: stage, thread: null}), 120);
const pix = effects.filter(e => e.effect === 'pixelate');
ok('pixelate ramps the pixelate effect and restores it', r.finished && pix.some(e => e.value >= 149) &&
    pix[pix.length - 1].value === 0);
effects.length = 0;
const pending = ext.switchTo({SCENE: 'One', FX: 'fade'}, {target: stage, thread: null});
runtime._step();
await settle();
runtime._step();
await settle();
vm.stopAll();
ok('stop all mid transition restores effects', effects.length > 0 && effects[effects.length - 1].value === 0 &&
    !scenes.busy());
pending.then(() => null);
r = await runUntil(scenes.switchTo('Three'));
ok('a switch after a cancelled one still runs', r.finished && ext.currentScene({PROP: 'name'}) === 'Three');

section('editing scenes');
const added = scenes.add({name: 'Boss Room'});
ok('add captures backdrop and shown sprites', added.name === 'Boss Room' && added.id === 'scene4' &&
    added.backdrop === 'day' && added.spawns.some(s => s.sprite === 'Hero'));
ok('rename', scenes.rename('scene4', 'Lair').name === 'Lair');
ok('move to the front', scenes.move('Lair', 0) && scenes.list()[0].name === 'Lair');
ok('remove', scenes.remove('Lair') && scenes.list().length === 3);
ok('all scenes toggle', scenes.setAllScenes('Coin', true) && scenes.allScenes().join() === 'Hud,Coin');
const saved = JSON.parse(vm.toJSON());
ok('scenes save in runtime extension storage', saved.extensionStorage.squigglescenes.scenes.length === 3 &&
    saved.extensionStorage.squigglescenes.allScenes.length === 2);
ok('a scene for a name that does not exist does nothing', (await runUntil(scenes.switchTo('Nope'))).value === null);

section('project load resets the current scene');
await vm.loadProject(JSON.stringify(project()));
ok('current scene clears on load', getScenes(vm.runtime).current().index === -1);

done();
