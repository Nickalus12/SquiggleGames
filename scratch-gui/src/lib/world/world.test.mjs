import {createRequire} from 'node:module';
import {ok, near, section, done, stubRenderer, fakeCanvas} from './harness.mjs';

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');
const RenderWebGL = require('scratch-render/src/RenderWebGL.js');
const ScratchStorage = require('@turbowarp/scratch-storage');
const twgl = createRequire(require.resolve('scratch-render/src/RenderWebGL.js'))('twgl.js');

vmLog.warn = () => {};
vmLog.info = () => {};
globalThis.document = {hidden: true};

const {installWorldSeams} = await import('./seams.js');
const {getWorld, extendSeam} = await import('./world.js');
const {readScenes} = await import('./storage.js');
const {getScenes} = await import('./scenes.js');
const readScenesOf = rt => readScenes(rt).scenes;
const {FLAGS, createGrid, addTexture, setCell, encodeLevel} = await import('./tilemap.js');
const {default: SquiggleWorldBlocks} = await import('../libraries/extensions/squiggleworld/index.js');
const {getKit} = await import('../kits/registry.js');

const sprite = (name, extra) => Object.assign({
    isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
}, extra);

const stage = () => ({
    isStage: true, name: 'Stage', variables: {v1: ['score', 0]}, lists: {}, broadcasts: {}, blocks: {},
    comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
    videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
});

const cave = () => {
    const grid = createGrid({id: 'cave', name: 'Cave', cols: 64, rows: 24, tileSize: 16, tileset: 'Tiles'});
    const wall = addTexture(grid, 'wall', FLAGS.solid);
    const lava = addTexture(grid, 'lava', FLAGS.hazard);
    for (let c = 0; c < 64; c++) setCell(grid, 'main', c, 20, wall);
    setCell(grid, 'main', 10, 19, lava);
    setCell(grid, 'front', 3, 3, wall);
    setCell(grid, 'flags', 30, 19, FLAGS.goal);
    return grid;
};

const worldProject = () => ({
    targets: [
        stage(),
        sprite('Hero', {x: 0, y: 0}),
        sprite('Hud', {x: 100, y: 100, layerOrder: 2}),
        sprite('Tiles', {visible: false, layerOrder: 3})
    ],
    monitors: [],
    extensions: [],
    extensionStorage: {squiggleworld: {format: 1, levels: [encodeLevel(cave())]}},
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const classicProject = () => ({
    targets: [
        stage(),
        sprite('Cat', {
            x: 12, y: -7,
            blocks: {
                a: {opcode: 'event_whenflagclicked', next: 'b', parent: null, inputs: {}, fields: {},
                    shadow: false, topLevel: true, x: 10, y: 10},
                b: {opcode: 'motion_movesteps', next: null, parent: 'a', inputs: {STEPS: [1, [4, '10']]},
                    fields: {}, shadow: false, topLevel: false}
            }
        })
    ],
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

section('kit registration');
const kit = getKit('squiggleworld');
ok('squiggleworld registers with its extension', kit && kit.extension === SquiggleWorldBlocks);
ok('kit draws on both tile layers and provides world', kit.layers.join() === 'sq-tiles-back,sq-tiles-front' &&
    kit.provides.indexOf('world') !== -1);
ok('kit colour comes from the theme tokens', kit.color === '#8cc63f');

section('a 1.8 project does not change by a byte');
const plain = new VM();
plain.attachRenderer(stubRenderer(RenderWebGL, twgl));
await plain.loadProject(JSON.stringify(classicProject()));
const plainJson = plain.toJSON();
const kitted = new VM();
kitted.attachRenderer(stubRenderer(RenderWebGL, twgl));
installWorldSeams(kitted);
kitted.extensionManager.addBuiltinExtension('squiggleworld', SquiggleWorldBlocks);
getWorld(kitted.runtime, {createCanvas: fakeCanvas, loadImage: () => null});
await kitted.loadProject(JSON.stringify(classicProject()));
kitted.runtime._step();
kitted.runtime._step();
const kittedJson = kitted.toJSON();
const firstDiff = Array.from(kittedJson).findIndex((ch, i) => ch !== plainJson[i]);
ok('serialized JSON is byte identical', kittedJson === plainJson,
    firstDiff === -1 ? kittedJson.length - plainJson.length : [plainJson.slice(firstDiff - 40, firstDiff + 40), kittedJson.slice(firstDiff - 40, firstDiff + 40)]);
ok('no world storage was written', !kitted.runtime.extensionStorage.squiggleworld &&
    !kitted.runtime.extensionStorage.squigglescenes);
ok('a single sprite export is byte identical', kitted.toJSON(kitted.runtime.targets[1].id) ===
    plain.toJSON(plain.runtime.targets[1].id));

section('levels load from runtime storage');
const vm = new VM();
const renderer = stubRenderer(RenderWebGL, twgl);
vm.attachRenderer(renderer);
vm.attachStorage(new (ScratchStorage.default || ScratchStorage)());
const seam = installWorldSeams(vm);
const runtime = vm.runtime;
const world = getWorld(runtime, {createCanvas: fakeCanvas, loadImage: costume => ({name: costume.name}),
    random: () => 0.75});
vm.extensionManager.addBuiltinExtension('squiggleworld', SquiggleWorldBlocks);
await vm.loadProject(JSON.stringify(worldProject()));
const ext = new SquiggleWorldBlocks(runtime);
world.attach(seam);
const hero = runtime.getSpriteTargetByName('Hero');
const hud = runtime.getSpriteTargetByName('Hud');
const tiles = runtime.getSpriteTargetByName('Tiles');
tiles.getCostumes = () => ['wall', 'lava'].map(name => ({name, assetId: name, dataFormat: 'png', asset: {}}));
const util = target => ({target});
ok('the saved level loads', world.levels().length === 1 && world.levels()[0].name === 'Cave');
ok('the first level is in use', world.currentId() === 'cave');
ok('play copy is not the saved grid', world.current() !== world.level('cave'));
ok('level menu lists names', JSON.stringify(ext.levelMenu()) === '["Cave"]');

section('tile chunks');
runtime._step();
const chunkList = Array.from(world.tiles().chunks.values());
const back = chunkList.filter(chunk => chunk.group.name === 'back');
const front = chunkList.filter(chunk => chunk.group.name === 'front');
ok('non-empty chunks in view get drawables', back.length > 0 && front.length === 1, chunkList.length);
ok('empty chunks get no drawable', back.every(chunk => chunk.drawable !== null) && back.length <= 4, back.length);
const offsets = renderer._layerGroups;
const firstBack = back[0];
const order = renderer._drawList.indexOf(firstBack.drawable);
ok('back chunks sit in sq-tiles-back', order >= offsets['sq-tiles-back'].drawListOffset &&
    order < offsets.pen.drawListOffset, {order, offsets: Object.keys(offsets)});
ok('front chunks sit in sq-tiles-front', renderer._drawList.indexOf(front[0].drawable) >=
    offsets['sq-tiles-front'].drawListOffset);
ok('chunk skins are bitmap skins anchored at the top left', renderer.skins.get(firstBack.skin).center.join() === '0,0');
const pos = renderer.positions.get(firstBack.drawable);
ok('chunk position is its world top left', pos[0] === -240 + (firstBack.cx * 256) && pos[1] === 180 - (firstBack.cy * 256), pos);
await new Promise(resolve => setTimeout(resolve, 0));
runtime._step();
const floorChunk = back.find(chunk => chunk.cy === 1);
const draws = floorChunk.canvas.ops.filter(op => op[0] === 'draw');
ok('textures repaint once loaded', draws.length === 17 && draws.some(op => op[1] === 'wall') &&
    draws.some(op => op[1] === 'lava'), draws.length);
ok('tiles draw at tile size', draws[0][4] === 16 && draws[0][5] === 16);
const updates = renderer.skinUpdates;
const painted = () => renderer.skinUpdates + renderer.skins.size;
const paintedBefore = painted();
runtime._step();
ok('an unchanged view repaints nothing', renderer.skinUpdates === updates);

section('scripts edit a play copy');
const storedBefore = JSON.stringify(runtime.extensionStorage.squiggleworld);
ext.setTile({X: -240 + 8, Y: 180 - 8, TILE: 'lava'});
ok('set tile changes the play copy', ext.tileAt({X: -240 + 8, Y: 180 - 8}) === 'lava');
runtime._step();
ok('set tile paints one chunk', painted() === paintedBefore + 1, painted() - paintedBefore);
ok('set tile leaves saved storage alone', JSON.stringify(runtime.extensionStorage.squiggleworld) === storedBefore);
ok('unknown tiles are ignored', (ext.setTile({X: 0, Y: 0, TILE: 'nothing'}), ext.tileAt({X: 0, Y: 0}) === ''));
runtime.emit('PROJECT_START');
ok('green flag resets the play copy', ext.tileAt({X: -240 + 8, Y: 180 - 8}) === '');
ok('grid reporter is 1-based', ext.gridAt({AXIS: 'column', X: -240 + 20, Y: 0}) === 2 &&
    ext.gridAt({AXIS: 'row', X: 0, Y: 180 - 40}) === 3);

section('moving against the grid');
ext.setHitbox({W: 12, H: 16}, util(hero));
hero.setXY(-240 + 40, 180 - 200);
for (let i = 0; i < 20; i++) ext.moveStopping({AXIS: 'y', N: -12}, util(hero));
ok('falling lands on the floor', near(hero.y - 8, 180 - (20 * 16)), hero.y);
ok('on the ground after landing', ext.onGround({}, util(hero)) && ext.hitWall({SIDE: 'bottom'}, util(hero)));
ok('hit any side sees the floor', ext.hitWall({SIDE: 'any'}, util(hero)));
ext.moveStopping({AXIS: 'x', N: 5}, util(hero));
ok('moving x clears only x hits', !ext.hitWall({SIDE: 'left'}, util(hero)) && ext.hitWall({SIDE: 'bottom'}, util(hero)));
hero.setXY(-240 + (10 * 16) + 8, 180 - (19 * 16) - 8);
ok('touching hazard on the lava tile', ext.touchingTile({KIND: 'hazard'}, util(hero)));
ok('the hazard hat reports the same', ext.whenTouchTile({KIND: 'hazard'}, util(hero)));
ok('not touching goal there', !ext.touchingTile({KIND: 'goal'}, util(hero)));
ext.randomSpot({SPOT: 'goal'}, util(hero));
ok('random goal spot lands on the goal cell', near(hero.x, -240 + (30 * 16) + 8) && ext.touchingTile({KIND: 'goal'}, util(hero)));
ext.randomSpot({SPOT: 'floor'}, util(hero));
ok('random floor spot stands on the floor', ext.onGround({}, util(hero)), hero.y);
ok('default hitbox comes from the skin size', world.box(hud).w === 20 && world.box(hud).h === 30);

section('camera');
const drawFrame = () => {
    renderer.dirty = true;
    renderer.draw();
};
drawFrame();
ok('no camera block means no view change', seam.getView().zoom === 1 && seam.getView().x === 0 && seam.camera === undefined);
extendSeam(seam);
ok('SquiggleWorld.camera() is null while inactive', seam.camera() === null);
hero.setXY(300, 20);
ext.cameraFollow({TARGET: '_myself_', S: 0}, util(hero));
runtime._step();
drawFrame();
ok('follow with smoothness 0 centres the sprite', seam.getView().x === 300 && seam.getView().y === 20, seam.getView());
ok('toView puts the sprite at the stage centre', seam.toView(300, 20).x === 0);
ok('SquiggleWorld.camera() reports the view', seam.camera().x === 300 && seam.camera().follow === hero);
ok('camera x reporter', ext.cameraValue({PROP: 'x'}) === 300);
ext.setZoom({N: 200});
runtime._step();
drawFrame();
ok('zoom shows in the view and in scale()', seam.getView().zoom === 2 && seam.scale() === 2);
ok('camera left reporter follows zoom', ext.cameraValue({PROP: 'left'}) === 300 - 120);

section('screen space');
ext.pinToScreen({ONOFF: 'on'}, util(hud));
drawFrame();
const hudPos = renderer.positions.get(hud.drawableID);
ok('a pinned sprite draws at its screen spot', near(hudPos[0], 300 + 50) && near(hudPos[1], 20 + 50), hudPos);
ok('a pinned sprite keeps its screen size', near(renderer.scales.get(hud.drawableID)[0], 50));
ok('pinning leaves target x and y alone', hud.x === 100 && hud.y === 100);
ext.pinToScreen({ONOFF: 'off'}, util(hud));
ok('unpinning puts it back in the world', renderer.positions.get(hud.drawableID)[0] === 100);
const stageTarget = runtime.getTargetForStage();
ext.setBackdrop({MODE: 'fixed', F: 0});
drawFrame();
ok('a fixed backdrop follows the camera', renderer.positions.get(stageTarget.drawableID).join() === '300,20');
stageTarget.getCostumes()[0].skinId = 777;
ext.setBackdrop({MODE: 'parallax', F: 50});
drawFrame();
ok('parallax 50 wraps half the screen scroll into the stage width',
    renderer.positions.get(stageTarget.drawableID).join() === '390,20', renderer.positions.get(stageTarget.drawableID));
const echoId = Array.from(renderer.skinOf.keys()).find(id => renderer.skinOf.get(id) === 777);
ok('an echo copy of the backdrop fills the other side', typeof echoId === 'number' &&
    renderer.positions.get(echoId).join() === '150,20', echoId && renderer.positions.get(echoId));
ok('the echo shares the backdrop skin and keeps screen size', renderer.visible.get(echoId) === true &&
    renderer.scales.get(echoId).join() === '50,50');
ext.setBackdrop({MODE: 'scrolls', F: 0});
drawFrame();
ok('scrolls puts the backdrop back at the origin', renderer.positions.get(stageTarget.drawableID).join() === '0,0');
ok('scrolls hides the echo', renderer.visible.get(echoId) === false);
runtime.ioDevices.mouse._scratchX = 40;
runtime.ioDevices.mouse._scratchY = -30;
ok('mouse screen x and y are stage space', ext.mouseScreen({AXIS: 'x'}) === 40 && ext.mouseScreen({AXIS: 'y'}) === -30);
ok('mouse x is world space through the seam', runtime.ioDevices.mouse.getScratchX() === 320);

section('SquiggleWorld API');
ok('levels() summarises saved levels', seam.levels()[0].id === 'cave' && seam.levels()[0].cols === 64);
ok('solidAt reads the play copy', seam.solidAt(-240 + 8, 180 - (20 * 16) - 8) && !seam.solidAt(0, 0));
const rules = seam.rulesLevels(true)[0];
ok('rulesLevels gives the server shape', rules.tile === 16 && typeof rules.solid === 'string');
ok('currentLevel names the level in use', seam.currentLevel() === 'cave');
const upload = seam.levelsForUpload();
ok('levelsForUpload leaves solid out unless asked', upload[0].tile === 16 && !('solid' in upload[0]));
ok('levelsForUpload({solid: true}) carries solid', typeof seam.levelsForUpload({solid: true})[0].solid === 'string');
ok('currentLevelIndex is 1-based', seam.currentLevelIndex() === 1);
ok('tileNames lists the active tileset costumes', seam.tileNames().join() === 'wall,lava');
ok('tilesets lists sprites that hold tiles', JSON.stringify(seam.tilesets()) === '["Tiles"]');
const sceneId = await seam.createScene('Boss');
ok('createScene resolves the new scene id', typeof sceneId === 'string' &&
    readScenesOf(runtime).some(scene => scene.id === sceneId && scene.name === 'Boss'));
const levelId = await seam.createLevel('Second Cave');
ok('createLevel resolves the new id on the active tileset', levelId === 'second-cave' &&
    world.level(levelId).tileset === 'Tiles' && seam.levels().length === 2);
ok('currentLevelIndex stays on the level in use', seam.currentLevelIndex() === 1);
const fakeCostumes = tiles.getCostumes;
delete tiles.getCostumes;
const shownCostume = tiles.currentCostume;
const tileName = await seam.createTile('grass');
const madeCostume = tiles.getCostumes().find(costume => costume.name === tileName);
ok('createTile adds a blank costume at the level tile size', tileName === 'grass' && madeCostume &&
    madeCostume.dataFormat === 'svg' && madeCostume.rotationCenterX === 8, tileName);
ok('createTile registers the tile on the level', world.level('cave').tiles.some(tile => tile.name === 'grass'));
ok('createTile keeps the tileset costume shown', tiles.currentCostume === shownCostume);
ok('a second createTile gets a unique name', await seam.createTile('grass') === 'grass2');
tiles.getCostumes = fakeCostumes;
ok('showLevel switches by name', seam.showLevel('Second Cave') === true && world.currentId() === 'second-cave');
ok('currentLevelIndex follows the level in use', seam.currentLevelIndex() === 2);
ok('showLevel refuses an unknown level', seam.showLevel('nowhere') === false && world.currentId() === 'second-cave');
ok('showScene previews a scene by name', seam.showScene('Boss') === true &&
    getScenes(runtime).current().scene.name === 'Boss');
ok('showScene refuses an unknown scene', seam.showScene('nowhere') === false);
ok('showLevel switches by id', seam.showLevel('cave') && world.currentId() === 'cave');
world.clearLevel();
ok('currentLevelIndex is 0 with no level', seam.currentLevelIndex() === 0);
let refused = false;
await seam.createTile('none').catch(() => {
    refused = true;
});
ok('createTile rejects with no level in use', refused);
world.useLevel('cave');

section('painter edits change the saved level');
const events = [];
world.events.on('cells', payload => events.push(payload));
world.paintCells('cave', 'main', [{col: 5, row: 5, value: 1}, {col: 6, row: 5, value: 1}]);
ok('paint writes storage', runtime.extensionStorage.squiggleworld.levels[0].layers.main[5].join() === '0,5,1,2,0,57');
ok('paint updates the play copy too', world.current().main[(5 * 64) + 5] === 1);
ok('paint emits one cells event', events.length === 1 && events[0].cells.length === 2);
world.paintCells('cave', 'main', [{col: 5, row: 5, value: 1}]);
ok('repainting the same value emits nothing', events.length === 1);
const json = JSON.parse(vm.toJSON());
ok('levels survive save with no world blocks in use', json.extensionStorage.squiggleworld.levels[0].id === 'cave');

section('frame cost');
const big = createGrid({id: 'big', name: 'Big', cols: 64, rows: 64, tileSize: 32, tileset: 'Tiles'});
addTexture(big, 'wall', FLAGS.solid);
for (let i = 0; i < 64 * 64; i++) {
    big.back[i] = 1;
    big.main[i] = i % 3 ? 1 : 0;
    big.front[i] = i % 7 ? 0 : 1;
}
const raw = worldProject();
raw.extensionStorage.squiggleworld.levels = [encodeLevel(big)];
for (let i = 0; i < 40; i++) raw.targets.push(sprite(`S${i}`, {x: (i * 37) % 400, y: (i * 53) % 300}));
await vm.loadProject(JSON.stringify(raw));
const runner = runtime.getSpriteTargetByName('Hero');
ext.cameraFollow({TARGET: '_myself_', S: 50}, util(runner));
runtime._step();
const samples = [];
for (let f = 0; f < 240; f++) {
    runner.setXY(runner.x + 6, runner.y - 3);
    const t0 = performance.now();
    world.step();
    drawFrame();
    samples.push(performance.now() - t0);
}
samples.sort((a, b) => a - b);
const p95 = samples[Math.floor(samples.length * 0.95)];
console.log(`  frame cost 64x64 three layers, 40 sprites: median ${samples[120].toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`);
if (process.env.SQ_PERF === '1') ok('world work stays under 4.5 ms a frame at p95 (stub renderer)', p95 < 4.5, p95);
ok('the chunk pool stays bounded', world.tiles().chunks.size <= 64, world.tiles().chunks.size);

done();
