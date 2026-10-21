import {createUnreadPoller, POLL_MS} from '../../../src/lib/messages-unread';

const fakeTarget = () => {
    const listeners = new Map();
    return {
        hidden: false,
        listeners,
        addEventListener (type, fn) {
            listeners.set(type, fn);
        },
        removeEventListener (type, fn) {
            if (listeners.get(type) === fn) listeners.delete(type);
        }
    };
};

const reply = (status, body) => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
});

const setup = responses => {
    const calls = [];
    const timers = [];
    const doc = fakeTarget();
    const win = fakeTarget();
    const queue = responses.slice();
    const poller = createUnreadPoller({
        request: (url, opts) => {
            calls.push({url, opts});
            const next = queue.length > 1 ? queue.shift() : queue[0];
            return typeof next === 'function' ? next() : next;
        },
        base: () => '',
        doc,
        win,
        every: (fn, ms) => {
            timers.push({fn, ms, live: true});
            return timers.length - 1;
        },
        cancel: id => {
            timers[id].live = false;
        }
    });
    return {poller, calls, timers, doc, win};
};

const flush = () => new Promise(r => setTimeout(r, 0));

describe('createUnreadPoller', () => {
    test('a count shows the button', async () => {
        const {poller, calls, timers} = setup([reply(200, {unread: 4})]);
        poller.start();
        await flush();
        expect(calls[0].url).toBe('/api/notifications/unread');
        expect(calls[0].opts.credentials).toBe('same-origin');
        expect(timers[0].ms).toBe(POLL_MS);
        expect(POLL_MS).toBe(60000);
        expect(poller.getState()).toEqual({available: true, unread: 4});
    });

    test('signed out hides the button', async () => {
        const {poller} = setup([reply(200, {unread: 2}), reply(401, {})]);
        await poller.refresh();
        expect(poller.getState().available).toBe(true);
        await poller.refresh();
        expect(poller.getState()).toEqual({available: false, unread: 0});
    });

    test('a bad body hides the button', async () => {
        const {poller} = setup([reply(200, {unread: 'lots'})]);
        await poller.refresh();
        expect(poller.getState().available).toBe(false);
    });

    test('a server error keeps the last count', async () => {
        const {poller} = setup([reply(200, {unread: 3}), reply(500, {}), () => Promise.reject(new Error('offline'))]);
        await poller.refresh();
        await poller.refresh();
        await poller.refresh();
        expect(poller.getState()).toEqual({available: true, unread: 3});
    });

    test('skips polls while the tab is hidden and refreshes on return', async () => {
        const {poller, calls, timers, doc} = setup([reply(200, {unread: 1})]);
        doc.hidden = true;
        poller.start();
        await flush();
        timers[0].fn();
        await flush();
        expect(calls.length).toBe(0);
        doc.hidden = false;
        doc.listeners.get('visibilitychange')();
        await flush();
        expect(calls.length).toBe(1);
    });

    test('focus refreshes the count', async () => {
        const {poller, calls, win} = setup([reply(200, {unread: 1})]);
        poller.start();
        await flush();
        win.listeners.get('focus')();
        await flush();
        expect(calls.length).toBe(2);
    });

    test('two buttons share one timer', async () => {
        const {poller, timers, win} = setup([reply(200, {unread: 1})]);
        poller.start();
        poller.start();
        expect(timers.length).toBe(1);
        poller.stop();
        expect(timers[0].live).toBe(true);
        poller.stop();
        expect(timers[0].live).toBe(false);
        expect(win.listeners.size).toBe(0);
        poller.stop();
        expect(timers.length).toBe(1);
    });

    test('subscribers hear changes only', async () => {
        const {poller} = setup([reply(200, {unread: 2})]);
        const seen = jest.fn();
        poller.subscribe(seen);
        await poller.refresh();
        await poller.refresh();
        expect(seen).toHaveBeenCalledTimes(1);
    });
});
