import {createRequire} from 'node:module';
import {ok, near, section, done, stubRenderer} from '../../../world/harness.mjs';

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');
const RenderWebGL = require('scratch-render/src/RenderWebGL.js');
const twgl = createRequire(require.resolve('scratch-render/src/RenderWebGL.js'))('twgl.js');

vmLog.warn = () => {};
vmLog.info = () => {};
globalThis.document = {hidden: true};

const {installWorldSeams} = await import('../../../world/seams.js');
const {getWorld, installWorldApi} = await import('../../../world/world.js');
const {default: SquiggleAnimateBlocks, EASES, MAX_DT} = await import('./index.js');
const {getKit} = await import('../../../kits/registry.js');

const STEP = 1000 / 30;

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

const fixedClock = ext => {
    let now = 0;
    ext.clock = () => {
        now += STEP;
        return now;
    };
};

const util = target => {
    const u = {target, stackFrame: {}, yields: 0};
    u.yield = () => {
        u.yields++;
    };
    return u;
};

section('kit registration');
const kit = getKit('squiggleanimate');
ok('squiggleanimate registers with its extension', kit && kit.extension === SquiggleAnimateBlocks);
ok('kit colour comes from the theme tokens', kit.color === '#16b3c7');
ok('kit draws on no layer and is not a world kit', kit.layers.length === 0 && kit.provides.length === 0);

section('easing values at 0, 0.5 and 1');
const expected = {
    linear: 0.5,
    smooth: 0.5,
    bounce: 0.765625,
    spring: 1.015625,
    back: 1.0876975
};
for (const name of Object.keys(expected)) {
    const ease = EASES[name];
    ok(`${name} starts at 0`, near(ease(0), 0));
    ok(`${name} ends at 1`, near(ease(1), 1));
    ok(`${name} at 0.5 is ${expected[name]}`, near(ease(0.5), expected[name]), ease(0.5));
}
ok('the menu offers exactly the five eases', Object.keys(EASES).join() === 'linear,smooth,bounce,spring,back');

section('a 1.8 project does not change by a byte');
const plain = new VM();
plain.attachRenderer(stubRenderer(RenderWebGL, twgl));
await plain.loadProject(JSON.stringify(classicProject()));
const plainJson = plain.toJSON();
const kitted = new VM();
kitted.attachRenderer(stubRenderer(RenderWebGL, twgl));
installWorldSeams(kitted);
kitted.extensionManager.addBuiltinExtension('squiggleanimate', SquiggleAnimateBlocks);
await kitted.loadProject(JSON.stringify(classicProject()));
await kitted.extensionManager.loadExtensionURL('squiggleanimate');
kitted.runtime._step();
kitted.runtime._step();
const kittedJson = kitted.toJSON();
ok('serialized JSON is byte identical with the kit loaded', kittedJson === plainJson,
    kittedJson.length - plainJson.length);
ok('no kit storage was written', !kitted.runtime.extensionStorage.squiggleanimate);
ok('a single sprite export is byte identical', kitted.toJSON(kitted.runtime.targets[1].id) ===
    plain.toJSON(plain.runtime.targets[1].id));

section('tweens run on the step clock');
globalThis.window = {addEventListener: () => {}, removeEventListener: () => {}};
const vm = new VM();
vm.attachRenderer(stubRenderer(RenderWebGL, twgl));
const seam = installWorldSeams(vm);
installWorldApi();
await vm.loadProject(JSON.stringify(classicProject()));
const runtime = vm.runtime;
const ext = new SquiggleAnimateBlocks(runtime);
fixedClock(ext);
ok('the kit takes its time from the seam', window.SquiggleWorld === seam && runtime.listenerCount('BEFORE_EXECUTE') === 1);
const cat = runtime.getSpriteTargetByName('Cat');
cat.setXY(0, 0);
const u = util(cat);
ext.tween({PROP: 'x', V: 100, T: 1, EASE: 'linear'}, u);
ok('a waiting tween yields', u.yields === 1);
for (let i = 0; i < 29; i++) {
    runtime._step();
    ext.tween({PROP: 'x', V: 100, T: 1, EASE: 'linear'}, u);
}
ok('after 29 steps of 1/30 s the tween is still going', ext.isTweening({}, u) && near(cat.x, 2900 / 30, 1e-6), cat.x);
ok('the waiting block keeps yielding', u.yields === 30);
runtime._step();
ext.tween({PROP: 'x', V: 100, T: 1, EASE: 'linear'}, u);
ok('the 30th step lands exactly on the target', cat.x === 100 && !ext.isTweening({}, u), cat.x);
ok('the waiting block lets the script go on', u.yields === 30);

section('glide, conflicts and stop');
const g = util(cat);
ext.glideTo({X: -50, Y: 40, T: 0.5, EASE: 'smooth'}, g);
runtime._step();
ext.startTween({PROP: 'x', V: 200, T: 1, EASE: 'linear'}, util(cat));
ext.glideTo({X: -50, Y: 40, T: 0.5, EASE: 'smooth'}, g);
ok('a new x tween ends the glide and frees its script', g.yields === 1);
ext.startTween({PROP: 'size', V: 300, T: 1, EASE: 'back'}, util(cat));
ok('two properties tween together', ext.tweens.length === 2);
ext.stopTweens({}, util(cat));
ok('stop my tweens ends them all', !ext.isTweening({}, util(cat)) && ext.tweens.length === 0);
ext.startTween({PROP: 'ghost', V: 500, T: 0, EASE: 'linear'}, util(cat));
ok('a zero-second tween sets at once and clamps ghost', cat.effects.ghost === 100);
const xyBefore = [cat.x, cat.y];
const rejected = ext.startTween({PROP: 'xy', V: 5, T: 1, EASE: 'linear'}, util(cat));
const waiting = util(cat);
ext.tween({PROP: 'XY', V: 5, T: 1, EASE: 'linear'}, waiting);
ext.startTween({PROP: 'camera x', V: 5, T: 0, EASE: 'linear'}, util(cat));
ext.startTween({PROP: 'nose', V: 5, T: 0, EASE: 'linear'}, util(cat));
runtime._step();
ok('a reporter that returns xy is rejected before the tween starts', rejected.done && waiting.yields === 0 &&
    cat.x === xyBefore[0] && cat.y === xyBefore[1], [cat.x, cat.y]);
ok('props outside the menu start nothing', ext.tweens.length === 0);
ext.startTween({PROP: 'y', V: 10, T: 1, EASE: 'linear'}, util(cat));
runtime.emit('PROJECT_STOP_ALL');
ok('the stop sign ends every tween', ext.tweens.length === 0);

section('camera tweens only with a camera');
ok('no camera properties without the World kit', ext.propMenu().indexOf('camera x') === -1);
const stageUtil = util(runtime.getTargetForStage());
ext.startTween({PROP: 'camera x', V: 50, T: 1, EASE: 'linear'}, stageUtil);
ok('a camera tween with no World kit finishes at once', ext.tweens.length === 0);
const world = getWorld(runtime, {createCanvas: () => null, loadImage: () => null});
world.attach(seam);
world.camera.set(0, 0);
ok('camera properties appear once the World kit is loaded', ext.propMenu().indexOf('camera zoom') !== -1);
ext.startTween({PROP: 'camera zoom', V: 200, T: 0.5, EASE: 'linear'}, stageUtil);
for (let i = 0; i < 15; i++) runtime._step();
ok('camera zoom tweens through the world camera', near(world.camera.state.zoom, 2), world.camera.state.zoom);

section('clips');
['walk1', 'walk2', 'walk3', 'walk4', 'idle'].forEach((name, i) => {
    cat.sprite.addCostumeAt({name, skinId: i + 1, rotationCenterX: 0, rotationCenterY: 0, bitmapResolution: 1,
        size: [2, 2]}, i);
});
ext.last = null;
const frames = [];
let started = 0;
const startHats = runtime.startHats.bind(runtime);
runtime.startHats = (opcode, fields, target) => {
    if (opcode === 'squiggleanimate_whenClipFrame') started++;
    return startHats(opcode, fields, target);
};
const fired = [];
const firedNow = name => {
    const now = [];
    for (let n = 1; n <= 4; n++) if (ext.whenClipFrame({NAME: name, N: n}, util(cat))) now.push(n);
    return now;
};
ext.defineClip({NAME: 'walk', A: 'walk1', B: 'walk4', FPS: 30}, util(cat));
ext.playClip({NAME: 'walk', MODE: 'ping-pong'}, util(cat));
frames.push(ext.clipFrame({}, util(cat)));
for (let i = 0; i < 9; i++) {
    runtime._step();
    frames.push(ext.clipFrame({}, util(cat)));
    fired.push(...firedNow('walk'));
}
ok('ping-pong runs 1 2 3 4 3 2 1 2 3 4', frames.join(' ') === '1 2 3 4 3 2 1 2 3 4', frames.join(' '));
ok('the costume follows the clip', cat.currentCostume === 3);
ok('the frame hat fires for all 10 of 10 frames, frame 1 included', fired.join(' ') === frames.join(' '),
    fired.join(' '));
ok('each step with a hit starts the frame hat for the sprite', started === 9, started);
ok('the hat matches the clip name and frame', ext.whenClipFrame({NAME: 'Walk', N: 4}, util(cat)) &&
    !ext.whenClipFrame({NAME: 'walk', N: 3}, util(cat)));

ext.clips = new WeakMap();
const once = util(cat);
ext.playClipWait({NAME: 'walk'}, once);
let steps = 0;
let before = 0;
const onceFired = [];
do {
    before = once.yields;
    runtime._step();
    steps++;
    onceFired.push(...firedNow('walk'));
    ext.playClipWait({NAME: 'walk'}, once);
} while (once.yields > before && steps < 60);
ok('once mode fires frame 1', onceFired[0] === 1 && onceFired.join(' ') === '1 2 3 4', onceFired.join(' '));
ok('a clip with no define uses walk1 to walk4 at 12 fps and plays once', steps === 10 && cat.currentCostume === 3,
    [steps, cat.currentCostume]);

ext.defineClip({NAME: 'pose', A: 'idle', B: 'idle', FPS: 30}, util(cat));
started = 0;
ext.playClip({NAME: 'pose', MODE: 'loop'}, util(cat));
const poseFired = [];
for (let i = 0; i < 4; i++) {
    runtime._step();
    poseFired.push(...firedNow('pose'));
}
ok('a one-frame clip fires once', poseFired.join(' ') === '1' && started === 1, [poseFired, started]);

ext.playClip({NAME: 'walk', MODE: 'loop'}, util(cat));
const loop = [];
ext.clips = new WeakMap();
ext.defineClip({NAME: 'walk', A: 1, B: 4, FPS: 30}, util(cat));
ext.playClip({NAME: 'walk', MODE: 'loop'}, util(cat));
for (let i = 0; i < 5; i++) {
    runtime._step();
    loop.push(ext.clipFrame({}, util(cat)));
}
ok('loop wraps to frame 1', loop.join(' ') === '2 3 4 1 2', loop.join(' '));
runtime.emit('PROJECT_STOP_ALL');
ok('the stop sign ends clips', ext.clipFrame({}, util(cat)) === 0);

section('delta time');
let t = 0;
ext.clock = () => t;
ext.last = null;
runtime._step();
ok('the first step reports one frame', near(ext.deltaTime(), 1 / 30));
t += 16;
runtime._step();
ok('delta time is the real step in seconds', near(ext.deltaTime(), 0.016));
t += 5000;
runtime._step();
ok(`delta time is capped at ${MAX_DT} s`, ext.deltaTime() === MAX_DT);
ext.startTween({PROP: 'x', V: 0, T: 1, EASE: 'linear'}, util(cat));
cat.setXY(100, 0);
ext.tweens[0].from = [100];
t += 60000;
runtime._step();
ok('a long stall moves a tween by the cap only', near(cat.x, 90), cat.x);

done();
