const POLL_MS = 60 * 1000;

const apiBase = () => (location.port === '8601' ? `http://${location.hostname}:4455` : '');

const createUnreadPoller = ({request, base, doc, win, every, cancel}) => {
    const subscribers = new Set();
    let state = {available: false, unread: 0};
    let users = 0;
    let timer = null;
    let inFlight = false;

    const set = next => {
        if (next.available === state.available && next.unread === state.unread) return;
        state = next;
        for (const cb of subscribers) cb();
    };

    const refresh = () => {
        if (inFlight || (doc && doc.hidden)) return Promise.resolve(state);
        inFlight = true;
        return Promise.resolve()
            .then(() => request(`${base()}/api/notifications/unread`, {
                credentials: 'same-origin',
                headers: {'x-squiggle': '1'}
            }))
            .then(r => {
                if (!r || !r.ok) {
                    if (r && (r.status === 401 || r.status === 403 || r.status === 404)) {
                        set({available: false, unread: 0});
                    }
                    return null;
                }
                return r.json().then(d => {
                    const n = d && typeof d.unread === 'number' && d.unread >= 0 ? Math.floor(d.unread) : null;
                    if (n === null) set({available: false, unread: 0});
                    else set({available: true, unread: n});
                });
            })
            .catch(() => null)
            .then(() => {
                inFlight = false;
                return state;
            });
    };

    const onVisible = () => {
        if (!doc || !doc.hidden) refresh();
    };

    return {
        POLL_MS,
        getState: () => state,
        refresh,
        subscribe (cb) {
            subscribers.add(cb);
            return () => subscribers.delete(cb);
        },
        start () {
            users++;
            if (users > 1) return;
            refresh();
            timer = every(refresh, POLL_MS);
            if (win) win.addEventListener('focus', onVisible);
            if (doc) doc.addEventListener('visibilitychange', onVisible);
        },
        stop () {
            if (users === 0) return;
            users--;
            if (users > 0) return;
            cancel(timer);
            timer = null;
            if (win) win.removeEventListener('focus', onVisible);
            if (doc) doc.removeEventListener('visibilitychange', onVisible);
        }
    };
};

const poller = typeof window === 'undefined' ? null : createUnreadPoller({
    request: (url, opts) => fetch(url, opts),
    base: apiBase,
    doc: document,
    win: window,
    every: (fn, ms) => setInterval(fn, ms),
    cancel: id => clearInterval(id)
});

const messagesUrl = () => `${apiBase()}/messages`;

export {createUnreadPoller, messagesUrl, POLL_MS};
export default poller;
