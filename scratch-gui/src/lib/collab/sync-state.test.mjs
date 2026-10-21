process.removeAllListeners('warning');

const {SYNC_KINDS, chipFor, createSyncStore, readClient} = await import('./sync-state.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
    }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('chip states');
{
    ok('four kinds', same(SYNC_KINDS, ['synced', 'syncing', 'reconnecting', 'offline']));
    ok('synced', same(chipFor({state: 'synced', pending: 0}, true), {kind: 'synced', pending: 0}));
    ok('synced with a queue is syncing N', same(chipFor({state: 'synced', pending: 3}, true), {kind: 'syncing', pending: 3}));
    ok('catching up is syncing', same(chipFor({state: 'catching-up', pending: 0}, true), {kind: 'syncing', pending: 0}));
    ok('catching up keeps N', chipFor({state: 'catching-up', pending: 2}, true).pending === 2);
    ok('reloading is syncing', chipFor({state: 'reloading', pending: 1}, true).kind === 'syncing');
    ok('offline with network is reconnecting', same(chipFor({state: 'offline', pending: 4}, true), {kind: 'reconnecting', pending: 4}));
    ok('offline without network is offline', chipFor({state: 'offline', pending: 0}, false).kind === 'offline');
    ok('bad pending reads 0', chipFor({state: 'synced', pending: 'x'}, true).pending === 0);
    ok('negative pending reads 0', chipFor({state: 'synced', pending: -2}, true).kind === 'synced');
    ok('unknown state is synced', chipFor({state: 'odd'}, true).kind === 'synced');
    ok('no state at all is synced', chipFor(null, true).kind === 'synced');
}

console.log('reading the client');
{
    ok('uses syncState when present', same(readClient({syncState: {state: 'catching-up', pending: 1}, connected: false}),
        {state: 'catching-up', pending: 1}));
    ok('falls back to connected and the queue', same(readClient({connected: true, _queue: [1, 2]}),
        {state: 'synced', pending: 2}));
    ok('falls back to offline', readClient({connected: false}).state === 'offline');
    ok('a missing client is offline', readClient(null).state === 'offline');
    ok('a syncState without a state falls back', readClient({syncState: {}, connected: true}).state === 'synced');
}

const fakeClient = () => {
    const handlers = {};
    return {
        handlers,
        connected: true,
        syncState: {state: 'synced', pending: 0},
        on (type, cb) {
            (handlers[type] = handlers[type] || []).push(cb);
        },
        emit (type, msg) {
            (handlers[type] || []).forEach(cb => cb(msg));
        }
    };
};
const fakeWin = () => {
    const listeners = {};
    return {
        listeners,
        addEventListener (type, cb) {
            (listeners[type] = listeners[type] || []).push(cb);
        },
        fire (type) {
            (listeners[type] || []).forEach(cb => cb());
        }
    };
};
const timers = () => {
    const t = {set: 0, cleared: 0, tick: null};
    t.setTimer = (fn, ms) => {
        t.set++;
        t.ms = ms;
        t.tick = fn;
        return t.set;
    };
    t.clearTimer = id => {
        t.cleared++;
        t.lastCleared = id;
    };
    return t;
};

console.log('store');
{
    const client = fakeClient();
    const win = fakeWin();
    const t = timers();
    let online = true;
    const store = createSyncStore({client, win, online: () => online, every: 500, setTimer: t.setTimer, clearTimer: t.clearTimer});
    ok('starts from the client', store.getState().kind === 'synced');
    ok('hooks nothing before a subscriber', !client.handlers['sync-state'] && t.set === 0);
    const seen = [];
    const off = store.subscribe(c => seen.push(c));
    ok('hooks sync-state', client.handlers['sync-state'].length === 1);
    ok('hooks welcome and disconnected', client.handlers.welcome.length === 1 && client.handlers.disconnected.length === 1);
    ok('hooks online and offline', win.listeners.online.length === 1 && win.listeners.offline.length === 1);
    ok('polls at the given rate', t.set === 1 && t.ms === 500);
    client.syncState = {state: 'catching-up', pending: 2};
    client.emit('sync-state', client.syncState);
    ok('a sync-state event notifies', seen.length === 1 && same(seen[0], {kind: 'syncing', pending: 2}));
    client.syncState = {state: 'catching-up', pending: 1};
    t.tick();
    ok('the poll picks up a pending change', seen.length === 2 && seen[1].pending === 1);
    t.tick();
    ok('an unchanged poll is quiet', seen.length === 2);
    client.syncState = {state: 'offline', pending: 1};
    online = false;
    win.fire('offline');
    ok('the offline event notifies offline', seen[seen.length - 1].kind === 'offline');
    online = true;
    win.fire('online');
    ok('the online event turns it to reconnecting', seen[seen.length - 1].kind === 'reconnecting');
    client.syncState = {state: 'synced', pending: 0};
    client.emit('welcome', {});
    await Promise.resolve();
    ok('welcome refreshes after the handler', seen[seen.length - 1].kind === 'synced');
    const second = [];
    const off2 = store.subscribe(c => second.push(c));
    ok('a second subscriber shares one hook', client.handlers['sync-state'].length === 1 && t.set === 1);
    off();
    ok('the timer stays while someone listens', t.cleared === 0);
    off2();
    ok('the last unsubscribe stops the timer', t.cleared === 1 && t.lastCleared === 1);
    store.subscribe(() => {});
    ok('a new subscriber restarts the timer', t.set === 2);
}

console.log('subscriber errors');
{
    const client = fakeClient();
    const t = timers();
    const store = createSyncStore({client, win: null, online: () => true, setTimer: t.setTimer, clearTimer: t.clearTimer});
    const errors = console.error;
    let logged = 0;
    console.error = () => {
        logged++;
    };
    const after = [];
    store.subscribe(() => {
        throw new Error('boom');
    });
    store.subscribe(c => after.push(c));
    client.syncState = {state: 'catching-up', pending: 0};
    client.emit('sync-state');
    console.error = errors;
    ok('a throwing subscriber is logged', logged === 1);
    ok('the next subscriber still hears it', after.length === 1);
}

console.log('fallback client');
{
    const client = {connected: false, _queue: [1], on () {}};
    const t = timers();
    const store = createSyncStore({client, win: null, online: () => true, setTimer: t.setTimer, clearTimer: t.clearTimer});
    ok('a 1.x client without syncState reads reconnecting', same(store.getState(), {kind: 'reconnecting', pending: 1}));
    client.connected = true;
    client._queue = [];
    ok('refresh reads it synced', store.refresh().kind === 'synced');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
