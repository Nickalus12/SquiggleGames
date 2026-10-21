import {createRequire} from 'node:module';

process.removeAllListeners('warning');

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const Runtime = require('scratch-vm/src/engine/runtime.js');
const StageLayering = require('scratch-vm/src/engine/stage-layering.js');
const RenderedTarget = require('scratch-vm/src/sprites/rendered-target.js');
const sb3 = require('scratch-vm/src/serialization/sb3.js');
const vmLog = require('scratch-vm/src/util/log.js');
const RenderWebGL = require('scratch-render/src/RenderWebGL.js');
const Rectangle = require('scratch-render/src/Rectangle.js');
const twgl = createRequire(require.resolve('scratch-render/src/RenderWebGL.js'))('twgl.js');

vmLog.warn = () => {};
vmLog.info = () => {};

const {LAYER_ORDER, registerKit} = await import('../kits/registry.js');
const {installWorldSeams, HOOKS, IDENTITY} = await import('./seams.js');
const {markRulesTarget} = await import('../collab/project-seam.js');

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

const method = (owner, name, arity, label) => {
    const fn = owner && owner[name];
    ok(`${label}.${name} exists with arity ${arity}`, typeof fn === 'function' && fn.length === arity,
        typeof fn === 'function' ? fn.length : typeof fn);
};

const sameMatrix = (a, b) => a && b && a.length === 16 &&
    Array.from(a).every((v, i) => Math.abs(v - b[i]) < 1e-6);

const project = () => ({
    targets: [
        {
            isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0
        },
        {
            isStage: false, name: 'Hero', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
            x: 30, y: -40, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
        },
        {
            isStage: false, name: 'Game Rules', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 2, visible: false,
            x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
        }
    ],
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const stubRenderer = () => {
    const renderer = Object.create(RenderWebGL.prototype);
    Object.assign(renderer, {
        _layerGroups: {},
        _groupOrdering: [],
        _drawList: [],
        _allDrawables: [],
        _nextDrawableId: 0,
        _nativeSize: [480, 360],
        _gl: {canvas: {clientWidth: 480, clientHeight: 360}},
        _xLeft: -240,
        _xRight: 240,
        _yBottom: -180,
        _yTop: 180,
        _projection: twgl.m4.ortho(-240, 240, -180, 180, -1, 1),
        dirty: false,
        draws: [],
        calls: []
    });
    renderer.draw = function () {
        if (!this.dirty) return;
        this.dirty = false;
        this.draws.push(Float32Array.from(this._projection));
    };
    const noop = () => {};
    let skins = 0;
    Object.assign(renderer, {
        createDrawable (group) {
            const id = this._nextDrawableId++;
            this._addToDrawList(id, group);
            return id;
        },
        destroyDrawable: noop,
        updateDrawableSkinId: noop,
        updateDrawableVisible: noop,
        updateDrawableEffect: noop,
        setDrawableOrder: noop,
        getDrawableOrder: () => 0,
        getCurrentSkinSize: () => [0, 0],
        getSkinSize: () => [0, 0],
        getSkinRotationCenter: () => [0, 0],
        getFencedPositionOfDrawable: (id, position) => position,
        createSVGSkin: () => ++skins,
        createBitmapSkin: () => ++skins,
        destroySkin: noop,
        setPrivateSkinAccess: noop,
        markSkinAsPrivate: noop
    });
    renderer.updateDrawablePosition = function (id, position) {
        this.calls.push(['position', id, position]);
    };
    renderer.updateDrawableDirectionScale = function (id, direction, scale) {
        this.calls.push(['directionScale', id, direction, scale]);
    };
    renderer.updateDrawableProperties = function (id, properties) {
        this.calls.push(['properties', id, properties]);
    };
    return renderer;
};

section('scratch-render contract (pinned TurboWarp scratch-render)');
const R = RenderWebGL.prototype;
method(R, 'draw', 0, 'RenderWebGL');
method(R, 'clientSpaceToScratchBounds', 2, 'RenderWebGL');
method(R, 'updateDrawablePosition', 2, 'RenderWebGL');
method(R, 'updateDrawableDirectionScale', 3, 'RenderWebGL');
method(R, 'updateDrawableProperties', 2, 'RenderWebGL');
method(R, 'setLayerGroupOrdering', 1, 'RenderWebGL');
method(R, 'createDrawable', 1, 'RenderWebGL');
method(R, 'destroyDrawable', 2, 'RenderWebGL');
method(R, 'createBitmapSkin', 3, 'RenderWebGL');
method(R, 'updateDrawableSkinId', 2, 'RenderWebGL');
method(R, 'setStageSize', 4, 'RenderWebGL');
method(R, '_addToDrawList', 2, 'RenderWebGL');
const setStageSizeSrc = R.setStageSize.toString();
ok('setStageSize writes _xLeft, _xRight, _yBottom, _yTop',
    ['_xLeft', '_xRight', '_yBottom', '_yTop'].every(name => setStageSizeSrc.includes(`this.${name} = `)));
ok('setStageSize builds _projection with m4.ortho(xLeft, xRight, yBottom, yTop, -1, 1)',
    setStageSizeSrc.includes('this._projection = twgl.m4.ortho(xLeft, xRight, yBottom, yTop, -1, 1)'));
ok('draw renders the draw list through this._projection',
    R.draw.toString().includes('this._drawThese(this._drawList, ShaderManager.DRAW_MODE.default, this._projection'));
ok('draw returns early when not dirty', /if \(!this\.dirty\)\s*{\s*return;/.test(R.draw.toString()));
ok('clientSpaceToScratchBounds maps from _xLeft and _yTop',
    R.clientSpaceToScratchBounds.toString().includes('this._xLeft + x') &&
    R.clientSpaceToScratchBounds.toString().includes('this._yTop - y'));
ok('Rectangle.initFromBounds(left, right, bottom, top)', Rectangle.prototype.initFromBounds.length === 4);

const layered = Object.create(RenderWebGL.prototype);
Object.assign(layered, {_layerGroups: {}, _groupOrdering: [], _drawList: []});
layered.setLayerGroupOrdering(StageLayering.LAYER_GROUPS);
layered._addToDrawList(1, 'background');
layered._addToDrawList(2, 'sprite');
layered._addToDrawList(3, 'pen');
layered._addToDrawList(4, 'sprite');
ok('layer groups keep drawListOffset bookkeeping', layered._layerGroups.sprite.drawListOffset === 2 &&
    layered._layerGroups.pen.drawListOffset === 1, layered._layerGroups);
ok('setLayerGroupOrdering resets every offset to 0 (seams.js restores them)', (() => {
    const probe = Object.create(RenderWebGL.prototype);
    Object.assign(probe, {_layerGroups: {}, _groupOrdering: [], _drawList: []});
    probe.setLayerGroupOrdering(['a', 'b']);
    probe._addToDrawList(1, 'a');
    probe._addToDrawList(2, 'b');
    probe.setLayerGroupOrdering(['a', 'b']);
    return probe._layerGroups.b.drawListOffset === 0;
})());

section('scratch-vm contract (pinned TurboWarp scratch-vm c4823421)');
ok('StageLayering.LAYER_GROUPS is background, video, pen, sprite',
    JSON.stringify(StageLayering.LAYER_GROUPS) === JSON.stringify(['background', 'video', 'pen', 'sprite']),
    StageLayering.LAYER_GROUPS);
ok('LAYER_ORDER keeps the stock groups in their stock order',
    JSON.stringify(LAYER_ORDER.filter(name => StageLayering.LAYER_GROUPS.indexOf(name) !== -1)) ===
    JSON.stringify(StageLayering.LAYER_GROUPS));
ok('LAYER_ORDER is the design order', JSON.stringify(LAYER_ORDER) === JSON.stringify(
    ['background', 'video', 'sq-tiles-back', 'pen', 'sprite', 'sq-tiles-front', 'sq-hud']));
ok('Runtime.BEFORE_EXECUTE is BEFORE_EXECUTE', Runtime.BEFORE_EXECUTE === 'BEFORE_EXECUTE');
ok('Runtime.AFTER_EXECUTE is AFTER_EXECUTE', Runtime.AFTER_EXECUTE === 'AFTER_EXECUTE');
ok('Runtime.PROJECT_LOADED is PROJECT_LOADED', Runtime.PROJECT_LOADED === 'PROJECT_LOADED');
ok('Runtime.EXTENSION_ADDED is EXTENSION_ADDED', Runtime.EXTENSION_ADDED === 'EXTENSION_ADDED');
const stepSrc = Runtime.prototype._step.toString();
ok('_step emits BEFORE_EXECUTE then AFTER_EXECUTE around stepThreads',
    stepSrc.indexOf('this.emit(Runtime.BEFORE_EXECUTE)') !== -1 &&
    stepSrc.indexOf('this.emit(Runtime.BEFORE_EXECUTE)') < stepSrc.indexOf('this.sequencer.stepThreads()') &&
    stepSrc.indexOf('this.sequencer.stepThreads()') < stepSrc.indexOf('this.emit(Runtime.AFTER_EXECUTE)'));
method(Runtime.prototype, 'toggleScript', 2, 'Runtime');
method(Runtime.prototype, '_renderInterpolatedPositions', 0, 'Runtime');
method(Runtime.prototype, 'setRuntimeOptions', 1, 'Runtime');
method(Runtime.prototype, 'attachRenderer', 1, 'Runtime');
ok('_renderInterpolatedPositions reads _lastStepTime and currentStepTime',
    Runtime.prototype._renderInterpolatedPositions.toString().includes('this._lastStepTime') &&
    Runtime.prototype._renderInterpolatedPositions.toString().includes('this.currentStepTime'));
ok('setRuntimeOptions drives renderer.offscreenTouching from fencing',
    Runtime.prototype.setRuntimeOptions.toString().includes('this.renderer.offscreenTouching = !this.runtimeOptions.fencing'));
method(RenderedTarget.prototype, 'isTouchingEdge', 0, 'RenderedTarget');
method(VM.prototype, 'toJSON', 2, 'VirtualMachine');
method(VM.prototype, 'attachRenderer', 1, 'VirtualMachine');

const vm = new VM();
const runtime = vm.runtime;
ok('runtimeOptions.fencing defaults to true', runtime.runtimeOptions.fencing === true);
ok('runtimeOptions.miscLimits exists', typeof runtime.runtimeOptions.miscLimits === 'boolean');
method(runtime.ioDevices.mouse, 'getScratchX', 0, 'mouse');
method(runtime.ioDevices.mouse, 'getScratchY', 0, 'mouse');
ok('mouse keeps _scratchX and _scratchY', '_scratchX' in runtime.ioDevices.mouse && '_scratchY' in runtime.ioDevices.mouse);
method(runtime.ext_scratch3_looks, '_positionBubble', 1, 'ext_scratch3_looks');
method(runtime.ext_scratch3_motion, '_ifOnEdgeBounce', 1, 'ext_scratch3_motion');
ok('runtime.extensionStorage starts as an object', runtime.extensionStorage && typeof runtime.extensionStorage === 'object');

await vm.loadProject(JSON.stringify(project()));
const hero = runtime.targets.find(target => target.getName() === 'Hero');
const rules = runtime.targets.find(target => target.getName() === 'Game Rules');
ok('targets carry extensionStorage (target.js:77)', rules && rules.extensionStorage &&
    typeof rules.extensionStorage === 'object');
ok('blocks keep the _blocks map the world-mode scan reads', hero && hero.blocks && typeof hero.blocks._blocks === 'object');

rules.extensionStorage.together = {role: 'rules', v: 1};
runtime.extensionStorage.squiggleworld = {format: 1};
const nativeJson = JSON.parse(VM.prototype.toJSON.call(vm));
const nativeRules = nativeJson.targets.find(target => target.name === 'Game Rules');
ok('stock sb3.serialize drops storage of extensions no block uses (sb3.js:611)',
    !nativeRules.extensionStorage && !nativeJson.extensionStorage, nativeRules.extensionStorage);
const withBlocks = project();
withBlocks.targets[2].extensionStorage = {together: {role: 'rules', v: 1}};
withBlocks.extensionStorage = {squiggleworld: {format: 1}};
const vm2 = new VM();
await vm2.loadProject(JSON.stringify(withBlocks));
const loadedRules = vm2.runtime.targets.find(target => target.getName() === 'Game Rules');
ok('stock deserialize keeps target extensionStorage (sb3.js:1331)',
    loadedRules.extensionStorage.together && loadedRules.extensionStorage.together.role === 'rules');
ok('stock deserialize keeps runtime extensionStorage (sb3.js:1596)',
    vm2.runtime.extensionStorage.squiggleworld && vm2.runtime.extensionStorage.squiggleworld.format === 1);
ok('sb3.serialize and deserialize are exported', typeof sb3.serialize === 'function' &&
    typeof sb3.deserialize === 'function');

section('installWorldSeams on a VM with a renderer');
const renderer = stubRenderer();
vm.attachRenderer(renderer);
renderer._addToDrawList(90, 'background');
renderer._addToDrawList(91, 'sprite');
renderer._addToDrawList(92, 'sprite');
renderer._addToDrawList(93, 'pen');
const before = renderer._drawList.slice();
const world = installWorldSeams(vm);
ok('install returns the world object', world && world.version === 1 && world.renderer === renderer);
ok('install is idempotent per renderer', installWorldSeams(vm) === world);
ok('layer order is the design order', JSON.stringify(renderer._groupOrdering) === JSON.stringify(LAYER_ORDER),
    renderer._groupOrdering);
ok('existing drawables keep their place in the draw list', JSON.stringify(renderer._drawList) === JSON.stringify(before));
ok('existing group offsets survive the reorder', renderer._layerGroups.background.drawListOffset === 0 &&
    renderer._layerGroups.pen.drawListOffset === 1 && renderer._layerGroups.sprite.drawListOffset === 2,
renderer._layerGroups);
ok('new groups sit at the right offsets', renderer._layerGroups['sq-tiles-back'].drawListOffset === 1 &&
    renderer._layerGroups['sq-tiles-front'].drawListOffset === 4 && renderer._layerGroups['sq-hud'].drawListOffset === 4,
renderer._layerGroups);
renderer._addToDrawList(94, 'sq-hud');
renderer._addToDrawList(95, 'sq-tiles-back');
renderer._addToDrawList(96, 'sprite');
ok('kit layers draw in order: tiles-back under pen, hud on top',
    JSON.stringify(renderer._drawList) === JSON.stringify([90, 95, 93, 91, 92, 96, 94]), renderer._drawList);
ok('hook names are the documented seven', JSON.stringify(HOOKS) === JSON.stringify(
    ['drawablePosition', 'drawableDirectionScale', 'drawableProperties', 'bubble', 'touchingEdge', 'edgeBounce',
        'toggleScript']));

section('no camera: exactly 1.8');
const stockProjection = Float32Array.from(renderer._projection);
renderer.dirty = true;
renderer.draw();
ok('draw uses the stock projection', sameMatrix(renderer.draws[0], stockProjection));
ok('toView is identity', JSON.stringify(world.toView(12, -7)) === JSON.stringify({x: 12, y: -7, scale: 1}));
ok('view is the identity object', world.getView() === IDENTITY);
runtime.ioDevices.mouse._scratchX = 20.4;
runtime.ioDevices.mouse._scratchY = -10.6;
ok('mouse x and y are the stock values', runtime.ioDevices.mouse.getScratchX() === 20 &&
    runtime.ioDevices.mouse.getScratchY() === -11);
const stockBounds = RenderWebGL.prototype.clientSpaceToScratchBounds.call(renderer, 240, 180);
const seamBounds = renderer.clientSpaceToScratchBounds(240, 180);
ok('clientSpaceToScratchBounds is stock', JSON.stringify(stockBounds) === JSON.stringify(seamBounds), seamBounds);
renderer.updateDrawablePosition(5, [1, 2]);
renderer.updateDrawableDirectionScale(5, 90, [100, 100]);
renderer.updateDrawableProperties(5, {visible: true});
ok('drawable updates pass straight through', renderer.calls.length === 3 && renderer.calls[0][0] === 'position' &&
    renderer.calls[1][0] === 'directionScale' && renderer.calls[2][0] === 'properties');
ok('fencing stays on without a world kit', runtime.runtimeOptions.fencing === true && world.isWorldMode() === false);
ok('window.SquiggleWorld is absent without a window', typeof globalThis.window === 'undefined');

section('camera');
let cameraView = {x: 100, y: 50, zoom: 2};
const progressSeen = [];
const dropCamera = world.setCamera(progress => {
    progressSeen.push(progress);
    return cameraView;
});
renderer.draws.length = 0;
renderer.draw();
ok('a camera draw uses ortho of the view rectangle',
    sameMatrix(renderer.draws[0], twgl.m4.ortho(-20, 220, -40, 140, -1, 1)), Array.from(renderer.draws[0] || []));
ok('the stock projection is restored after the draw', sameMatrix(renderer._projection, stockProjection));
ok('target x and y never move', hero.x === 30 && hero.y === -40);
ok('toView maps world to stage', JSON.stringify(world.toView(110, 50)) === JSON.stringify({x: 20, y: 0, scale: 2}));
ok('toWorld inverts toView', JSON.stringify(world.toWorld(20, 0)) === JSON.stringify({x: 110, y: 50}));
ok('mouse reads in world space', runtime.ioDevices.mouse.getScratchX() === 110 &&
    runtime.ioDevices.mouse.getScratchY() === 45, [runtime.ioDevices.mouse.getScratchX(), runtime.ioDevices.mouse.getScratchY()]);
const picked = renderer.clientSpaceToScratchBounds(240, 180);
ok('picking bounds land in world space', picked.left === 100 && picked.right === 100 &&
    picked.bottom === 50 && picked.top === 50, picked);
renderer.draw();
ok('an unchanged view does not force a redraw', renderer.draws.length === 1);
cameraView = {x: 101, y: 50, zoom: 2};
renderer.draw();
ok('a moved camera marks the renderer dirty', renderer.draws.length === 2);
runtime._lastStepTime = Date.now() - 8;
runtime.currentStepTime = 16;
progressSeen.length = 0;
runtime._renderInterpolatedPositions();
ok('interpolated frames pass progress to the camera', progressSeen.length === 1 &&
    progressSeen[0] > 0.3 && progressSeen[0] <= 1, progressSeen);
renderer.dirty = true;
progressSeen.length = 0;
renderer.draw();
ok('step frames pass progress 1', progressSeen[0] === 1, progressSeen);
cameraView = {x: Number.NaN, y: 0, zoom: 2};
renderer.draw();
ok('a broken view falls back to identity', world.getView() === IDENTITY);
cameraView = {x: 5, y: 5, zoom: 1};
dropCamera();
renderer.draw();
ok('removing the camera returns to identity', world.getView() === IDENTITY &&
    sameMatrix(renderer.draws[renderer.draws.length - 1], stockProjection));

section('hooks');
const seen = [];
const dropHook = world.hook('drawablePosition', (next, id, position) => {
    seen.push(id);
    return next(id, [position[0] + 1, position[1]]);
});
renderer.calls.length = 0;
renderer.updateDrawablePosition(7, [10, 10]);
ok('a position hook wraps the stock call', seen[0] === 7 && renderer.calls[0][2][0] === 11, renderer.calls);
dropHook();
renderer.updateDrawablePosition(7, [10, 10]);
ok('dropping a hook restores pass-through', renderer.calls[1][2][0] === 10);
let threw = false;
try {
    world.hook('nope', () => {});
} catch (e) {
    threw = true;
}
ok('unknown hook names throw', threw);
const edgeHook = world.hook('touchingEdge', (next, target) => target.getName() === 'Hero');
ok('touchingEdge hook answers for RenderedTarget.isTouchingEdge', hero.isTouchingEdge() === true &&
    rules.isTouchingEdge() === false);
edgeHook();
const bounceTargets = [];
const bounceHook = world.hook('edgeBounce', (next, target) => bounceTargets.push(target.getName()));
runtime.ext_scratch3_motion._ifOnEdgeBounce(hero);
ok('edgeBounce hook sees the compiled-code entry point', bounceTargets[0] === 'Hero');
bounceHook();
const bubbleTargets = [];
const bubbleHook = world.hook('bubble', (next, target) => bubbleTargets.push(target.getName()));
runtime.ext_scratch3_looks._positionBubble(hero);
ok('bubble hook wraps _positionBubble', bubbleTargets[0] === 'Hero');
bubbleHook();

section('step hooks');
const order = [];
const dropBefore = world.onBeforeExecute(() => order.push('before'));
const dropAfter = world.onAfterExecute(() => order.push('after'));
globalThis.document = {hidden: true};
runtime._step();
ok('BEFORE_EXECUTE and AFTER_EXECUTE fire once per step in order', JSON.stringify(order) === '["before","after"]', order);
dropBefore();
dropAfter();
runtime._step();
delete globalThis.document;
ok('step hooks unsubscribe', order.length === 2);

section('Game Rules never run on a device');
markRulesTarget(rules);
const pushed = [];
const pushThread = runtime._pushThread;
runtime._pushThread = (id, target) => {
    pushed.push(target.getName());
};
runtime.toggleScript('top', {target: rules});
runtime.toggleScript('top', {target: hero});
runtime._pushThread = pushThread;
ok('toggleScript ignores the rules sprite and runs others', JSON.stringify(pushed) === '["Hero"]', pushed);

section('world mode');
registerKit({id: 'squiggleworld', provides: ['world'], layers: ['sq-tiles-back', 'sq-tiles-front']});
world.refreshWorldMode();
ok('runtime storage of a world kit turns world mode on', world.isWorldMode() &&
    runtime.runtimeOptions.fencing === false && renderer.offscreenTouching === true);
delete runtime.extensionStorage.squiggleworld;
world.refreshWorldMode();
ok('leaving world mode restores fencing', !world.isWorldMode() && runtime.runtimeOptions.fencing === true &&
    renderer.offscreenTouching === false);
runtime.emit('EXTENSION_ADDED', {id: 'squiggleworld'});
ok('adding a world kit turns world mode on', world.isWorldMode() && runtime.runtimeOptions.fencing === false);
runtime.setRuntimeOptions({fencing: false, maxClones: 500});
world.setWorldMode(false);
ok('options set by the project after world mode are left alone', runtime.runtimeOptions.fencing === false &&
    runtime.runtimeOptions.maxClones === 500);
runtime.setRuntimeOptions({fencing: true});
const worldBlocks = project();
worldBlocks.targets[1].blocks = {
    a: {opcode: 'squiggleworld_setTile', next: null, parent: null, inputs: {}, fields: {}, shadow: false,
        topLevel: true, x: 0, y: 0}
};
vm.extensionManager.addBuiltinExtension('squiggleworld', class {
    getInfo () {
        return {id: 'squiggleworld', name: 'World', blocks: [{opcode: 'setTile', blockType: 'command', text: 'set tile'}]};
    }
    setTile () {}
});
await vm.loadProject(JSON.stringify(worldBlocks));
ok('loading a project with world kit blocks turns world mode on', world.isWorldMode() &&
    runtime.runtimeOptions.fencing === false);
await vm.loadProject(JSON.stringify(project()));
ok('loading a 1.8 project afterwards turns it off', !world.isWorldMode() && runtime.runtimeOptions.fencing === true);

section('extensionStorage round trip through the seam');
const vm3 = new VM();
vm3.attachRenderer(stubRenderer());
installWorldSeams(vm3);
await vm3.loadProject(JSON.stringify(project()));
const rules3 = vm3.runtime.targets.find(target => target.getName() === 'Game Rules');
markRulesTarget(rules3);
const saved = vm3.toJSON();
const vm4 = new VM();
await vm4.loadProject(saved);
const rules4 = vm4.runtime.targets.find(target => target.getName() === 'Game Rules');
ok('a rules sprite with no blocks keeps its mark through serialize and deserialize',
    rules4.extensionStorage.together && rules4.extensionStorage.together.role === 'rules' &&
    rules4.extensionStorage.together.v === 1, rules4.extensionStorage);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
