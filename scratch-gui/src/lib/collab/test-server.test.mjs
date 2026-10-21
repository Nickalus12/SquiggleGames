process.removeAllListeners('warning');

const {default: WebSocket} = await import('ws');
const {createTestServer} = await import('./test-server.mjs');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${typeof detail === 'undefined' ? '' : `: ${JSON.stringify(detail)}`}`);
    }
};

const server = await createTestServer();
const url = `ws://127.0.0.1:${server.port}`;

const open = name => new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    const waiters = [];
    ws.on('message', raw => {
        const msg = JSON.parse(raw);
        inbox.push(msg);
        waiters.slice().forEach(w => {
            if (w.test(msg)) {
                waiters.splice(waiters.indexOf(w), 1);
                w.resolve(msg);
            }
        });
    });
    ws.on('error', reject);
    ws.on('open', () => {
        const peer = {
            ws,
            inbox,
            send: msg => ws.send(JSON.stringify(msg)),
            next: (type, extra = () => true) => {
                const test = m => m.type === type && extra(m);
                const seen = inbox.find(test);
                if (seen) {
                    inbox.splice(inbox.indexOf(seen), 1);
                    return Promise.resolve(seen);
                }
                return new Promise((done, failed) => {
                    const w = {test,
                        resolve: m => {
                            inbox.splice(inbox.indexOf(m), 1);
                            done(m);
                        }};
                    waiters.push(w);
                    setTimeout(() => failed(new Error(`timeout ${type}`)), 2000);
                });
            }
        };
        peer.send({type: 'join', proto: 2, room: 'stub-room', name});
        resolve(peer);
    });
});

try {
    console.log('join');
    const a = await open('Ada Test');
    const wa = await a.next('welcome');
    ok('the first joiner owns the room', wa.role === 'owner' && wa.canEdit === true);
    ok('welcome lists the joiner', wa.peers.length === 1 && wa.peers[0].id === wa.id);
    ok('welcome carries me', wa.me.displayName === 'Ada Test' && wa.me.isChild === false);
    ok('an empty room has no snapshot', wa.hasSnapshot === false);
    const ca = await a.next('room-chat-config');
    ok('chat starts unlocked', ca.locked === false && ca.canModerate === true);

    a.send({type: 'snapshot', b64: 'UEsDBA=='});
    const ack = await a.next('snapshot-ack');
    ok('a snapshot is acked with a version', ack.version === 1);

    const b = await open('Bo Test');
    const wb = await b.next('welcome');
    ok('the second joiner edits', wb.role === 'editor' && wb.peers.length === 2);
    ok('the second joiner sees the snapshot flag', wb.hasSnapshot === true);
    const snap = await b.next('snapshot');
    ok('the second joiner gets the stored snapshot', snap.b64 === 'UEsDBA==' && snap.author === 'Ada Test');
    const joined = await a.next('peer-joined');
    ok('the first joiner hears peer-joined', joined.peer.id === wb.id && joined.peer.name === 'Bo Test');

    console.log('relay');
    a.send({type: 'cursor', x: 10, y: 20});
    const cur = await b.next('cursor');
    ok('cursor relays with from', cur.from === wa.id && cur.x === 10);
    a.send({type: 'drag', targetId: 't', blockId: 'b', phase: 'start'});
    const drag = await b.next('drag');
    ok('drag relays with from', drag.from === wa.id && drag.phase === 'start');
    b.send({type: 'block-event', e: {}});
    const be = await a.next('block-event');
    ok('block events carry a room seq', be.rs === 1 && be.from === wb.id);
    ok('the sender does not hear its own relay', !b.inbox.some(m => m.type === 'block-event'));

    console.log('guest lock');
    const g = await open('Guest Cy');
    const wg = await g.next('welcome');
    ok('a guest joins as a guest that cannot edit', wg.role === 'guest' && wg.canEdit === false);
    const la = await a.next('room-chat-config', m => m.locked === true);
    ok('a guest locks chat for everyone', la.mode === 'quick');
    g.ws.close();
    const left = await a.next('peer-left');
    ok('leaving tells the room', left.id === wg.id);
    const ua = await a.next('room-chat-config', m => m.locked === false);
    ok('the lock lifts when the guest goes', ua.mode === 'free');

    console.log('chat and ping');
    b.send({type: 'room-chat', phrase: 'hi'});
    const line = await a.next('room-chat');
    ok('a phrase reaches the room by id', line.phrase === 'hi' && line.text === '' && line.mine === false);
    const own = await b.next('room-chat');
    ok('the sender sees its own line as mine', own.mine === true);
    a.send({type: 'ping', t: 5});
    const pong = await a.next('pong');
    ok('ping answers pong', pong.t === 5);

    console.log('inject');
    ok('peers lists the room', server.peers('stub-room').map(p => p.id)
        .join() === [wa.id, wb.id].join());
    ok('peers of an unknown room is empty', server.peers('nope').length === 0);
    const sent = server.inject('stub-room', {type: 'drag', from: wb.id, blockId: 'x', phase: 'move'}, wb.id);
    const injected = await a.next('drag', m => m.blockId === 'x');
    ok('inject reaches everyone but the excepted peer', sent === 1 && injected.from === wb.id);
    ok('inject into an unknown room sends nothing', server.inject('nope', {type: 'drag'}) === 0);

    a.ws.close();
    b.ws.close();
    await new Promise(r => setTimeout(r, 50));
    ok('an empty room is dropped', server.rooms.size === 0);
} catch (e) {
    ok('no timeouts', false, e.message);
} finally {
    await server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
