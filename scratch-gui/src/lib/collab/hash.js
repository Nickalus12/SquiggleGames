import {sha256Hex} from './snapshot-http.js';

const MAX_HASHED_TARGETS = 512;
const MAX_HASHED_NAME = 128;

const canonical = value => {
    if (value === null || typeof value === 'undefined') return 'null';
    if (typeof value === 'number') return JSON.stringify(value);
    if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (typeof value === 'object') {
        const keys = Object.keys(value)
            .filter(key => typeof value[key] !== 'undefined' && typeof value[key] !== 'function')
            .sort();
        return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return 'null';
};

const orNull = value => (typeof value === 'undefined' ? null : value);

const md5exts = list => (list || []).map(asset => (asset ? asset.md5ext : null));

const declared = map => Object.keys(map || {}).sort()
    .map(id => {
        const entry = map[id];
        return [id, Array.isArray(entry) ? entry[0] : entry];
    });

const targetPayload = target => ({
    name: target.name,
    isStage: target.isStage,
    blocks: target.blocks,
    comments: target.comments || {},
    costumes: md5exts(target.costumes),
    sounds: md5exts(target.sounds),
    variables: declared(target.variables),
    lists: declared(target.lists),
    broadcasts: declared(target.broadcasts),
    extensionStorage: target.extensionStorage || {},
    rotationStyle: orNull(target.rotationStyle),
    draggable: orNull(target.draggable)
});

const projectHashes = async json => {
    const project = typeof json === 'string' ? JSON.parse(json) : json;
    const out = {};
    for (const target of project.targets || []) {
        if (!target || typeof target.name !== 'string') continue;
        out[target.name] = await sha256Hex(canonical(targetPayload(target)));
    }
    return out;
};

const sendableHashes = hashes => {
    const names = Object.keys(hashes || {});
    if (!names.length || names.length > MAX_HASHED_TARGETS) return null;
    return names.every(name => name.length <= MAX_HASHED_NAME) ? hashes : null;
};

const driftedTargets = (local, remote) => {
    if (!local || !remote) return [];
    const names = new Set(Object.keys(local).concat(Object.keys(remote)));
    return Array.from(names).filter(name => local[name] !== remote[name])
        .sort();
};

export {
    MAX_HASHED_TARGETS,
    canonical,
    driftedTargets,
    projectHashes,
    sendableHashes,
    targetPayload
};
