import {PEER_COLORS, PEER_SHAPES, PEER_SLOTS, peerSlot, styleForSlot} from '../themes/peers.js';

const DRAG_LOCK_MS = 1500;
const DRAG_MOVE_EVERY_MS = 500;
const VIEWPORT_EVERY_MS = 1000;
const FOLLOW_GRACE_MS = 300;
const FIELD_TTL_MS = 10000;

const TABS = ['code', 'costumes', 'sounds'];

const createStyleBook = () => {
    const held = new Map();

    const pick = id => {
        const start = peerSlot(id);
        const n = held.size + 1;
        const colorCap = Math.max(1, Math.ceil(n / PEER_COLORS.length));
        const shapeCap = Math.max(1, Math.ceil(n / PEER_SHAPES.length));
        const used = new Set();
        const colorCount = new Array(PEER_COLORS.length).fill(0);
        const shapeCount = new Array(PEER_SHAPES.length).fill(0);
        for (const slot of held.values()) {
            used.add(slot);
            colorCount[slot % PEER_COLORS.length]++;
            shapeCount[Math.floor(slot / PEER_COLORS.length)]++;
        }
        for (let step = 0; step < PEER_SLOTS; step++) {
            const slot = (start + step) % PEER_SLOTS;
            const color = slot % PEER_COLORS.length;
            const shape = Math.floor(slot / PEER_COLORS.length);
            if (!used.has(slot) && colorCount[color] < colorCap && shapeCount[shape] < shapeCap) return slot;
        }
        for (let step = 0; step < PEER_SLOTS; step++) {
            const slot = (start + step) % PEER_SLOTS;
            if (!used.has(slot)) return slot;
        }
        return start;
    };

    return {
        assign (id) {
            const key = String(id);
            if (!held.has(key)) held.set(key, pick(key));
            return styleForSlot(held.get(key));
        },
        get (id) {
            const key = String(id);
            return held.has(key) ? styleForSlot(held.get(key)) : null;
        },
        release (id) {
            held.delete(String(id));
        },
        reset () {
            held.clear();
        },
        get size () {
            return held.size;
        }
    };
};

const createLocks = ({now = () => Date.now(), ttl = DRAG_LOCK_MS} = {}) => {
    const byPeer = new Map();

    const sweep = () => {
        const t = now();
        for (const [peer, lock] of byPeer) {
            if (lock.until <= t) byPeer.delete(peer);
        }
    };

    return {
        apply (from, frame) {
            if (!frame || typeof frame.blockId !== 'string' || !frame.blockId) return null;
            if (frame.phase === 'end') {
                byPeer.delete(from);
                return null;
            }
            if (frame.phase !== 'start' && frame.phase !== 'move') return null;
            const lock = {
                peer: from,
                targetId: typeof frame.targetId === 'string' ? frame.targetId : null,
                blockId: frame.blockId,
                until: now() + ttl
            };
            byPeer.set(from, lock);
            return lock;
        },
        release (from) {
            byPeer.delete(from);
        },
        holder (blockId, targetId) {
            sweep();
            for (const lock of byPeer.values()) {
                const sameTarget = !targetId || !lock.targetId || lock.targetId === targetId;
                if (lock.blockId === blockId && sameTarget) return lock;
            }
            return null;
        },
        remaining (blockId, targetId) {
            const lock = this.holder(blockId, targetId);
            return lock ? Math.max(0, lock.until - now()) : 0;
        },
        list () {
            sweep();
            return [...byPeer.values()];
        },
        clear () {
            byPeer.clear();
        }
    };
};

const createFields = ({now = () => Date.now(), ttl = FIELD_TTL_MS} = {}) => {
    const byPeer = new Map();
    return {
        apply (from, frame) {
            if (!frame || frame.on !== true || typeof frame.blockId !== 'string') {
                byPeer.delete(from);
                return null;
            }
            const entry = {
                peer: from,
                targetId: typeof frame.targetId === 'string' ? frame.targetId : null,
                blockId: frame.blockId,
                until: now() + ttl
            };
            byPeer.set(from, entry);
            return entry;
        },
        release (from) {
            byPeer.delete(from);
        },
        list () {
            const t = now();
            for (const [peer, entry] of byPeer) {
                if (entry.until <= t) byPeer.delete(peer);
            }
            return [...byPeer.values()];
        },
        holder (blockId) {
            return this.list().find(entry => entry.blockId === blockId) || null;
        },
        clear () {
            byPeer.clear();
        }
    };
};

const createFollow = ({now = () => Date.now(), grace = FOLLOW_GRACE_MS} = {}) => {
    let peer = null;
    let since = 0;
    let last = null;
    const listeners = new Set();
    const emit = reason => {
        for (const cb of listeners) cb({following: peer, reason});
    };

    return {
        get following () {
            return peer;
        },
        subscribe (cb) {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        start (id, known) {
            if (id === null || typeof id === 'undefined') return false;
            if (typeof known === 'function' && !known(id)) return false;
            peer = id;
            since = now();
            last = null;
            emit('start');
            return true;
        },
        stop (reason) {
            if (peer === null) return false;
            peer = null;
            last = null;
            emit(reason || 'stop');
            return true;
        },
        input (kind) {
            if (peer === null) return false;
            if (kind !== 'escape' && now() - since < grace) return false;
            return this.stop(kind === 'escape' ? 'escape' : 'input');
        },
        peerLeft (id) {
            return peer === id ? this.stop('left') : false;
        },
        viewport (from, frame) {
            if (peer === null || from !== peer || !frame) return null;
            const view = {
                targetId: typeof frame.targetId === 'string' ? frame.targetId : null,
                tab: TABS.indexOf(frame.tab) === -1 ? 'code' : frame.tab,
                x: Number.isFinite(frame.x) ? frame.x : null,
                y: Number.isFinite(frame.y) ? frame.y : null,
                zoom: Number.isFinite(frame.zoom) && frame.zoom > 0 ? frame.zoom : null
            };
            last = view;
            return view;
        },
        get last () {
            return last;
        }
    };
};

const createGate = (every, now = () => Date.now()) => {
    let at = -Infinity;
    return {
        ready () {
            const t = now();
            if (t - at < every) return false;
            at = t;
            return true;
        },
        reset () {
            at = -Infinity;
        }
    };
};

const initials = name => {
    const words = String(name || '').trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return '?';
    const first = Array.from(words[0])[0] || '';
    const second = words.length > 1 ? (Array.from(words[words.length - 1])[0] || '') : '';
    return (first + second).toUpperCase();
};

export {
    DRAG_LOCK_MS,
    DRAG_MOVE_EVERY_MS,
    FIELD_TTL_MS,
    FOLLOW_GRACE_MS,
    TABS,
    VIEWPORT_EVERY_MS,
    createFields,
    createFollow,
    createGate,
    createLocks,
    createStyleBook,
    initials
};
