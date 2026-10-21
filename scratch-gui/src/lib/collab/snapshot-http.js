const SNAPSHOT_FIELDS = Object.freeze(['sha', 'size', 'atSeq', 'ref', 'basedOn', 'force', 'reset', 'cacheOnly']);

const ASSET_MAX_BYTES = 10 * 1024 * 1024;
const PROJECT_MAX_BYTES = 8 * 1024 * 1024;
const ASSET_CONCURRENCY = 4;

const CONTENT_TYPES = Object.freeze({
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg'
});

const MD5EXT = new RegExp(`^[0-9a-f]{32}\\.(${Object.keys(CONTENT_TYPES).join('|')})$`);

const snapshotError = (code, detail) => {
    const error = new Error(`snapshot ${code}${detail ? `: ${detail}` : ''}`);
    error.code = code;
    return error;
};

const snapshotFrame = fields => {
    const frame = {type: 'snapshot', atSeq: 0};
    SNAPSHOT_FIELDS.forEach(key => {
        if (fields && typeof fields[key] !== 'undefined' && fields[key] !== null) frame[key] = fields[key];
    });
    return frame;
};

const md5extOf = asset => (asset && asset.assetId && asset.dataFormat ?
    `${asset.assetId}.${asset.dataFormat}`.toLowerCase() :
    null);

const listOf = (target, getter, field) => {
    if (typeof target[getter] === 'function') return target[getter]() || [];
    if (target.sprite && Array.isArray(target.sprite[field])) return target.sprite[field];
    return [];
};

const projectAssets = vm => {
    const seen = new Map();
    const targets = (vm && vm.runtime && vm.runtime.targets) || [];
    targets.forEach(target => {
        if (!target || target.isOriginal === false) return;
        listOf(target, 'getCostumes', 'costumes')
            .concat(listOf(target, 'getSounds', 'sounds'))
            .forEach(item => {
                const asset = item && item.asset;
                const md5ext = md5extOf(asset);
                if (!md5ext || seen.has(md5ext) || !asset.data) return;
                seen.set(md5ext, {md5ext, dataFormat: asset.dataFormat, data: asset.data});
            });
    });
    return Array.from(seen.values());
};

const toBytes = value => {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new TextEncoder().encode(String(value));
};

const streamBytes = (bytes, transform) => new Response(
    new Blob([bytes]).stream()
        .pipeThrough(transform)
).arrayBuffer()
    .then(buffer => new Uint8Array(buffer));

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = bytes => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const STORED_BLOCK = 0xffff;

const storedGzip = bytes => {
    const blocks = Math.max(1, Math.ceil(bytes.length / STORED_BLOCK));
    const out = new Uint8Array(10 + bytes.length + (blocks * 5) + 8);
    out.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff]);
    let at = 10;
    for (let b = 0; b < blocks; b++) {
        const start = b * STORED_BLOCK;
        const len = Math.min(STORED_BLOCK, bytes.length - start);
        out[at] = b === blocks - 1 ? 1 : 0;
        out[at + 1] = len & 0xff;
        out[at + 2] = len >>> 8;
        out[at + 3] = ~len & 0xff;
        out[at + 4] = (~len >>> 8) & 0xff;
        out.set(bytes.subarray(start, start + len), at + 5);
        at += 5 + len;
    }
    const view = new DataView(out.buffer);
    view.setUint32(at, crc32(bytes), true);
    view.setUint32(at + 4, bytes.length >>> 0, true);
    return out;
};

const gzip = text => {
    const bytes = toBytes(text);
    if (typeof CompressionStream === 'undefined') return Promise.resolve(storedGzip(bytes));
    return streamBytes(bytes, new CompressionStream('gzip'));
};

const isGzip = bytes => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

const gunzipText = bytes => {
    const raw = toBytes(bytes);
    if (isGzip(raw) && typeof DecompressionStream === 'undefined') return Promise.reject(snapshotError('no-gunzip'));
    const plain = isGzip(raw) ? streamBytes(raw, new DecompressionStream('gzip')) : Promise.resolve(raw);
    return plain.then(out => new TextDecoder().decode(out));
};

const sha256Hex = value => {
    const subtle = typeof crypto === 'undefined' ? null : crypto.subtle;
    if (!subtle) return Promise.reject(snapshotError('no-crypto'));
    return subtle.digest('SHA-256', toBytes(value)).then(buffer => Array.from(new Uint8Array(buffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join(''));
};

const readJSON = response => {
    if (!response.ok) {
        const error = snapshotError('http', String(response.status));
        error.status = response.status;
        return response.json().then(body => {
            error.body = body;
            throw error;
        }, () => {
            throw error;
        });
    }
    return response.json().catch(() => ({}));
};

const missingAssetsOf = error => (error && error.status === 409 && error.body &&
    error.body.error === 'missing-assets' && Array.isArray(error.body.missing) ? error.body.missing : null);

const missingFrom = (reply, asked) => {
    if (reply && Array.isArray(reply.missing)) return reply.missing.filter(name => asked.includes(name));
    if (reply && Array.isArray(reply.have)) return asked.filter(name => !reply.have.includes(name));
    return asked.slice();
};

const runPool = (items, limit, work) => {
    let next = 0;
    const lane = () => {
        if (next >= items.length) return Promise.resolve();
        const item = items[next++];
        return work(item).then(lane);
    };
    const lanes = [];
    for (let i = 0; i < Math.min(limit, items.length); i++) lanes.push(lane());
    return Promise.all(lanes);
};

const createSnapshotHttp = ({slug, base, fetchImpl, concurrency}) => {
    const root = base || '';
    const known = new Set();
    const run = (path, init) => (fetchImpl || fetch)(`${root}${path}`, Object.assign({
        credentials: 'include'
    }, init, {
        headers: Object.assign({'x-squiggle': '1'}, init && init.headers)
    }));
    const roomPath = `/api/rooms/${encodeURIComponent(slug)}`;

    const putAsset = asset => {
        const bytes = toBytes(asset.data);
        if (bytes.length > ASSET_MAX_BYTES) return Promise.reject(snapshotError('asset-too-big', asset.md5ext));
        return run(`/api/assets/${asset.md5ext}?room=${encodeURIComponent(slug)}`, {
            method: 'PUT',
            headers: {'content-type': CONTENT_TYPES[asset.dataFormat] || 'application/octet-stream'},
            body: bytes
        })
            .then(readJSON)
            .then(() => {
                known.add(asset.md5ext);
            });
    };

    const uploadAssets = assets => {
        const fresh = assets.filter(asset => MD5EXT.test(asset.md5ext) && !known.has(asset.md5ext));
        if (!fresh.length) return Promise.resolve({asked: 0, sent: 0});
        const asked = fresh.map(asset => asset.md5ext);
        return run('/api/assets/have', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({md5ext: asked})
        })
            .then(readJSON)
            .then(reply => {
                const missing = new Set(missingFrom(reply, asked));
                asked.forEach(name => {
                    if (!missing.has(name)) known.add(name);
                });
                const send = fresh.filter(asset => missing.has(asset.md5ext));
                return runPool(send, concurrency || ASSET_CONCURRENCY, putAsset)
                    .then(() => ({asked: asked.length, sent: send.length}));
            });
    };

    const uploadProject = json => gzip(json).then(body => {
        if (body.length > PROJECT_MAX_BYTES) throw snapshotError('project-too-big', String(body.length));
        return run(`${roomPath}/pj`, {
            method: 'PUT',
            headers: {'content-type': 'application/json', 'content-encoding': 'gzip'},
            body
        })
            .then(readJSON)
            .then(reply => {
                if (!reply || typeof reply.sha !== 'string' || !reply.sha) throw snapshotError('no-sha');
                return {sha: reply.sha, size: typeof reply.size === 'number' ? reply.size : body.length};
            });
    });

    const upload = (vm, text) => {
        const json = typeof text === 'string' ? text : vm.toJSON();
        const assets = projectAssets(vm);
        const send = () => uploadAssets(assets).then(() => uploadProject(json));
        return send()
            .catch(error => {
                const missing = missingAssetsOf(error);
                if (!missing) throw error;
                missing.forEach(name => known.delete(String(name).toLowerCase()));
                return send();
            })
            .then(result => Object.assign({json}, result));
    };

    const fetchProject = sha => {
        if (typeof sha !== 'string' || !/^[0-9a-f]{16,64}$/.test(sha)) {
            return Promise.reject(snapshotError('bad-sha'));
        }
        return run(`${roomPath}/pj/${sha}`, {method: 'GET'}).then(response => {
            if (!response.ok) {
                const error = snapshotError('http', String(response.status));
                error.status = response.status;
                throw error;
            }
            return response.arrayBuffer();
        })
            .then(gunzipText);
    };

    const assetUrl = asset => `${root}/api/assets/${md5extOf(asset)}`;

    return {
        known,
        uploadAssets,
        uploadProject,
        upload,
        fetchProject,
        assetUrl
    };
};

const storesAttached = new WeakSet();

const attachAssetStore = (storage, http) => {
    if (!storage || typeof storage.addWebStore !== 'function' || storesAttached.has(storage)) return false;
    const types = storage.AssetType || {};
    const kinds = [types.ImageVector, types.ImageBitmap, types.Sound].filter(Boolean);
    if (!kinds.length) return false;
    storage.addWebStore(kinds, asset => http.assetUrl(asset));
    storesAttached.add(storage);
    return true;
};

export {
    ASSET_MAX_BYTES,
    MD5EXT,
    PROJECT_MAX_BYTES,
    SNAPSHOT_FIELDS,
    attachAssetStore,
    createSnapshotHttp,
    gunzipText,
    gzip,
    projectAssets,
    sha256Hex,
    snapshotFrame,
    storedGzip
};
