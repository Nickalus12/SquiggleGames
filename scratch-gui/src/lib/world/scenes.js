import {SCENES_KEY, MAX_SCENES, MAX_SPAWNS, readScenes, writeScenes} from './storage.js';
import {attachWhenReady, getWorld, peekWorld} from './world.js';
import {preserveExtensionStorage} from '../collab/project-seam.js';

const ANY = '_any_';
const PHASES = Object.freeze(['ends', 'clones', 'stop', 'swap', 'camera', 'spawns', 'starts']);
const TRANSITIONS = Object.freeze(['cut', 'fade', 'pixelate']);
const HALF_MS = 250;
const END_WAIT_MS = 2000;
const HAT_STARTS = 'squigglescenes_whenSceneStarts';
const HAT_ENDS = 'squigglescenes_whenSceneEnds';

const controllers = new WeakMap();

const lower = value => String(value === null || typeof value === 'undefined' ? '' : value).trim()
    .toLowerCase();

const createEmitter = () => {
    const listeners = new Map();
    return {
        on (name, fn) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(fn);
            return () => listeners.get(name).delete(fn);
        },
        emit (name, payload) {
            const set = listeners.get(name);
            if (set) Array.from(set).forEach(fn => fn(payload));
        }
    };
};

const createScenes = runtime => {
    const emitter = createEmitter();
    const state = {
        currentId: '',
        ending: '',
        starting: '',
        busy: null,
        tickers: new Set(),
        effect: null,
        touched: new Set()
    };

    const data = () => readScenes(runtime);
    const list = () => data().scenes;

    const indexOf = key => {
        const scenes = list();
        if (typeof key === 'number' && Number.isInteger(key)) return key >= 0 && key < scenes.length ? key : -1;
        const want = lower(key);
        if (!want) return -1;
        let at = scenes.findIndex(scene => lower(scene.id) === want);
        if (at === -1) at = scenes.findIndex(scene => lower(scene.name) === want);
        if (at === -1 && /^\d+$/.test(want)) {
            const n = Number(want) - 1;
            at = n >= 0 && n < scenes.length ? n : -1;
        }
        return at;
    };

    const current = () => {
        const scenes = list();
        const at = scenes.findIndex(scene => scene.id === state.currentId);
        return at === -1 ? {index: -1, scene: null} : {index: at, scene: scenes[at]};
    };

    const save = next => {
        preserveExtensionStorage(SCENES_KEY);
        writeScenes(runtime, next);
        emitter.emit('scenes', list());
    };

    const tick = () => {
        const dt = runtime.currentStepTime || (1000 / 30);
        Array.from(state.tickers).forEach(fn => fn(dt));
    };
    runtime.on('AFTER_EXECUTE', tick);

    const waitFor = (done, limit) => new Promise(resolve => {
        if (done(0)) {
            resolve();
            return;
        }
        let elapsed = 0;
        const fn = dt => {
            elapsed += dt;
            if (done(elapsed) || elapsed >= limit) {
                state.tickers.delete(fn);
                resolve();
            }
        };
        state.tickers.add(fn);
    });

    const drawables = () => {
        const renderer = runtime.renderer;
        return renderer && Array.isArray(renderer._drawList) ? renderer._drawList.slice() : [];
    };

    const ownEffect = (id, effect) => {
        const target = runtime.targets.find(t => t.drawableID === id);
        return target && target.effects ? target.effects[effect] || 0 : 0;
    };

    const setEffect = amount => {
        const renderer = runtime.renderer;
        if (!renderer || !state.effect) return;
        const effect = state.effect;
        const ids = new Set(drawables());
        if (amount === 0) state.touched.forEach(id => ids.add(id));
        for (const id of ids) {
            if (amount !== 0) state.touched.add(id);
            const base = ownEffect(id, effect);
            const value = effect === 'brightness' ? base + ((-100 - base) * amount) : base + (150 * amount);
            renderer.updateDrawableEffect(id, effect, value);
        }
    };

    const clearEffect = () => {
        if (!state.effect) return;
        setEffect(0);
        state.effect = null;
        state.touched.clear();
    };

    const cancel = () => {
        state.tickers.clear();
        clearEffect();
        state.busy = null;
    };
    runtime.on('PROJECT_STOP_ALL', () => cancel());
    runtime.on('PROJECT_LOADED', () => {
        cancel();
        state.currentId = '';
    });

    const ramp = (transition, from, to) => {
        if (transition === 'cut' || !runtime.renderer) return Promise.resolve();
        state.effect = transition === 'fade' ? 'brightness' : 'pixelate';
        setEffect(from);
        return waitFor(elapsed => {
            const t = Math.min(1, elapsed / HALF_MS);
            setEffect(from + ((to - from) * t));
            return t >= 1;
        }, HALF_MS);
    };

    const originals = () => runtime.targets.filter(target => !target.isStage && target.isOriginal);

    const inScene = (scene, all) => {
        const names = new Set(scene.spawns.map(spawn => lower(spawn.sprite)));
        all.forEach(name => names.add(lower(name)));
        return target => names.has(lower(target.getName()));
    };

    const startHats = (opcode, flag, name) => {
        state[flag] = name;
        const threads = runtime.startHats(opcode) || [];
        state[flag] = '';
        return threads;
    };

    const applySpawns = (scene, all) => {
        const keep = new Set(all.map(lower));
        const bySprite = new Map(scene.spawns.map(spawn => [lower(spawn.sprite), spawn]));
        for (const target of originals()) {
            const name = lower(target.getName());
            const spawn = bySprite.get(name);
            if (spawn) {
                target.setXY(spawn.x, spawn.y);
                target.setVisible(spawn.shown);
            } else if (!keep.has(name)) {
                target.setVisible(false);
            }
        }
    };

    const swap = (scene, quiet) => {
        const stage = runtime.getTargetForStage();
        if (stage && scene.backdrop) {
            const at = stage.getCostumeIndexByName(scene.backdrop);
            if (at !== -1 && at !== stage.currentCostume) {
                stage.setCostume(at);
                if (!quiet) runtime.startHats('event_whenbackdropswitchesto', {BACKDROP: stage.getCostumes()[at].name});
            }
        }
        let world = peekWorld(runtime);
        if (scene.level) {
            if (!world) {
                world = getWorld(runtime);
                attachWhenReady(world);
            }
            world.useLevel(scene.level);
        } else if (world) {
            world.clearLevel();
        }
        return world;
    };

    const resetCamera = (scene, world) => {
        if (!world) return;
        world.camera.reset();
        if (scene.bounds) {
            world.camera.setBounds(scene.bounds);
            world.camera.keepInside(true);
        }
    };

    const phase = (name, scene) => emitter.emit('phase', {phase: name, scene: scene.name});

    const perform = async (to, options) => {
        const opts = options || {};
        const transition = TRANSITIONS.indexOf(opts.transition) === -1 ? 'cut' : opts.transition;
        const scenes = data();
        const scene = scenes.scenes[to];
        const from = current().scene;
        if (from) {
            phase('ends', from);
            const threads = startHats(HAT_ENDS, 'ending', from.name);
            await waitFor(() => threads.every(thread => !runtime.isActiveThread(thread)), END_WAIT_MS);
        }
        await ramp(transition, 0, 1);
        phase('clones', scene);
        let callerLeaves = false;
        if (!scene.keepClones) {
            for (const clone of runtime.targets.filter(target => !target.isStage && !target.isOriginal)) {
                if (opts.thread && opts.thread.target === clone) callerLeaves = true;
                runtime.disposeTarget(clone);
                runtime.stopForTarget(clone, opts.thread);
            }
        }
        phase('stop', scene);
        const stays = inScene(scene, scenes.allScenes);
        for (const target of originals()) {
            if (stays(target)) continue;
            if (opts.thread && opts.thread.target === target) callerLeaves = true;
            runtime.stopForTarget(target, opts.thread);
        }
        phase('swap', scene);
        state.currentId = scene.id;
        const world = swap(scene);
        phase('camera', scene);
        resetCamera(scene, world);
        phase('spawns', scene);
        applySpawns(scene, scenes.allScenes);
        phase('starts', scene);
        startHats(HAT_STARTS, 'starting', scene.name);
        emitter.emit('current', {index: to, scene});
        await ramp(transition, 1, 0);
        clearEffect();
        return {scene, callerLeaves};
    };

    const switchTo = (key, options) => {
        const to = indexOf(key);
        if (to === -1) return Promise.resolve(null);
        const run = (state.busy || Promise.resolve()).then(() => perform(to, options));
        const tail = run.catch(() => null);
        state.busy = tail;
        tail.then(() => {
            if (state.busy === tail) state.busy = null;
        });
        return run;
    };

    const controller = {
        runtime,
        events: emitter,
        PHASES,
        list,
        allScenes: () => data().allScenes,
        current,
        currentId: () => state.currentId,
        busy: () => !!state.busy,
        matchesStart: name => name === ANY || lower(name) === lower(state.starting),
        matchesEnd: name => name === ANY || lower(name) === lower(state.ending),
        switchTo,
        next (options) {
            const scenes = list();
            if (!scenes.length) return Promise.resolve(null);
            const at = current().index;
            return switchTo((at + 1) % scenes.length, options);
        },
        preview (key) {
            const at = indexOf(key);
            if (at === -1) return null;
            const scenes = data();
            const scene = scenes.scenes[at];
            state.currentId = scene.id;
            const world = swap(scene, true);
            resetCamera(scene, world);
            applySpawns(scene, scenes.allScenes);
            emitter.emit('current', {index: at, scene});
            return scene;
        },
        thumbnail (scene) {
            const stage = runtime.getTargetForStage();
            if (!stage || !scene) return '';
            const want = lower(scene.backdrop);
            const costume = stage.getCostumes().find(c => lower(c.name) === want) ||
                stage.getCostumes()[stage.currentCostume];
            if (!costume || !costume.asset || typeof costume.asset.encodeDataURI !== 'function') return '';
            return costume.asset.encodeDataURI();
        },
        resetToSpawns () {
            const scene = current().scene;
            if (!scene) return false;
            applySpawns(scene, data().allScenes);
            return true;
        },
        capture (spec) {
            const stage = runtime.getTargetForStage();
            const world = peekWorld(runtime);
            const backdrop = stage ? stage.getCostumes()[stage.currentCostume] : null;
            const shown = originals().filter(target => target.visible);
            return Object.assign({
                backdrop: backdrop ? backdrop.name : '',
                level: world && world.currentId() ? world.currentId() : '',
                bounds: null,
                spawns: shown.slice(0, MAX_SPAWNS).map(target => ({
                    sprite: target.getName(),
                    x: Math.round(target.x),
                    y: Math.round(target.y),
                    shown: true
                }))
            }, spec);
        },
        add (spec) {
            const next = data();
            if (next.scenes.length >= MAX_SCENES) return null;
            const taken = new Set(next.scenes.map(scene => lower(scene.id)));
            let n = next.scenes.length + 1;
            while (taken.has(`scene${n}`)) n++;
            const scene = controller.capture(Object.assign({id: `scene${n}`, name: `Scene ${n}`}, spec));
            next.scenes.push(scene);
            save(next);
            return list()[next.scenes.length - 1];
        },
        update (key, patch) {
            const at = indexOf(key);
            if (at === -1) return null;
            const next = data();
            next.scenes[at] = Object.assign({}, next.scenes[at], patch, {id: next.scenes[at].id});
            save(next);
            return list()[at];
        },
        rename (key, name) {
            const text = String(name || '').trim();
            return text ? controller.update(key, {name: text}) : null;
        },
        move (key, toIndex) {
            const at = indexOf(key);
            const next = data();
            const to = Math.max(0, Math.min(next.scenes.length - 1, Math.floor(Number(toIndex))));
            if (at === -1 || !Number.isFinite(to) || at === to) return false;
            const [scene] = next.scenes.splice(at, 1);
            next.scenes.splice(to, 0, scene);
            save(next);
            return true;
        },
        remove (key) {
            const at = indexOf(key);
            if (at === -1) return false;
            const next = data();
            const [gone] = next.scenes.splice(at, 1);
            if (gone.id === state.currentId) state.currentId = '';
            save(next);
            return true;
        },
        setAllScenes (spriteName, on) {
            const next = data();
            const name = String(spriteName || '').trim();
            if (!name) return false;
            const rest = next.allScenes.filter(entry => lower(entry) !== lower(name));
            next.allScenes = on ? rest.concat(name) : rest;
            save(next);
            return true;
        },
        cancel,
        reset () {
            cancel();
            state.currentId = '';
        }
    };
    return controller;
};

const getScenes = runtime => {
    if (!controllers.has(runtime)) controllers.set(runtime, createScenes(runtime));
    return controllers.get(runtime);
};

const peekScenes = runtime => controllers.get(runtime) || null;

export {
    ANY,
    PHASES,
    TRANSITIONS,
    HALF_MS,
    END_WAIT_MS,
    HAT_STARTS,
    HAT_ENDS,
    getScenes,
    peekScenes
};
