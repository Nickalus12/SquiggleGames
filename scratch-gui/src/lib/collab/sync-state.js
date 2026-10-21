const SYNC_KINDS = ['synced', 'syncing', 'reconnecting', 'offline'];
const POLL_MS = 1000;

const countOf = pending => {
    const n = Math.floor(Number(pending));
    return Number.isFinite(n) && n > 0 ? n : 0;
};

const chipFor = (sync, online) => {
    const state = sync && sync.state;
    const pending = countOf(sync && sync.pending);
    if (state === 'offline') return {kind: online === false ? 'offline' : 'reconnecting', pending};
    if (state === 'reloading' || state === 'catching-up' || pending > 0) return {kind: 'syncing', pending};
    return {kind: 'synced', pending: 0};
};

const readClient = client => {
    const sync = client && client.syncState;
    if (sync && typeof sync.state === 'string') return sync;
    const queue = client && Array.isArray(client._queue) ? client._queue.length : 0;
    return {state: client && client.connected ? 'synced' : 'offline', pending: queue};
};

const browserOnline = () => {
    try {
        return typeof navigator === 'undefined' || navigator.onLine !== false;
    } catch (e) {
        return true;
    }
};

const sameChip = (a, b) => a.kind === b.kind && a.pending === b.pending;

const createSyncStore = ({
    client,
    online = browserOnline,
    win = typeof window === 'undefined' ? null : window,
    every = POLL_MS,
    setTimer = setInterval,
    clearTimer = clearInterval
}) => {
    const subscribers = new Set();
    let chip = chipFor(readClient(client), online());
    let hooked = false;
    let timer = null;

    const refresh = () => {
        const next = chipFor(readClient(client), online());
        if (sameChip(next, chip)) return chip;
        chip = next;
        subscribers.forEach(fn => {
            try {
                fn(chip);
            } catch (e) {
                console.error('[collab] sync view error', e);
            }
        });
        return chip;
    };
    const later = () => Promise.resolve().then(refresh);

    const hook = () => {
        if (hooked) return;
        hooked = true;
        if (client && typeof client.on === 'function') {
            client.on('sync-state', refresh);
            client.on('welcome', later);
            client.on('disconnected', later);
        }
        if (win && typeof win.addEventListener === 'function') {
            win.addEventListener('online', refresh);
            win.addEventListener('offline', refresh);
        }
    };

    return {
        getState: () => chip,
        refresh,
        subscribe (fn) {
            hook();
            subscribers.add(fn);
            if (timer === null) timer = setTimer(refresh, every);
            refresh();
            return () => {
                subscribers.delete(fn);
                if (!subscribers.size && timer !== null) {
                    clearTimer(timer);
                    timer = null;
                }
            };
        }
    };
};

export {SYNC_KINDS, chipFor, createSyncStore, readClient};
