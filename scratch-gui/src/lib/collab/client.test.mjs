/*
 * The collab WebSocket client, tested without a browser:
 *   node src/lib/collab/client.test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
    }
};

const sockets = [];
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

const store = {};
const sandboxGlobals = `
const WebSocket = globalThis.__FakeWebSocket;
const localStorage = globalThis.__localStorage;
const location = globalThis.__location;
`;
globalThis.__location = {hostname: 'test.invalid', host: 'test.invalid', port: ''};
globalThis.__FakeWebSocket = FakeWebSocket;
globalThis.__localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => {
        store[k] = String(v);
    }
};

const src = fs.readFileSync(path.join(here, 'client.js'), 'utf8')
    .replace(/^export default client;\s*$/m, 'return client;');
// eslint-disable-next-line no-new-func
const client = new Function(`${sandboxGlobals}${src}`)();

client.connect({url: 'ws://test.invalid', room: 'r1', name: 'Tester'});
let ws = sockets[sockets.length - 1];
ws.open();
ws.message({type: 'welcome', id: 'u1', color: '#fff'});
ok('welcome marks the client connected', client.connected === true);
ok('heartbeat runs while connected', client._heartbeatTimer !== null);

client.closeForUnload();
ok('pagehide close stops the heartbeat', client._heartbeatTimer === null);
ok('pagehide close drops the socket', client.ws === null && client.connected === false);

client.resumeIfNeeded();
ws = sockets[sockets.length - 1];
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
client._clearReconnect();

const realSetTimeout = globalThis.setTimeout;
let seenDelay = null;
globalThis.setTimeout = (fn, delay) => {
    seenDelay = delay;
    return 0;
};
client._backoff = 10000;
client._scheduleReconnect();
globalThis.setTimeout = realSetTimeout;
ok('reconnect delay is jittered around the backoff',
    seenDelay >= 7500 && seenDelay <= 12500 && client._backoff === 15000, seenDelay);
client._reconnectTimer = null;

client.disconnect();
client.connect({url: 'ws://test.invalid', room: 'r1', name: 'Tester'});
client._queue = [];
client.send({type: 'snapshot', b64: 'AAA', cacheOnly: false, force: true, reset: false});
client.send({type: 'block-event', target: 'Sprite1', event: {type: 'move'}});
client.send({type: 'snapshot', b64: 'BBB', cacheOnly: true, force: false, reset: false});
ok('a newer queued snapshot supersedes the older one', client._queue.length === 2, client._queue);
const queuedSnap = JSON.parse(client._queue[1]);
ok('the surviving snapshot is the newest', queuedSnap.b64 === 'BBB', queuedSnap);
ok('force from the superseded snapshot carries over', queuedSnap.force === true, queuedSnap);
ok('non-snapshot messages stay queued ahead of it',
    JSON.parse(client._queue[0]).type === 'block-event', client._queue[0]);

client.disconnect();
store.st_token = 'device-token';
const joinOf = sock => sock.sent.map(d => JSON.parse(d)).find(m => m.type === 'join');

client.connect({url: 'wss://test.invalid', room: 'r1', name: 'Tester'});
ws = sockets[sockets.length - 1];
ws.open();
ok('the device token goes to the page\'s own server', joinOf(ws).token === 'device-token', joinOf(ws));
client.disconnect();

client.connect({url: 'wss://evil.example', room: 'r1', name: 'Tester'});
ws = sockets[sockets.length - 1];
ws.open();
ok('the device token never goes to another origin', joinOf(ws).token === undefined, joinOf(ws));
ws.message({type: 'welcome', id: 'u1', color: '#fff', token: 'planted'});
ok('a foreign server cannot plant a device token', store.st_token === 'device-token', store.st_token);
client.disconnect();

client.connect({url: 'ws://test.invalid.evil.example', room: 'r1', name: 'Tester'});
ws = sockets[sockets.length - 1];
ws.open();
ok('a look-alike host is another origin', joinOf(ws).token === undefined, joinOf(ws));
client.disconnect();

const fresh = () => {
    client.disconnect();
    client.connect({url: 'ws://test.invalid', room: 'r1', name: 'Tester'});
    const sock = sockets[sockets.length - 1];
    sock.open();
    sock.message({type: 'welcome', id: 'u1', color: '#fff'});
    return sock;
};
const sentTypes = sock => sock.sent.map(d => JSON.parse(d).type);

ws = fresh();
let downs = [];
client.on('disconnected', m => downs.push(m));
client._lastInbound = Date.now() - 11000;
client._heartbeat();
ok('ten seconds of silence marks the socket dead', client.connected === false && downs.length === 1, downs);
ok('a dead socket with nothing sent reports nothing unconfirmed', downs[0] && downs[0].unconfirmed === false, downs);
ok('the dead socket is replaced', client.ws !== ws && sockets[sockets.length - 1] === client.ws);
ok('the silence limit backs off after a trip', client._silenceLimit === 20000, client._silenceLimit);

ws = fresh();
client._silenceLimit = 10000;
downs = [];
client.send({type: 'block-event', target: 'Sprite1', event: {type: 'create'}});
client._lastInbound = Date.now() - 11000;
client._heartbeat();
ok('an edit written into a dead socket is reported unconfirmed', downs[0] && downs[0].unconfirmed === true, downs);

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
client._lastInbound = Date.now() - 11000;
downs = [];
client._heartbeat();
ok('an upload still draining is not silence', client.connected === true && downs.length === 0, downs);
ws.bufferedAmount = 0;

client.disconnect();
client.connect({url: 'ws://test.invalid', room: 'r1', name: 'Tester'});
ws = sockets[sockets.length - 1];
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
client.connect({url: 'ws://test.invalid', room: 'r1', name: 'Tester'});
ws = sockets[sockets.length - 1];
client.send({type: 'block-event', target: 'Sprite1', event: {type: 'move'}});
ws.open();
ws.message({type: 'welcome', id: 'u1', color: '#fff'});
ok('an undecided queue still flushes after the welcome', sentTypes(ws).includes('block-event'), sentTypes(ws));

ws = fresh();
let release;
client.unloadGuard = () => new Promise(r => {
    release = r;
});
client.closeForUnload();
ok('leaving with a save in flight keeps the socket open', client.ws === ws && ws.readyState === 1);
release();
await new Promise(r => setTimeout(r, 0));
ok('the socket closes once the save is handed over', client.ws === null && ws.readyState === 3);

ws = fresh();
client.unloadGuard = () => new Promise(() => {});
client.closeForUnload();
client.resumeIfNeeded();
await new Promise(r => setTimeout(r, 3100));
ok('a bfcache restore cancels the pending close', client.ws === ws && ws.readyState === 1);
client.unloadGuard = null;

client.disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
