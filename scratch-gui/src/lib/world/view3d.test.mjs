import {createRequire} from 'node:module';
import {ok, near, section, done, stubRenderer, fakeCanvas} from './harness.mjs';

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
const {FLAGS, createGrid, addTexture, setCell, encodeLevel} = await import('./tilemap.js');
const {HEIGHT, WIDTH, pixel} = await import('./raycast.js');
const {LAYER, RESOLUTION, TURN_PER_PIXEL, createView3d} = await import('./view3d.js');

const RED = pixel(220, 30, 30);
const GREEN = pixel(30, 200, 30);
const GREY = pixel(120, 120, 120);

const sprite = (name, extra) => Object.assign({
    isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
}, extra);

const stage = () => ({
    isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
    comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
    videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
});

const hall = () => {
    const grid = createGrid({id: 'hall', name: 'Hall', cols: 16, rows: 16, tileSize: 32, tileset: 'Tiles',
        origin: [-256, 256]});
    const brick = addTexture(grid, 'brick', FLAGS.solid);
    for (let i = 0; i < 16; i++) {
        setCell(grid, 'main', i, 0, brick);
        setCell(grid, 'main', i, 15, brick);
        setCell(grid, 'main', 0, i, brick);
        setCell(grid, 'main', 15, i, brick);
    }
    return grid;
};

const cellX = col => -256 + ((col + 0.5) * 32);
const cellY = row => 256 - ((row + 0.5) * 32);

const project = () => ({
    targets: [
        stage(),
        sprite('Hero', {x: cellX(8), y: cellY(12), direction: 0}),
        sprite('Guard', {x: cellX(8), y: cellY(6), direction: 180, layerOrder: 2}),
        sprite('Sight', {layerOrder: 3}),
        sprite('Tiles', {visible: false, layerOrder: 4})
    ],
    monitors: [],
    extensions: [],
    extensionStorage: {squiggleworld: {format: 1, levels: [encodeLevel(hall())]}},
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const costume = (name, color) => ({name, color, assetId: name, dataFormat: 'png', asset: {}, size: [32, 32]});

const vm = new VM();
const renderer = stubRenderer(RenderWebGL, twgl);
const ghosts = new Map();
const groups = new Map();
renderer.updateDrawableEffect = (id, effect, value) => {
    if (effect === 'ghost') ghosts.set(id, value);
};
const updateProperties = renderer.updateDrawableProperties;
renderer.updateDrawableProperties = function (id, properties) {
    if (properties && 'ghost' in properties) ghosts.set(id, properties.ghost);
    return updateProperties.call(this, id, properties);
};
const createDrawable = renderer.createDrawable;
renderer.createDrawable = function (group) {
    const id = createDrawable.call(this, group);
    groups.set(id, group);
    return id;
};
vm.attachRenderer(renderer);
const seam = installWorldSeams(vm);
const runtime = vm.runtime;
const world = getWorld(runtime, {createCanvas: fakeCanvas, loadImage: () => null});
vm.extensionManager.addBuiltinExtension('squiggleworld',
    (await import('../libraries/extensions/squiggleworld/index.js')).default);
await vm.loadProject(JSON.stringify(project()));
world.attach(seam);

const hero = runtime.getSpriteTargetByName('Hero');
const guard = runtime.getSpriteTargetByName('Guard');
const sight = runtime.getSpriteTargetByName('Sight');
const tiles = runtime.getSpriteTargetByName('Tiles');
const guardViews = [1, 2, 3, 4, 5, 6, 7, 8].map(i => costume(`guard-${i}`, i === 5 ? GREEN : RED));
guard.getCostumes = () => guardViews;
const fixed = list => () => list;
tiles.getCostumes = fixed([costume('brick', GREY)]);
hero.getCostumes = fixed([costume('hero', RED)]);
sight.getCostumes = fixed([costume('sight', RED)]);

const loads = [];
const listeners = {canvas: new Map(), doc: new Map()};
const fakeTarget = map => ({
    addEventListener: (name, fn) => map.set(name, fn),
    removeEventListener: name => map.delete(name)
});
const canvas = Object.assign(fakeTarget(listeners.canvas), {
    requests: 0,
    requestPointerLock () {
        this.requests++;
    }
});
const doc = Object.assign(fakeTarget(listeners.doc), {
    pointerLockElement: null,
    exits: 0,
    exitPointerLock () {
        this.exits++;
        this.pointerLockElement = null;
    }
});
const view = createView3d(runtime, world, {
    canvas,
    document: doc,
    toBitmap: (data, width, height) => ({data, width, height}),
    loadImage: item => {
        loads.push(item.assetId);
        return Promise.resolve({width: 32, height: 32, color: item.color});
    },
    createCanvas: (width, height) => {
        let color = 0;
        return {
            getContext: () => ({
                clearRect: () => null,
                drawImage: image => {
                    color = image.color;
                },
                getImageData: () => {
                    const data = new Uint8ClampedArray(width * height * 4);
                    new Uint32Array(data.buffer).fill(color);
                    return {data};
                }
            })
        };
    }
});
view.attach(seam);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const centre = () => view.frame.pixels[((HEIGHT / 2) * WIDTH) + (WIDTH / 2)];

section('show 3D view from a sprite');
ok('starts off', !view.isOn() && view.viewer() === null);
view.show(runtime.getTargetForStage());
ok('the stage cannot be the viewer', !view.isOn());
world.camera.set(100, 50);
ok('the World camera is active before 3D', world.camera.isActive());
sight.setXY(0, 0);
world.pin(sight, true);
guard.setEffect('ghost', 30);
view.setLook(guard, 'views');
view.show(hero);
ok('the view is on and follows Hero', view.isOn() && view.viewer() === hero);
const drawable = Array.from(groups.keys()).find(id => groups.get(id) === LAYER);
ok('the frame is one drawable in sq-tiles-back', typeof drawable === 'number' &&
    Array.from(groups.values()).filter(group => group === LAYER).length >= 1);
ok('the skin is a bitmap at half resolution', renderer.skins.get(renderer.skinOf.get(drawable)).resolution ===
    RESOLUTION && RESOLUTION === 0.5);
ok('the frame sits on the stage at full scale', renderer.positions.get(drawable).join() === '0,0' &&
    renderer.scales.get(drawable).join() === '100,100');
ok('holdCamera parks the World camera on the stage', !world.camera.isActive());
runtime._step();
ok('the seam view is the stage while held', seam.getView().x === 0 && seam.getView().zoom === 1);
ok('World chunks are hidden', world.tiles().update({x: 0, y: 0, zoom: 1}) === 0);

section('ghosting');
ok('unpinned sprites are ghosted at render time', ghosts.get(guard.drawableID) === 100 &&
    ghosts.get(hero.drawableID) === 100);
ok('the target keeps its own ghost', guard.effects.ghost === 30);
ok('a pinned sprite draws over the view', ghosts.get(sight.drawableID) !== 100);
guard.setEffect('ghost', 0);
ok('a script setting ghost stays hidden in 3D', ghosts.get(guard.drawableID) === 100 && guard.effects.ghost === 0);
guard.clearEffects();
ok('clear graphic effects stays hidden in 3D', ghosts.get(guard.drawableID) === 100);
guard.setEffect('ghost', 30);
renderer.updateDrawableProperties(guard.drawableID, {ghost: 0, visible: true});
ok('the drawableProperties hook ghosts too', ghosts.get(guard.drawableID) === 100);
const twin = guard.makeClone();
runtime.addTarget(twin);
runtime._step();
ok('a new clone is ghosted', ghosts.get(twin.drawableID) === 100);
world.pin(sight, false);
runtime._step();
ok('unpinning ghosts the sprite on the next frame', ghosts.get(sight.drawableID) === 100);
world.pin(sight, true);
runtime._step();
ok('pinning again shows it on the next frame', ghosts.get(sight.drawableID) === 0);
twin.dispose();
runtime.disposeTarget(twin);

section('walls and billboards');
await flush();
runtime._step();
ok('wall and view costumes load', loads.indexOf('brick') !== -1 && loads.some(id => id.startsWith('guard-')),
    loads);
ok('Guard is in Hero\'s sights', view.crosshair() === 'Guard', view.crosshair());
ok('Guard faces Hero so 8 views shows guard-1', loads.indexOf('guard-1') !== -1);
guard.setDirection(0);
runtime._step();
await flush();
runtime._step();
ok('turning Guard away swaps in guard-5', loads.indexOf('guard-5') !== -1 && centre() === GREEN,
    centre().toString(16));
hero.setDirection(90);
runtime._step();
ok('turning Hero away leaves nothing in sights', view.crosshair() === '');
ok('the wall ahead is textured', centre() === GREY || centre() === pixel(86, 86, 86), centre().toString(16));
hero.setDirection(0);
view.setLook(guard, 'nothing');
runtime._step();
ok('nothing removes the billboard', view.crosshair() === '');
view.setLook(guard, 'picture');
runtime._step();
await flush();
runtime._step();
ok('a picture draws the costume it wears', view.crosshair() === 'Guard' && centre() === RED);
view.setLook(guard, 'bogus');
ok('an unknown look is ignored', view.lookOf(guard) === 1);
view.setLook(hero, 'picture');
runtime._step();
ok('the viewer never draws itself', view.crosshair() === 'Guard');
view.setElevation(guard, 5000);
ok('3D height clamps', view.elevationOf(guard) === 1000);
view.setElevation(guard, 0);

section('one upload a frame, skipped when still');
runtime._step();
const still = view.stats().uploads;
runtime._step();
runtime._step();
ok('nothing moved means no upload', view.stats().uploads === still);
hero.setXY(hero.x + 4, hero.y);
runtime._step();
ok('moving the viewer uploads once', view.stats().uploads === still + 1);
guard.setXY(guard.x - 4, guard.y);
runtime._step();
ok('moving a billboard uploads once', view.stats().uploads === still + 2);
world.setTileAt(cellX(4), cellY(4), 1);
runtime._step();
ok('a tile edit uploads once', view.stats().uploads === still + 3);
view.setSetting('fog', 40);
runtime._step();
ok('a setting change uploads once', view.stats().uploads === still + 4);
runtime._step();
ok('then it is still again', view.stats().uploads === still + 4);

section('settings');
view.setSetting('fov', 500);
view.setSetting('eye', 1);
view.setSetting('fog', -3);
ok('settings clamp', JSON.stringify(view.settings()) === '{"fov":140,"fog":0,"eye":5}', view.settings());
view.setSetting('fov', 66);
view.setSetting('eye', 50);
view.setSurfaceColor('floor', '#112233');
view.setSurfaceColor('ceiling', 'bad');
runtime._step();
ok('a floor colour applies, a bad ceiling keeps the old one',
    view.frame.pixels[(HEIGHT - 1) * WIDTH] === pixel(17, 34, 51) && view.frame.pixels[0] === pixel(0x8f, 0xb4, 0xd6));

section('mouse turning');
view.setMouseTurn(true);
ok('mouse turning listens on the stage canvas', listeners.canvas.has('click') && listeners.doc.has('mousemove'));
listeners.canvas.get('click')();
ok('a click on the stage asks for pointer lock', canvas.requests === 1);
doc.pointerLockElement = canvas;
listeners.canvas.get('click')();
ok('no second request while locked', canvas.requests === 1);
const facing = hero.direction;
listeners.doc.get('mousemove')({movementX: 40});
runtime._step();
ok('mouse movement turns the viewer', near(hero.direction, facing + (40 * TURN_PER_PIXEL)), hero.direction);
doc.pointerLockElement = null;
listeners.doc.get('mousemove')({movementX: 40});
runtime._step();
ok('Esc (lock lost) stops turning', near(hero.direction, facing + 10));
doc.pointerLockElement = canvas;
view.setMouseTurn(false);
ok('turning it off releases the lock and the listeners', doc.exits === 1 && !listeners.canvas.has('click'));

section('hide and viewer loss');
view.hide();
ok('hide turns the view off and hides the frame', !view.isOn() && renderer.visible.get(drawable) === false);
ok('hide restores every sprite\'s own ghost', ghosts.get(guard.drawableID) === 30 &&
    ghosts.get(hero.drawableID) === 0);
ok('hide gives the camera back', world.camera.isActive());
ok('hide shows World chunks again', world.tiles().update({x: 0, y: 0, zoom: 1}) > 0);
const before = view.stats().uploads;
runtime._step();
ok('no drawing while off', view.stats().uploads === before);
const ghostViewer = hero.makeClone();
runtime.addTarget(ghostViewer);
view.show(ghostViewer);
ok('a clone can be the viewer', view.isOn() && view.viewer() === ghostViewer);
ghostViewer.dispose();
runtime.disposeTarget(ghostViewer);
runtime._step();
ok('deleting the viewer hides the view', !view.isOn() && world.camera.isActive());
view.show(hero);
runtime.emit('PROJECT_STOP_ALL');
ok('stop hides the view', !view.isOn());
runtime.emit('PROJECT_LOADED');
ok('loading a project resets looks and settings', view.lookOf(guard) === 0 && view.settings().fog === 0 &&
    !Array.from(groups.keys()).some(id => groups.get(id) === LAYER && renderer._drawList.indexOf(id) !== -1));
view.detach();
view.show(hero);
const detachedUploads = view.stats().uploads;
runtime._step();
ok('after detach the steps no longer reach the view', view.stats().uploads === detachedUploads);
view.dispose();
ok('dispose turns it off', !view.isOn());

done();
