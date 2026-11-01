const LIMITS = Object.freeze({keys: 16, bytes: 4096, name: 64, board: 40});
const DEBOUNCE_MS = 1000;
const RETRY_MS = Object.freeze([2000, 4000, 8000, 16000, 30000]);
const BOARD_CACHE_MS = 5000;
const STORAGE_PREFIX = 'squiggle:gamedata:v1:';
const DRAFT = 'draft';
const TOP_MAX = 10;

const STATUS = Object.freeze({
    idle: 'idle',
    loading: 'loading',
    device: 'device',
    saving: 'saving',
    saved: 'saved',
    offline: 'offline',
    full: 'full'
});

const hasControl = text => Array.from(text).some(ch => ch.charCodeAt(0) < 32);
const PLAIN_NUMBER = /^-?(0|[1-9]\d{0,14})(\.\d{1,10})?$/;

const encoder = new TextEncoder();

const bytesOf = value => encoder.encode(JSON.stringify(value)).length;

const cleanName = raw => {
    const name = String(raw === null || typeof raw === 'undefined' ? '' : raw).trim()
        .slice(0, LIMITS.name);
    return name && !hasControl(name) ? name : '';
};

const cleanBoard = raw => {
    const name = cleanName(raw).slice(0, LIMITS.board);
    return name;
};

const cleanValue = raw => {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    const text = String(raw === null || typeof raw === 'undefined' ? '' : raw);
    return PLAIN_NUMBER.test(text) && Number.isFinite(Number(text)) ? Number(text) : text;
};

const better = (order, a, b) => (order === 'min' ? a < b : a > b);

const topText = rows => rows
    .map(row => `${row.place}. ${row.me ? 'you' : (row.name || 'a player')} ${row.score}`)
    .join(', ');

const totalBytes = map => {
    let total = 0;
    map.forEach(value => {
        total += bytesOf(value);
    });
    return total;
};

const createGameData = ({
    fetchImpl,
    storage,
    base = '',
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout
} = {}) => {
    let context = {projectId: null, signedIn: false};
    let values = new Map();
    let boards = {};
    let ready = false;
    let status = STATUS.idle;
    let loadToken = 0;
    let timer = null;
    let attempt = 0;
    let flushing = null;
    const pending = new Map();
    const boardCache = new Map();
    const changeListeners = new Set();
    const readyListeners = new Set();

    const account = () => !!(context.signedIn && context.projectId);

    const emit = () => changeListeners.forEach(cb => {
        try {
            cb();
        } catch (e) {
            changeListeners.delete(cb);
        }
    });

    const setStatus = next => {
        if (status === next) return;
        status = next;
        emit();
    };

    const storageKey = () => `${STORAGE_PREFIX}${context.projectId || DRAFT}`;

    const readDevice = () => {
        try {
            const raw = storage && storage.getItem(storageKey());
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object') return {values: {}, boards: {}};
            return {
                values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {},
                boards: parsed.boards && typeof parsed.boards === 'object' ? parsed.boards : {}
            };
        } catch (e) {
            return {values: {}, boards: {}};
        }
    };

    const writeDevice = () => {
        try {
            if (!storage) return false;
            if (!values.size && !Object.keys(boards).length) storage.removeItem(storageKey());
            else storage.setItem(storageKey(), JSON.stringify({values: Object.fromEntries(values), boards}));
            return true;
        } catch (e) {
            return false;
        }
    };

    const api = (method, path, body) => {
        const headers = {accept: 'application/json'};
        if (method !== 'GET') headers['x-squiggle'] = '1';
        if (body) headers['content-type'] = 'application/json';
        return fetchImpl(`${base}/api/games/${encodeURIComponent(context.projectId)}${path}`, {
            method,
            headers,
            credentials: 'include',
            body: body ? JSON.stringify(body) : null
        }).then(res => res.json().catch(() => ({}))
            .then(data => ({status: res.status, ok: res.ok, data})));
    };

    const fromDevice = () => {
        const device = readDevice();
        values = new Map(Object.entries(device.values));
        boards = device.boards;
    };

    const markReady = token => {
        if (token !== loadToken) return;
        ready = true;
        emit();
        readyListeners.forEach(cb => {
            try {
                cb();
            } catch (e) {
                readyListeners.delete(cb);
            }
        });
    };

    let schedule = null;

    const flush = () => {
        timer = null;
        if (!account() || !pending.size || flushing) return flushing || Promise.resolve(null);
        const batch = Array.from(pending.entries()).slice(0, LIMITS.keys);
        const writes = batch.map(([name, entry]) => (entry.forget ? {name, forget: true} : {name, value: entry.value}));
        setStatus(STATUS.saving);
        const token = loadToken;
        flushing = api('PUT', '/saves', {writes})
            .then(res => {
                flushing = null;
                if (token !== loadToken) return null;
                if (res.status === 401) {
                    context = Object.assign({}, context, {signedIn: false});
                    pending.clear();
                    writeDevice();
                    setStatus(STATUS.device);
                    return res;
                }
                if (!res.ok && res.status !== 409) throw new Error(`save failed ${res.status}`);
                attempt = 0;
                batch.forEach(([name, entry]) => {
                    if (pending.get(name) === entry) pending.delete(name);
                });
                const results = (res.data && Array.isArray(res.data.results)) ? res.data.results : [];
                const full = results.some(r => r && (r.error === 'too-many-keys' || r.error === 'too-large'));
                if (pending.size) schedule();
                else setStatus(full ? STATUS.full : STATUS.saved);
                return res;
            })
            .catch(() => {
                flushing = null;
                if (token !== loadToken) return null;
                const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
                attempt += 1;
                setStatus(STATUS.offline);
                if (timer) clearTimer(timer);
                timer = setTimer(flush, wait);
                return null;
            });
        return flushing;
    };

    schedule = () => {
        if (timer) clearTimer(timer);
        timer = setTimer(flush, DEBOUNCE_MS);
        if (status !== STATUS.offline) setStatus(STATUS.saving);
    };

    const fits = (name, value) => {
        if (!values.has(name) && values.size >= LIMITS.keys) return false;
        const next = new Map(values);
        next.set(name, value);
        return totalBytes(next) <= LIMITS.bytes;
    };

    const carryUp = device => {
        Object.keys(device.values).slice(0, LIMITS.keys)
            .forEach(name => {
                const value = cleanValue(device.values[name]);
                if (!cleanName(name) || !fits(name, value)) return;
                values.set(name, value);
                pending.set(name, {value});
            });
        if (pending.size) schedule();
    };

    const store = {
        load (next) {
            loadToken += 1;
            const token = loadToken;
            if (timer) clearTimer(timer);
            timer = null;
            attempt = 0;
            pending.clear();
            boardCache.clear();
            ready = false;
            context = {projectId: (next && next.projectId) || null, signedIn: !!(next && next.signedIn)};
            values = new Map();
            boards = {};
            if (!account()) {
                fromDevice();
                setStatus(STATUS.device);
                markReady(token);
                return Promise.resolve(store);
            }
            setStatus(STATUS.loading);
            return api('GET', '/saves')
                .then(res => {
                    if (token !== loadToken) return store;
                    if (res.status === 401) {
                        context = Object.assign({}, context, {signedIn: false});
                        fromDevice();
                        setStatus(STATUS.device);
                        markReady(token);
                        return store;
                    }
                    if (!res.ok) throw new Error(`load failed ${res.status}`);
                    const got = res.data || {};
                    values = new Map(Object.entries(got.values || {}));
                    boards = {};
                    Object.keys(got.boards || {}).forEach(board => {
                        boards[board] = {best: got.boards[board].best, place: got.boards[board].place};
                    });
                    setStatus(STATUS.saved);
                    if (!values.size) carryUp(readDevice());
                    markReady(token);
                    return store;
                })
                .catch(() => {
                    if (token !== loadToken) return store;
                    fromDevice();
                    setStatus(STATUS.offline);
                    markReady(token);
                    return store;
                });
        },
        set (rawName, rawValue) {
            const name = cleanName(rawName);
            if (!name) return false;
            const value = cleanValue(rawValue);
            if (values.has(name) && values.get(name) === value) return true;
            if (!fits(name, value)) {
                setStatus(STATUS.full);
                return false;
            }
            values.set(name, value);
            if (account()) {
                pending.set(name, {value});
                schedule();
            } else {
                writeDevice();
            }
            emit();
            return true;
        },
        get (rawName) {
            const name = cleanName(rawName);
            return name && values.has(name) ? values.get(name) : '';
        },
        forget (rawName) {
            const name = cleanName(rawName);
            if (!name || !values.has(name)) return false;
            values.delete(name);
            if (account()) {
                pending.set(name, {forget: true});
                schedule();
            } else {
                writeDevice();
            }
            emit();
            return true;
        },
        best (rawBoard) {
            const board = cleanBoard(rawBoard);
            return board && boards[board] ? boards[board].best : '';
        },
        post (rawBoard, rawScore, order) {
            const board = cleanBoard(rawBoard);
            const score = Number(rawScore);
            if (!board || !Number.isFinite(score)) return Promise.resolve(false);
            const keep = order === 'min' ? 'min' : 'max';
            const had = boards[board];
            if (!had || better(keep, score, Number(had.best))) {
                boards[board] = Object.assign({}, had, {best: score, order: keep});
                emit();
            }
            boardCache.delete(board);
            if (!account()) {
                writeDevice();
                return Promise.resolve(true);
            }
            const token = loadToken;
            return api('POST', `/boards/${encodeURIComponent(board)}`, {score, keep})
                .then(res => {
                    if (token !== loadToken || !res.ok) return false;
                    boards[board] = {best: res.data.best, place: res.data.place, order: keep};
                    boardCache.set(board, {at: now(), top: res.data.top || []});
                    emit();
                    return true;
                })
                .catch(() => false);
        },
        top (rawBoard, rawCount) {
            const board = cleanBoard(rawBoard);
            const count = Math.max(1, Math.min(TOP_MAX, Math.floor(Number(rawCount)) || TOP_MAX));
            if (!board) return Promise.resolve([]);
            if (!account()) {
                const mine = boards[board];
                return Promise.resolve(mine ? [{place: 1, name: null, score: mine.best, me: true}] : []);
            }
            const cached = boardCache.get(board);
            if (cached && now() - cached.at < BOARD_CACHE_MS) return Promise.resolve(cached.top.slice(0, count));
            const token = loadToken;
            return api('GET', `/boards/${encodeURIComponent(board)}?top=${TOP_MAX}`)
                .then(res => {
                    if (token !== loadToken || !res.ok) return [];
                    const top = Array.isArray(res.data.top) ? res.data.top : [];
                    boardCache.set(board, {at: now(), top});
                    return top.slice(0, count);
                })
                .catch(() => []);
        },
        resetMine () {
            values = new Map();
            pending.clear();
            if (!account()) {
                boards = {};
                writeDevice();
                emit();
                return Promise.resolve(true);
            }
            emit();
            return api('DELETE', '/saves').then(res => res.ok, () => false);
        },
        clearBoard (rawBoard) {
            const board = cleanBoard(rawBoard);
            if (!board) return Promise.resolve(false);
            boardCache.delete(board);
            if (!account()) {
                delete boards[board];
                writeDevice();
                emit();
                return Promise.resolve(true);
            }
            return api('DELETE', `/boards/${encodeURIComponent(board)}`).then(res => {
                if (res.ok) {
                    delete boards[board];
                    emit();
                }
                return res.ok;
            }, () => false);
        },
        flush,
        onChange (cb) {
            changeListeners.add(cb);
            return () => changeListeners.delete(cb);
        },
        onReady (cb) {
            readyListeners.add(cb);
            return () => readyListeners.delete(cb);
        },
        snapshot () {
            return {
                projectId: context.projectId,
                signedIn: context.signedIn,
                onAccount: account(),
                ready,
                status,
                values: Array.from(values.entries()).map(([name, value]) => ({name, value})),
                boards: Object.keys(boards).sort()
                    .map(board => Object.assign({board}, boards[board])),
                pending: pending.size,
                bytes: totalBytes(values)
            };
        },
        get ready () {
            return ready;
        },
        get signedIn () {
            return context.signedIn;
        },
        get status () {
            return status;
        }
    };
    return store;
};

export {
    BOARD_CACHE_MS,
    DEBOUNCE_MS,
    LIMITS,
    RETRY_MS,
    STATUS,
    STORAGE_PREFIX,
    cleanName,
    cleanValue,
    createGameData,
    topText
};
