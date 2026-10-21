import {createRequire} from 'node:module';
import {stubRenderer} from '../../../world/harness.mjs';

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
    return new Proxy(store, {
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

const listeners = new Map();
const observers = [];

globalThis.window = {
    addEventListener (name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
    },
    removeEventListener (name, fn) {
        if (listeners.has(name)) listeners.get(name).delete(fn);
    }
};
globalThis.document = {hidden: false, createElement: () => element(300, 150)};
globalThis.ResizeObserver = class {
    constructor (fn) {
        this.fn = fn;
        this.watching = 0;
        observers.push(this);
    }
    observe () {
        this.watching++;
    }
    disconnect () {
        this.watching = 0;
    }
};

const {installWorldSeams} = await import('../../../world/seams.js');
const {getWorld, installWorldApi} = await import('../../../world/world.js');
const {setFrameRequest} = await import('./overlay.js');

const queue = new Map();
const requests = {count: 0, cancelled: 0};
const requestFrame = fn => {
    requests.count++;
    queue.set(requests.count, fn);
    return requests.count;
};
const cancelFrame = id => {
    if (queue.delete(id)) requests.cancelled++;
};
const restoreFrames = () => setFrameRequest(requestFrame, cancelFrame);
restoreFrames();

const frame = () => {
    const run = Array.from(queue.values());
    queue.clear();
    run.forEach(fn => fn(0));
    return run.length;
};

const frames = n => {
    let ran = 0;
    for (let i = 0; i < n; i++) ran += frame();
    return ran;
};

const pending = () => queue.size;

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

const fixedClock = (overlay, hz) => {
    let at = 0;
    overlay.clock = () => {
        at += 1000 / (hz || 60);
        return at;
    };
};

const boot = async () => {
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
    const world = () => {
        const made = getWorld(runtime, {createCanvas: () => null, loadImage: () => null});
        made.attach(seam);
        return made;
    };
    const step = () => runtime._step();
    return {vm, runtime, cat, seam, renderer, stageCanvas, world, step};
};

export {boot, element, fixedClock, frame, frames, listeners, observers, parent, pending, requests, restoreFrames};
