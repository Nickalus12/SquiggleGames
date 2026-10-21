import RenderedTarget from 'scratch-vm/src/sprites/rendered-target.js';
import {LAYER_ORDER, worldKitIds} from '../kits/registry.js';
import {installProjectSeam, isRulesTarget} from '../collab/project-seam.js';

const BEFORE_EXECUTE = 'BEFORE_EXECUTE';
const AFTER_EXECUTE = 'AFTER_EXECUTE';
const PROJECT_LOADED = 'PROJECT_LOADED';
const EXTENSION_ADDED = 'EXTENSION_ADDED';

const HOOKS = Object.freeze([
    'drawablePosition',
    'drawableDirectionScale',
    'drawableProperties',
    'drawableEffect',
    'bubble',
    'touchingEdge',
    'edgeBounce',
    'toggleScript'
]);

const IDENTITY = Object.freeze({x: 0, y: 0, zoom: 1});

const worlds = new WeakMap();
const byRuntime = new WeakMap();

const normalizeView = view => {
    if (!view) return IDENTITY;
    const x = Number(view.x);
    const y = Number(view.y);
    const zoom = typeof view.zoom === 'undefined' ? 1 : Number(view.zoom);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) return IDENTITY;
    if (x === 0 && y === 0 && zoom === 1) return IDENTITY;
    return Object.freeze({x, y, zoom});
};

const sameView = (a, b) => a === b || (a.x === b.x && a.y === b.y && a.zoom === b.zoom);

const ortho = (left, right, bottom, top) => {
    const m = new Float32Array(16);
    m[0] = 2 / (right - left);
    m[5] = 2 / (top - bottom);
    m[10] = -1;
    m[12] = (right + left) / (left - right);
    m[13] = (top + bottom) / (bottom - top);
    m[15] = 1;
    return m;
};

const roundMouse = (runtime, value) => (
    runtime.runtimeOptions.miscLimits ? Math.round(value) : Math.round(value * 1000) / 1000
);

const reorderLayers = renderer => {
    const groups = renderer._layerGroups || {};
    const previous = {};
    Object.keys(groups).forEach(name => {
        previous[name] = groups[name].drawListOffset;
    });
    const order = LAYER_ORDER.concat((renderer._groupOrdering || []).filter(name => LAYER_ORDER.indexOf(name) === -1));
    renderer.setLayerGroupOrdering(order);
    let next = renderer._drawList ? renderer._drawList.length : 0;
    for (let i = order.length - 1; i >= 0; i--) {
        const name = order[i];
        const offset = Object.prototype.hasOwnProperty.call(previous, name) ? previous[name] : next;
        renderer._layerGroups[name].drawListOffset = offset;
        next = offset;
    }
};

const hookFor = (target, name) => {
    const world = target && target.runtime && byRuntime.get(target.runtime);
    return world ? world.hooks[name] : null;
};

const installPrototypeSeams = () => {
    const proto = RenderedTarget.prototype;
    if (proto.isTouchingEdge.squiggleSeam) return;
    const isTouchingEdge = proto.isTouchingEdge;
    proto.isTouchingEdge = function () {
        const hook = hookFor(this, 'touchingEdge');
        if (!hook) return isTouchingEdge.call(this);
        return hook(() => isTouchingEdge.call(this), this);
    };
    proto.isTouchingEdge.squiggleSeam = true;
};

const createWorld = (vm, runtime, renderer) => {
    const hooks = Object.create(null);
    const steps = {before: new Set(), after: new Set()};
    const state = {
        camera: null,
        view: IDENTITY,
        matrix: null,
        matrixKey: '',
        progress: 1,
        worldMode: false,
        forced: null,
        prior: true
    };

    const toView = (x, y) => {
        const view = state.view;
        return {x: (x - view.x) * view.zoom, y: (y - view.y) * view.zoom, scale: view.zoom};
    };

    const toWorld = (x, y) => {
        const view = state.view;
        return {x: view.x + (x / view.zoom), y: view.y + (y / view.zoom)};
    };

    const projectionFor = view => {
        const key = `${view.x},${view.y},${view.zoom},${renderer._xLeft},${renderer._xRight},` +
            `${renderer._yBottom},${renderer._yTop}`;
        if (key !== state.matrixKey) {
            state.matrixKey = key;
            state.matrix = ortho(
                view.x + (renderer._xLeft / view.zoom),
                view.x + (renderer._xRight / view.zoom),
                view.y + (renderer._yBottom / view.zoom),
                view.y + (renderer._yTop / view.zoom)
            );
        }
        return state.matrix;
    };

    const setView = view => {
        if (sameView(view, state.view)) return;
        state.view = view;
        renderer.dirty = true;
    };

    const draw = renderer.draw;
    renderer.draw = function () {
        if (!state.camera) {
            setView(IDENTITY);
            return draw.call(this);
        }
        setView(normalizeView(state.camera(state.progress)));
        if (state.view === IDENTITY) return draw.call(this);
        const saved = this._projection;
        this._projection = projectionFor(state.view);
        try {
            return draw.call(this);
        } finally {
            this._projection = saved;
        }
    };

    const clientSpaceToScratchBounds = renderer.clientSpaceToScratchBounds;
    renderer.clientSpaceToScratchBounds = function (...args) {
        const bounds = clientSpaceToScratchBounds.apply(this, args);
        if (state.view === IDENTITY) return bounds;
        const low = toWorld(bounds.left, bounds.bottom);
        const high = toWorld(bounds.right, bounds.top);
        bounds.initFromBounds(Math.floor(low.x), Math.ceil(high.x), Math.floor(low.y), Math.ceil(high.y));
        return bounds;
    };

    const wrapRenderer = (method, hookName) => {
        const original = renderer[method];
        const next = (...args) => original.apply(renderer, args);
        renderer[method] = function (...args) {
            const hook = hooks[hookName];
            if (!hook) return original.apply(this, args);
            return hook(next, ...args);
        };
    };
    wrapRenderer('updateDrawablePosition', 'drawablePosition');
    wrapRenderer('updateDrawableDirectionScale', 'drawableDirectionScale');
    wrapRenderer('updateDrawableProperties', 'drawableProperties');
    wrapRenderer('updateDrawableEffect', 'drawableEffect');

    const mouse = runtime.ioDevices.mouse;
    const getScratchX = mouse.getScratchX;
    const getScratchY = mouse.getScratchY;
    mouse.getScratchX = function () {
        if (state.view === IDENTITY) return getScratchX.call(this);
        return roundMouse(runtime, toWorld(this._scratchX, this._scratchY).x);
    };
    mouse.getScratchY = function () {
        if (state.view === IDENTITY) return getScratchY.call(this);
        return roundMouse(runtime, toWorld(this._scratchX, this._scratchY).y);
    };

    const wrapBlocks = (owner, method, hookName) => {
        const original = owner[method];
        owner[method] = function (target) {
            const hook = hooks[hookName];
            if (!hook) return original.call(this, target);
            return hook(() => original.call(this, target), target);
        };
    };
    wrapBlocks(runtime.ext_scratch3_looks, '_positionBubble', 'bubble');
    wrapBlocks(runtime.ext_scratch3_motion, '_ifOnEdgeBounce', 'edgeBounce');

    const renderInterpolatedPositions = runtime._renderInterpolatedPositions;
    runtime._renderInterpolatedPositions = function () {
        if (!state.camera) return renderInterpolatedPositions.call(this);
        const elapsed = Date.now() - this._lastStepTime;
        state.progress = Math.min(1, Math.max(0, elapsed / this.currentStepTime));
        try {
            return renderInterpolatedPositions.call(this);
        } finally {
            state.progress = 1;
        }
    };

    const toggleScript = runtime.toggleScript;
    const nextToggle = (...args) => toggleScript.apply(runtime, args);
    runtime.toggleScript = function (topBlockId, opts) {
        const target = (opts && opts.target) || this._editingTarget;
        if (isRulesTarget(target)) return;
        const hook = hooks.toggleScript;
        if (!hook) return toggleScript.call(this, topBlockId, opts);
        return hook(nextToggle, topBlockId, opts);
    };

    installProjectSeam(vm);

    runtime.on(BEFORE_EXECUTE, () => steps.before.forEach(fn => fn()));
    runtime.on(AFTER_EXECUTE, () => steps.after.forEach(fn => fn()));

    const applyWorldMode = on => {
        if (on) {
            if (!state.worldMode) state.prior = runtime.runtimeOptions.fencing;
            state.worldMode = true;
            if (runtime.runtimeOptions.fencing !== false) runtime.setRuntimeOptions({fencing: false});
            state.forced = runtime.runtimeOptions;
            return;
        }
        if (!state.worldMode) return;
        state.worldMode = false;
        if (runtime.runtimeOptions === state.forced) runtime.setRuntimeOptions({fencing: state.prior});
        state.forced = null;
    };

    const usesWorldKit = () => {
        const ids = worldKitIds();
        if (!ids.length) return false;
        if (ids.some(id => runtime.extensionStorage && runtime.extensionStorage[id])) return true;
        const prefixes = ids.map(id => `${id}_`);
        return runtime.targets.some(target => {
            if (!target.isOriginal || !target.blocks) return false;
            const blocks = target.blocks._blocks;
            return Object.keys(blocks).some(blockId => {
                const opcode = blocks[blockId].opcode;
                return typeof opcode === 'string' && prefixes.some(prefix => opcode.startsWith(prefix));
            });
        });
    };

    runtime.on(PROJECT_LOADED, () => applyWorldMode(usesWorldKit()));
    runtime.on(EXTENSION_ADDED, info => {
        if (info && worldKitIds().indexOf(info.id) !== -1) applyWorldMode(true);
    });

    const subscribe = set => fn => {
        if (typeof fn !== 'function') throw new Error('world step hooks take a function');
        set.add(fn);
        return () => set.delete(fn);
    };

    const world = {
        version: 1,
        vm,
        runtime,
        renderer,
        layers: LAYER_ORDER,
        hookNames: HOOKS,
        toView,
        toWorld,
        getView: () => state.view,
        setCamera (camera) {
            if (camera !== null && typeof camera !== 'function') throw new Error('setCamera takes a function or null');
            const previous = state.camera;
            state.camera = camera;
            renderer.dirty = true;
            return () => {
                if (state.camera === camera) {
                    state.camera = previous;
                    renderer.dirty = true;
                }
            };
        },
        hook (name, fn) {
            if (HOOKS.indexOf(name) === -1) throw new Error(`Unknown world hook ${name}`);
            if (fn !== null && typeof fn !== 'function') throw new Error(`World hook ${name} takes a function or null`);
            const previous = hooks[name] || null;
            hooks[name] = fn;
            return () => {
                if (hooks[name] === fn) hooks[name] = previous;
            };
        },
        onBeforeExecute: subscribe(steps.before),
        onAfterExecute: subscribe(steps.after),
        isWorldMode: () => state.worldMode,
        setWorldMode: on => applyWorldMode(!!on),
        refreshWorldMode: () => applyWorldMode(usesWorldKit())
    };
    Object.defineProperty(world, 'hooks', {value: hooks});
    return world;
};

const installWorldSeams = vm => {
    const runtime = vm && vm.runtime;
    const renderer = runtime && runtime.renderer;
    if (!renderer) return null;
    if (worlds.has(renderer)) return worlds.get(renderer);
    reorderLayers(renderer);
    installPrototypeSeams();
    const world = createWorld(vm, runtime, renderer);
    worlds.set(renderer, world);
    byRuntime.set(runtime, world);
    world.refreshWorldMode();
    if (typeof window !== 'undefined') {
        window.SquiggleWorld = world;
        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('SquiggleWorldReady'));
        }
    }
    return world;
};

export {
    IDENTITY,
    HOOKS,
    installWorldSeams
};
