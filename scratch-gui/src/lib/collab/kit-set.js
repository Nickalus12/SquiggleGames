const KIT_SET_EVENT = 'KIT_STORAGE_CHANGED';
const MAX_PATH_KEYS = 4;
const MAX_KEY_LENGTH = 64;
const MAX_VALUE_BYTES = 16 * 1024;
const EXT_ID = /^[A-Za-z0-9_]{1,64}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const validPath = path => Array.isArray(path) && path.length >= 1 && path.length <= MAX_PATH_KEYS &&
    path.every(key => typeof key === 'string' && key.length >= 1 && key.length <= MAX_KEY_LENGTH &&
        !UNSAFE_KEYS.has(key));

const jsonOf = value => JSON.stringify(typeof value === 'undefined' ? null : value);

const valueBytes = value => new TextEncoder().encode(jsonOf(value)).length;

const kitSetFrame = ({scope, targetId, ext, path, value}) => {
    if (scope !== 'project' && scope !== 'target') return null;
    if (!EXT_ID.test(ext || '') || !validPath(path)) return null;
    const frame = {type: 'kit-set', scope, ext, path: path.slice(), value: typeof value === 'undefined' ? null : value};
    if (scope === 'target') {
        if (typeof targetId !== 'string' || !targetId) return null;
        frame.targetId = targetId;
    }
    return frame;
};

const fitsKitSet = frame => !!frame && valueBytes(frame.value) <= MAX_VALUE_BYTES;

const clone = value => (value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value)));

const writePath = (storage, ext, path, value) => {
    const root = Object.assign({}, storage[ext]);
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        const next = node[key];
        node[key] = next && typeof next === 'object' && !Array.isArray(next) ? Object.assign({}, next) : {};
        node = node[key];
    }
    const last = path[path.length - 1];
    if (value === null) delete node[last];
    else node[last] = clone(value);
    storage[ext] = root;
    return root;
};

const applyKitSet = (runtime, msg, findTarget) => {
    if (!runtime || !msg || !EXT_ID.test(msg.ext || '') || !validPath(msg.path)) return false;
    if (typeof msg.value === 'undefined' || valueBytes(msg.value) > MAX_VALUE_BYTES) return false;
    if (msg.scope === 'project') {
        if (!runtime.extensionStorage) runtime.extensionStorage = {};
        writePath(runtime.extensionStorage, msg.ext, msg.path, msg.value);
        return true;
    }
    if (msg.scope !== 'target') return false;
    const target = findTarget(msg.targetId, msg.ext);
    if (!target) return false;
    if (!target.extensionStorage) target.extensionStorage = {};
    writePath(target.extensionStorage, msg.ext, msg.path, msg.value);
    return true;
};

const changedKeys = (before, after) => {
    const keys = new Set(Object.keys(before || {}).concat(Object.keys(after || {})));
    return Array.from(keys).filter(key => JSON.stringify((before || {})[key]) !== JSON.stringify((after || {})[key]))
        .sort();
};

const announceKitSet = (runtime, {scope, target, ext, before, after}) => {
    if (!runtime || typeof runtime.emit !== 'function') return;
    changedKeys(before, after).forEach(key => {
        runtime.emit(KIT_SET_EVENT, {
            scope,
            target,
            ext,
            path: [key],
            value: after && typeof after[key] !== 'undefined' ? after[key] : null
        });
    });
};

export {
    KIT_SET_EVENT,
    MAX_VALUE_BYTES,
    announceKitSet,
    applyKitSet,
    changedKeys,
    fitsKitSet,
    kitSetFrame
};
