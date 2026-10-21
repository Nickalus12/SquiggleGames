import {FORMAT, MAX_LEVELS, createGrid, encodeLevel} from './tilemap.js';

const WORLD_KEY = 'squiggleworld';
const SCENES_KEY = 'squigglescenes';
const MAX_SCENES = 64;
const MAX_SPAWNS = 32;

const storageOf = runtime => {
    if (!runtime) return null;
    if (!runtime.extensionStorage) runtime.extensionStorage = {};
    return runtime.extensionStorage;
};

const peek = (runtime, key) => {
    const store = runtime && runtime.extensionStorage;
    const value = store && store[key];
    return value && typeof value === 'object' ? value : null;
};

const ensure = (runtime, key, list) => {
    const store = storageOf(runtime);
    let value = store[key];
    if (!value || typeof value !== 'object') {
        value = {format: FORMAT};
        value[list] = [];
        store[key] = value;
    }
    if (!Array.isArray(value[list])) value[list] = [];
    if (typeof value.format !== 'number') value.format = FORMAT;
    return value;
};

const readLevels = runtime => {
    const world = peek(runtime, WORLD_KEY);
    if (!world || !Array.isArray(world.levels)) return [];
    return world.levels.slice(0, MAX_LEVELS).map(level => createGrid(level));
};

const writeLevel = (runtime, grid) => {
    const world = ensure(runtime, WORLD_KEY, 'levels');
    const encoded = encodeLevel(grid);
    const at = world.levels.findIndex(level => level && level.id === grid.id);
    if (at === -1) {
        if (world.levels.length >= MAX_LEVELS) return false;
        world.levels.push(encoded);
    } else {
        world.levels[at] = encoded;
    }
    return true;
};

const removeLevel = (runtime, id) => {
    const world = peek(runtime, WORLD_KEY);
    if (!world || !Array.isArray(world.levels)) return false;
    const before = world.levels.length;
    world.levels = world.levels.filter(level => !level || level.id !== id);
    return world.levels.length !== before;
};

const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const name = (value, fallback) => {
    const s = typeof value === 'string' ? value.trim() : '';
    return s ? s.slice(0, 100) : fallback;
};

const normalizeBounds = bounds => {
    if (!bounds || typeof bounds !== 'object') return null;
    const left = num(bounds.left, NaN);
    const right = num(bounds.right, NaN);
    const top = num(bounds.top, NaN);
    const bottom = num(bounds.bottom, NaN);
    if (![left, right, top, bottom].every(Number.isFinite) || right <= left || top <= bottom) return null;
    return {left, right, top, bottom};
};

const normalizeSpawn = spawn => ({
    sprite: name(spawn && spawn.sprite, ''),
    x: num(spawn && spawn.x, 0),
    y: num(spawn && spawn.y, 0),
    shown: !(spawn && spawn.shown === false)
});

const normalizeScene = (scene, index) => {
    const source = scene || {};
    return {
        id: name(source.id, `scene${index + 1}`),
        name: name(source.name, `Scene ${index + 1}`),
        backdrop: name(source.backdrop, ''),
        level: name(source.level, ''),
        bounds: normalizeBounds(source.bounds),
        keepClones: source.keepClones === true,
        spawns: (Array.isArray(source.spawns) ? source.spawns : [])
            .slice(0, MAX_SPAWNS)
            .map(normalizeSpawn)
            .filter(spawn => spawn.sprite)
    };
};

const readScenes = runtime => {
    const scenes = peek(runtime, SCENES_KEY);
    if (!scenes || !Array.isArray(scenes.scenes)) return {scenes: [], allScenes: []};
    return {
        scenes: scenes.scenes.slice(0, MAX_SCENES).map(normalizeScene),
        allScenes: (Array.isArray(scenes.allScenes) ? scenes.allScenes : []).map(s => name(s, '')).filter(Boolean)
    };
};

const writeScenes = (runtime, data) => {
    const store = ensure(runtime, SCENES_KEY, 'scenes');
    store.scenes = (data.scenes || []).slice(0, MAX_SCENES).map(normalizeScene);
    store.allScenes = (data.allScenes || []).map(s => name(s, '')).filter(Boolean);
    return store;
};

export {
    WORLD_KEY,
    SCENES_KEY,
    MAX_SCENES,
    MAX_SPAWNS,
    peek,
    readLevels,
    writeLevel,
    removeLevel,
    readScenes,
    writeScenes,
    normalizeScene
};
