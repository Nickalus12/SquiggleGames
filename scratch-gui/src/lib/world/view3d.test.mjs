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
const {LAYER, RESOLUTION, TURN_PER_PIXEL, createPixelCache, createView3d, stepPose} = await import('./view3d.js');
const {default: guiLog} = await import('../log.js');

const unhandled = [];
process.on('unhandledRejection', reason => unhandled.push(reason));

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
        return Promise.reject(new Error('lock refused'));
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
    resolution: RESOLUTION,
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
const seamEffect = renderer.updateDrawableEffect;
view.attach(seam);
ok('3D ghosts through the seam drawableEffect hook, not its own renderer wrap',
    renderer.updateDrawableEffect === seamEffect && typeof seam.hooks.drawableEffect === 'function');
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
const framesBeforeSights = view.stats().frames;
const guardHomeX = guard.x;
guard.setXY(cellX(2), guard.y);
const midTickAway = view.crosshair();
guard.setXY(hero.x, guard.y);
const midTickAimed = view.crosshair();
const framesAfterSights = view.stats().frames;
runtime._step();
guard.setXY(guardHomeX, guard.y);
runtime._step();
ok('mid-tick crosshair queries pick the centre column without extra full-frame renders',
    midTickAway === '' && midTickAimed === 'Guard' && framesAfterSights === framesBeforeSights);

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
view.setSurfaceTexture('floor', 'brick');
view.setSurfaceTexture('ceiling', 'sky');
view.setLightFalloff(35);
view.setGlow(guard, '#22d3ee', 96);
runtime._step();
ok('surface textures, light falloff, and sprite glow apply cleanly',
    view.surfaceTextures().floor === 'brick' && view.surfaceTextures().ceiling === 'sky' &&
    view.lightFalloff() === 35 && view.glowOf(guard).radius === 96);
view.setSurfaceTexture('floor', 'color');
view.setSurfaceTexture('ceiling', 'color');
view.setLightFalloff(0);
view.setGlow(guard, '#22d3ee', 0);
runtime._step();

section('dynamic widescreen and resolution scale');
runtime.stageWidth = 640;
runtime.stageHeight = 360;
runtime._step();
ok('640x360 stage resizes 3D frame to 320x180 at 0.5 scale',
    view.frame.width === 320 && view.frame.height === 180);
view.setScale(1);
runtime._step();
ok('setScale(1) renders crisp 640x360 full resolution',
    view.scale() === 1 && view.frame.width === 640 && view.frame.height === 360);
view.setScale(RESOLUTION);
runtime.stageWidth = 480;
runtime.stageHeight = 360;
runtime._step();
ok('restoring 480x360 and 0.5 scale returns frame to 240x180',
    view.frame.width === WIDTH && view.frame.height === HEIGHT);
const bitmap = (data, width, height) => ({data, width, height});
const autoAt = dpr => createView3d(runtime, world, {canvas, document: doc, toBitmap: bitmap, devicePixelRatio: dpr});
const plainView = autoAt(1);
ok('Auto starts a 1x screen at three quarter resolution', plainView.scale() === 0.75 &&
    plainView.quality() === 'auto' && plainView.frame.width === 360 && plainView.frame.height === 270,
plainView.scale());
const retina = autoAt(2);
ok('Auto starts a 2x screen at full resolution', retina.scale() === 1);
runtime.stageWidth = 640;
runtime.stageHeight = 360;
const wideRetina = autoAt(2);
ok('a wide stage on a 2x screen starts at three quarters to stay in the pixel budget', wideRetina.scale() === 0.75);
runtime.stageWidth = 480;
runtime.stageHeight = 360;
plainView.setQuality('crisp');
ok('Crisp draws at full resolution', plainView.scale() === 1 && plainView.quality() === 'crisp');
plainView.setQuality('fast');
ok('Fast draws at half resolution', plainView.scale() === RESOLUTION && plainView.frame.width === WIDTH);
runtime.emit('SQUIGGLE_SETTINGS_CHANGED', {render3d: 'crisp'});
ok('changing 3D quality in Game settings reaches every auto view', plainView.scale() === 1 && retina.scale() === 1);
ok('a view with a fixed resolution ignores Game settings', view.scale() === RESOLUTION);
plainView.setScale(0.75);
ok('setScale pins the view as manual', plainView.quality() === 'manual' && plainView.scale() === 0.75);
[plainView, retina, wideRetina].forEach(extra => extra.dispose());
ok('disposed views stop listening for settings', runtime.listenerCount('SQUIGGLE_SETTINGS_CHANGED') === 1);

section('mouse turning');
view.setMouseTurn(true);
ok('mouse turning listens on the stage canvas', listeners.canvas.has('click') && listeners.doc.has('mousemove'));
listeners.canvas.get('click')();
ok('a click on the stage asks for pointer lock', canvas.requests === 1);
await new Promise(resolve => setTimeout(resolve, 0));
ok('a refused pointer lock is not an unhandled rejection', unhandled.length === 0, unhandled);
doc.pointerLockElement = canvas;
listeners.canvas.get('click')();
ok('no second request while locked', canvas.requests === 1);
const facing = hero.direction;
listeners.doc.get('mousemove')({movementX: 40});
runtime._step();
ok('mouse movement turns the viewer at 0.10 deg default per physical px',
    near(hero.direction, facing + 4), hero.direction);
doc.pointerLockElement = null;
listeners.doc.get('mousemove')({movementX: 40});
runtime._step();
ok('Esc (lock lost) stops turning', near(hero.direction, facing + 4));
doc.pointerLockElement = canvas;
view.setMouseTurn(false);
ok('turning it off releases the lock and the listeners', doc.exits === 1 && !listeners.canvas.has('click'));

section('texture failures');
{
    const warned = [];
    const warn = guiLog.warn;
    guiLog.warn = (...args) => warned.push(args);
    const cache = createPixelCache({
        loadImage: () => Promise.reject(new Error('missing asset')),
        createCanvas: () => null,
        onLoad: () => null
    });
    const broken = {assetId: 'gone', asset: {}};
    ok('a failing texture reads as empty', cache.get(broken, 'wall') === null);
    await new Promise(resolve => setTimeout(resolve, 0));
    guiLog.warn = warn;
    ok('a failing texture logs a warning', warned.length === 1 && warned[0][0] === 'squiggle3d texture did not load' &&
        warned[0][1].message === 'missing asset', warned);
}

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
guard.setEffect('ghost', 20);
ok('after detach the drawableEffect hook is gone', !seam.hooks.drawableEffect && ghosts.get(guard.drawableID) === 20);
view.dispose();
ok('dispose turns it off', !view.isOn());

section('auto quality steps with tick time');
const plainDraw = runtime.renderer && runtime.renderer.draw;
let clock = 0;
let costPerCall = 12;
const adaptive = createView3d(runtime, world, {canvas, document: doc, toBitmap: bitmap, devicePixelRatio: 1,
    now: () => {
        clock += costPerCall;
        return clock;
    }});
adaptive.attach(seam);
adaptive.show(hero);
const homeX = hero.x;
let stride = 0;
const walk = ticks => {
    for (let i = 0; i < ticks; i++) {
        stride++;
        hero.setXY(homeX + ((stride % 2) * 2), hero.y);
        runtime._step();
    }
};
const ticksUntil = (done, cap) => {
    let ticks = 0;
    while (!done() && ticks < cap) {
        walk(1);
        ticks++;
    }
    return ticks;
};
const downAfter = ticksUntil(() => adaptive.scale() === RESOLUTION, 200);
ok('one window of slow ticks steps Auto down from 0.75 to 0.5',
    adaptive.scale() === RESOLUTION && downAfter >= 45 && downAfter <= 47 && adaptive.stats().steps === 1,
    {downAfter, stats: adaptive.stats()});
walk(90);
ok('it never goes below half resolution', adaptive.scale() === RESOLUTION);
costPerCall = 0.01;
const upAfter = ticksUntil(() => adaptive.scale() === 0.75, 200);
ok('headroom steps back up to the starting scale within two windows',
    adaptive.scale() === 0.75 && upAfter <= 90, {upAfter, stats: adaptive.stats()});
walk(135);
ok('Auto never climbs above the scale this screen started at', adaptive.scale() === 0.75);
ok('the frame follows the scale', adaptive.frame.width === 360 && adaptive.frame.height === 270);
ok('an attached view times the stage draw', !runtime.renderer || runtime.renderer.draw !== plainDraw);
adaptive.dispose();
ok('detaching gives the stage draw back untouched', !runtime.renderer || runtime.renderer.draw === plainDraw);

section('auto quality watches display frames');
let paceClock = 0;
const frameQueue = [];
const paced = createView3d(runtime, world, {canvas, document: doc, toBitmap: bitmap, devicePixelRatio: 1,
    now: () => paceClock, requestFrame: cb => frameQueue.push(cb)});
paced.attach(seam);
paced.show(hero);
walk(1);
ok('a shown auto view starts watching display frames', frameQueue.length === 1);
const runFrames = (count, lateEvery) => {
    for (let i = 1; i <= count; i++) {
        paceClock += lateEvery && i % lateEvery === 0 ? 50 : 16.7;
        const next = frameQueue.shift();
        if (next) next();
    }
};
runFrames(91, 10);
const pacedDown = ticksUntil(() => paced.scale() === RESOLUTION, 60);
ok('ten percent late display frames step a cheap view down', paced.scale() === RESOLUTION && pacedDown <= 46,
    {pacedDown, stats: paced.stats()});
paced.setScale(0.75);
runFrames(1);
ok('a manual scale stops watching display frames', frameQueue.length === 0);
paced.dispose();

section('per-frame pose interpolation and mouse turn');
{
    const mid = stepPose({x: 10, y: 20, direction: 80}, {x: 14, y: 28, direction: 88}, 0.5, 8);
    ok('stepPose lerps x, y and committed yaw by progress and adds pending turn in full',
        near(mid.x, 12) && near(mid.y, 24) && near(mid.direction, 84 + (8 * TURN_PER_PIXEL)), mid);
    const wrapped = stepPose({x: 0, y: 0, direction: 178}, {x: 0, y: 0, direction: -178}, 0.5, 0);
    ok('stepPose wraps committed yaw across +/-180', Math.abs(wrapped.direction) === 180, wrapped);
    const snapped = stepPose({x: 0, y: 0, direction: 0}, {x: 200, y: 0, direction: 90}, 0.25, 0);
    ok('stepPose snaps large teleports and large angle jumps',
        snapped.x === 200 && snapped.direction === 90, snapped);

    let rafClock = 100;
    const rafQueue = [];
    const smooth = createView3d(runtime, world, {
        canvas,
        document: doc,
        toBitmap: bitmap,
        devicePixelRatio: 1,
        now: () => rafClock,
        requestFrame: cb => rafQueue.push(cb)
    });
    smooth.attach(seam);
    hero.setXY(0, 0);
    hero.setDirection(90);
    smooth.show(hero);
    smooth.setMouseTurn(true);
    doc.pointerLockElement = canvas;

    let steppedInTick = false;
    const origStepThreads = runtime.sequencer.stepThreads;
    runtime.sequencer.stepThreads = function () {
        steppedInTick = !runtime.redrawRequested;
        hero.setXY(hero.x + 4, hero.y);
        return origStepThreads.call(this);
    };
    listeners.doc.get('mousemove')({movementX: 30});
    runtime._step();
    runtime.sequencer.stepThreads = origStepThreads;
    ok('applying mouse turn in BEFORE_EXECUTE does not set redrawRequested or starve threads',
        steppedInTick && near(hero.direction, 93) && near(hero.x, 4));

    const uploadsAtStep = smooth.stats().uploads;
    rafClock += (1000 / 30) * 0.5;
    listeners.doc.get('mousemove')({movementX: 20});
    const nextRaf = rafQueue.shift();
    if (nextRaf) nextRaf();
    const rafPose = smooth.pose();
    ok('display rAF applies pending mouse turn in full, lerps position, and uploads bitmap',
        near(hero.direction, 95) && near(rafPose.direction, 95) && near(rafPose.x, 2) &&
        smooth.stats().uploads === uploadsAtStep + 1, {rafPose, uploads: smooth.stats().uploads});

    rafClock += (1000 / 30) * 0.5;
    hero.setXY(8, 0);
    runtime._step();
    runtime.interpolationEnabled = true;
    const uploadsBeforeInterp = smooth.stats().uploads;
    rafClock += (1000 / 30) * 0.5;
    listeners.doc.get('mousemove')({movementX: 10});
    runtime.renderer.draw();
    const interpPose = smooth.pose();
    runtime.interpolationEnabled = false;
    ok('interpolation draw updates 3D bitmap with lerped pose and full pending turn',
        near(interpPose.x, 6) && near(interpPose.direction, 96) &&
        smooth.stats().uploads === uploadsBeforeInterp + 1, {interpPose, uploads: smooth.stats().uploads});

    doc.pointerLockElement = null;
    smooth.dispose();
}

section('player 3D settings and lock');
const playerView = createView3d(runtime, world, {canvas, document: doc, toBitmap: bitmap, devicePixelRatio: 1});
playerView.attach(seam);
playerView.show(hero);
playerView.setSetting('fov', 60);
playerView.setSetting('fog', 20);
ok('player settings are enabled by default', playerView.usePlayerSettings() === true);
playerView.setPlayerSettings({fov: 95, quality: 'fast', drawDistance: 'near', mouseSpeed: 24, invertLook: true});
ok('player fov overrides project fov', playerView.effectiveSettings().fov === 95);
ok('fast quality sets 0.5 scale, turns floor textures off, spriteStep 2, and rayCap 16',
    playerView.scale() === 0.5 && playerView.floorTextures() === false &&
    playerView.effectiveSettings().spriteStep === 2 && playerView.effectiveSettings().rayCap === 16);
ok('near draw distance overrides fog with heavier fog', playerView.effectiveSettings().fog > 20);
playerView.setPlayerSettings({quality: 'crisp', drawDistance: 'far'});
ok('crisp quality sets 1.0 scale, turns floor textures on, spriteStep 1, and rayCap 40',
    playerView.scale() === 1 && playerView.floorTextures() === true &&
    playerView.effectiveSettings().spriteStep === 1 && playerView.effectiveSettings().rayCap === 40);
ok('far draw distance overrides fog with lighter fog', playerView.effectiveSettings().fog < 20);
playerView.setUsePlayerSettings(false);
ok('locking player settings restores project fov and fog',
    playerView.usePlayerSettings() === false &&
    playerView.effectiveSettings().fov === 60 &&
    playerView.effectiveSettings().fog === 20);
playerView.setUsePlayerSettings(true);
ok('unlocking player settings re-applies player overrides', playerView.effectiveSettings().fov === 95);
ok('default pitch is 0 and frame.horizon is frame.height / 2',
    playerView.pitch() === 0 && playerView.frame.horizon === playerView.frame.height / 2);
playerView.setPitch(30);
ok('setPitch updates pitch and shifts frame.horizon above centre',
    playerView.pitch() === 30 && playerView.frame.horizon > playerView.frame.height / 2);
playerView.setPitch(99);
ok('setPitch clamps to +89 degrees', playerView.pitch() === 89);
playerView.setPitch(-99);
ok('setPitch clamps to -89 degrees and shifts frame.horizon below centre',
    playerView.pitch() === -89 && playerView.frame.horizon < playerView.frame.height / 2);
playerView.setPitch(0);
playerView.setPlayerSettings({lookUpDown: false});
playerView.addPitch(20);
ok('addPitch respects player lookUpDown toggle', playerView.pitch() === 0);
playerView.setPlayerSettings({lookUpDown: true, headBob: 100});
playerView.addPitch(15);
ok('addPitch adjusts pitch when lookUpDown is on', playerView.pitch() === 15);
playerView.addPitch(50);
ok('addPitch clamps player pitch to +35 degrees', playerView.pitch() === 35);
playerView.addPitch(-90);
ok('addPitch clamps player pitch to -35 degrees', playerView.pitch() === -35);
playerView.setPitch(0);
playerView.stepBob(2, 0, 1 / 30, 0);
ok('stepBob updates view headBob amplitude while view is on', playerView.headBob().amplitude > 0);
playerView.hide();
playerView.stepBob(2, 0, 1 / 30, 0);
ok('stepBob zeros headBob while view is hidden', playerView.headBob().amplitude === 0);
playerView.dispose();

const {default: Squiggle3dBlocks} = await import('../libraries/extensions/squiggle3d/index.js');
const ext = new Squiggle3dBlocks(runtime);
ext.setPitch({N: 25});
ok('squiggle3d setPitch and pitch blocks read and write pitch', ext.pitch() === 25);
ext.setPitch({N: -100});
ok('squiggle3d setPitch block clamps to -89', ext.pitch() === -89);
ext.setPitch({N: 0});
ext.usePlayerSettings({ONOFF: 'off'});
ok('squiggle3d usePlayerSettings block toggles maker lock', ext.view.usePlayerSettings() === false);
ext.usePlayerSettings({ONOFF: 'on'});

section('per-frame pose interpolation and mouse turn with gamepad and touch');
{
    const mid = stepPose({x: 10, y: 20, direction: 80}, {x: 14, y: 28, direction: 88}, 0.5, 8);
    ok('stepPose lerps x, y and committed yaw by progress and adds pending turn in full',
        near(mid.x, 12) && near(mid.y, 24) && near(mid.direction, 84 + (8 * TURN_PER_PIXEL)), mid);
    const wrapped = stepPose({x: 0, y: 0, direction: 178}, {x: 0, y: 0, direction: -178}, 0.5, 0);
    ok('stepPose wraps committed yaw across +/-180', Math.abs(wrapped.direction) === 180, wrapped);
    const snapped = stepPose({x: 0, y: 0, direction: 0}, {x: 200, y: 0, direction: 90}, 0.25, 0);
    ok('stepPose snaps large teleports and large angle jumps',
        snapped.x === 200 && snapped.direction === 90, snapped);

    let rafClock = 100;
    const rafQueue = [];
    let activeGamepads = [];
    const smooth = createView3d(runtime, world, {
        canvas,
        document: doc,
        toBitmap: bitmap,
        devicePixelRatio: 1,
        now: () => rafClock,
        requestFrame: cb => rafQueue.push(cb),
        getGamepads: () => activeGamepads
    });
    smooth.attach(seam);
    hero.setXY(0, 0);
    hero.setDirection(90);
    smooth.show(hero);
    smooth.setMouseTurn(true);
    doc.pointerLockElement = canvas;

    let steppedInTick = false;
    const origStepThreads = runtime.sequencer.stepThreads;
    runtime.sequencer.stepThreads = function () {
        steppedInTick = !runtime.redrawRequested;
        hero.setXY(hero.x + 4, hero.y);
        return origStepThreads.call(this);
    };
    listeners.doc.get('mousemove')({movementX: 30});
    runtime._step();
    runtime.sequencer.stepThreads = origStepThreads;
    ok('applying mouse turn in BEFORE_EXECUTE does not set redrawRequested or starve threads',
        steppedInTick && near(hero.direction, 93) && near(hero.x, 4));

    const uploadsAtStep = smooth.stats().uploads;
    rafClock += (1000 / 30) * 0.5;
    listeners.doc.get('mousemove')({movementX: 20});
    const nextRaf = rafQueue.shift();
    if (nextRaf) nextRaf();
    const rafPose = smooth.pose();
    ok('display rAF applies pending mouse turn in full, lerps position, and uploads bitmap',
        near(hero.direction, 95) && near(rafPose.direction, 95) && near(rafPose.x, 2) &&
        smooth.stats().uploads === uploadsAtStep + 1, {rafPose, uploads: smooth.stats().uploads});

    rafClock += (1000 / 30) * 0.5;
    hero.setXY(8, 0);
    runtime._step();
    runtime.interpolationEnabled = true;
    const uploadsBeforeInterp = smooth.stats().uploads;
    rafClock += (1000 / 30) * 0.5;
    listeners.doc.get('mousemove')({movementX: 10});
    runtime.renderer.draw();
    const interpPose = smooth.pose();
    runtime.interpolationEnabled = false;
    ok('interpolation draw updates 3D bitmap with lerped pose and full pending turn',
        near(interpPose.x, 6) && near(interpPose.direction, 96) &&
        smooth.stats().uploads === uploadsBeforeInterp + 1, {interpPose, uploads: smooth.stats().uploads});

    listeners.doc.get('mousemove')({movementX: 0, movementY: -100});
    runtime._step();
    ok('mouse movementY pitches the view and shifts frame.horizon',
        smooth.pitch() === 10 && smooth.frame.horizon > smooth.frame.height / 2);

    listeners.canvas.get('pointerdown')({pointerType: 'touch', pointerId: 7, clientX: 400, clientY: 180});
    listeners.doc.get('pointermove')({pointerType: 'touch', pointerId: 7, clientX: 410, clientY: 180});
    listeners.doc.get('pointermove')({pointerType: 'touch', pointerId: 7, clientX: 430, clientY: 160});
    listeners.doc.get('pointerup')({pointerType: 'touch', pointerId: 7, clientX: 430, clientY: 160});
    runtime._step();
    ok('right-half touch drag turns and pitches the 3D view',
        smooth.pitch() > 10 && hero.direction > 96);

    activeGamepads = [{
        connected: true,
        axes: [0, -0.9, 0.8, -0.8],
        buttons: [{pressed: true}]
    }];
    const dirBeforePad = hero.direction;
    const pitchBeforePad = smooth.pitch();
    rafClock += 16.7;
    const padRaf = rafQueue.shift();
    if (padRaf) padRaf();
    ok('gamepad right stick turns and pitches on display rAF',
        hero.direction > dirBeforePad && smooth.pitch() > pitchBeforePad);

    activeGamepads = [];
    doc.pointerLockElement = null;
    const lockCalls = [];
    const origRequest = canvas.requestPointerLock;
    canvas.requestPointerLock = optsLock => {
        lockCalls.push(optsLock);
        if (optsLock && optsLock.unadjustedMovement) {
            const err = new Error('not supported');
            err.name = 'NotSupportedError';
            return Promise.reject(err);
        }
        return Promise.resolve();
    };
    listeners.canvas.get('click')();
    await new Promise(resolve => setTimeout(resolve, 0));
    canvas.requestPointerLock = origRequest;
    ok('pointer lock requests unadjustedMovement: true and retries without options on NotSupportedError',
        lockCalls.length === 2 &&
        lockCalls[0] && lockCalls[0].unadjustedMovement === true &&
        typeof lockCalls[1] === 'undefined');
    smooth.dispose();
}

section('2.0x rung and bilinear texture filter');
{
    ext.view.dispose();
    const prevStageW = runtime.stageWidth;
    const prevStageH = runtime.stageHeight;
    runtime.stageWidth = 640;
    runtime.stageHeight = 360;
    const texData = new Uint32Array(64 * 64);
    for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
            texData[(y * 64) + x] = ((x + y) & 1) ? pixel(220, 40, 40) : pixel(20, 180, 240);
        }
    }
    hero.setXY(cellX(8), cellY(12));
    hero.setDirection(0);
    const v2x = createView3d(runtime, world, {
        canvas,
        document: doc,
        toBitmap: bitmap,
        devicePixelRatio: 1,
        loadImage: () => ({width: 64, height: 64}),
        createCanvas: (w, h) => ({
            width: w,
            height: h,
            getContext: () => ({
                clearRect () {},
                drawImage () {},
                getImageData: () => ({data: new Uint8ClampedArray(texData.buffer.slice(0))})
            })
        })
    });
    v2x.attach(seam);
    v2x.setSurfaceTexture('floor', 'brick');
    v2x.setQuality('crisp');
    v2x.show(hero);
    await new Promise(resolve => setTimeout(resolve, 0));
    runtime._step();
    const crispNearest = v2x.frame.pixels.slice();
    ok('bilinear texture filter is off by default on Crisp',
        v2x.textureFilter() === false && v2x.effectiveSettings().textureFilter === false);
    v2x.setTextureFilter(true);
    const crispBilinear = v2x.frame.pixels.slice();
    let diffCount = 0;
    for (let i = 0; i < crispNearest.length; i++) {
        if (crispNearest[i] !== crispBilinear[i]) diffCount++;
    }
    ok('enabling bilinear texture filter on Crisp blends wall and floor texels',
        v2x.textureFilter() === true && diffCount > 100, diffCount);
    v2x.setTextureFilter(false);
    let sameCount = 0;
    for (let i = 0; i < crispNearest.length; i++) {
        if (crispNearest[i] === v2x.frame.pixels[i]) sameCount++;
    }
    ok('turning bilinear filter back off at 1.0x restores pixel-identical frame',
        sameCount === crispNearest.length);
    v2x.setPlayerSettings({quality: '2x', textureFilter: true});
    ok('2.0x rung renders at 1280x720 on a 640x360 stage with bilinear filter active',
        v2x.scale() === 2 && v2x.frame.width === 1280 && v2x.frame.height === 720 && v2x.textureFilter() === true);
    v2x.setPlayerSettings({quality: 'fast', textureFilter: true});
    ok('bilinear texture filter stays off on Fast (0.5x) even when setting is enabled',
        v2x.scale() === 0.5 && v2x.textureFilter() === false);
    v2x.setPlayerSettings({quality: 'sharpest', textureFilter: true});
    ok('bilinear texture filter stays off on Sharpest (1.5x) so only Crisp and 2.0x activate it',
        v2x.scale() === 1.5 && v2x.textureFilter() === false);
    v2x.dispose();
    runtime.stageWidth = prevStageW;
    runtime.stageHeight = prevStageH;
}

section('3D floor elevation, jump arc, gravity, and landing horizon dip');
{
    let jClock = 1000;
    const jView = createView3d(runtime, world, {
        canvas,
        document: doc,
        toBitmap: bitmap,
        devicePixelRatio: 1,
        now: () => {
            jClock += 1000 / 30;
            return jClock;
        }
    });
    jView.attach(seam);
    const live = world.current();
    world.paintCells(live.id, 'floorHeights', [
        {col: 8, row: 11, value: 135},
        {col: 8, row: 10, value: 150},
        {col: 9, row: 12, value: 90}
    ]);
    world.setHitbox(hero, 16, 16);
    hero.setXY(cellX(8), cellY(12));
    hero.setDirection(0);
    jView.show(hero);
    jView.setPitch(0);
    runtime._step();
    const baseHorizon = jView.frame.height / 2;
    ok('viewer starts grounded at playerZ 0 with horizon at half height',
        near(jView.playerZ(), 0) && jView.isJumping() === false && near(jView.frame.horizon, baseHorizon));

    const hitStep025 = world.move(hero, 'y', 32);
    runtime._step();
    ok('walking onto a 0.25 floor height cell is free and raises playerZ to 0.25',
        hitStep025 === null && near(hero.y, cellY(11)) && near(jView.playerZ(), 0.25));

    hero.setXY(cellX(8), cellY(12));
    world.paintCells(live.id, 'floorHeights', [{col: 8, row: 11, value: 150}]);
    jView.show(hero);
    runtime._step();
    const blocked05 = world.move(hero, 'y', 32);
    ok('walking into a 0.5 floor height cell without jumping is blocked',
        blocked05 === 'top' && hero.y < cellY(11));

    hero.setXY(cellX(8), cellY(12));
    const jumped = jView.jump();
    ok('jump() starts a 3D jump when grounded and ignores double-jump in air',
        jumped === true && jView.isJumping() === true && jView.jump() === false);

    const climb05 = world.move(hero, 'y', 32);
    ok('moving into a 0.5 floor height cell while jumping succeeds',
        climb05 === null && near(hero.y, cellY(11)));

    let peakZ = jView.playerZ();
    let landedHorizon = baseHorizon;
    for (let i = 0; i < 30; i++) {
        runtime._step();
        if (jView.playerZ() > peakZ) peakZ = jView.playerZ();
        if (!jView.isJumping()) {
            landedHorizon = jView.frame.horizon;
            break;
        }
    }
    ok('jump arc peaks above 0.5 under gravity and lands on the 0.5 platform',
        peakZ > 0.5 && jView.isJumping() === false && near(jView.playerZ(), 0.5),
        {peakZ, playerZ: jView.playerZ()});
    ok('landing triggers a dip into frame.horizon below half height',
        landedHorizon < baseHorizon && jView.headBob().landingY > 0,
        {landedHorizon, baseHorizon, landingY: jView.headBob().landingY});

    for (let i = 0; i < 20; i++) runtime._step();
    ok('landing dip in frame.horizon recovers back to half height',
        near(jView.frame.horizon, baseHorizon, 0.5));

    hero.setXY(cellX(9), cellY(12));
    for (let i = 0; i < 25; i++) runtime._step();
    ok('stepping into a -0.5 pit drops playerZ to -0.5 under gravity',
        near(jView.playerZ(), -0.5));

    world.paintCells(live.id, 'floorHeights', [
        {col: 8, row: 11, value: 0},
        {col: 8, row: 10, value: 0},
        {col: 9, row: 12, value: 0}
    ]);
    jView.dispose();
}

done();
