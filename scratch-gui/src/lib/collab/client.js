/* WebSocket client for Squiggle: auto-reconnect, typed message handlers,
 * brief outbound queue so a blip doesn't drop block edits mid-drag. */

// Lossy traffic — safe to drop under backpressure or while offline.
const LOSSY = new Set(['cursor', 'presence', 'sprite-info']);
// Reliable traffic is queued briefly across reconnects (block edits, snapshots…).
const MAX_QUEUE = 80;
const MAX_BUFFERED = 2 * 1024 * 1024; // ~2MB socket buffer → start dropping lossy
const MAX_FRAME = 64 * 1024 * 1024;
const FRAME_LIMITS = new Map([
    ['snapshot', MAX_FRAME],
    ['save-project', MAX_FRAME],
    ['vm-action', 32 * 1024 * 1024],
    ['block-event', 4 * 1024 * 1024],
    ['play-sync', 512 * 1024],
    ['game', 32 * 1024],
    ['cursor', 4 * 1024],
    ['presence', 4 * 1024]
]);
const DEFAULT_FRAME_LIMIT = 64 * 1024;

const utf8Length = s => {
    let n = s.length;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0x800 && (c < 0xd800 || c > 0xdfff)) n += 2;
        else if (c >= 0x80) n += 1;
    }
    return n;
};
const frameSize = (data, limit) => (data.length > limit || data.length * 3 <= limit ?
    data.length : utf8Length(data));

/*
 * Liveness. The server pings every 30s and drops sockets that stop answering,
 * so IT always notices a dead client. The reverse was never true: a socket
 * whose path dies without a close frame — phone leaving wifi, NAT dropping the
 * mapping, a laptop lid — stays readyState OPEN in the browser forever. Every
 * edit after that goes into a socket that reaches nobody, while the presence
 * dot stays green. So the client keeps its own clock: a small ping on an idle
 * connection, and a reconnect if nothing at all comes back.
 *
 * Browsers don't surface protocol-level pongs to JS, which is why this is an
 * application ping rather than a "no frames in 90s" rule — an idle-but-healthy
 * room sends no traffic for minutes and must not be torn down for it.
 */
const HEARTBEAT_MS = 2000;
const PING_IDLE_MS = 4000;
const PING_BUSY_MS = 1000;
const SILENCE_LIMIT_MS = 10000;
const SILENCE_MAX_MS = 60000;
const SILENCE_RELAX_MS = 5 * 60 * 1000;
const UNLOAD_GRACE_MS = 3000;
// A socket can sit in CONNECTING indefinitely (this is what a sleeping laptop
// wakes up to). resumeIfNeeded deliberately won't touch a handshake in flight,
// so the handshake needs its own deadline or nothing ever replaces it.
const CONNECT_TIMEOUT_MS = 12000;

const ownsSocketUrl = url => {
    if (typeof location === 'undefined') return false;
    try {
        const target = new URL(url);
        if (target.hostname !== location.hostname) return false;
        return target.host === location.host || location.port === '8601';
    } catch (e) {
        return false;
    }
};

class CollabClient {
    constructor () {
        this.ws = null;
        this.handlers = {};
        this.connected = false;
        this.session = null; // {url, room, name}
        this.me = null; // {id, color}
        this._backoff = 1000;
        this._closedByUser = false;
        this._reconnectTimer = null;
        this._queue = []; // reliable messages waiting for an open socket
        this._openGen = 0; // ignore stale socket callbacks after supersede
        this._connectTimer = null;
        this._heartbeatTimer = null;
        this._lastInbound = 0;
        this._lastProgress = 0;
        this._lastBuffered = 0;
        this._lastPingAt = 0;
        this._pingCovers = [];
        this._sentGen = 0;
        this._confirmedGen = 0;
        this._learnedLimits = new Map();
        this._largestSent = null;
        this._silenceLimit = SILENCE_LIMIT_MS;
        this._lastSilenceAt = 0;
        this._holding = false;
        this._cancelUnload = null;
        this.unloadGuard = null;
        // Set when the reliable queue had to drop something. Whoever is
        // listening owes the room a full resync — see 'queue-overflow'.
        this.droppedReliable = false;
    }

    on (type, cb) {
        (this.handlers[type] = this.handlers[type] || []).push(cb);
    }

    _emit (type, msg) {
        const list = this.handlers[type];
        if (!list || !list.length) return;
        for (let i = 0; i < list.length; i++) {
            try {
                list[i](msg);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[collab] handler error', type, e);
            }
        }
    }

    connect ({url, room, name}) {
        this.session = {url, room, name};
        this._closedByUser = false;
        this._backoff = 1000;
        this._startHeartbeat();
        this._open();
    }

    _clearReconnect () {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    _clearConnectTimer () {
        if (this._connectTimer) {
            clearTimeout(this._connectTimer);
            this._connectTimer = null;
        }
    }

    _startHeartbeat () {
        if (this._heartbeatTimer) return;
        this._heartbeatTimer = setInterval(() => this._heartbeat(), HEARTBEAT_MS);
    }

    _stopHeartbeat () {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    /* Nothing heard back for two heartbeats: the socket says OPEN but there is
     * nobody on the other end of it. Replace it rather than keep writing into
     * a pipe that goes nowhere. */
    _heartbeat () {
        if (this._closedByUser || !this.session) return;
        if (!this.ws || this.ws.readyState !== 1) return;
        const now = Date.now();
        const buffered = this.ws.bufferedAmount || 0;
        if (buffered && buffered < this._lastBuffered) this._lastProgress = now;
        this._lastBuffered = buffered;
        const hidden = typeof document !== 'undefined' && document.hidden;
        const heard = Math.max(this._lastInbound, this._lastProgress);
        if (!hidden && heard && now - heard > this._silenceLimit) {
            this._lastSilenceAt = now;
            this._silenceLimit = Math.min(this._silenceLimit * 2, SILENCE_MAX_MS);
            const wasConnected = this.connected;
            this.connected = false;
            if (wasConnected) this._emit('disconnected', {unconfirmed: this._takeUnconfirmed()});
            this._backoff = 1000;
            this._open();
            return;
        }
        const busy = this._sentGen > this._confirmedGen;
        if (now - this._lastPingAt < (busy ? PING_BUSY_MS : PING_IDLE_MS)) return;
        this._lastPingAt = now;
        this._pingCovers.push(this._sentGen);
        if (this._pingCovers.length > 64) this._pingCovers.shift();
        try {
            this.ws.send(JSON.stringify({type: 'ping'}));
        } catch (e) { /* the close handler will pick this up */ }
    }

    _takeUnconfirmed () {
        const unconfirmed = this._sentGen > this._confirmedGen;
        this._confirmedGen = this._sentGen;
        this._pingCovers = [];
        return unconfirmed;
    }

    _onPong () {
        const covered = this._pingCovers.shift();
        if (typeof covered === 'number' && covered > this._confirmedGen) this._confirmedGen = covered;
        if (this._silenceLimit !== SILENCE_LIMIT_MS && Date.now() - this._lastSilenceAt > SILENCE_RELAX_MS) {
            this._silenceLimit = SILENCE_LIMIT_MS;
        }
    }

    get generation () {
        return this._openGen;
    }

    get holdingQueue () {
        return this._holding;
    }

    releaseQueue () {
        this._holding = false;
        this._flushQueue();
    }

    discardQueue () {
        this._holding = false;
        const dropped = this._queue.length;
        this._queue = [];
        return dropped;
    }

    _open () {
        if (!this.session || this._closedByUser) return;
        this._startHeartbeat();
        this._clearReconnect();
        this._clearConnectTimer();

        // Supersede any in-flight socket so its onclose can't double-reconnect.
        const gen = ++this._openGen;
        if (this.ws) {
            try {
                this.ws.onopen = null;
                this.ws.onmessage = null;
                this.ws.onclose = null;
                this.ws.onerror = null;
                this.ws.close();
            } catch (e) { /* already dead */ }
            this.ws = null;
        }

        const {url, room, name} = this.session;
        let ws;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            this._scheduleReconnect();
            return;
        }
        this.ws = ws;
        this._lastInbound = Date.now();
        this._lastProgress = 0;
        this._lastBuffered = 0;
        this._lastPingAt = Date.now();
        this._pingCovers = [];
        this._holding = false;
        this._largestSent = null;
        this._connectTimer = setTimeout(() => {
            this._connectTimer = null;
            if (gen !== this._openGen || !this.ws || this.ws.readyState !== 0) return;
            // Still handshaking well past any reasonable round trip. Tear it
            // down; the close path schedules the retry.
            try {
                this.ws.close();
            } catch (e) { /* already dying */ }
        }, CONNECT_TIMEOUT_MS);

        ws.onopen = () => {
            if (gen !== this._openGen) return;
            this._clearConnectTimer();
            this._lastInbound = Date.now();
            // Persistent device identity: token issued by the server on first
            // join, kept in localStorage — name-only login stays that simple.
            let token = null;
            try {
                token = ownsSocketUrl(url) ? localStorage.getItem('st_token') : null;
            } catch (e) {
                token = null;
            }
            const join = {type: 'join', room, name};
            if (token) join.token = token;
            ws.send(JSON.stringify(join));
        };
        ws.onmessage = evt => {
            if (gen !== this._openGen) return;
            this._lastInbound = Date.now();
            let msg;
            try {
                msg = JSON.parse(evt.data);
            } catch (e) {
                return;
            }
            if (msg.type === 'pong') {
                this._onPong();
                return;
            }
            if (msg.type === 'welcome') {
                this.connected = true;
                this._backoff = 1000;
                this.me = {id: msg.id, color: msg.color};
                if (msg.token && ownsSocketUrl(url)) {
                    try {
                        localStorage.setItem('st_token', msg.token);
                    } catch (e) { /* private mode */ }
                }
                this._confirmedGen = this._sentGen;
                this._holding = this._queue.length > 0;
                this._emit('welcome', msg);
                if (this._holding) this.releaseQueue();
                return;
            }
            this._emit(msg.type, msg);
        };
        ws.onclose = event => {
            if (gen !== this._openGen) return;
            this._clearConnectTimer();
            const wasConnected = this.connected;
            this.connected = false;
            this.ws = null;
            this._holding = false;
            const code = event && typeof event.code === 'number' ? event.code : 0;
            const reason = event && typeof event.reason === 'string' ? event.reason : '';
            const dropped = code === 1009 && reason !== 'too-much-data' ? this._learnFrameLimit() : null;
            if (wasConnected) {
                this._emit('disconnected', {
                    unconfirmed: this._takeUnconfirmed(),
                    code,
                    reason,
                    dropped
                });
            }
            if (dropped) this._purgeOversized();
            if (!this._closedByUser) this._scheduleReconnect();
        };
        ws.onerror = () => { /* onclose follows */ };
    }

    _scheduleReconnect () {
        if (this._closedByUser || !this.session) return;
        this._clearReconnect();
        const delay = this._backoff * (0.75 + (Math.random() * 0.5));
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (!this._closedByUser && this.session) this._open();
        }, delay);
        this._backoff = Math.min(this._backoff * 1.6, 15000);
    }

    // Reconnect immediately when the tab comes back (laptop sleep / ZeroTier blip).
    resumeIfNeeded () {
        if (this._cancelUnload) this._cancelUnload();
        if (this._closedByUser || !this.session) return;
        // Don't kill a healthy open socket OR an in-flight CONNECTING handshake.
        if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
        this._backoff = 1000;
        this._open();
    }

    _frameLimit (type) {
        const limit = FRAME_LIMITS.get(type) || DEFAULT_FRAME_LIMIT;
        const learned = this._learnedLimits.get(type);
        return typeof learned === 'number' ? Math.min(limit, learned) : limit;
    }

    _noteSent (entry) {
        const ratio = entry.size / this._frameLimit(entry.type);
        if (!this._largestSent || ratio > this._largestSent.ratio) {
            this._largestSent = {type: entry.type, ref: entry.ref, size: entry.size, ratio};
        }
    }

    _learnFrameLimit () {
        const largest = this._largestSent;
        this._largestSent = null;
        if (!largest || largest.size <= DEFAULT_FRAME_LIMIT) return null;
        this._learnedLimits.set(largest.type,
            Math.max(DEFAULT_FRAME_LIMIT, Math.min(this._frameLimit(largest.type), largest.size - 1)));
        return {type: largest.type, ref: largest.ref, bytes: largest.size};
    }

    _purgeOversized () {
        const kept = [];
        for (const entry of this._queue) {
            if (entry.size > this._frameLimit(entry.type)) this._refuse(entry, false);
            else kept.push(entry);
        }
        this._queue = kept;
    }

    _refuse (entry, lossy) {
        this._emit('frame-refused', {type: entry.type, ref: entry.ref, bytes: entry.size, reliable: !lossy});
    }

    _flushQueue () {
        if (!this.ws || this.ws.readyState !== 1) return;
        const pending = this._queue;
        this._queue = [];
        for (let i = 0; i < pending.length; i++) {
            try {
                this.ws.send(pending[i].data);
                this._sentGen++;
                this._noteSent(pending[i]);
            } catch (e) {
                // Re-queue the rest if the socket died mid-flush.
                this._queue = pending.slice(i);
                return;
            }
        }
    }

    send (msg) {
        if (!msg || typeof msg !== 'object') return false;
        const lossy = LOSSY.has(msg.type);
        const superseded = msg.type === 'snapshot' ? this._queue.filter(e => e.type === 'snapshot') : [];
        for (const old of superseded) {
            try {
                const prior = JSON.parse(old.data);
                if (prior.force) msg.force = true;
                if (prior.reset) msg.reset = true;
            } catch (e) { /* unparseable — superseded either way */ }
        }
        let data;
        try {
            data = JSON.stringify(msg);
        } catch (e) {
            return false;
        }
        const limit = this._frameLimit(msg.type);
        const entry = {
            data,
            type: msg.type,
            ref: typeof msg.ref === 'number' ? msg.ref : null,
            size: frameSize(data, limit)
        };
        if (entry.size > limit) {
            this._refuse(entry, lossy);
            return false;
        }
        if (superseded.length) this._queue = this._queue.filter(e => e.type !== 'snapshot');

        // Only treat the socket as writable after welcome — frames sent between
        // onopen and welcome are dropped server-side (no room yet) and would
        // bypass the reliable queue.
        if (this.connected && this.ws && this.ws.readyState === 1 && (lossy || !this._holding)) {
            // Under backpressure, drop lossy traffic so block edits keep flowing.
            if (lossy && this.ws.bufferedAmount > MAX_BUFFERED) return false;
            try {
                this.ws.send(data);
                if (!lossy) this._sentGen++;
                this._noteSent(entry);
            } catch (e) {
                if (lossy) return false;
                this._enqueue(entry);
            }
            return true;
        }

        if (lossy) return false; // no point queueing cursors for a dead socket
        this._enqueue(entry);
        return true;
    }

    _enqueue (entry) {
        if (this._queue.length >= MAX_QUEUE) {
            // Prefer keeping the newest reliable messages (latest block state
            // wins) — but say so. A dropped `create` with its later `move`
            // kept is a peer that diverges permanently and never finds out;
            // the listener answers this by forcing a full snapshot.
            this._queue.shift();
            if (!this.droppedReliable) {
                this.droppedReliable = true;
                this._emit('queue-overflow', {});
            }
        }
        this._queue.push(entry);
    }

    /*
     * Leaving the page: hand the seat back NOW.
     *
     * A browser does close the socket when you navigate away, but it does it
     * on its own schedule, and the page you land on fetches the room list
     * immediately. That race is visible: you walk out of a room, the dashboard
     * paints, and it says somebody is still in there — you. Closing here puts
     * the close frame ahead of the next page's first request.
     *
     * Deliberately not `disconnect()`: the session is kept so a bfcache restore
     * can reconnect instead of coming back to a dead editor.
     */
    closeForUnload () {
        let pending = null;
        try {
            pending = this.unloadGuard ? this.unloadGuard() : null;
        } catch (e) {
            pending = null;
        }
        if (pending && typeof pending.then === 'function' && this.connected) {
            const gen = this._openGen;
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this._cancelUnload = null;
                if (gen === this._openGen) this._closeNow();
            };
            this._cancelUnload = () => {
                done = true;
                this._cancelUnload = null;
            };
            pending.then(finish, finish);
            setTimeout(finish, UNLOAD_GRACE_MS);
            return;
        }
        this._closeNow();
    }

    _closeNow () {
        this._stopHeartbeat();
        this._clearReconnect();
        this._clearConnectTimer();
        this._openGen++; // the onclose below must not schedule a reconnect
        this.connected = false;
        if (this.ws) {
            try {
                this.ws.close(1000, 'leaving');
            } catch (e) { /* already dying */ }
            this.ws = null;
        }
    }

    disconnect () {
        this._closedByUser = true;
        this._clearReconnect();
        this._clearConnectTimer();
        this._stopHeartbeat();
        this._queue = [];
        this._openGen++;
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) { /* ignore */ }
            this.ws = null;
        }
        this.connected = false;
    }
}

const client = new CollabClient();

// Fast recover after sleep / tab background — ZeroTier often needs a fresh socket.
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) client.resumeIfNeeded();
    });
}
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => client.resumeIfNeeded());
    // pagehide, not beforeunload: it is the one that fires on mobile and on a
    // bfcache freeze, which are exactly the exits that used to leave a ghost.
    window.addEventListener('pagehide', () => client.closeForUnload());
    // ...and the matching restore, since a frozen page gets no visibilitychange.
    window.addEventListener('pageshow', e => {
        if (e.persisted) client.resumeIfNeeded();
    });
}

export default client;
