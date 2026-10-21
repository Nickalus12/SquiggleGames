import {register, createRequire} from 'node:module';

register('./collab-test-loader.mjs', import.meta.url);
process.removeAllListeners('warning');

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');

vmLog.warn = () => {};
vmLog.info = () => {};
vmLog.error = () => {};

const {gunzipText, sha256Hex, gzip} = await import('./snapshot-http.js');
const {gameFlags} = await import('../rules/flags.js');
const {projectHashes} = await import('./hash.js');

const only = process.argv[2] || '';
const realTimeout = globalThis.setTimeout;
const STEP = 10;

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
const section = async (name, fn) => {
    if (only && name !== only) return;
    console.log(`\n${name}`);
    await fn();
};

const noop = () => {};
const noopObject = base => new Proxy(base, {
    get: (target, key) => {
        if (key in target) return target[key];
        if (key === 'then' || typeof key === 'symbol') return undefined;
        return noop;
    }
});

const makeClock = () => {
    let t = 1700000000000;
    const timers = new Map();
    const add = (fn, ms, every) => {
        const wait = Math.max(0, Number(ms) || 0);
        const handle = {ref: () => handle, unref: () => handle, hasRef: () => false};
        timers.set(handle, {fn, at: t + wait, every: every ? Math.max(1, wait) : 0});
        return handle;
    };
    return {
        now: () => t,
        setTimeout: (fn, ms, ...args) => add(() => fn(...args), ms, false),
        setInterval: (fn, ms, ...args) => add(() => fn(...args), ms, true),
        clear: handle => timers.delete(handle),
        advance (ms) {
            const end = t + ms;
            for (;;) {
                let next = null;
                timers.forEach((timer, key) => {
                    if (timer.at <= end && (!next || timer.at < next.timer.at)) next = {key, timer};
                });
                if (!next) break;
                t = Math.max(t, next.timer.at);
                if (next.timer.every) next.timer.at += next.timer.every;
                else timers.delete(next.key);
                next.timer.fn();
            }
            t = end;
        }
    };
};

let current = null;
globalThis.setTimeout = (fn, ms, ...args) => current.clock.setTimeout(fn, ms, ...args);
globalThis.setInterval = (fn, ms, ...args) => current.clock.setInterval(fn, ms, ...args);
globalThis.clearTimeout = handle => current && current.clock.clear(handle);
globalThis.clearInterval = handle => current && current.clock.clear(handle);
Date.now = () => current.clock.now();

const yieldReal = () => new Promise(resolve => realTimeout(resolve, 0));
const settle = async (ms = 0) => {
    for (let spent = 0; spent < ms; spent += STEP) {
        await yieldReal();
        current.clock.advance(Math.min(STEP, ms - spent));
    }
    await yieldReal();
    current.clock.advance(0);
    await yieldReal();
};
const waitFor = async (cond, budget = 5000) => {
    for (let spent = 0; ; spent += STEP) {
        if (await cond()) return true;
        if (spent >= budget) return false;
        await yieldReal();
        current.clock.advance(STEP);
    }
};
const pump = async promise => {
    let done = false;
    const result = Promise.resolve(promise).finally(() => {
        done = true;
    });
    while (!done) {
        await yieldReal();
        current.clock.advance(STEP);
    }
    return result;
};

globalThis.fetch = async (url, init) => {
    const fx = current;
    fx.calls.push({url, method: init.method, headers: init.headers, body: init.body});
    const path = url.replace('https://sq.test', '');
    if (fx.hold && fx.hold.match.test(path)) await fx.hold.wait;
    if (fx.status[path]) return new Response('', {status: fx.status[path]});
    if (path === '/api/assets/have') return Response.json({missing: JSON.parse(init.body).md5ext});
    if (/^\/api\/assets\//.test(path)) return Response.json({ok: true});
    if (init.method === 'PATCH') return Response.json({});
    if (/\/rules$/.test(path) && init.method === 'PUT') {
        fx.rulesPuts.push(JSON.parse(init.body));
        return Response.json({hash: JSON.parse(init.body).hash, ok: true, errors: []});
    }
    if (/\/pj$/.test(path) && init.method === 'PUT') {
        const text = await gunzipText(init.body);
        const sha = await sha256Hex(text);
        fx.pages.set(sha, init.body);
        return Response.json({sha, size: text.length});
    }
    const get = path.match(/\/pj\/([0-9a-f]+)$/);
    if (get) return fx.pages.has(get[1]) ? new Response(fx.pages.get(get[1])) : new Response('', {status: 404});
    return new Response('', {status: 404});
};

globalThis.WebSocket = class {
    constructor (url) {
        if (current.socketRefused) throw new Error('refused');
        this.url = url;
        this.sent = [];
        this.closed = null;
        current.gameSockets.push(this);
    }
    send (text) {
        this.sent.push(JSON.parse(text));
    }
    close (code) {
        this.closed = code;
        this.onclose({code});
    }
    deliver (msg) {
        this.onmessage({data: JSON.stringify(msg)});
    }
};
globalThis.document = noopObject({
    hidden: false, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null
});
globalThis.localStorage = {getItem: () => null, setItem: noop};
globalThis.location = {port: '', hostname: 'sq.test', search: '', hash: ''};
globalThis.__collabStubs = {};

const stage = extra => Object.assign({
    isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0
}, extra);
const sprite = name => ({
    isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
});
const project = names => JSON.stringify({
    targets: [stage()].concat(names.map(sprite)),
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});
const flagHat = (x, y) => ({opcode: 'event_whenflagclicked', next: null, parent: null, inputs: {}, fields: {},
    shadow: false, topLevel: true, x, y});
const moveBlock = () => ({opcode: 'motion_movesteps', next: null, parent: null, inputs: {STEPS: [1, [4, '10']]},
    fields: {}, shadow: false, topLevel: true, x: 0, y: 0});

const welcome = extra => Object.assign({
    id: 'me', role: 'owner', canEdit: true, room: 'blue fox', title: 'Blue fox',
    peers: [{id: 'me'}], projects: [], version: 0, hasSnapshot: false, gameVars: {}, color: '#fff'
}, extra);

let fixtures = 0;
const fixture = async ({names = ['Cat']} = {}) => {
    for (let i = 0; i < 5; i++) await yieldReal();
    fixtures += 1;
    const key = String(fixtures);
    const listeners = new Map();
    const sent = [];
    const banners = [];
    const notes = [];
    const client = noopObject({
        connected: true,
        generation: 1,
        holdingQueue: false,
        session: {name: 'Tester', room: 'blue fox', url: 'wss://sq.test'},
        on: (type, cb) => listeners.set(type, cb),
        send: msg => {
            sent.push(msg);
            return true;
        }
    });
    const overlay = noopObject({
        peers: new Map(),
        self: null,
        setSelf: (name, color, room, extra) => {
            overlay.self = Object.assign({name, color, room}, extra);
        },
        banner: (text, opts) => banners.push({text, opts})
    });
    const fx = {
        clock: makeClock(),
        listeners,
        sent,
        banners,
        notes,
        client,
        overlay,
        pages: new Map(),
        calls: [],
        status: {},
        rulesPuts: [],
        hold: null,
        gameSockets: [],
        socketRefused: false,
        webStores: []
    };
    current = fx;
    gameFlags.serverReady = false;
    globalThis.window = noopObject({addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true});
    globalThis.__collabStubs[key] = {
        './client': client,
        './overlay': overlay,
        './login': Object.assign(() => Promise.resolve({url: 'wss://sq.test/ws', room: 'blue fox', name: 'Tester'}), {
            apiBase: () => 'https://sq.test'
        }),
        './moderated': noopObject({}),
        './paint-merge': noopObject({}),
        '@turbowarp/paper': noopObject({}),
        '../../components/squiggle-only-notice': {showPortabilityNote: target => notes.push(target)},
        '../log': {error: noop, warn: noop, info: noop, log: noop}
    };
    const vm = new VM();
    vm.runtime.storage = {
        AssetType: {ImageVector: 'svg-type', ImageBitmap: 'png-type', Sound: 'sound-type', SoundWav: 'wav-type'},
        loads: [],
        load: (type, id, fmt) => {
            vm.runtime.storage.loads.push(`${id}.${fmt}`);
            return Promise.resolve({assetId: id, dataFormat: fmt, data: new Uint8Array([1, 2, 3])});
        },
        addWebStore: (types, getUrl) => fx.webStores.push({types, getUrl}),
        scratchFetch: {setMetadata: noop, RequestMetadata: {}}
    };
    await pump(vm.loadProject(project(names)));
    fx.vm = vm;
    fx.collab = (await import(`./index.js?fixture=${key}`)).default;
    await pump(fx.collab.init(vm, {}));
    fx.emit = (type, msg) => listeners.get(type)(msg);
    fx.snapshots = () => sent.filter(m => m && m.type === 'snapshot');
    fx.puts = () => fx.calls.filter(c => c.method === 'PUT' && /\/pj$/.test(c.url));
    fx.gets = () => fx.calls.filter(c => c.method === 'GET');
    fx.named = name => vm.runtime.targets.find(t => t.getName && t.getName() === name);
    fx.has = name => Boolean(fx.named(name));
    return fx;
};

const welcome2 = async (fx, rs = 10) => {
    fx.client.rs = rs;
    fx.emit('welcome', welcome({proto: 2}));
    const seeded = await waitFor(() => fx.snapshots().length === 1);
    const frame = fx.snapshots()[0];
    if (seeded) fx.emit('snapshot-ack', {ref: frame.ref, version: 1});
    await settle();
    return frame;
};

const publish = async (fx, text) => {
    const sha = await sha256Hex(text);
    fx.pages.set(sha, await gzip(text));
    return sha;
};

const addRules = async fx => {
    const rules = sprite('Game Rules');
    rules.extensionStorage = {together: {role: 'rules', v: 1}};
    rules.blocks = {hat: flagHat(0, 0)};
    await pump(fx.vm.addSprite(JSON.stringify(rules)).catch(() => null));
    const changes = [];
    fx.collab.attachWorkspace(noopObject({
        addChangeListener: fn => changes.push(fn),
        getParentSvg: () => null
    }), {});
    const target = () => fx.vm.runtime.targets.find(t => t.isOriginal && t.getName() === 'Game Rules');
    let edits = 0;
    const edit = () => {
        edits += 1;
        const id = `edit${edits}`;
        fx.vm.setEditingTarget(target().id);
        target().blocks.createBlock(Object.assign({id}, flagHat(edits * 10, 0)));
        changes.forEach(fn => fn({type: 'create', toJson: () => ({type: 'create', blockId: id})}));
    };
    return {target, edit};
};

const replayWelcome = (fx, version, snap) => fx.emit('welcome', welcome({proto: 2, replay: true, rs: snap.atSeq + 5,
    hasSnapshot: true, peers: [{id: 'me'}, {id: 'pal'}], version, snap}));

await section('welcome with proto 2 seeds the room over http', async () => {
    const fx = await fixture();
    const {vm, snapshots, puts, webStores} = fx;
    fx.client.rs = 10;
    fx.emit('welcome', welcome({proto: 2}));
    ok('the frame goes out', await waitFor(() => snapshots().length === 1), fx.sent);
    const frame = snapshots()[0] || {};
    ok('it claims the room seq we have applied', frame.atSeq === 10, frame);
    ok('it carries the sha and no project bytes', typeof frame.sha === 'string' && !('b64' in frame), frame);
    ok('the sha is the project text hash', frame.sha === await sha256Hex(vm.toJSON()));
    ok('it carries the size and the ref', typeof frame.size === 'number' && typeof frame.ref === 'number');
    ok('it is based on the welcome version', frame.basedOn === 0);
    ok('it carries the manifest hash of every target', JSON.stringify(frame.hashes) ===
        JSON.stringify(await projectHashes(vm.toJSON())), frame.hashes);
    ok('the project went up gzipped first', puts().length === 1 && puts()[0].headers['content-encoding'] === 'gzip');
    ok('the asset store points at the server once',
        webStores.length === 1 && webStores[0].getUrl({assetId: 'a'.repeat(32), dataFormat: 'png'}) ===
            `https://sq.test/api/assets/${'a'.repeat(32)}.png`);
});

await section('an unchanged project is not sent again', async () => {
    const fx = await fixture();
    const {vm, snapshots, puts} = fx;
    await welcome2(fx);
    const frames = snapshots().length;
    const uploads = puts().length;
    fx.emit('server-restarting', {});
    await settle(100);
    ok('nothing goes out for an unchanged project', snapshots().length === frames && puts().length === uploads,
        [snapshots().length - frames, puts().length - uploads]);
    vm.renameSprite(fx.named('Cat').id, 'Lynx');
    fx.emit('server-restarting', {});
    ok('the next change goes out', await waitFor(() => snapshots().length === frames + 1), snapshots().length - frames);
    ok('only the change was uploaded', puts().length === uploads + 1, puts().length - uploads);
    ok('only the change was framed', snapshots()[frames].sha === await sha256Hex(vm.toJSON()));
});

await section('our own snapshot echoed back is not fetched', async () => {
    const fx = await fixture();
    const own = (await welcome2(fx)).sha;
    fx.emit('snapshot', {type: 'snapshot', sha: own, version: 1});
    await settle();
    ok('no fetch for our own sha', fx.gets().length === 0, fx.gets());
});

await section('a snapshot by sha loads from the server', async () => {
    const fx = await fixture();
    await welcome2(fx);
    const sha = await publish(fx, project(['Dog']));
    fx.emit('snapshot', {type: 'snapshot', sha, version: 2, author: 'server'});
    ok('the project loads', await waitFor(() => fx.has('Dog')));
    ok('it was fetched by sha', fx.gets().length === 1 && fx.gets()[0].url.endsWith(`/pj/${sha}`), fx.gets());
    fx.emit('snapshot', {type: 'snapshot', sha, version: 2});
    await settle();
    ok('a repeat of it is skipped', fx.gets().length === 1);
});

await section('a refused send rescues to the library by sha', async () => {
    const fx = await fixture();
    const {vm, sent, banners, pages} = fx;
    await welcome2(fx);
    vm.renameSprite(fx.named('Cat').id, 'Puppy');
    const local = vm.toJSON();
    const sha = await publish(fx, project(['Owl']));
    fx.emit('snapshot-refused', {reason: 'stale', ref: 99, sha, roomVersion: 3});
    ok('the room version loads', await waitFor(() => fx.has('Owl')));
    const save = sent.find(m => m && m.type === 'save-project');
    ok('save-project carries the sha of the local copy', save && save.sha === await sha256Hex(local), save);
    ok('and no project bytes', save && !('b64' in save));
    ok('the local copy is on the server', save && pages.has(save.sha));
    ok('no download banner when the save went out', !banners.some(b => /replaced/.test(b.text || '')), banners);
});

await section('offline, the rescue is a download', async () => {
    const fx = await fixture();
    const {vm, sent, banners, client} = fx;
    await welcome2(fx);
    vm.renameSprite(fx.named('Cat').id, 'Wren');
    const sha = await publish(fx, project(['Owl']));
    client.connected = false;
    fx.emit('snapshot-refused', {reason: 'stale', ref: 98, sha, roomVersion: 3});
    ok('the room version loads', await waitFor(() => fx.has('Owl')));
    client.connected = true;
    ok('the local copy is offered as a download', banners.some(b => /replaced/.test(b.text || '')), banners);
    ok('no save-project while offline', !sent.some(m => m && m.type === 'save-project'));
});

await section('a missing sha asks for a resync', async () => {
    const fx = await fixture();
    await welcome2(fx);
    const before = fx.sent.length;
    const logError = console.error;
    const logWarn = console.warn;
    console.error = noop;
    console.warn = noop;
    fx.emit('snapshot', {type: 'snapshot', sha: 'e'.repeat(64), version: 4, author: 'server'});
    const resynced = await waitFor(() => fx.sent.slice(before).some(m => m && m.type === 'resync'));
    console.error = logError;
    console.warn = logWarn;
    ok('the failure requests the project again', resynced, fx.sent.slice(before));
});

await section('a builtin extension travels as a vm-action', async () => {
    const fx = await fixture();
    const {vm, sent, snapshots, calls} = fx;
    await welcome2(fx);
    fx.overlay.peers.set('pal', {id: 'pal'});
    const before = sent.length;
    vm.extensionManager.loadExtensionIdSync('pen');
    const relayed = sent.slice(before).find(m => m && m.type === 'vm-action');
    ok('the extension id is relayed', relayed && relayed.action === 'extensionAdd' && relayed.id === 'pen',
        sent.slice(before));

    const count = sent.length;
    fx.emit('vm-action', {type: 'vm-action', action: 'extensionAdd', id: 'music', from: 'pal'});
    ok('a remote extension loads', vm.extensionManager.isExtensionLoaded('music'));
    ok('and is not relayed back', !sent.slice(count).some(m => m && m.type === 'vm-action'));
    fx.emit('vm-action', {type: 'vm-action', action: 'extensionAdd', id: 'https://evil.test/x.js', from: 'pal'});
    ok('a url is never loaded', !vm.extensionManager.isExtensionLoaded('https://evil.test/x.js'));

    const before2 = sent.length;
    await pump(vm.addSprite(JSON.stringify(sprite('Bee'))).catch(() => null));
    const add = await waitFor(() => sent.slice(before2).some(m => m && m.action === 'spriteAdd')) &&
        sent.slice(before2).find(m => m && m.action === 'spriteAdd');
    ok('a new sprite travels as json', add && add.format === 'json' && JSON.parse(add.sprite).name === 'Bee', add);

    fx.emit('vm-action', {type: 'vm-action', action: 'spriteAdd', format: 'json', sprite: JSON.stringify(sprite('Ant')),
        name: 'Ant', from: 'pal', fromName: 'Pal'});
    ok('a json sprite from a peer installs', await waitFor(() => fx.has('Ant')));

    const whale = sprite('Whale');
    whale.variables = {big: ['big', 'w'.repeat(1100 * 1024)]};
    const before4 = sent.length;
    const frames4 = snapshots().length;
    await pump(vm.addSprite(JSON.stringify(whale)).catch(() => null));
    ok('a sprite over 1 MiB goes as a full snapshot instead',
        await waitFor(() => snapshots().length > frames4 && !snapshots()[snapshots().length - 1].cacheOnly, 30000),
        snapshots().length - frames4);
    ok('and never as a spriteAdd', !sent.slice(before4).some(m => m && m.action === 'spriteAdd'));
    vm.deleteSprite(fx.named('Whale').id);

    const soundId = 'b'.repeat(32);
    const before3 = sent.length;
    await pump(vm.addSound({
        name: 'buzz', dataFormat: 'wav', assetId: soundId, md5: `${soundId}.wav`,
        asset: {assetId: soundId, dataFormat: 'wav', data: new Uint8Array([9, 9])}
    }, fx.named('Bee').id));
    const soundAdd = await waitFor(() => sent.slice(before3).some(m => m && m.action === 'soundAdd')) &&
        sent.slice(before3).find(m => m && m.action === 'soundAdd');
    ok('a new sound travels by md5ext', soundAdd && soundAdd.md5ext === `${soundId}.wav` && !('data' in soundAdd),
        soundAdd);
    ok('its bytes went up first', calls.some(c => c.method === 'PUT' &&
        c.url.endsWith(`/api/assets/${soundId}.wav?room=blue%20fox`)));

    const ant = fx.named('Ant');
    const peerId = 'c'.repeat(32);
    fx.emit('vm-action', {type: 'vm-action', action: 'soundAdd', target: 'Ant',
        sound: {name: 'chirp', dataFormat: 'wav'}, md5ext: `${peerId}.wav`, from: 'pal'});
    ok('a peer sound loads from the asset store',
        await waitFor(() => ant.getSounds().some(snd => snd.name === 'chirp')), ant.getSounds().map(snd => snd.name));
    ok('by its md5ext', vm.runtime.storage.loads.includes(`${peerId}.wav`), vm.runtime.storage.loads);
    const quietError = console.error;
    console.error = noop;
    fx.emit('vm-action', {type: 'vm-action', action: 'soundAdd', target: 'Ant', sound: {name: 'bad', dataFormat: 'wav'},
        md5ext: '../../x.wav', from: 'pal'});
    await settle();
    console.error = quietError;
    ok('a malformed md5ext is never loaded', !vm.runtime.storage.loads.some(id => id.includes('..')));
});

await section('a project over the limit shows the too-big banner', async () => {
    const fx = await fixture();
    const {vm, banners, snapshots} = fx;
    await welcome2(fx);
    fx.status['/api/rooms/blue%20fox/pj'] = 413;
    const frames = snapshots().length;
    vm.renameSprite(fx.named('Cat').id, 'Hawk');
    fx.emit('server-restarting', {});
    ok('the banner says it is too big', await waitFor(() => banners.some(b => /too big/.test(b.text || ''))), banners);
    ok('no frame without an upload', snapshots().length === frames);
});

await section('a refused save shows why and stops retrying', async () => {
    const fx = await fixture();
    const {vm, banners, puts} = fx;
    await welcome2(fx);
    fx.status['/api/rooms/blue%20fox/pj'] = 403;
    const putsBefore = puts().length;
    const cat = fx.named('Cat');
    vm.renameSprite(cat.id, 'Kite');
    fx.emit('server-restarting', {});
    ok('the banner says why', await waitFor(() => banners.some(b => /cannot save in this room/.test(b.text || ''))),
        banners);
    const afterFirst = puts().length;
    ok('it tried once', afterFirst === putsBefore + 1, afterFirst - putsBefore);
    vm.renameSprite(cat.id, 'Cat');
    fx.emit('server-restarting', {});
    await settle(100);
    ok('a later edit does not put again', puts().length === afterFirst, puts().length - afterFirst);
    ok('the banner shows once', banners.filter(b => /cannot save/.test(b.text || '')).length === 1, banners.length);
});

await section('a v1 room keeps the b64 frame', async () => {
    const fx = await fixture();
    const {vm, snapshots} = fx;
    await welcome2(fx);
    fx.emit('welcome', welcome({proto: 1, hasSnapshot: true, peers: [{id: 'me'}, {id: 'pal'}]}));
    await settle();
    const frames = snapshots().length;
    vm.renameSprite(fx.named('Cat').id, 'Eagle');
    fx.emit('server-restarting', {});
    ok('a b64 frame goes out', await waitFor(() => snapshots().length > frames), snapshots().length - frames);
    const frame = snapshots()[snapshots().length - 1];
    ok('it carries b64 and no sha', typeof frame.b64 === 'string' && !('sha' in frame), Object.keys(frame));
});

await section('a reconnect welcome with a pointer loads it', async () => {
    const fx = await fixture();
    await welcome2(fx);
    const text = project(['Fox']);
    const sha = await publish(fx, text);
    fx.emit('welcome', welcome({proto: 2, hasSnapshot: true, peers: [{id: 'me'}, {id: 'pal'}], version: 9,
        snap: {sha, size: text.length, version: 9, atSeq: 0, hashes: {}}}));
    ok('the pointed project loads', await waitFor(() => fx.has('Fox')));
});

await section('a replay welcome keeps the local project and checks drift', async () => {
    const fx = await fixture({names: ['Fox']});
    const {vm, sent} = fx;
    await welcome2(fx, 20);
    const hashes = await projectHashes(vm.toJSON());
    const headSha = 'f'.repeat(64);
    const getsBefore = fx.gets().length;
    const sentBefore = sent.length;
    replayWelcome(fx, 10, {sha: headSha, size: 10, version: 10, atSeq: 20, hashes});
    await settle();
    ok('matching hashes ask for nothing', !sent.slice(sentBefore).some(m => m && m.type === 'resync') &&
        fx.gets().length === getsBefore);
    fx.clock.advance(60000);
    const logWarn = console.warn;
    console.warn = noop;
    replayWelcome(fx, 10, {sha: headSha, size: 10, version: 10, atSeq: 20,
        hashes: Object.assign({}, hashes, {Fox: '0'.repeat(64)})});
    const resynced = await waitFor(() => sent.slice(sentBefore).some(m => m && m.type === 'resync'));
    console.warn = logWarn;
    ok('a drifted target asks the room for a resync', resynced);
    ok('it asks once', sent.slice(sentBefore).filter(m => m && m.type === 'resync').length === 1);
    ok('the head is fetched once to repair the drift', fx.gets().length === getsBefore + 1,
        fx.gets().slice(getsBefore));
    ok('the local project is kept', fx.has('Fox'));
});

const driftWelcome = async (fx, remote, label) => {
    const text = JSON.stringify(remote);
    const sha = await publish(fx, text);
    const hashes = await projectHashes(text);
    fx.clock.advance(600000);
    const sentBefore = fx.sent.length;
    fx.client.rs = 30;
    replayWelcome(fx, 11, {sha, size: text.length, version: 11, atSeq: 30, hashes});
    const repaired = await waitFor(async () => (await projectHashes(fx.vm.toJSON())).Fox === hashes.Fox);
    await settle();
    ok(`${label}: the drifted target matches the head`, repaired);
    const after = fx.sent.slice(sentBefore).filter(m => m && m.type !== 'presence');
    ok(`${label}: nothing is relayed and no resync is asked`, after.length === 0, after);
};

const foxOf = json => json.targets.find(t => t.name === 'Fox');

await section('a replay welcome repairs a target whose blocks drifted', async () => {
    const fx = await fixture({names: ['Fox']});
    await welcome2(fx, 30);
    const remote = JSON.parse(fx.vm.toJSON());
    foxOf(remote).blocks = {a: moveBlock()};
    const foxId = fx.named('Fox').id;
    await driftWelcome(fx, remote, 'blocks');
    const fox = fx.named('Fox');
    ok('the target keeps its id', fox.id === foxId);
    ok('the block is on the target', Object.values(fox.blocks._blocks).some(b => b.opcode === 'motion_movesteps'));
});

await section('a replay welcome replaces a target that drifted beyond its blocks', async () => {
    const fx = await fixture({names: ['Fox']});
    await welcome2(fx, 30);
    const remote = JSON.parse(fx.vm.toJSON());
    foxOf(remote).variables = {score: ['score', 3]};
    foxOf(remote).blocks = {a: moveBlock()};
    const foxId = fx.named('Fox').id;
    const count = fx.vm.runtime.targets.length;
    await driftWelcome(fx, remote, 'target');
    const fox = fx.named('Fox');
    ok('the replaced target keeps its id', fox && fox.id === foxId, fox && fox.id);
    ok('the head variable is on it', fox && fox.variables.score && fox.variables.score.value === 3);
    ok('no target is added or lost', fx.vm.runtime.targets.length === count, fx.vm.runtime.targets.length);
    ok('the blocks came across too', Object.values(fox.blocks._blocks).some(b => b.opcode === 'motion_movesteps'));
});

await section('with no room seq the snapshot still claims atSeq 0', async () => {
    const fx = await fixture();
    const {snapshots} = fx;
    await welcome2(fx);
    fx.client.rs = null;
    const frames = snapshots().length;
    fx.vm.renameSprite(fx.named('Cat').id, 'Vixen');
    fx.emit('server-restarting', {});
    ok('a frame goes out', await waitFor(() => snapshots().length > frames), snapshots().length - frames);
    const frame = snapshots()[snapshots().length - 1];
    ok('it carries atSeq 0', frame && frame.atSeq === 0, frame);
});

await section('the green flag puts the rules', async () => {
    const fx = await fixture();
    const {vm, rulesPuts, calls} = fx;
    await welcome2(fx);
    await addRules(fx);
    vm.runtime.emit('PROJECT_START');
    ok('a rules PUT goes to the room', await waitFor(() => rulesPuts.length === 1), rulesPuts.length);
    const put = rulesPuts[0] || {};
    ok('it carries an integer opcodeSet matching the mark', put.opcodeSet === 1 &&
        put.sprite && put.sprite.extensionStorage.together.opcodeSet === 1, put.opcodeSet);
    ok('it hashes like the server', put.hash === await (await import('../rules/hash.js'))
        .hashRules(put.sprite, put.opcodeSet, put.levels));
    ok('the url names the room', calls.some(c => c.method === 'PUT' &&
        c.url === 'https://sq.test/api/rooms/blue%20fox/rules'));
    ok('the project is stamped after the PUT', await waitFor(() => vm.runtime.extensionStorage.together &&
        vm.runtime.extensionStorage.together.rulesHash === put.hash));
    await settle(20);
    ok('no game socket opens while the game server is off', fx.gameSockets.length === 0, fx.gameSockets.length);
    vm.runtime.emit('PROJECT_STOP_ALL');
});

await section('the green flag opens the game socket', async () => {
    const fx = await fixture();
    const {vm, sent, rulesPuts, gameSockets} = fx;
    await welcome2(fx);
    const rules = await addRules(fx);
    gameFlags.serverReady = true;
    vm.runtime.emit('PROJECT_START');
    const net = globalThis.window.SquiggleNet;
    ok('the rules start opens the room game socket', await waitFor(() => gameSockets.length === 1) &&
        gameSockets[0].url === 'wss://sq.test/ws/room/blue%20fox/game', gameSockets.map(g => g.url));
    const ws = gameSockets[0];
    ws.onopen();
    ok('it joins with proto 2', ws.sent[0] && ws.sent[0].type === 'join' && ws.sent[0].proto === 2, ws.sent);
    ok('the bridge reports the game', net.inGame === true);
    ws.deliver({type: 'welcome', slot: 1, ack: 0, mode: 'rules', tickHz: 20});
    ok('the bridge reports the slot', net.slot === 1);
    ok('and the mode and tick rate', net.mode === 'rules' && net.tickHz === 20, [net.mode, net.tickHz]);
    const ticks = [];
    const games = [];
    const offTick = net.onTick(msg => ticks.push(msg));
    const offGame = net.on('game', msg => games.push(msg));
    ws.deliver({type: 'tick', t: 1, kf: 1, v: {score: 2}, y: {names: {2: 'Pal'}}, a: {2: [10, 0, 90, 0, 1, 0]},
        e: [{n: 'hi', v: 'x', f: 2}, {n: 'go', v: '', f: 0}]});
    ok('ticks reach onTick subscribers', ticks.length === 1 && ticks[0].v.score === 2);
    ok('a player message in a tick arrives as a game message with the sender name',
        games.length === 1 && games[0].name === 'hi' && games[0].fromName === 'Pal' && games[0].from === 2, games);
    ws.deliver({type: 'rules-status', hash: 'abc', ok: true, phase: 'compile', errors: []});
    const {rulesStatus} = await import('../rules/status.js');
    ok('rules-status lands in the status store', rulesStatus.get().compile.hash === 'abc');
    const relayed = sent.length;
    net.send({type: 'game', action: 'msg', name: 'jump', value: '1'});
    const ins = () => ws.sent.filter(m => m.type === 'in');
    ok('a Together message goes over the game socket while in a game',
        sent.length === relayed && ins().some(m => (m.g || []).some(op => op.action === 'msg' && op.name === 'jump')),
        ins());
    ok('tell the game goes out as input', net.sendInput({g: {action: 'input', name: 'left', value: ''}}) === true);
    const cat = fx.named('Cat');
    cat.setXY(0, 0);
    ws.deliver({type: 'tick', t: 2, c: [100, 0, 1]});
    ok('a correction over 30 px snaps the own sprite', cat.x === 100, cat.x);
    vm.runtime.emit('AFTER_EXECUTE');
    await settle(60);
    vm.runtime.emit('AFTER_EXECUTE');
    const last = ins().pop();
    ok('the own sprite goes out with the new cid', last && last.a && last.a[0] === 100 && last.cid === 1, last);
    await settle(20);
    const putsInGame = rulesPuts.length;
    rules.edit();
    ok('a rules edit during a game puts the rules again', await waitFor(() => rulesPuts.length === putsInGame + 1),
        rulesPuts.length - putsInGame);
    const toasts = [];
    fx.overlay.toast = text => toasts.push(text);
    fx.emit('game-started', {type: 'game-started', name: 'Pal'});
    ok('a game started by someone else is not announced while in it', toasts.length === 0);
    vm.runtime.emit('PROJECT_STOP_ALL');
    ok('stop closes the game socket', ws.closed === 1000 && net.inGame === false);
    const putsAfterStop = rulesPuts.length;
    rules.edit();
    await settle(700);
    ok('a rules edit outside a game puts nothing', rulesPuts.length === putsAfterStop,
        rulesPuts.length - putsAfterStop);
    fx.emit('game-started', {type: 'game-started', name: 'Pal'});
    ok('otherwise it says how to join', toasts.length === 1 && /Pal started a test game/.test(toasts[0]), toasts);
    fx.emit('game-ended', {type: 'game-ended'});
    fx.emit('role-changed', {type: 'role-changed', role: 'viewer', canEdit: false});
    vm.runtime.emit('PROJECT_START');
    await settle(20);
    ok('a viewer\'s green flag opens nothing while no room game runs', gameSockets.length === 1, gameSockets.length);
    fx.emit('game-started', {type: 'game-started', name: 'Pal'});
    vm.runtime.emit('PROJECT_START');
    ok('once a room game runs the viewer joins it', await waitFor(() => gameSockets.length === 2), gameSockets.length);
    vm.runtime.emit('PROJECT_STOP_ALL');
    offTick();
    offGame();
});

await section('game setup changes travel as kit-set', async () => {
    const fx = await fixture();
    const {vm, sent} = fx;
    await welcome2(fx);
    const rules = (await addRules(fx)).target();
    gameFlags.serverReady = true;
    const {writeSetup} = await import('../rules/setup-model.js');
    const before = sent.length;
    writeSetup(vm, rules, {teams: ['Red', 'Blue']});
    const kitSets = () => sent.slice(before).filter(m => m && m.type === 'kit-set');
    const teams = kitSets().find(m => m.path.join() === 'teams');
    ok('a changed mark key goes out as kit-set', teams && teams.scope === 'target' &&
        teams.targetId === 'Game Rules' && teams.ext === 'together' && teams.value.join() === 'Red,Blue', kitSets());
    ok('one frame per changed key', kitSets().every(m => m.path.length === 1) &&
        new Set(kitSets().map(m => m.path[0])).size === kitSets().length);
    const first = kitSets().length;
    writeSetup(vm, rules, {teams: ['Red', 'Blue']});
    ok('an unchanged mark sends nothing', kitSets().length === first);
    fx.emit('kit-set', {type: 'kit-set', scope: 'target', targetId: 'Game Rules', ext: 'together', path: ['teams'],
        value: ['Green'], from: 'pal', rs: 30});
    ok('an inbound kit-set lands on the mark', rules.extensionStorage.together.teams.join() === 'Green');
    ok('and is not sent back', kitSets().length === first);
});

await section('room settings and appearance go over HTTP', async () => {
    const fx = await fixture();
    const {sent, calls} = fx;
    await welcome2(fx);
    const before = sent.length;
    fx.collab.setRoomTitle('Space race');
    ok('the title is a PATCH on the room', await waitFor(() => calls.some(c => c.method === 'PATCH' &&
        c.url === 'https://sq.test/api/rooms/blue%20fox' && JSON.parse(c.body).title === 'Space race')),
    calls.filter(c => c.method === 'PATCH'));
    fx.collab.setAppearance({color: '#ff8800', style: 'star'});
    const presence = sent.slice(before).find(m => m && m.type === 'presence' && m.color === '#ff8800');
    ok('the colour and cursor ride on presence', presence && presence.cursor === 'star' &&
        typeof presence.status === 'string', sent.slice(before));
    ok('and are kept with a PATCH on /api/me', await waitFor(() => calls.some(c => c.method === 'PATCH' &&
        c.url === 'https://sq.test/api/me' && JSON.parse(c.body).cursor === 'star')));
    ok('no moved frame goes out', !sent.slice(before).some(m => m && /^(appearance|set-room-title)$/.test(m.type)));
});

await section('a first join answered with a replay loads the room', async () => {
    const fx = await fixture();
    const {vm, snapshots, client} = fx;
    const remote = JSON.parse(vm.toJSON());
    remote.targets.push(sprite('Owl'));
    const text = JSON.stringify(remote);
    const sha = await publish(fx, text);
    client.freshJoin = true;
    client.rs = 5;
    replayWelcome(fx, 12, {sha, size: text.length, version: 12, atSeq: 5, hashes: {}});
    ok('the room project loads', await waitFor(() => fx.has('Owl')));
    client.freshJoin = false;
    client.rs = 8;
    const frames = snapshots().length;
    vm.renameSprite(fx.named('Owl').id, 'Barn Owl');
    fx.emit('server-restarting', {});
    ok('a frame goes out', await waitFor(() => snapshots().length > frames), snapshots().length - frames);
    const frame = snapshots()[snapshots().length - 1];
    ok('it is based on the head version', frame && frame.basedOn === 12, frame);
});

await section('a green flag while the room project loads does nothing', async () => {
    const fx = await fixture();
    const {vm, rulesPuts, gameSockets} = fx;
    await welcome2(fx);
    const rules = await addRules(fx);
    gameFlags.serverReady = true;
    const remote = JSON.parse(vm.toJSON());
    remote.targets.push(sprite('Eel'));
    const text = JSON.stringify(remote);
    const sha = await publish(fx, text);
    let release = null;
    fx.hold = {match: new RegExp(`/pj/${sha}$`), wait: new Promise(resolve => {
        release = resolve;
    })};
    fx.emit('welcome', welcome({proto: 2, hasSnapshot: true, peers: [{id: 'me'}, {id: 'pal'}], version: 13,
        snap: {sha, size: text.length, version: 13, atSeq: 8, hashes: {}}}));
    ok('the head is being fetched', await waitFor(() => fx.gets().some(c => fx.hold.match.test(c.url))));
    rules.target().blocks.createBlock(Object.assign({id: 'loading'}, flagHat(0, 100)));
    vm.runtime.emit('PROJECT_START');
    await settle(20);
    ok('no game socket opens', gameSockets.length === 0, gameSockets.length);
    ok('no rules go up', rulesPuts.length === 0, rulesPuts.length);
    release();
    ok('the project still loads', await waitFor(() => fx.has('Eel')));
    fx.hold = null;
    vm.runtime.emit('PROJECT_STOP_ALL');
});

await section('a refused rules PUT or game socket at the green flag is caught', async () => {
    const fx = await fixture();
    const {vm, calls} = fx;
    await welcome2(fx);
    const rules = await addRules(fx);
    gameFlags.serverReady = true;
    const rejections = [];
    const onRejection = reason => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    fx.status['/api/rooms/blue%20fox/rules'] = 500;
    rules.target().blocks.createBlock(Object.assign({id: 'refused'}, flagHat(0, 200)));
    const rulesCalls = () => calls.filter(c => /\/rules$/.test(c.url)).length;
    const putsBefore = rulesCalls();
    vm.runtime.emit('PROJECT_START');
    ok('the PUT is tried', await waitFor(() => rulesCalls() > putsBefore));
    await settle(20);
    ok('no unhandled rejection', rejections.length === 0, rejections.map(String));
    vm.runtime.emit('PROJECT_STOP_ALL');
    fx.socketRefused = true;
    vm.runtime.emit('PROJECT_START');
    await settle(20);
    fx.socketRefused = false;
    ok('a game socket that will not open raises no unhandled rejection', rejections.length === 0,
        rejections.map(String));
    process.off('unhandledRejection', onRejection);
    vm.runtime.emit('PROJECT_STOP_ALL');
});

await section('a project too wide for hashes still saves', async () => {
    const fx = await fixture();
    const {snapshots} = fx;
    await welcome2(fx);
    const names = [];
    for (let i = 0; i < 360; i++) names.push(`${i}`.padStart(128, '€'));
    await pump(fx.vm.loadProject(project(names)));
    const frames = snapshots().length;
    fx.emit('server-restarting', {});
    ok('a frame goes out', await waitFor(() => snapshots().length > frames, 60000), snapshots().length - frames);
    const frame = snapshots()[snapshots().length - 1];
    ok('it carries a sha and no hashes', frame && typeof frame.sha === 'string' && !frame.hashes,
        frame && Object.keys(frame));
});

await section('a 4010 close ends the session with a reload message', async () => {
    const fx = await fixture();
    const {vm, banners, notes} = fx;
    fx.listeners.get('error')({type: 'error', error: 'reload-needed'});
    ok('the reload-needed error frame adds nothing by itself', banners.length === 0, banners);
    fx.emit('reload-needed', {code: 4010, reason: 'please-reload'});
    const ended = banners.find(b => /Reload the page/.test(b.text || ''));
    ok('the banner asks for a reload', Boolean(ended), banners);
    ok('and offers a copy to keep', ended && typeof ended.opts.onAction === 'function');
    vm.saveProjectSb3 = () => Promise.resolve(new Blob(['x']));
    if (ended) ended.opts.onAction();
    ok('saving the copy shows the portability note first', notes.length === 1 && notes[0] === vm, notes.length);
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
