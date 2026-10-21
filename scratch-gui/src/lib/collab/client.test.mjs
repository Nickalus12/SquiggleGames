import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2] || '';

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${detail !== undefined ? ` : ${JSON.stringify(detail)}` : ''}`);
    }
};

const section = async (name, fn) => {
    if (only && name !== only) return;
    console.log(`\n${name}`);
    await fn();
};

const settle = async () => {
    for (let i = 0; i < 5; i++) await null;
};

const makeClock = () => {
    let t = 1000000;
    let id = 0;
    const timers = new Map();
    const delays = [];
    const add = (fn, ms, every) => {
        id += 1;
        const wait = Math.max(0, Number(ms) || 0);
        timers.set(id, {fn, at: t + wait, every: every ? Math.max(1, wait) : 0});
        return id;
    };
    return {
        delays,
        now: () => t,
        setTimeout: (fn, ms) => {
            delays.push(ms);
            return add(fn, ms, false);
        },
        clearTimeout: handle => timers.delete(handle),
        setInterval: (fn, ms) => add(fn, ms, true),
        clearInterval: handle => timers.delete(handle),
        advance (ms) {
            const end = t + ms;
            for (;;) {
                let next = null;
                timers.forEach((timer, key) => {
                    if (timer.at <= end && (!next || timer.at < next.timer.at)) next = {key, timer};
                });
                if (!next) break;
                t = next.timer.at;
                if (next.timer.every) next.timer.at += next.timer.every;
                else timers.delete(next.key);
                next.timer.fn();
            }
            t = end;
        }
    };
};

const src = fs.readFileSync(path.join(here, 'client.js'), 'utf8')
    .replace(/^export default client;\s*$/m, 'return client;');

const sandboxGlobals = `
const WebSocket = globalThis.__collab.FakeWebSocket;
const localStorage = globalThis.__collab.localStorage;
const location = globalThis.__collab.location;
const setTimeout = globalThis.__collab.clock.setTimeout;
const clearTimeout = globalThis.__collab.clock.clearTimeout;
const setInterval = globalThis.__collab.clock.setInterval;
const clearInterval = globalThis.__collab.clock.clearInterval;
const Date = {now: globalThis.__collab.clock.now};
`;

const setup = () => {
    const sockets = [];
    const store = {};
    const clock = makeClock();
    class FakeWebSocket {
        constructor (url) {
            this.url = url;
            this.readyState = 0;
            this.bufferedAmount = 0;
            this.sent = [];
            sockets.push(this);
        }
        send (data) {
            this.sent.push(data);
            if (this.autoPong && JSON.parse(data).type === 'ping') {
                clock.setTimeout(() => this.message({type: 'pong'}), 0);
            }
        }
        close () {
            this.readyState = 3;
            if (this.onclose) this.onclose();
        }
        open () {
            this.readyState = 1;
            if (this.onopen) this.onopen();
        }
        message (obj) {
            if (this.onmessage) this.onmessage({data: JSON.stringify(obj)});
        }
    }
    globalThis.__collab = {
        FakeWebSocket,
        clock,
        location: {hostname: 'test.invalid', host: 'test.invalid', port: ''},
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => {
                store[k] = String(v);
            }
        }
    };
    // eslint-disable-next-line no-new-func
    const client = new Function(`${sandboxGlobals}${src}`)();
    const last = () => sockets[sockets.length - 1];
    const connect = (room = 'r1', url = 'ws://test.invalid') => {
        client.connect({url, room, name: 'Tester'});
        return last();
    };
    const fresh = () => {
        client.disconnect();
        const sock = connect();
        sock.open();
        sock.message({type: 'welcome', id: 'u1', color: '#fff'});
        return sock;
    };
    return {client, sockets, store, clock, last, connect, fresh};
};

const joinOf = sock => sock.sent.map(d => JSON.parse(d)).find(m => m.type === 'join');
const sentTypes = sock => sock.sent.map(d => JSON.parse(d).type);
const lastSent = sock => JSON.parse(sock.sent[sock.sent.length - 1]);
const utf8 = s => Buffer.byteLength(s, 'utf8');
const deliver = (sock, obj) => {
    const data = JSON.stringify(obj);
    sock.onmessage({data});
    return utf8(data);
};
const v2Welcome = extra => Object.assign({type: 'welcome', proto: 2, id: 7, color: '#0f0', rs: 10, replay: false,
    resume: 'resume-1', ack: 0, snap: {sha: 'a'.repeat(64), size: 10, version: 3, atSeq: 9}}, extra);
const SNAPSHOT_BUDGET = Math.floor(0.6 * 128 * 1024 * 1024);

const recordEvents = client => {
    const events = [];
    for (const type of ['block-event', 'vm-action', 'kit-set', 'tilemap-patch', 'error', 'frame-refused',
        'reload-needed', 'disconnected', 'bad-frame']) {
        client.on(type, m => events.push(Object.assign({on: type}, m)));
    }
    return events;
};

const v2Room = (env, room = 'v2room') => {
    const sock = env.connect(room);
    sock.open();
    deliver(sock, v2Welcome());
    return sock;
};

await section('pagehide, bfcache and the backoff', () => {
    const {client, sockets, connect, last} = setup();
    let ws = connect();
    ws.open();
    ws.message({type: 'welcome', id: 'u1', color: '#fff'});
    ok('welcome marks the client connected', client.connected === true);
    ok('heartbeat runs while connected', client._heartbeatTimer !== null);

    client.closeForUnload();
    ok('pagehide close stops the heartbeat', client._heartbeatTimer === null);
    ok('pagehide close drops the socket', client.ws === null && client.connected === false);

    client.resumeIfNeeded();
    ws = last();
    ok('bfcache restore opens a fresh socket', sockets.length === 2 && client.ws === ws);
    ok('bfcache restore restarts the heartbeat', client._heartbeatTimer !== null);

    ws.open();
    ok('backoff is not reset by a bare socket open', client._backoff === 1000);
    client._backoff = 6400;
    ws.message({type: 'welcome', id: 'u1', color: '#fff'});
    ok('welcome resets the backoff', client._backoff === 1000);

    client._backoff = 1600;
    ws.close();
    ok('close after welcome schedules a reconnect with grown backoff', client._backoff > 1600, client._backoff);
    client.disconnect();
});

await section('the reconnect delay', () => {
    const {client, clock, connect} = setup();
    connect().open();
    client._clearReconnect();
    client._backoff = 10000;
    clock.delays.length = 0;
    client._scheduleReconnect();
    const seenDelay = clock.delays[0];
    ok('reconnect delay is jittered around the backoff',
        seenDelay >= 7500 && seenDelay <= 12500 && client._backoff === 15000, seenDelay);
    const before = client._openGen;
    clock.advance(12500);
    ok('the reconnect opens once the delay passes', client._openGen === before + 1);
    client.disconnect();
});

await section('queued snapshots', () => {
    const {client, connect} = setup();
    connect();
    client._queue = [];
    client.send({type: 'snapshot', b64: 'AAA', cacheOnly: false, force: true, reset: false});
    client.send({type: 'block-event', target: 'Sprite1', event: {type: 'move'}});
    client.send({type: 'snapshot', b64: 'BBB', cacheOnly: true, force: false, reset: false});
    ok('a newer queued snapshot supersedes the older one', client._queue.length === 2, client._queue);
    const queuedSnap = JSON.parse(client._queue[1].data);
    ok('the surviving snapshot is the newest', queuedSnap.b64 === 'BBB', queuedSnap);
    ok('force from the superseded snapshot carries over', queuedSnap.force === true, queuedSnap);
    ok('non-snapshot messages stay queued ahead of it',
        JSON.parse(client._queue[0].data).type === 'block-event', client._queue[0]);
    client.disconnect();
});

await section('the device token', () => {
    const {client, store, connect} = setup();
    store.st_token = 'device-token';
    let ws = connect('r1', 'wss://test.invalid');
    ws.open();
    ok('the device token goes to the page\'s own server', joinOf(ws).token === 'device-token', joinOf(ws));
    client.disconnect();

    ws = connect('r1', 'wss://evil.example');
    ws.open();
    ok('the device token never goes to another origin', joinOf(ws).token === undefined, joinOf(ws));
    ws.message({type: 'welcome', id: 'u1', color: '#fff', token: 'planted'});
    ok('a foreign server cannot plant a device token', store.st_token === 'device-token', store.st_token);
    client.disconnect();

    ws = connect('r1', 'ws://test.invalid.evil.example');
    ws.open();
    ok('a look-alike host is another origin', joinOf(ws).token === undefined, joinOf(ws));
    client.disconnect();
});

await section('silence and pings', () => {
    const {client, clock, sockets, fresh} = setup();
    let ws = fresh();
    let downs = [];
    client.on('disconnected', m => downs.push(m));
    clock.advance(11000);
    client._heartbeat();
    ok('ten seconds of silence marks the socket dead', client.connected === false && downs.length === 1, downs);
    ok('a dead socket with nothing sent reports nothing unconfirmed', downs[0] && downs[0].unconfirmed === false,
        downs);
    ok('the dead socket is replaced', client.ws !== ws && sockets[sockets.length - 1] === client.ws);
    ok('the silence limit backs off after a trip', client._silenceLimit === 20000, client._silenceLimit);

    ws = fresh();
    client._silenceLimit = 10000;
    downs = [];
    client.send({type: 'block-event', target: 'Sprite1', event: {type: 'create'}});
    client._lastInbound = clock.now() - 11000;
    client._heartbeat();
    ok('an edit written into a dead socket is reported unconfirmed', downs[0] && downs[0].unconfirmed === true,
        downs);

    ws = fresh();
    client.send({type: 'block-event', target: 'Sprite1', event: {type: 'create'}});
    client._lastPingAt = 0;
    client._heartbeat();
    ok('an unconfirmed edit pings promptly', sentTypes(ws).includes('ping'), sentTypes(ws));
    ws.message({type: 'pong'});
    downs = [];
    ws.close();
    ok('a pong after the edit confirms it', downs[0] && downs[0].unconfirmed === false, downs);

    ws = fresh();
    client._lastBuffered = 5000;
    ws.bufferedAmount = 3000;
    client._lastInbound = clock.now() - 11000;
    downs = [];
    client._heartbeat();
    ok('an upload still draining is not silence', client.connected === true && downs.length === 0, downs);
    client.disconnect();
});

await section('the queue at the welcome', () => {
    const {client, connect} = setup();
    let ws = connect();
    client.send({type: 'block-event', target: 'Sprite1', event: {type: 'move'}});
    ws.open();
    let heldAtWelcome = null;
    const discardOnce = () => {
        heldAtWelcome = client.holdingQueue;
        client.discardQueue();
    };
    client.on('welcome', discardOnce);
    ws.message({type: 'welcome', id: 'u1', color: '#fff'});
    client.handlers.welcome.splice(client.handlers.welcome.indexOf(discardOnce), 1);
    ok('the queue is held while the welcome is decided', heldAtWelcome === true);
    ok('a discarded queue never reaches the room', !sentTypes(ws).includes('block-event'), sentTypes(ws));

    client.disconnect();
    ws = connect();
    client.send({type: 'block-event', target: 'Sprite1', event: {type: 'move'}});
    ws.open();
    ws.message({type: 'welcome', id: 'u1', color: '#fff'});
    ok('an undecided queue still flushes after the welcome', sentTypes(ws).includes('block-event'), sentTypes(ws));
    client.disconnect();
});

await section('a queue held for an answer', () => {
    const {client, connect, last} = setup();
    const edit = id => client.send({type: 'block-event', target: 'Sprite1', event: {type: 'move', blockId: id}});
    const edits = sock => sock.sent.map(d => JSON.parse(d)).filter(m => m.type === 'block-event')
        .map(m => m.event.blockId)
        .join();
    let ws = connect();
    const drop = () => {
        ws.readyState = 3;
        ws.onclose({code: 1006, reason: ''});
    };
    const reopen = () => {
        client._clearReconnect();
        client._open();
        ws = last();
        ws.open();
        ws.message({type: 'welcome', id: 'u1', color: '#fff'});
    };
    edit('a');
    client.send({type: 'snapshot', b64: 'AA==', basedOn: 1});
    ws.open();
    const holdOnce = () => client.holdQueue();
    client.on('welcome', holdOnce);
    ws.message({type: 'welcome', id: 'u1', color: '#fff'});
    client.handlers.welcome.splice(client.handlers.welcome.indexOf(holdOnce), 1);
    ok('a held queue does not flush after the welcome', edits(ws) === '', sentTypes(ws));
    client.send({type: 'vm-action', action: 'renameSprite', target: 'Sprite1', newName: 'Cat'});
    ok('a reliable send while held waits', !sentTypes(ws).includes('vm-action') && client.holdingQueue === true,
        sentTypes(ws));
    drop();
    ok('the queue survives the close', client._queue.length === 3, client._queue.length);
    reopen();
    ok('the next welcome keeps holding', client.holdingQueue === true && edits(ws) === '', sentTypes(ws));
    const held = client.takeQueue();
    ok('take returns the held frames without the snapshot', held.map(m => m.type).join() ===
        'block-event,vm-action' && held[0].event.blockId === 'a', held);
    ok('take empties the queue and still holds', client._queue.length === 0 && client.holdingQueue === true);
    drop();
    reopen();
    edit('b');
    ok('an empty held queue still holds at the next welcome', edits(ws) === '' && client.holdingQueue === true,
        sentTypes(ws));
    client.releaseQueue();
    ok('release sends what was queued after the take', edits(ws) === 'b' && client.holdingQueue === false,
        sentTypes(ws));
    drop();
    edit('c');
    reopen();
    ok('a released hold is gone at the next welcome', edits(ws) === 'c', sentTypes(ws));
    client.holdQueue();
    client.discardQueue();
    edit('d');
    ok('discard ends the hold', edits(ws) === 'c,d', sentTypes(ws));
    drop();
    edit('e');
    reopen();
    ok('a discarded hold is gone at the next welcome', edits(ws) === 'e', sentTypes(ws));
    client.holdQueue();
    client.disconnect();
    ws = connect();
    edit('f');
    ws.open();
    ws.message({type: 'welcome', id: 'u1', color: '#fff'});
    ok('leaving ends the hold', edits(ws) === 'f', sentTypes(ws));
    client.disconnect();
});

await section('leaving with a save in flight', async () => {
    const {client, clock, fresh} = setup();
    let ws = fresh();
    let release;
    client.unloadGuard = () => new Promise(r => {
        release = r;
    });
    client.closeForUnload();
    ok('leaving with a save in flight keeps the socket open', client.ws === ws && ws.readyState === 1);
    release();
    await settle();
    ok('the socket closes once the save is handed over', client.ws === null && ws.readyState === 3);

    ws = fresh();
    client.unloadGuard = () => new Promise(() => {});
    client.closeForUnload();
    client.resumeIfNeeded();
    clock.advance(3100);
    ok('a bfcache restore cancels the pending close', client.ws === ws && ws.readyState === 1);

    ws = fresh();
    client.closeForUnload();
    clock.advance(3100);
    ok('a save that never settles still closes after the grace', client.ws === null && ws.readyState === 3);
    client.unloadGuard = null;
    client.disconnect();
});

await section('close codes', () => {
    const {client, fresh} = setup();
    let closes = [];
    client.on('disconnected', m => closes.push(m));
    for (const [code, reason] of [[1008, 'rate-limited'], [1009, 'too-much-data'], [4008, 'too-slow']]) {
        const ws = fresh();
        closes = [];
        ws.readyState = 3;
        ws.onclose({code, reason});
        ok(`a ${code} close tells the editor why`, closes.length === 1 && closes[0].code === code &&
            closes[0].reason === reason, closes);
        ok(`a ${code} close still reconnects`, client._reconnectTimer !== null);
        client._clearReconnect();
    }
    const ws = fresh();
    closes = [];
    ws.readyState = 3;
    ws.onclose();
    ok('a close without an event reports code 0', closes[0] && closes[0].code === 0 && closes[0].reason === '',
        closes);
    client.disconnect();
});

await section('frame limits', () => {
    const {client, fresh} = setup();
    let refused = [];
    client.on('frame-refused', m => refused.push(m));
    const ws = fresh();
    const before = ws.sent.length;
    ok('a block event over the server limit is not sent',
        client.send({type: 'block-event', pad: 'x'.repeat((4 * 1024 * 1024) + 1)}) === false &&
        ws.sent.length === before);
    ok('the refusal is reported as reliable', refused.length === 1 && refused[0].type === 'block-event' &&
        refused[0].reliable === true, refused);
    refused = [];
    ok('the limit counts UTF-8 bytes, not characters',
        client.send({type: 'block-event', pad: '€'.repeat(1500000)}) === false && refused.length === 1);
    refused = [];
    ok('an oversized cursor is dropped as lossy',
        client.send({type: 'cursor', pad: 'x'.repeat(5000)}) === false && refused[0] && refused[0].reliable === false,
        refused);
    ok('a frame within its limit still goes out', client.send({type: 'block-event', pad: 'ok'}) === true &&
        sentTypes(ws).pop() === 'block-event');
    client.disconnect();
});

await section('a 1009 close learns the frame limit', () => {
    const {client, fresh} = setup();
    let refused = [];
    let closes = [];
    client.on('frame-refused', m => refused.push(m));
    client.on('disconnected', m => closes.push(m));
    let ws = fresh();
    client.send({type: 'snapshot', b64: 'A'.repeat(200 * 1024), ref: 7, cacheOnly: false});
    client._holding = true;
    client.send({type: 'block-event', target: 'Sprite1', event: {type: 'move'}});
    client.send({type: 'snapshot', b64: 'B'.repeat(300 * 1024), ref: 8, cacheOnly: true});
    ws.readyState = 3;
    ws.onclose({code: 1009, reason: ''});
    ok('a 1009 close names the frame that was too large', closes[0] && closes[0].dropped &&
        closes[0].dropped.type === 'snapshot' && closes[0].dropped.ref === 7, closes);
    ok('a queued frame over the learned limit is dropped from the queue',
        client._queue.length === 1 && client._queue[0].type === 'block-event', client._queue);
    ok('the dropped queued snapshot is reported', refused.length === 1 && refused[0].ref === 8, refused);
    client._clearReconnect();
    refused = [];
    ok('the same snapshot is refused next time instead of closing the socket again',
        client.send({type: 'snapshot', b64: 'C'.repeat(200 * 1024), ref: 9, cacheOnly: false}) === false &&
        refused[0].ref === 9, refused);
    ok('a smaller snapshot is still accepted', client.send({type: 'snapshot', b64: 'D'.repeat(100 * 1024), ref: 10}));
    ok('learning one type leaves the others alone',
        client.send({type: 'vm-action', pad: 'E'.repeat(300 * 1024)}) === true);
    client._learnedLimits.clear();

    ws = fresh();
    closes = [];
    client.send({type: 'snapshot', b64: 'A'.repeat(200 * 1024), ref: 11});
    ws.readyState = 3;
    ws.onclose({code: 1009, reason: 'too-much-data'});
    ok('a byte-budget close drops nothing and learns nothing',
        closes[0] && closes[0].dropped === null && client._learnedLimits.size === 0, closes);
    client._clearReconnect();

    ws = fresh();
    closes = [];
    client.send({type: 'block-event', pad: 'small'});
    ws.readyState = 3;
    ws.onclose({code: 1009, reason: 'frame-too-large'});
    ok('a 1009 after only small frames blames nothing',
        closes[0] && closes[0].dropped === null && client._learnedLimits.size === 0, closes);
    client.disconnect();
});

await section('the snapshot budget', () => {
    const {client, clock, fresh} = setup();
    let ws = fresh();
    ws.autoPong = true;
    ok('a new socket starts with an empty snapshot budget', client._snapshotLog.length === 0);
    client._snapshotLog = [{at: clock.now(), size: SNAPSHOT_BUDGET}];
    let sentBefore = ws.sent.length;
    ok('a snapshot over the per-minute budget is held, not sent',
        client.send({type: 'snapshot', b64: 'S1', ref: 20, force: true}) === true &&
        ws.sent.length === sentBefore && client._paced && client._paced.ref === 20);
    client.send({type: 'snapshot', b64: 'S2', ref: 21});
    ok('a newer held snapshot replaces the older one and keeps its force',
        client._paced.ref === 21 && JSON.parse(client._paced.data).force === true, client._paced);
    client.send({type: 'block-event', pad: 'live'});
    ok('live block events are not held behind it', lastSent(ws).type === 'block-event');
    const snapshots = () => ws.sent.map(d => JSON.parse(d)).filter(m => m.type === 'snapshot');
    clock.advance(30000);
    ok('the held snapshot waits while the minute runs', client._paced && client._paced.ref === 21);
    clock.advance(30001);
    ok('the held snapshot goes out once the budget allows',
        snapshots().map(m => m.ref).join() === '21' && client._paced === null && client._snapshotLog.length === 1,
        snapshots());

    client._snapshotLog = [{at: clock.now(), size: SNAPSHOT_BUDGET}];
    client.send({type: 'snapshot', b64: 'S3', ref: 22});
    client.send({type: 'snapshot', b64: 'S4', ref: 23}, true);
    ok('an urgent snapshot skips the budget and replaces the held one',
        snapshots().map(m => m.ref).join() === '21,23' && client._paced === null && client._pacedTimer === null,
        snapshots());

    client.send({type: 'snapshot', b64: 'S5', ref: 24});
    ws.readyState = 3;
    ws.onclose({code: 1006, reason: ''});
    ok('a held snapshot moves to the queue when the socket drops',
        client._paced === null && client._queue.length === 1 && client._queue[0].ref === 24, client._queue);
    client._clearReconnect();

    ws = fresh();
    client._snapshotLog = [{at: clock.now(), size: SNAPSHOT_BUDGET}];
    client.send({type: 'snapshot', b64: 'S6', ref: 25});
    sentBefore = ws.sent.length;
    client.closeForUnload();
    ok('leaving the page sends the held snapshot before closing',
        ws.sent.length === sentBefore + 1 && JSON.parse(ws.sent[sentBefore]).ref === 25 && client._paced === null);
    client.disconnect();
});

await section('v2 welcome, ring frames and acks', () => {
    const env = setup();
    const {client, clock} = env;
    const events = recordEvents(client);
    const ws = env.connect('v2room');
    ws.open();
    ok('the first join says proto 2 with no rs or resume',
        joinOf(ws).proto === 2 && !('rs' in joinOf(ws)) && !('resume' in joinOf(ws)), joinOf(ws));
    let received = deliver(ws, v2Welcome());
    ok('a v2 welcome without replay takes the room rs', client.rs === 10 && client.proto === 2, client.rs);
    ok('the resume token is kept', client.resume === 'resume-1');
    received += deliver(ws, {type: 'block-event', from: 3, rs: 11, event: {type: 'move'}});
    ok('a peer ring frame is applied and moves rs', events.length === 1 && client.rs === 11, events);
    received += deliver(ws, {type: 'block-event', from: 3, rs: 11, event: {type: 'move'}});
    ok('a ring frame at or below rs is not applied twice', events.length === 1 && client.rs === 11);
    received += deliver(ws, {type: 'kit-set', from: 7, rs: 12, ext: 'together'});
    ok('our own frame coming back in a replay is skipped but counted',
        events.length === 1 && client.rs === 12, events);
    deliver(ws, {type: 'pong'});
    received += deliver(ws, {type: 'cursor', from: 3, x: 1, y: 2});
    ok('an ack is armed while frames arrive', client._ackTimer !== null);
    clock.advance(1100);
    const acks = ws.sent.map(d => JSON.parse(d)).filter(m => m.type === 'ack');
    ok('one ack a second carries the bytes received, pongs left out',
        acks.length === 1 && acks[0].b === received && acks[0].t === clock.now() - 100, {acks, received});
    ok('no ack is armed once frames stop', client._ackTimer === null);

    events.length = 0;
    deliver(ws, {type: 'error', error: 'too-large', of: 'vm-action'});
    ok('a too-large error is a frame refusal, not an error toast',
        events.length === 1 && events[0].on === 'frame-refused' && events[0].type === 'vm-action' &&
        events[0].reliable === true, events);
    client.disconnect();
});

await section('v2 frame limits and the pointer budget', () => {
    const env = setup();
    const {client} = env;
    const events = recordEvents(client);
    v2Room(env);
    ok('a v2 snapshot pointer with hashes up to 256 KiB goes out',
        client.send({type: 'snapshot', sha: 'b'.repeat(64), size: 10, pad: 'x'.repeat(255 * 1024)}) === true, events);
    ok('a v2 snapshot pointer over 256 KiB, the server cap, is refused locally',
        client.send({type: 'snapshot', sha: 'b'.repeat(64), size: 10, pad: 'x'.repeat(256 * 1024)}) === false &&
        events[0] && events[0].type === 'snapshot', events);
    ok('a tilemap-patch up to 256 KiB goes out',
        client.send({type: 'tilemap-patch', pad: 'x'.repeat(200 * 1024)}) === true);
    ok('a vm-action over 1 MiB is refused locally',
        client.send({type: 'vm-action', pad: 'x'.repeat(1024 * 1024)}) === false);
    ok('a kit-set within 20 KiB still goes out', client.send({type: 'kit-set', pad: 'x'.repeat(10 * 1024)}) === true);
    ok('an unlisted frame type gets the 4 KiB default',
        client.send({type: 'viewport', pad: 'x'.repeat(5000)}) === false);

    client._snapshotLog = [];
    client._paced = null;
    client.send({type: 'snapshot', sha: 'c'.repeat(64), size: 80 * 1024 * 1024, ref: 30});
    ok('a pointer frame costs the project size against the budget',
        client._snapshotLog.length === 1 && client._snapshotLog[0].size === 80 * 1024 * 1024, client._snapshotLog);
    client.send({type: 'snapshot', sha: 'd'.repeat(64), size: 80 * 1024 * 1024, ref: 31});
    ok('so a second large project waits for the window', client._paced && client._paced.ref === 31);
    client.disconnect();
});

await section('v2 rejoin and replay', () => {
    const env = setup();
    const {client} = env;
    const events = recordEvents(client);
    let ws = v2Room(env);
    deliver(ws, {type: 'block-event', from: 3, rs: 12, event: {type: 'move'}});
    ws.readyState = 3;
    ws.onclose({code: 1006, reason: ''});
    ok('a dropped socket reconnects', client._reconnectTimer !== null);
    client._clearReconnect();
    client._open();
    ws = env.last();
    ws.open();
    ok('the rejoin carries the last applied rs and the resume token',
        joinOf(ws).rs === 12 && joinOf(ws).resume === 'resume-1' && joinOf(ws).proto === 2, joinOf(ws));
    deliver(ws, v2Welcome({rs: 15, replay: true, resume: 'resume-2'}));
    ok('a replay welcome keeps our rs for the frames that follow', client.rs === 12 && client.resume === 'resume-2');
    events.length = 0;
    deliver(ws, {type: 'vm-action', from: 7, rs: 13, action: 'x'});
    deliver(ws, {type: 'vm-action', from: 4, rs: 14, action: 'y'});
    deliver(ws, {type: 'tilemap-patch', from: 4, rs: 15, level: 'l'});
    ok('replayed peer frames apply in order, our own skipped',
        events.map(e => `${e.on}:${e.rs}`).join() === 'vm-action:14,tilemap-patch:15' && client.rs === 15, events);

    deliver(ws, v2Welcome({rs: 40, replay: false}));
    ok('a welcome without replay jumps rs to the room', client.rs === 40);
    client.disconnect();
});

await section('platform close codes', () => {
    const env = setup();
    const {client, clock} = env;
    const events = recordEvents(client);
    let ws = v2Room(env);
    client._backoff = 8000;
    clock.delays.length = 0;
    ws.readyState = 3;
    ws.onclose({code: 1012, reason: ''});
    const restart = clock.delays.filter(delay => delay !== 1000);
    ok('a platform restart reconnects within 2 s and resets the backoff',
        restart.length === 1 && restart[0] >= 0 && restart[0] <= 2000 && client._backoff === 1000, clock.delays);
    clock.advance(2000);
    ok('and the new socket is open by then', env.last() !== ws);

    ws = env.last();
    ws.open();
    deliver(ws, v2Welcome({rs: 40}));
    events.length = 0;
    clock.delays.length = 0;
    ws.readyState = 3;
    ws.onclose({code: 1013, reason: 'too-slow'});
    ok('a too-slow close reports and reconnects', events.some(e => e.on === 'disconnected' && e.code === 1013) &&
        client._reconnectTimer !== null, events);
    const wait = clock.delays.filter(delay => delay >= 5000);
    ok('after waiting 5 to 10 s', wait.length === 1 && wait[0] <= 10000, clock.delays);
    const sockets = env.sockets.length;
    clock.advance(4999);
    ok('nothing reopens before 5 s', env.sockets.length === sockets);
    clock.advance(5001);
    ok('it reopens by 10 s', env.sockets.length === sockets + 1);

    ws = env.last();
    ws.open();
    deliver(ws, v2Welcome({rs: 40}));
    events.length = 0;
    ws.readyState = 3;
    ws.onclose({code: 4003, reason: 'room-deleted'});
    ok('a 4003 close never reconnects', client._reconnectTimer === null && client._closedByUser === true &&
        client._heartbeatTimer === null, events);

    ws = env.connect('v2room');
    ws.open();
    ok('reconnecting to the same room keeps rs', joinOf(ws).rs === 40, joinOf(ws));
    events.length = 0;
    ws.readyState = 3;
    ws.onclose({code: 4010, reason: 'please-reload'});
    ok('a 4010 close asks for a reload and stops', events.some(e => e.on === 'reload-needed') &&
        client._reconnectTimer === null && client._closedByUser === true, events);

    ws = env.connect('v2room');
    ws.open();
    deliver(ws, v2Welcome({rs: 40}));
    events.length = 0;
    const opened = env.sockets.length;
    ws.readyState = 3;
    ws.onclose({code: 1007, reason: 'bad-frame'});
    ok('a 1007 close says bad-frame and counts it', events.some(e => e.on === 'bad-frame' && e.count === 1 &&
        e.final === false) && client.badFrames === 1, events);
    clock.advance(5000);
    ok('the first reconnects once', env.sockets.length === opened + 1, env.sockets.length - opened);
    ws = env.last();
    ws.open();
    ok('with a fresh join', !('rs' in joinOf(ws)) && !('resume' in joinOf(ws)) && client.freshJoin === true, joinOf(ws));
    ws.autoPong = true;
    deliver(ws, v2Welcome({rs: 41}));
    events.length = 0;
    clock.advance(30000);
    ws.readyState = 3;
    ws.onclose({code: 1007, reason: 'bad-frame'});
    ok('a second inside a minute is final', events.some(e => e.on === 'bad-frame' && e.count === 2 && e.final === true),
        events);
    ok('and stays closed', client._reconnectTimer === null && client._closedByUser === true, events);
    clock.advance(60000);
    ok('with no reconnect loop', env.sockets.length === opened + 1);

    ws = env.connect('v2room');
    ws.open();
    deliver(ws, v2Welcome({rs: 50}));
    ws.readyState = 3;
    const first = env.sockets.length;
    ws.onclose({code: 1007, reason: 'bad-frame'});
    clock.advance(5000);
    ok('a new connect starts the strikes again', env.sockets.length === first + 1, env.sockets.length - first);
    ws = env.last();
    ws.open();
    ws.autoPong = true;
    deliver(ws, v2Welcome({rs: 51}));
    clock.advance(61000);
    events.length = 0;
    const before = env.sockets.length;
    ws.readyState = 3;
    ws.onclose({code: 1007, reason: 'bad-frame'});
    clock.advance(5000);
    ok('two a minute apart each reconnect', events.some(e => e.on === 'bad-frame' && e.final === false) &&
        env.sockets.length === before + 1, events);
    client.disconnect();

    ws = env.connect('another');
    ws.open();
    ok('a different room starts without rs or resume', !('rs' in joinOf(ws)) && !('resume' in joinOf(ws)),
        joinOf(ws));
    ok('and counts as a fresh join', client.freshJoin === true);
    client.disconnect();
});

await section('a v1 server', () => {
    const env = setup();
    const {client, clock} = env;
    const ws = env.connect('another');
    ws.open();
    deliver(ws, {type: 'welcome', id: 1, color: '#fff'});
    deliver(ws, {type: 'block-event', from: 3, event: {}});
    clock.advance(1100);
    ok('a v1 server gets no ack frames', !ws.sent.map(d => JSON.parse(d)).some(m => m.type === 'ack'));
    ok('a v1 server keeps the v1 limits', client.send({type: 'viewport', pad: 'x'.repeat(5000)}) === true);
    client.disconnect();
});

await section('a queued v1 snapshot at a v2 welcome', () => {
    const env = setup();
    const {client} = env;
    const events = recordEvents(client);
    const ws = env.connect('held');
    client.send({type: 'snapshot', b64: 'Z'.repeat(8000), ref: 50});
    client.send({type: 'block-event', event: {type: 'move'}});
    ws.open();
    deliver(ws, v2Welcome({rs: 1}));
    ok('a queued v1 snapshot is dropped quietly when the welcome says v2',
        !events.some(e => e.on === 'frame-refused') && sentTypes(ws).includes('block-event') &&
        !sentTypes(ws).includes('snapshot'), {events, sent: sentTypes(ws)});
    client.disconnect();
});

await section('a first join answered with replay', () => {
    const env = setup();
    const {client} = env;
    const events = recordEvents(client);
    const ws = env.connect('fresh');
    ws.open();
    deliver(ws, v2Welcome({rs: 8, replay: true, snap: {sha: 'e'.repeat(64), size: 10, version: 4, atSeq: 5}}));
    ok('a first join answered with replay starts from the snapshot seq', client.rs === 5, client.rs);
    deliver(ws, {type: 'block-event', from: 3, rs: 6, event: {type: 'a'}});
    deliver(ws, {type: 'block-event', from: 3, rs: 7, event: {type: 'b'}});
    deliver(ws, {type: 'block-event', from: 3, rs: 8, event: {type: 'c'}});
    ok('the three replayed frames all apply on top of it',
        events.filter(e => e.on === 'block-event').map(e => e.rs).join() === '6,7,8' && client.rs === 8, events);
    client.disconnect();
});

await section('field and viewport are lossy', () => {
    const env = setup();
    const {client} = env;
    const ws = v2Room(env);
    ws.readyState = 3;
    ws.onclose({code: 1006, reason: ''});
    const queued = client._queue.length;
    client.send({type: 'field', targetId: 't', blockId: 'b', value: 'x'});
    client.send({type: 'viewport', x: 0, y: 0, scale: 1});
    ok('offline they are dropped, not queued', client._queue.length === queued, client._queue);
    client.send({type: 'drag', phase: 'move', blockId: 'b'});
    ok('a drag still waits for the socket', client._queue.length === queued + 1 &&
        client._queue[queued].type === 'drag', client._queue);
    client.disconnect();
});

await section('sync state', () => {
    const env = setup();
    const {client} = env;
    const states = [];
    client.on('sync-state', m => states.push(`${m.state}:${m.pending}`));
    let ws = env.connect('sync');
    ws.open();
    ok('an open socket before its welcome is offline', client.syncState.state === 'offline', client.syncState);
    deliver(ws, v2Welcome({rs: 10, replay: false}));
    ok('a welcome with nothing to replay is synced', states.join() === 'synced:0' &&
        client.syncState.state === 'synced', states);
    client.syncReloading(true);
    client.syncReloading(true);
    ok('a snapshot reload says reloading once', states.join() === 'synced:0,reloading:0', states);
    client.syncReloading(false);
    ok('and synced when it is done', states.join() === 'synced:0,reloading:0,synced:0', states);
    states.length = 0;
    ws.readyState = 3;
    ws.onclose({code: 1006, reason: ''});
    client.send({type: 'block-event', event: {type: 'move'}});
    ok('a dropped socket is offline', states.join() === 'offline:0', states);
    ok('the getter counts what waits', client.syncState.state === 'offline' && client.syncState.pending === 1,
        client.syncState);
    client._clearReconnect();
    client._open();
    ws = env.last();
    ws.open();
    states.length = 0;
    deliver(ws, v2Welcome({rs: 13, replay: true}));
    ok('a replay welcome with frames to come is catching up', states.join() === 'catching-up:0' &&
        client.rs === 10, {states, rs: client.rs});
    deliver(ws, {type: 'block-event', from: 3, rs: 11, event: {type: 'a'}});
    client.syncReloading(true);
    client.syncReloading(false);
    deliver(ws, {type: 'block-event', from: 3, rs: 12, event: {type: 'b'}});
    ok('a reload mid replay goes back to catching up',
        states.join() === 'catching-up:0,reloading:0,catching-up:0', states);
    deliver(ws, {type: 'block-event', from: 3, rs: 13, event: {type: 'c'}});
    ok('the frame at the welcome rs is synced', states[states.length - 1] === 'synced:0', states);
    states.length = 0;
    deliver(ws, v2Welcome({rs: 30, replay: false, behind: true}));
    deliver(ws, v2Welcome({rs: 35, replay: true, behind: true}));
    ok('a behind welcome waits on no frames', states.length === 0 && client.syncState.state === 'synced', states);
    deliver(ws, v2Welcome({rs: 40, replay: true}));
    ok('a replay welcome with frames to come after synced catches up', states.join() === 'catching-up:0', states);
    deliver(ws, {type: 'welcome', id: 9, color: '#fff'});
    ok('a v1 welcome has no replay to wait on', states.join() === 'catching-up:0,synced:0', states);
    client.disconnect();
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
