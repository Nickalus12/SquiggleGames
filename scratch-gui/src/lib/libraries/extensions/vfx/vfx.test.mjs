import {ok, near, section, done} from '../../../world/harness.mjs';
import {boot, fixedClock, frame, frames, listeners, observers, parent, pending, requests, restoreFrames}
    from './overlay-harness.mjs';

const {createOverlay, setFrameRequest} = await import('./overlay.js');
const {default: ThunderboltVFX} = await import('./index.js');
const {default: SquiggleAnimateBlocks} = await import('../squiggleanimate/index.js');

const {runtime, cat, seam, stageCanvas, world, step} = await boot();

section('the shared overlay loop');
let painted = 0;
let keep = false;
const seen = [];
const overlay = createOverlay(runtime, {zIndex: 20, frame: (ctx, dt) => {
    painted++;
    seen.push(dt);
    return keep;
}});
fixedClock(overlay);
ok('a new overlay asks for one display frame', pending() === 1, pending());
frame();
ok('a new overlay paints once and sleeps', painted === 1 && pending() === 0, painted);
ok('the overlay mounts a canvas beside the stage', overlay.canvas.parentElement === parent &&
    overlay.canvas.style.zIndex === '20' && overlay.canvas.style.pointerEvents === 'none');
ok('the overlay matches the stage backing size', overlay.canvas.width === 960 && overlay.canvas.height === 720);
step();
step();
ok('a step with nothing live leaves the loop asleep', pending() === 0 && painted === 1);
keep = true;
overlay.wake();
overlay.wake();
ok('waking twice still asks for one frame', pending() === 1);
frames(3);
ok('a live overlay draws once per display frame, not per step', painted === 4, painted);
ok('dt is wall clock per display frame', near(seen[2], 1 / 60) && near(seen[3], 1 / 60), seen);
let at = 0;
overlay.clock = () => {
    at += 1000;
    return at;
};
frame();
ok('a long frame caps dt at 0.05 s', seen[seen.length - 1] === 0.05, seen[seen.length - 1]);
fixedClock(overlay);
keep = false;
frames(3);
ok('an overlay with nothing live goes to sleep', pending() === 0, pending());

section('one loop for every overlay');
let second = 0;
const before = requests.count;
const painting = painted;
const other = createOverlay(runtime, {frame: () => {
    second++;
    return true;
}});
overlay.wake();
ok('two woken overlays share one frame request', requests.count === before + 1 && pending() === 1,
    requests.count - before);
frame();
ok('one display frame draws both', painted === painting + 1 && second === 1, {painted, second});
frames(2);
ok('the sleeping overlay is skipped while the other keeps the loop', painted === painting + 1 && second === 3);
other.dispose();
frames(2);
ok('a disposed overlay drops out of the loop', second === 3 && pending() === 0);

section('the running project keeps the loop');
runtime.emit('PROJECT_RUN_START');
ok('the green flag wakes the overlay', overlay.isRunning() && pending() === 1);
frames(3);
ok('the loop keeps ticking while the project runs', pending() === 1);
step();
ok('the step hook only wakes the loop', pending() === 1);
runtime.emit('PROJECT_RUN_STOP');
frames(2);
ok('the stop sign lets the loop sleep', !overlay.isRunning() && pending() === 0);
ok('draw time is measured', overlay.stats.draws === painted && overlay.stats.max >= overlay.stats.last);

section('sampled vm state');
let stuck = false;
let samples = 0;
const sampled = createOverlay(runtime, {sample: () => stuck, frame: () => {
    samples++;
    return false;
}});
frame();
samples = 0;
step();
ok('a step with nothing to follow stays asleep', pending() === 0);
stuck = true;
step();
frame();
ok('a step that samples a stuck item wakes the overlay', samples === 1, samples);
sampled.dispose();

section('one liveness set per step');
let reads = 0;
const targets = runtime.executableTargets;
Object.defineProperty(runtime, 'executableTargets', {
    configurable: true,
    get () {
        reads++;
        return targets;
    }
});
step();
reads = 0;
const checks = [overlay.alive(cat), overlay.alive(cat), overlay.alive({}), overlay.alive(cat)];
ok('many liveness checks read the target list once', reads === 1 && checks[0] && !checks[2], {reads, checks});
step();
reads = 0;
overlay.alive(cat);
ok('the next step rebuilds the set', reads === 1);
delete runtime.executableTargets;
runtime.executableTargets = targets;

section('dispose releases the page');
const resizeBefore = listeners.get('resize').size;
const mounted = createOverlay(runtime, {frame: () => false});
const observer = observers[observers.length - 1];
ok('a mounted overlay watches the stage', observer.watching === 1 && listeners.get('resize').size === resizeBefore + 1);
mounted.dispose();
ok('dispose disconnects the resize observer', observer.watching === 0);
ok('dispose removes the resize listener', listeners.get('resize').size === resizeBefore);
ok('dispose removes the canvas', mounted.canvas.parentElement === null);
frame();

section('projection with no camera');
const plain = createOverlay(runtime, {frame: () => false});
frame();
const centre = plain.project(0, 0, false);
ok('stage centre maps to canvas centre', centre.x === 480 && centre.y === 360 && centre.scale === 2, centre);
const corner = plain.project(100, 50, false);
ok('stage units scale to backing pixels', corner.x === 680 && corner.y === 260, corner);
ok('pinned and world agree with no camera', JSON.stringify(plain.project(100, 50, true)) === JSON.stringify(corner));
ok('a point far off stage is culled', !plain.onScreen(plain.project(1000, 0, false), 10));
ok('screen and world conversions are the identity with no camera',
    JSON.stringify(plain.toScreen(30, 40)) === '{"x":30,"y":40}' &&
    JSON.stringify(plain.toWorld(30, 40)) === '{"x":30,"y":40}');

section('projection through the world camera');
const made = world();
made.camera.set(100, 0);
made.camera.setZoom(200);
step();
const view = seam.getView();
ok('the camera view reaches the seam', view.x === 100 && view.zoom === 2, view);
const followed = plain.project(100, 0, false);
ok('a world point under the camera lands at canvas centre', near(followed.x, 480) && near(followed.y, 360), followed);
ok('world scale follows the zoom', followed.scale === 4, followed.scale);
const pinned = plain.project(100, 0, true);
ok('a pinned point ignores the camera', pinned.x === 680 && pinned.y === 360 && pinned.scale === 2, pinned);
const round = plain.toWorld(plain.toScreen(130, -20).x, plain.toScreen(130, -20).y);
ok('screen and world conversions round trip through the camera', near(round.x, 130) && near(round.y, -20), round);
let sameProjector = false;
let readsView = 0;
const getView = seam.getView;
seam.getView = () => {
    readsView++;
    return getView();
};
const probe = createOverlay(runtime, {frame: () => {
    sameProjector = probe.projector(false) === probe.projector(false);
    probe.project(1, 2, false);
    probe.project(3, 4, false);
    probe.project(5, 6, true);
    return false;
}});
readsView = 0;
frame();
seam.getView = getView;
ok('a draw takes one projector', sameProjector);
ok('a draw reads the world view once', readsView === 1, readsView);
probe.dispose();
plain.dispose();

section('vfx');
const vfx = new ThunderboltVFX(runtime);
fixedClock(vfx.overlay);
frame();
made.camera.shake(0, 0);
vfx.shakeScreen({DURATION: 0.3, INTENSITY: 8});
ok('vfx shake goes to the world camera', !!made.camera.state.shake && vfx.shake.duration === 0);
frame();
ok('a camera shake leaves the stage canvas alone', !stageCanvas.style.transform);
vfx.resetCamera();
ok('reset camera stops a world camera shake', made.camera.state.shake === null, made.camera.state.shake);
let wall = 0;
vfx.clock = () => wall;
const writes = [];
['set', 'setZoom', 'setTarget'].forEach(name => {
    const original = made.camera[name];
    made.camera[name] = (...args) => {
        writes.push(name);
        return original.apply(made.camera, args);
    };
});
vfx.zoomPunch({DURATION: 0.2, AMOUNT: 0.5});
frames(5);
ok('display frames alone leave the camera zoom alone', made.camera.state.zoom === 2, made.camera.state.zoom);
wall = 100;
step();
ok('the punch reaches the camera in the same step', near(made.camera.state.zoom, 3), made.camera.state.zoom);
const punchGlide = made.camera.view(0.5).zoom;
ok('the punch glides between steps', made.camera.state.from.zoom < punchGlide && punchGlide < 3,
    {from: made.camera.state.from.zoom, punchGlide});
ok('the punch writes through setTarget', writes.length > 0 && writes.every(name => name === 'setTarget'), writes);
wall = 250;
step();
ok('zoom punch hands the zoom back', near(made.camera.state.zoom, 2), made.camera.state.zoom);
writes.length = 0;
step();
ok('a finished punch stops writing', writes.length === 0, writes);
frames(3);
ok('a finished camera punch does not replay on the stage canvas', !stageCanvas.style.transform && pending() === 0,
    stageCanvas.style.transform);
made.camera.setZoom(200);
vfx.zoomPunch({DURATION: 0.2, AMOUNT: 0.5});
wall = 300;
step();
made.camera.setZoom(300);
wall = 350;
step();
ok('the punch rides a zoom a script set mid punch', near(made.camera.state.zoom, 4.5), made.camera.state.zoom);
wall = 600;
step();
ok('the zoom a script set mid punch survives the hand back', near(made.camera.state.zoom, 3), made.camera.state.zoom);
made.camera.setZoom(200);
vfx.zoomPunch({DURATION: 0.2, AMOUNT: 0.5});
wall = 650;
step();
vfx.resetCamera();
ok('reset camera hands a running punch back', near(made.camera.state.zoom, 2), made.camera.state.zoom);
vfx.screenFlash({COLOR: '#ffffff', DURATION: 0.2});
frame();
ok('a flash fills the whole overlay', vfx.overlay.ctx.calls.some(c => c[0] === 'fillRect' && c[3] === 960));
frames(20);
ok('the flash ends and the loop sleeps', pending() === 0);


section('a punch over a clamped zoom');
made.camera.setTarget(null, null, 5000);
step();
vfx.zoomPunch({DURATION: 0.2, AMOUNT: 0.5});
wall = 700;
step();
wall = 900;
step();
ok('a punch over a zoom past the clamp ends at the clamp', near(made.camera.state.zoom, 10), made.camera.state.zoom);
made.camera.setTarget(null, null, 800);
step();
vfx.zoomPunch({DURATION: 0.2, AMOUNT: 0.5});
wall = 950;
step();
ok('a punch that hits the clamp stays at the clamp', near(made.camera.state.zoom, 10), made.camera.state.zoom);
wall = 1200;
step();
ok('a punch that hit the clamp ends at the zoom before it', near(made.camera.state.zoom, 8), made.camera.state.zoom);

section('a camera reset mid punch');
made.camera.setTarget(0, 0, 200);
step();
vfx.zoomPunch({DURATION: 0.2, AMOUNT: 0.5});
wall = 1250;
step();
made.camera.reset();
writes.length = 0;
wall = 1300;
step();
ok('a reset mid punch ends the punch', vfx.zoom.camera === null && vfx.zoom.elapsed === vfx.zoom.duration);
ok('a reset mid punch leaves the camera off', !made.camera.state.active && made.camera.state.zoom === 1 &&
    writes.length === 0, writes);
vfx.resetCamera();
ok('reset camera after a camera reset writes nothing', !made.camera.state.active && writes.length === 0, writes);

section('animate and the punch share one after step order');
const anim = new SquiggleAnimateBlocks(runtime);
let animAt = 0;
anim.clock = () => {
    animAt += 1000 / 30;
    return animAt;
};
const stageUtil = {target: runtime.getTargetForStage(), stackFrame: {}, yield: () => {}};
const zoomWrites = [];
const spied = made.camera.setTarget;
made.camera.setTarget = (x, y, z) => {
    zoomWrites.push(z);
    return spied.call(made.camera, x, y, z);
};
const composes = punchFirst => {
    anim.tweens = [];
    made.camera.setTarget(0, 0, 100);
    step();
    wall = 2000;
    const register = [() => anim.write(null, 'camera zoom', 100), () => vfx.zoomPunch({DURATION: 1, AMOUNT: 0.5})];
    if (punchFirst) register.reverse();
    register.forEach(fn => fn());
    anim.startTween({PROP: 'camera zoom', V: 300, T: 1, EASE: 'linear'}, stageUtil);
    wall = 2500;
    let fine = true;
    let last = 0;
    for (let i = 0; i < 4; i++) {
        zoomWrites.length = 0;
        step();
        const [animated, punched] = zoomWrites;
        fine = fine && zoomWrites.length === 2 && animated > last && near(punched, animated * 1.5) &&
            near(made.camera.state.zoom, punched / 100);
        last = animated;
    }
    anim.detachFlush();
    anim.detachFlush = null;
    vfx.endPunch();
    vfx.disposeStep();
    vfx.disposeStep = null;
    anim.tweens = [];
    return fine;
};
ok('animate first: each step writes the tween then the punch over it', composes(false));
ok('punch first: each step still writes the tween then the punch over it', composes(true));
made.camera.setTarget = spied;

section('a camera move wakes a sleeping overlay');
let redraws = 0;
const watcher = createOverlay(runtime, {frame: () => {
    redraws++;
    return false;
}});
step();
frames(3);
redraws = 0;
step();
ok('a still camera leaves the overlays asleep', pending() === 0 && redraws === 0, {pending: pending(), redraws});
const asked = requests.count;
made.camera.setTarget(made.camera.state.x + 100, null, null);
step();
step();
ok('a camera move with no thread running asks for one frame once the view moves',
    requests.count - asked === 1 && pending() === 1, requests.count - asked);
frame();
ok('the moved view redraws and the overlay sleeps again', redraws === 1 && pending() === 0, redraws);

section('swapping the frame request');
watcher.wake();
const cancelled = requests.cancelled;
const swapped = [];
const swapCancelled = [];
setFrameRequest(fn => swapped.push(fn), id => swapCancelled.push(id));
ok('a swap cancels the pending frame', requests.cancelled === cancelled + 1 && pending() === 0);
ok('an awake overlay asks the new request for its frame', swapped.length === 1);
restoreFrames();
ok('swapping back cancels that frame too', swapCancelled.length === 1 && swapCancelled[0] === 1 && pending() === 1);
const clearTimer = globalThis.clearTimeout;
let cleared = 0;
globalThis.clearTimeout = handle => {
    cleared++;
    clearTimer(handle);
};
setFrameRequest(null);
restoreFrames();
globalThis.clearTimeout = clearTimer;
ok('the default timer frame is cleared on a swap', cleared === 1 && pending() === 1, cleared);
frame();

section('a throwing overlay');
let boom = true;
let otherDraws = 0;
let otherLive = true;
let caught = null;
const thrower = createOverlay(runtime, {frame: () => {
    if (boom) throw new Error('boom');
    return false;
}});
const sibling = createOverlay(runtime, {frame: () => {
    otherDraws++;
    return otherLive;
}});
try {
    frame();
} catch (error) {
    caught = error;
}
ok('the loop rethrows the frame error', !!caught && caught.message === 'boom');
ok('the other overlays still draw', otherDraws === 1, otherDraws);
ok('the loop still schedules', pending() === 1);
ok('a throwing overlay sleeps', !thrower.awake());
made.camera.setTarget(made.camera.state.x + 40, null, null);
step();
const fresh = thrower.project(made.camera.state.x, 0, false);
ok('a throwing draw leaves no cached view', near(fresh.x, 480), fresh);
boom = false;
otherLive = false;
frames(3);
ok('the loop sleeps once nothing is live', pending() === 0);
thrower.dispose();
sibling.dispose();
watcher.dispose();

section('the projector matches the seam');
made.camera.setTarget(100, 0, 200);
step();
const checker = createOverlay(runtime, {frame: () => false});
frame();
ok('projector and seam toView agree', [[100, 0], [130, -20], [-50, 75]].every(([x, y]) => {
    const p = checker.project(x, y, false);
    const v = seam.toView(x, y);
    return near(p.x, (v.x + 240) * 2) && near(p.y, (180 - v.y) * 2) && near(p.scale, v.scale * 2);
}));
checker.dispose();

done();
