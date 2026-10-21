const PROTO = 2;
const BATCH_MS = 50;
const OPS_PER_SECOND = 25;
const OPS_BURST = 50;
const RTT_WEIGHT = 0.2;
const RECONNECT_MIN_MS = 250;
const RECONNECT_MAX_MS = 5000;
const BACK_OFF_MS = 5000;
const MAX_UNACKED = 200;
const MAX_OPS_PER_FRAME = 50;
const MAX_FRAME_BYTES = 8 * 1024;
const FILL_BYTES = 7 * 1024;
const OPS_KEY_BYTES = 7;
const FRAME_HEAD_BYTES = 128;
const MAX_OP_NAME = 100;
const MAX_OP_VALUE = 4096;
const STOP_CODES = new Set([1000, 1008, 1009]);
const RELOAD_CODE = 4010;
const BACK_OFF_CODE = 1013;

const gameSocketUrl = (base, slug) => {
    const origin = String(base || '').replace(/\/+$/, '')
        .replace(/^(wss?:\/\/[^/]+).*$/, '$1');
    return `${origin}/ws/room/${encodeURIComponent(slug)}/game`;
};

const encoder = new TextEncoder();

const byteLength = text => encoder.encode(text).length;

const cutOp = op => {
    const out = Object.assign({}, op);
    if (typeof out.name === 'string') out.name = out.name.slice(0, MAX_OP_NAME);
    if (typeof out.value === 'string') out.value = out.value.slice(0, MAX_OP_VALUE);
    return out;
};

const sameAvatar = (a, b) => !!a && !!b && a.length === b.length && a.every((value, i) => value === b[i]);

const createOpBucket = ({rate = OPS_PER_SECOND, burst = OPS_BURST, now}) => {
    let tokens = burst;
    let at = now();
    return {
        take () {
            const t = now();
            tokens = Math.min(burst, tokens + ((t - at) * rate / 1000));
            at = t;
            if (tokens < 1) return false;
            tokens -= 1;
            return true;
        }
    };
};

const createGameSession = ({
    url,
    WebSocketImpl,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    random = Math.random
}) => {
    const handlers = new Map();
    const bucket = createOpBucket({now});
    const unacked = [];
    let ws = null;
    let open = false;
    let closing = false;
    let attempts = 0;
    let reconnectTimer = null;
    let flushTimer = null;
    let lastFlushAt = -Infinity;
    let s = 0;
    let k = -1;
    let cid = 0;
    let slot = null;
    let resume = null;
    let rtt = null;
    let dropped = 0;
    let oversized = 0;
    let joinedWithResume = false;
    let pendingA = null;
    let lastSentA = null;
    const pendingG = [];
    let mode = null;
    let tickHz = null;

    const emit = (type, payload) => {
        const list = handlers.get(type);
        if (!list) return;
        list.slice().forEach(cb => cb(payload));
    };

    const sendRaw = frame => {
        if (!ws || !open) return false;
        try {
            ws.send(JSON.stringify(frame));
            return true;
        } catch (e) {
            return false;
        }
    };

    let schedule = null;

    const takeOps = baseBytes => {
        const ops = [];
        let bytes = baseBytes + OPS_KEY_BYTES;
        while (pendingG.length && ops.length < MAX_OPS_PER_FRAME) {
            const opBytes = pendingG[0].bytes + (ops.length ? 1 : 0);
            if (ops.length && bytes + opBytes > FILL_BYTES) break;
            ops.push(pendingG.shift().op);
            bytes += opBytes;
        }
        return ops;
    };

    const flush = () => {
        flushTimer = null;
        if (!open || (!pendingA && !pendingG.length)) return null;
        s += 1;
        const frame = {type: 'in', s, k, cid};
        if (pendingA) frame.a = pendingA;
        if (pendingG.length) frame.g = takeOps(byteLength(JSON.stringify(frame)));
        if (pendingA) lastSentA = pendingA;
        pendingA = null;
        lastFlushAt = now();
        unacked.push({s, frame, at: lastFlushAt, resent: false});
        if (unacked.length > MAX_UNACKED) unacked.splice(0, unacked.length - MAX_UNACKED);
        sendRaw(frame);
        if (pendingG.length) schedule();
        return frame;
    };

    schedule = () => {
        if (flushTimer || !open) return;
        const wait = lastFlushAt + BATCH_MS - now();
        if (wait <= 0) flush();
        else flushTimer = setTimer(flush, wait);
    };

    const settleAck = (ack, measure) => {
        if (!Number.isInteger(ack)) return;
        let sample = null;
        while (unacked.length && unacked[0].s <= ack) {
            const entry = unacked.shift();
            if (measure && entry.s === ack && !entry.resent) sample = now() - entry.at;
        }
        if (sample !== null) rtt = rtt === null ? sample : Math.round(((1 - RTT_WEIGHT) * rtt) + (RTT_WEIGHT * sample));
    };

    const onWelcome = msg => {
        attempts = 0;
        const refused = joinedWithResume && slot !== null && Number.isInteger(msg.slot) && msg.slot !== slot;
        if (refused) {
            unacked.length = 0;
            s = 0;
        }
        if (Number.isInteger(msg.slot)) slot = msg.slot;
        if (typeof msg.resume === 'string') resume = msg.resume;
        if (msg.mode === 'rules' || msg.mode === 'relay') mode = msg.mode;
        if (Number.isFinite(msg.tickHz) && msg.tickHz > 0) tickHz = msg.tickHz;
        const ack = Number.isInteger(msg.ack) ? msg.ack : 0;
        settleAck(ack, false);
        s = Math.max(ack, unacked.length ? unacked[0].s - 1 : s);
        const fits = unacked.filter(entry => {
            entry.frame.cid = cid;
            return byteLength(JSON.stringify(entry.frame)) <= MAX_FRAME_BYTES;
        });
        unacked.length = 0;
        fits.forEach(entry => {
            entry.resent = true;
            unacked.push(entry);
            sendRaw(entry.frame);
        });
        if (unacked.length) s = unacked[unacked.length - 1].s;
        emit('welcome', msg);
        schedule();
    };

    const onTick = msg => {
        settleAck(msg.ack, true);
        if (Number.isFinite(msg.t) && msg.t > k) k = msg.t;
        emit('tick', msg);
        if (Array.isArray(msg.c)) emit('correction', msg.c);
    };

    const onMessage = event => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch (e) {
            return;
        }
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'welcome') onWelcome(msg);
        else if (msg.type === 'tick') onTick(msg);
        else if (msg.type === 'rules-status') emit('rules-status', msg);
        else if (msg.type === 'game-ended') emit('ended', msg);
        else if (msg.type === 'error') emit('error', msg);
        else emit(msg.type, msg);
    };

    const reconnectDelay = code => {
        if (code === BACK_OFF_CODE) return BACK_OFF_MS + (random() * BACK_OFF_MS);
        const base = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * (2 ** attempts));
        return base + (random() * RECONNECT_MIN_MS);
    };

    let connect = null;

    const onClose = event => {
        const code = event && Number.isInteger(event.code) ? event.code : 1006;
        ws = null;
        open = false;
        if (flushTimer) clearTimer(flushTimer);
        flushTimer = null;
        if (closing) {
            emit('closed', {code, reason: 'stopped'});
            return;
        }
        if (code === RELOAD_CODE) {
            closing = true;
            emit('closed', {code, reason: 'reload'});
            return;
        }
        if (STOP_CODES.has(code) || (code >= 4000 && code !== RELOAD_CODE)) {
            closing = true;
            emit('closed', {code, reason: (event && event.reason) || 'refused'});
            return;
        }
        emit('dropped', {code});
        reconnectTimer = setTimer(() => {
            reconnectTimer = null;
            attempts += 1;
            connect();
        }, reconnectDelay(code));
    };

    connect = () => {
        if (closing) return;
        let socket;
        try {
            socket = new WebSocketImpl(url);
        } catch (e) {
            onClose({code: 1006});
            return;
        }
        ws = socket;
        socket.onopen = () => {
            if (ws !== socket) return;
            open = true;
            const join = {type: 'join', proto: PROTO};
            if (resume) join.resume = resume;
            joinedWithResume = !!resume;
            sendRaw(join);
        };
        socket.onmessage = event => {
            if (ws === socket) onMessage(event);
        };
        socket.onclose = event => {
            if (ws === socket) onClose(event);
        };
        socket.onerror = () => {};
    };

    return {
        start () {
            closing = false;
            connect();
            return this;
        },
        stop () {
            closing = true;
            if (reconnectTimer) clearTimer(reconnectTimer);
            reconnectTimer = null;
            if (flushTimer) clearTimer(flushTimer);
            flushTimer = null;
            const socket = ws;
            if (socket) {
                try {
                    socket.close(1000, 'stop');
                } catch (e) {
                    onClose({code: 1000});
                }
            } else {
                emit('closed', {code: 1000, reason: 'stopped'});
            }
        },
        setAvatar (a) {
            if (!Array.isArray(a)) return false;
            if (sameAvatar(a, pendingA || lastSentA)) return false;
            pendingA = a.slice();
            schedule();
            return true;
        },
        queueOp (op) {
            if (!op || typeof op !== 'object' || typeof op.action !== 'string') return false;
            const cut = cutOp(op);
            const bytes = byteLength(JSON.stringify(cut));
            if (FRAME_HEAD_BYTES + OPS_KEY_BYTES + bytes > MAX_FRAME_BYTES) {
                oversized += 1;
                return false;
            }
            if (!bucket.take()) {
                dropped += 1;
                return false;
            }
            pendingG.push({op: cut, bytes});
            schedule();
            return true;
        },
        setCid (next) {
            if (Number.isInteger(next) && next > cid) cid = next;
        },
        on (type, cb) {
            if (!handlers.has(type)) handlers.set(type, []);
            handlers.get(type).push(cb);
            return () => {
                const list = handlers.get(type);
                const i = list ? list.indexOf(cb) : -1;
                if (i >= 0) list.splice(i, 1);
            };
        },
        flush,
        get open () {
            return open;
        },
        get stopped () {
            return closing;
        },
        get slot () {
            return slot;
        },
        get mode () {
            return mode;
        },
        get tickHz () {
            return tickHz;
        },
        get rtt () {
            return rtt;
        },
        get k () {
            return k;
        },
        get s () {
            return s;
        },
        get cid () {
            return cid;
        },
        get dropped () {
            return dropped;
        },
        get oversized () {
            return oversized;
        },
        get unacked () {
            return unacked.length;
        }
    };
};

export {
    PROTO,
    BATCH_MS,
    OPS_PER_SECOND,
    OPS_BURST,
    MAX_OPS_PER_FRAME,
    MAX_FRAME_BYTES,
    MAX_OP_NAME,
    MAX_OP_VALUE,
    cutOp,
    gameSocketUrl,
    createGameSession
};
