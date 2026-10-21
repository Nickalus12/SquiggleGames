import {createRequire} from 'node:module';
import {ok, near, section, done, stubRenderer} from '../../../world/harness.mjs';

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');
const RenderWebGL = require('scratch-render/src/RenderWebGL.js');
const twgl = createRequire(require.resolve('scratch-render/src/RenderWebGL.js'))('twgl.js');

vmLog.warn = () => {};
vmLog.info = () => {};

const recorder = canvas => {
    const calls = [];
    const store = {canvas};
    const gradient = {addColorStop: () => {}};
    const ctx = new Proxy(store, {
        get (target, prop) {
            if (prop in target) return target[prop];
            if (prop === 'calls') return calls;
            return (...args) => {
                calls.push([prop, ...args]);
                if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
                if (prop === 'measureText') return {width: 10};
                return null;
            };
        },
        set (target, prop, value) {
            target[prop] = value;
            return true;
        }
    });
    return ctx;
};

const element = (width, height) => {
    const canvas = {width, height, style: {}, parentElement: null};
    canvas.ctx = recorder(canvas);
    canvas.getContext = () => canvas.ctx;
    canvas.getBoundingClientRect = () => ({left: 0, top: 0, width: 480, height: 360});
    return canvas;
};

const parent = {
    style: {},
    children: [],
    appendChild (child) {
        this.children.push(child);
        child.parentElement = this;
    },
    removeChild (child) {
        this.children.splice(this.children.indexOf(child), 1);
        child.parentElement = null;
    },
    getBoundingClientRect: () => ({left: 0, top: 0, width: 480, height: 360})
};

globalThis.window = {addEventListener: () => {}, removeEventListener: () => {}};
globalThis.document = {hidden: false, createElement: () => element(300, 150)};

const {installWorldSeams} = await import('../../../world/seams.js');
const {getWorld, installWorldApi} = await import('../../../world/world.js');
const {createOverlay} = await import('../vfx/overlay.js');
const {default: ThunderboltVFX} = await import('../vfx/index.js');
const {default: ThunderboltSystem} = await import('../particles/index.js');
const {default: ThunderboltHealthBars} = await import('../healthbars/index.js');

const sprite = (name, extra) => Object.assign({
    isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
}, extra);

const project = () => ({
    targets: [
        {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
            videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null},
        sprite('Cat')
    ],
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const fixedClock = target => {
    let at = 0;
    target.overlay.clock = () => {
        at += 1000 / 30;
        return at;
    };
};

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const step = async runtime => {
    runtime._step();
    await flush();
};

const renderer = stubRenderer(RenderWebGL, twgl);
const stageCanvas = element(960, 720);
parent.appendChild(stageCanvas);
Object.defineProperty(renderer, 'canvas', {value: stageCanvas});
const vm = new VM();
vm.attachRenderer(renderer);
const seam = installWorldSeams(vm);
installWorldApi();
await vm.loadProject(JSON.stringify(project()));
const runtime = vm.runtime;
const cat = runtime.getSpriteTargetByName('Cat');

section('the shared overlay');
let frames = 0;
let keep = false;
const overlay = createOverlay(runtime, {zIndex: 20, frame: () => {
    frames++;
    return keep;
}});
await step(runtime);
ok('a new overlay paints once and sleeps', frames === 1, frames);
frames = 0;
keep = true;
ok('the overlay mounts a canvas beside the stage', overlay.canvas.parentElement === parent &&
    overlay.canvas.style.zIndex === '20' && overlay.canvas.style.pointerEvents === 'none');
ok('the overlay matches the stage backing size', overlay.canvas.width === 960 && overlay.canvas.height === 720);
await step(runtime);
ok('an idle overlay does not draw', frames === 0);
overlay.wake();
await step(runtime);
ok('a woken overlay draws once per step after execute', frames === 1, frames);
await step(runtime);
ok('a live overlay keeps drawing', frames === 2, frames);
keep = false;
await step(runtime);
await step(runtime);
ok('an overlay with nothing live goes to sleep', frames === 3, frames);
runtime.emit('PROJECT_RUN_START');
await step(runtime);
ok('the green flag wakes it', frames === 4 && overlay.isRunning());
runtime.emit('PROJECT_RUN_STOP');
ok('the stop sign clears the running flag', !overlay.isRunning());
ok('draw time is measured', overlay.stats.draws === 5 && overlay.stats.max >= overlay.stats.last);
overlay.dispose();
ok('dispose removes the canvas', overlay.canvas.parentElement === null);

section('projection with no camera');
const plain = createOverlay(runtime, {frame: () => false});
const centre = plain.project(0, 0, false);
ok('stage centre maps to canvas centre', centre.x === 480 && centre.y === 360 && centre.scale === 2, centre);
const corner = plain.project(100, 50, false);
ok('stage units scale to backing pixels', corner.x === 680 && corner.y === 260, corner);
ok('pinned and world agree with no camera', JSON.stringify(plain.project(100, 50, true)) === JSON.stringify(corner));
ok('a point far off stage is culled', !plain.onScreen(plain.project(1000, 0, false), 10));

section('projection through the world camera');
const world = getWorld(runtime, {createCanvas: () => null, loadImage: () => null});
world.attach(seam);
world.camera.set(100, 0);
world.camera.setZoom(200);
await step(runtime);
const view = seam.getView();
ok('the camera view reaches the seam', view.x === 100 && view.zoom === 2, view);
const followed = plain.project(100, 0, false);
ok('a world point under the camera lands at canvas centre', near(followed.x, 480) && near(followed.y, 360), followed);
ok('world scale follows the zoom', followed.scale === 4, followed.scale);
const pinned = plain.project(100, 0, true);
ok('a pinned point ignores the camera', pinned.x === 680 && pinned.y === 360 && pinned.scale === 2, pinned);
plain.dispose();

section('health bars');
const bars = new ThunderboltHealthBars(runtime);
fixedClock(bars);
const ctx = bars.overlay.ctx;
bars.createBar({ID: 'boss', MAX: 100, X: 0, Y: 150});
await step(runtime);
const hud = bars.anchor(bars.bars.get('boss'));
ok('a new bar is pinned to the screen like 1.8', hud.x === 480 && hud.y === 60 && hud.scale === 2, hud);
ok('a woken bar draws', ctx.calls.some(c => c[0] === 'arcTo'));
cat.setXY(100, 0);
bars.stickToMe({ID: 'boss', DY: 50}, {target: cat});
await step(runtime);
const stuck = bars.anchor(bars.bars.get('boss'));
ok('a stuck bar rides its sprite through the camera', near(stuck.x, 480) && near(stuck.y, 160) &&
    stuck.scale === 4, stuck);
bars.pinToScreen({ID: 'boss', ONOFF: 'on'});
const freed = bars.bars.get('boss');
ok('pinning drops the sprite and keeps the last spot', !freed.target && freed.x === 100 && freed.y === 50);
bars.stickToMe({ID: 'boss', DY: 0}, {target: cat});
cat.setXY(2000, 0);
ctx.calls.length = 0;
bars.overlay.wake();
await step(runtime);
ok('a bar outside the view is not drawn', !ctx.calls.some(c => c[0] === 'arcTo'));
bars.setPosition({ID: 'boss', X: 0, Y: 0});
ok('set position detaches the bar', bars.bars.get('boss').target === null);
bars.changeHealth({ID: 'boss', VALUE: -10});
ok('damage leaves a popup', bars.bars.get('boss').popups.length === 1);
for (let i = 0; i < 40; i++) await step(runtime);
ok('popups age out on the step clock', bars.bars.get('boss').popups.length === 0);

section('particles');
const particles = new ThunderboltSystem(runtime);
fixedClock(particles);
particles.emit({ID: 'fx', COUNT: 5, X: 100, Y: 0, COLOR: '#ff0000', SIZE: 4, SPEED: 0, LIFE: 1, SPREAD: 0});
await step(runtime);
ok('particles draw in world units', particles.overlay.ctx.calls.some(c => c[0] === 'arc' || c[0] === 'fillRect'));
particles.shakeScreen({DURATION: 0.5, INTENSITY: 6});
ok('particle shake goes to the world camera', !!world.camera.state.shake && particles.shakeDuration === 0);

section('vfx');
const vfx = new ThunderboltVFX(runtime);
fixedClock(vfx);
world.camera.shake(0, 0);
vfx.shakeScreen({DURATION: 0.3, INTENSITY: 8});
ok('vfx shake goes to the world camera', !!world.camera.state.shake && vfx.shake.duration === 0);
await step(runtime);
ok('a camera shake leaves the stage canvas alone', !stageCanvas.style.transform);
vfx.zoomPunch({DURATION: 0.2, AMOUNT: 0.5});
await step(runtime);
ok('zoom punch drives the camera zoom', world.camera.state.zoom > 2, world.camera.state.zoom);
for (let i = 0; i < 10; i++) await step(runtime);
ok('zoom punch hands the zoom back', near(world.camera.state.zoom, 2), world.camera.state.zoom);
vfx.screenFlash({COLOR: '#ffffff', DURATION: 0.2});
await step(runtime);
ok('a flash fills the whole overlay', vfx.overlay.ctx.calls.some(c => c[0] === 'fillRect' && c[3] === 960));

done();
