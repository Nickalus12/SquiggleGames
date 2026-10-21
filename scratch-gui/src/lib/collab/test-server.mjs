import WebSocket from 'ws';
import {fileURLToPath} from 'url';

const COLORS = ['#7c5cff', '#1f9d74', '#e8590c', '#0a7089', '#c2255c', '#5c940d'];
const RELAY = new Set([
    'cursor', 'presence', 'sprite-info', 'drag', 'field', 'viewport', 'phrase', 'block-event', 'vm-action'
]);
const QUIET = new Set(['ack', 'pong']);

const createTestServer = ({port = 0, host = '127.0.0.1', log = () => {}} = {}) => {
    const rooms = new Map();
    let nextId = 1;

    const roomFor = slug => {
        if (!rooms.has(slug)) {
            rooms.set(slug, {slug, peers: new Map(), snapshot: null, version: 0, chatOn: true, chat: [], seq: 0});
        }
        return rooms.get(slug);
    };
    const send = (ws, msg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const broadcast = (room, msg, except) => {
        room.peers.forEach((peer, ws) => {
            if (ws !== except) send(ws, msg);
        });
    };
    const peerCard = p => ({id: p.id, name: p.name, color: p.color, cursor: p.cursor, role: p.role, userId: p.userId});
    const locked = room => [...room.peers.values()].some(p => p.role === 'guest');
    const chatConfig = (room, peer) => ({
        type: 'room-chat-config',
        mode: peer.role === 'guest' || locked(room) ? 'quick' : 'free',
        on: room.chatOn,
        muted: false,
        locked: locked(room),
        phrases: [],
        canModerate: peer.role === 'owner'
    });
    const pushConfig = room => room.peers.forEach((peer, ws) => send(ws, chatConfig(room, peer)));

    const join = (ws, msg) => {
        const room = roomFor(String(msg.room || 'test-room'));
        const name = String(msg.name || 'Tester').slice(0, 40);
        const guest = /^guest/i.test(name);
        let role = room.peers.size ? 'editor' : 'owner';
        if (guest) role = 'guest';
        const id = `p${nextId++}`;
        const slot = room.peers.size % COLORS.length;
        const peer = {
            id, name, role, userId: guest ? null : nextId, color: COLORS[slot], cursor: {slot: (nextId * 5) % 72}
        };
        room.peers.set(ws, peer);
        ws.sq = {room, peer};
        send(ws, {
            type: 'welcome',
            proto: 1,
            id,
            color: peer.color,
            cursor: peer.cursor,
            room: room.slug,
            title: room.slug,
            role,
            canEdit: role !== 'guest',
            me: {handle: name.toLowerCase().replace(/\W+/g, ''), displayName: name, isChild: false, member: id},
            visibility: 'private',
            peers: [...room.peers.values()].map(peerCard),
            hasSnapshot: !!room.snapshot,
            version: room.version,
            projects: [],
            gameVars: {}
        });
        send(ws, {type: 'room-chat-history', messages: room.chat.slice(-50)});
        broadcast(room, {type: 'peer-joined', peer: peerCard(peer)}, ws);
        pushConfig(room);
        if (room.snapshot) {
            send(ws, {type: 'snapshot', b64: room.snapshot.b64, version: room.version, author: room.snapshot.author});
        }
        log(`join ${room.slug} ${id} ${role}`);
    };

    const handle = (ws, msg) => {
        if (msg.type === 'ping') {
            send(ws, {type: 'pong', t: msg.t});
            return;
        }
        if (msg.type === 'join') {
            join(ws, msg);
            return;
        }
        if (!ws.sq || QUIET.has(msg.type)) return;
        const {room, peer} = ws.sq;
        if (RELAY.has(msg.type)) {
            const out = Object.assign({}, msg, {from: peer.id, fromName: peer.name, color: peer.color});
            if (msg.type === 'block-event' || msg.type === 'vm-action') out.rs = ++room.seq;
            broadcast(room, out, ws);
            return;
        }
        if (msg.type === 'snapshot' && typeof msg.b64 === 'string') {
            room.version += 1;
            room.snapshot = {b64: msg.b64, author: peer.name};
            send(ws, {type: 'snapshot-ack', version: room.version});
            if (!msg.cacheOnly) {
                broadcast(room, {type: 'snapshot', b64: msg.b64, version: room.version, author: peer.name}, ws);
            }
            return;
        }
        if (msg.type === 'room-chat' && typeof msg.phrase === 'string') {
            const line = {
                id: `c${room.chat.length + 1}`,
                member: peer.id,
                name: peer.name,
                color: peer.color,
                text: '',
                phrase: msg.phrase,
                ts: Date.now()
            };
            room.chat.push(line);
            room.chat = room.chat.slice(-50);
            room.peers.forEach((p, sock) => send(sock, Object.assign({type: 'room-chat', mine: sock === ws}, line)));
            return;
        }
        if (msg.type === 'save-project') {
            send(ws, {type: 'project-saved', name: msg.name, quiet: !!msg.quiet});
        }
    };

    const leave = ws => {
        if (!ws.sq) return;
        const {room, peer} = ws.sq;
        room.peers.delete(ws);
        broadcast(room, {type: 'peer-left', id: peer.id});
        pushConfig(room);
        if (!room.peers.size) rooms.delete(room.slug);
        log(`leave ${room.slug} ${peer.id}`);
    };

    const wss = new WebSocket.Server({port, host});
    wss.on('connection', ws => {
        ws.on('message', raw => {
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch (e) {
                return;
            }
            if (msg && typeof msg.type === 'string') handle(ws, msg);
        });
        ws.on('close', () => leave(ws));
    });

    return new Promise(resolve => {
        wss.on('listening', () => resolve({
            port: wss.address().port,
            rooms,
            close: () => new Promise(done => {
                wss.clients.forEach(c => c.terminate());
                wss.close(() => done());
            })
        }));
    });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const port = Number(process.argv[2]) || 8649;
    createTestServer({port, log: line => console.log(line)})
        .then(s => console.log(`collab test server on ws://127.0.0.1:${s.port}`));
}

export {createTestServer};
