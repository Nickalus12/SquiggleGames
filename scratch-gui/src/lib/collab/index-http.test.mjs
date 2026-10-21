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
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const waitFor = async (cond, ms = 3000) => {
    const end = Date.now() + ms;
    while (!cond()) {
        if (Date.now() > end) return false;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    return true;
};

const noop = () => {};
const noopObject = base => new Proxy(base, {
    get: (target, key) => {
        if (key in target) return target[key];
        if (key === 'then' || typeof key === 'symbol') return undefined;
        return noop;
    }
});

const listeners = new Map();
const sent = [];
const banners = [];
const client = noopObject({
    connected: true,
    generation: 1,
    holdingQueue: false,
    session: {name: 'Tester', room: 'blue fox'},
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

const pages = new Map();
const calls = [];
const status = {};
globalThis.fetch = async (url, init) => {
    calls.push({url, method: init.method, headers: init.headers});
    const path = url.replace('https://sq.test', '');
    if (status[path]) return new Response('', {status: status[path]});
    if (path === '/api/assets/have') return Response.json({missing: JSON.parse(init.body).md5ext});
    if (/^\/api\/assets\//.test(path)) return Response.json({ok: true});
    if (/\/pj$/.test(path) && init.method === 'PUT') {
        const text = await gunzipText(init.body);
        const sha = await sha256Hex(text);
        pages.set(sha, init.body);
        return Response.json({sha, size: text.length});
    }
    const get = path.match(/\/pj\/([0-9a-f]+)$/);
    if (get) return pages.has(get[1]) ? new Response(pages.get(get[1])) : new Response('', {status: 404});
    return new Response('', {status: 404});
};

globalThis.__collabStubs = {
    './client': client,
    './overlay': overlay,
    './login': Object.assign(() => Promise.resolve({url: 'wss://sq.test/ws', room: 'blue fox', name: 'Tester'}), {
        apiBase: () => 'https://sq.test'
    }),
    './moderated': noopObject({}),
    './paint-merge': noopObject({}),
    '@turbowarp/paper': noopObject({})
};
globalThis.window = noopObject({addEventListener: noop, dispatchEvent: () => true});
globalThis.document = noopObject({
    hidden: false, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null
});
globalThis.localStorage = {getItem: () => null, setItem: noop};
globalThis.location = {port: '', hostname: 'sq.test', search: '', hash: ''};

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

const emit = (type, msg) => listeners.get(type)(msg);
const snapshots = () => sent.filter(m => m && m.type === 'snapshot');
const puts = () => calls.filter(c => c.method === 'PUT' && /\/pj$/.test(c.url));
const gets = () => calls.filter(c => c.method === 'GET');

const vm = new VM();
const webStores = [];
vm.runtime.storage = {
    AssetType: {ImageVector: 'svg-type', ImageBitmap: 'png-type', Sound: 'sound-type', SoundWav: 'wav-type'},
    loads: [],
    load: (type, id, fmt) => {
        vm.runtime.storage.loads.push(`${id}.${fmt}`);
        return Promise.resolve({assetId: id, dataFormat: fmt, data: new Uint8Array([1, 2, 3])});
    },
    addWebStore: (types, getUrl) => webStores.push({types, getUrl}),
    scratchFetch: {setMetadata: noop, RequestMetadata: {}}
};
await vm.loadProject(project(['Cat']));

const collab = (await import('./index.js')).default;
await collab.init(vm, {});

const welcome = extra => Object.assign({
    id: 'me', role: 'owner', canEdit: true, room: 'blue fox', title: 'Blue fox',
    peers: [{id: 'me'}], projects: [], version: 0, hasSnapshot: false, gameVars: {}, color: '#fff'
}, extra);

section('welcome with proto 2 seeds the room over http');
{
    emit('welcome', welcome({proto: 2}));
    ok('the frame goes out', await waitFor(() => snapshots().length === 1), sent);
    const frame = snapshots()[0];
    ok('it carries the sha and no project bytes', typeof frame.sha === 'string' && !('b64' in frame), frame);
    ok('the sha is the project text hash', frame.sha === await sha256Hex(vm.toJSON()));
    ok('it carries the size and the ref', typeof frame.size === 'number' && typeof frame.ref === 'number');
    ok('it is based on the welcome version', frame.basedOn === 0);
    ok('the project went up gzipped first', puts().length === 1 && puts()[0].headers['content-encoding'] === 'gzip');
    ok('the asset store points at the server once',
        webStores.length === 1 && webStores[0].getUrl({assetId: 'a'.repeat(32), dataFormat: 'png'}) ===
            `https://sq.test/api/assets/${'a'.repeat(32)}.png`);
    emit('snapshot-ack', {ref: frame.ref, version: 1});
}

section('an unchanged project is not sent again');
{
    emit('server-restarting', {});
    await new Promise(resolve => setTimeout(resolve, 50));
    ok('no second upload', puts().length === 1, puts().length);
    ok('no second frame', snapshots().length === 1);
}

section('our own snapshot echoed back is not fetched');
{
    const own = snapshots()[0].sha;
    emit('snapshot', {type: 'snapshot', sha: own, version: 1});
    await tick();
    ok('no fetch for our own sha', gets().length === 0);
}

section('a snapshot by sha loads from the server');
{
    const text = project(['Dog']);
    const sha = await sha256Hex(text);
    pages.set(sha, await gzip(text));
    emit('snapshot', {type: 'snapshot', sha, version: 2, author: 'server'});
    ok('the project loads', await waitFor(() => vm.runtime.targets.some(t => t.getName && t.getName() === 'Dog')));
    ok('it was fetched by sha', gets().length === 1 && gets()[0].url.endsWith(`/pj/${sha}`), gets());
    emit('snapshot', {type: 'snapshot', sha, version: 2});
    await tick();
    ok('a repeat of it is skipped', gets().length === 1);
}

section('a refused send rescues to the library by sha');
{
    const dog = vm.runtime.targets.find(t => t.getName && t.getName() === 'Dog');
    vm.renameSprite(dog.id, 'Puppy');
    const local = vm.toJSON();
    const text = project(['Owl']);
    const sha = await sha256Hex(text);
    pages.set(sha, await gzip(text));
    banners.length = 0;
    emit('snapshot-refused', {reason: 'stale', ref: 99, sha, roomVersion: 3});
    ok('the room version loads', await waitFor(() => vm.runtime.targets.some(t => t.getName && t.getName() === 'Owl')));
    const save = sent.find(m => m && m.type === 'save-project');
    ok('save-project carries the sha of the local copy', save && save.sha === await sha256Hex(local), save);
    ok('and no project bytes', save && !('b64' in save));
    ok('the local copy is on the server', save && pages.has(save.sha));
    ok('no download banner when the save went out', !banners.some(b => /replaced/.test(b.text || '')), banners);
}

section('offline, the rescue is a download');
{
    const owl = vm.runtime.targets.find(t => t.getName && t.getName() === 'Owl');
    vm.renameSprite(owl.id, 'Wren');
    const text = project(['Owl']);
    const sha = await sha256Hex(text);
    banners.length = 0;
    const saves = sent.filter(m => m && m.type === 'save-project').length;
    client.connected = false;
    emit('snapshot-refused', {reason: 'stale', ref: 98, sha, roomVersion: 3});
    ok('the room version loads again', await waitFor(() => vm.runtime.targets.some(t => t.getName && t.getName() === 'Owl')));
    client.connected = true;
    ok('the local copy is offered as a download', banners.some(b => /replaced/.test(b.text || '')), banners);
    ok('no save-project while offline', sent.filter(m => m && m.type === 'save-project').length === saves);
}

section('a missing sha asks for a resync');
{
    const before = sent.length;
    const logError = console.error;
    const logWarn = console.warn;
    console.error = noop;
    console.warn = noop;
    emit('snapshot', {type: 'snapshot', sha: 'e'.repeat(64), version: 4, author: 'server'});
    const resynced = await waitFor(() => sent.slice(before).some(m => m && m.type === 'resync'));
    console.error = logError;
    console.warn = logWarn;
    ok('the failure requests the project again', resynced, sent.slice(before));
}

section('a builtin extension travels as a vm-action');
{
    overlay.peers.set('pal', {id: 'pal'});
    const before = sent.length;
    vm.extensionManager.loadExtensionIdSync('pen');
    const relayed = sent.slice(before).find(m => m && m.type === 'vm-action');
    ok('the extension id is relayed', relayed && relayed.action === 'extensionAdd' && relayed.id === 'pen', sent.slice(before));

    const count = sent.length;
    emit('vm-action', {type: 'vm-action', action: 'extensionAdd', id: 'music', from: 'pal'});
    ok('a remote extension loads', vm.extensionManager.isExtensionLoaded('music'));
    ok('and is not relayed back', !sent.slice(count).some(m => m && m.type === 'vm-action'));
    emit('vm-action', {type: 'vm-action', action: 'extensionAdd', id: 'https://evil.test/x.js', from: 'pal'});
    ok('a url is never loaded', !vm.extensionManager.isExtensionLoaded('https://evil.test/x.js'));

    const spriteText = JSON.stringify(sprite('Bee'));
    const before2 = sent.length;
    await vm.addSprite(spriteText).catch(() => null);
    const add = await waitFor(() => sent.slice(before2).some(m => m && m.action === 'spriteAdd')) &&
        sent.slice(before2).find(m => m && m.action === 'spriteAdd');
    ok('a new sprite travels as json', add && add.format === 'json' && JSON.parse(add.sprite).name === 'Bee', add);

    const remote = JSON.parse(add.sprite);
    remote.name = 'Ant';
    emit('vm-action', {type: 'vm-action', action: 'spriteAdd', format: 'json', sprite: JSON.stringify(remote),
        name: 'Ant', from: 'pal', fromName: 'Pal'});
    ok('a json sprite from a peer installs',
        await waitFor(() => vm.runtime.targets.some(t => t.getName && t.getName() === 'Ant')));

    const bee = vm.runtime.targets.find(t => t.getName && t.getName() === 'Bee');
    const soundId = 'b'.repeat(32);
    const before3 = sent.length;
    await vm.addSound({
        name: 'buzz', dataFormat: 'wav', assetId: soundId, md5: `${soundId}.wav`,
        asset: {assetId: soundId, dataFormat: 'wav', data: new Uint8Array([9, 9])}
    }, bee.id);
    const soundAdd = await waitFor(() => sent.slice(before3).some(m => m && m.action === 'soundAdd')) &&
        sent.slice(before3).find(m => m && m.action === 'soundAdd');
    ok('a new sound travels by md5ext', soundAdd && soundAdd.md5ext === `${soundId}.wav` && !('data' in soundAdd), soundAdd);
    ok('its bytes went up first', calls.some(c => c.method === 'PUT' && c.url.endsWith(`/api/assets/${soundId}.wav`)));

    const ant = vm.runtime.targets.find(t => t.getName && t.getName() === 'Ant');
    const peerId = 'c'.repeat(32);
    emit('vm-action', {type: 'vm-action', action: 'soundAdd', target: 'Ant', sound: {name: 'chirp', dataFormat: 'wav'},
        md5ext: `${peerId}.wav`, from: 'pal'});
    ok('a peer sound loads from the asset store',
        await waitFor(() => ant.getSounds().some(snd => snd.name === 'chirp')), ant.getSounds().map(snd => snd.name));
    ok('by its md5ext', vm.runtime.storage.loads.includes(`${peerId}.wav`), vm.runtime.storage.loads);
    const quietError = console.error;
    console.error = noop;
    emit('vm-action', {type: 'vm-action', action: 'soundAdd', target: 'Ant', sound: {name: 'bad', dataFormat: 'wav'},
        md5ext: '../../x.wav', from: 'pal'});
    await tick();
    console.error = quietError;
    ok('a malformed md5ext is never loaded', !vm.runtime.storage.loads.some(id => id.includes('..')));
    overlay.peers.clear();
}

section('a project over the limit shows the too-big banner');
{
    status['/api/rooms/blue%20fox/pj'] = 413;
    banners.length = 0;
    const frames = snapshots().length;
    const owl = vm.runtime.targets.find(t => t.getName && t.getName() === 'Owl');
    vm.renameSprite(owl.id, 'Hawk');
    emit('server-restarting', {});
    ok('the banner says it is too big', await waitFor(() => banners.some(b => /too big/.test(b.text || ''))), banners);
    ok('no frame without an upload', snapshots().length === frames);
    delete status['/api/rooms/blue%20fox/pj'];
}

section('a v1 room keeps the b64 frame');
{
    emit('welcome', welcome({proto: 1, hasSnapshot: true, peers: [{id: 'me'}, {id: 'pal'}]}));
    const frames = snapshots().length;
    const hawk = vm.runtime.targets.find(t => t.getName && t.getName() === 'Hawk');
    vm.renameSprite(hawk.id, 'Eagle');
    emit('server-restarting', {});
    ok('a b64 frame goes out', await waitFor(() => snapshots().length > frames), snapshots().length);
    const frame = snapshots()[snapshots().length - 1];
    ok('it carries b64 and no sha', typeof frame.b64 === 'string' && !('sha' in frame), Object.keys(frame));
}

section('a reconnect welcome with a pointer loads it');
{
    const text = project(['Fox']);
    const sha = await sha256Hex(text);
    pages.set(sha, await gzip(text));
    emit('welcome', welcome({proto: 2, hasSnapshot: true, peers: [{id: 'me'}, {id: 'pal'}], version: 9,
        snap: {sha, size: text.length, version: 9, atSeq: 0, hashes: {}}}));
    ok('the pointed project loads', await waitFor(() => vm.runtime.targets.some(t => t.getName && t.getName() === 'Fox')));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
