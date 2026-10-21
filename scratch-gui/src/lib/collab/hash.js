import {sha256Hex} from './snapshot-http.js';

const RUNTIME_ENTRY = '*';

const canonical = value => {
    if (value === null || typeof value === 'undefined') return 'null';
    if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : '0';
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

const md5extOf = asset => {
    if (!asset) return null;
    return asset.md5ext || (asset.assetId ? `${asset.assetId}.${asset.dataFormat}` : null);
};

const declared = (map, withCloud) => Object.keys(map || {}).sort()
    .map(id => {
        const entry = map[id];
        const name = Array.isArray(entry) ? entry[0] : entry;
        return withCloud ? [id, name, Array.isArray(entry) && entry[2] === true] : [id, name];
    });

const targetPayload = target => ({
    name: target.name,
    stage: target.isStage === true,
    layer: typeof target.layerOrder === 'number' ? target.layerOrder : 0,
    blocks: target.blocks || {},
    costumes: (target.costumes || []).map(md5extOf),
    sounds: (target.sounds || []).map(md5extOf),
    variables: declared(target.variables, true),
    lists: declared(target.lists, false),
    broadcasts: declared(target.broadcasts, false),
    extensionStorage: target.extensionStorage || null
});

const runtimePayload = project => ({
    extensions: (project.extensions || []).slice().sort(),
    extensionStorage: project.extensionStorage || null
});

const projectHashes = async json => {
    const project = typeof json === 'string' ? JSON.parse(json) : json;
    const out = {};
    for (const target of project.targets || []) {
        if (!target || typeof target.name !== 'string') continue;
        out[target.name] = await sha256Hex(canonical(targetPayload(target)));
    }
    out[RUNTIME_ENTRY] = await sha256Hex(canonical(runtimePayload(project)));
    return out;
};

const driftedTargets = (local, remote) => {
    if (!local || !remote) return [];
    const names = new Set(Object.keys(local).concat(Object.keys(remote)));
    return Array.from(names).filter(name => local[name] !== remote[name])
        .sort();
};

export {
    RUNTIME_ENTRY,
    canonical,
    driftedTargets,
    projectHashes,
    targetPayload
};
