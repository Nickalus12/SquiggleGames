const MAX_TEXT = 300;
const MAX_MESSAGES = 200;
const HIDDEN_KEY = 'sq_chat_hidden';

const BLOCKED_TEXT = {
    'filter': 'That message has words that are not allowed here. Try saying it another way.',
    'quick-only': 'You can chat with the quick phrases here.',
    'off': 'Chat is turned off in this room right now.',
    'muted': 'The owner turned off chat for you in this room.',
    'rate': 'Slow down a little. Try again in a few seconds.'
};

const blockedText = msg => (msg && typeof msg.message === 'string' && msg.message ?
    msg.message : (BLOCKED_TEXT[msg && msg.reason] || BLOCKED_TEXT.filter));

const hasId = m => !!m && (typeof m.id === 'number' || typeof m.id === 'string');

const cleanMessage = m => ({
    id: m.id,
    userId: typeof m.userId === 'number' ? m.userId : null,
    handle: typeof m.handle === 'string' ? m.handle : '',
    name: typeof m.name === 'string' && m.name ? m.name : (m.handle || ''),
    color: typeof m.color === 'string' ? m.color : '',
    text: typeof m.text === 'string' ? m.text : '',
    phrase: typeof m.phrase === 'string' ? m.phrase : null,
    ts: typeof m.ts === 'number' ? m.ts : 0,
    mine: m.mine === true
});

const readHidden = storage => {
    try {
        const list = JSON.parse(storage.getItem(HIDDEN_KEY) || '[]');
        return Array.isArray(list) ? list.filter(n => typeof n === 'number') : [];
    } catch (e) {
        return [];
    }
};

const writeHidden = (storage, list) => {
    try {
        storage.setItem(HIDDEN_KEY, JSON.stringify(list));
        return true;
    } catch (e) {
        return false;
    }
};

const createChatStore = ({send, storage}) => {
    const subscribers = new Set();
    const viewers = new Set();
    let lastSentText = null;
    let state = {
        config: null,
        messages: [],
        blocked: null,
        restoreText: null,
        unread: 0,
        lastAdded: null,
        selfHandle: '',
        hidden: storage ? readHidden(storage) : [],
        mutedUserIds: [],
        reported: []
    };

    const notify = () => {
        for (const cb of subscribers) {
            try {
                cb();
            } catch (e) {
                console.error('[collab] chat view error', e);
            }
        }
    };
    const set = patch => {
        state = Object.assign({}, state, patch);
        notify();
    };
    const isMine = m => m.mine || (!!state.selfHandle && m.handle === state.selfHandle);
    const isHidden = m => m.userId !== null && state.hidden.indexOf(m.userId) !== -1;

    return {
        getState: () => state,
        subscribe (cb) {
            subscribers.add(cb);
            return () => subscribers.delete(cb);
        },
        isMine,
        isHidden,
        get visible () {
            return viewers.size > 0;
        },
        setSelf ({handle}) {
            set({selfHandle: typeof handle === 'string' ? handle : ''});
        },
        handleConfig (msg) {
            if (!msg) return;
            const config = {
                mode: msg.mode === 'free' ? 'free' : 'quick',
                on: msg.on !== false,
                muted: msg.muted === true,
                canModerate: msg.canModerate === true,
                phrases: Array.isArray(msg.phrases) ?
                    msg.phrases.filter(p => p && typeof p.id === 'string' && typeof p.text === 'string') : []
            };
            const patch = {config};
            if (Array.isArray(msg.mutedUserIds)) {
                patch.mutedUserIds = msg.mutedUserIds.filter(n => typeof n === 'number');
            }
            if (!config.canModerate) patch.mutedUserIds = [];
            if (state.blocked && config.on && !config.muted &&
                (state.blocked.reason === 'off' || state.blocked.reason === 'muted')) {
                patch.blocked = null;
            }
            set(patch);
        },
        handleHistory (msg) {
            const list = msg && Array.isArray(msg.messages) ? msg.messages : [];
            set({
                messages: list.filter(hasId).map(cleanMessage)
                    .slice(-MAX_MESSAGES),
                lastAdded: null
            });
        },
        handleMessage (msg) {
            if (!hasId(msg)) return;
            const m = cleanMessage(msg);
            if (state.messages.some(x => x.id === m.id)) return;
            const messages = state.messages.concat([m]).slice(-MAX_MESSAGES);
            const patch = {messages, lastAdded: m.id};
            if (isMine(m)) {
                lastSentText = null;
                patch.blocked = null;
            } else if (!isHidden(m) && viewers.size === 0) {
                patch.unread = state.unread + 1;
            }
            set(patch);
        },
        handleBlocked (msg) {
            const reason = msg && typeof msg.reason === 'string' ? msg.reason : 'filter';
            set({
                blocked: {reason, message: blockedText(msg)},
                restoreText: reason === 'rate' ? lastSentText : null
            });
            lastSentText = null;
        },
        handleRemoved (msg) {
            if (!hasId(msg)) return;
            if (!state.messages.some(m => m.id === msg.id)) return;
            set({messages: state.messages.filter(m => m.id !== msg.id)});
        },
        takeRestoreText () {
            const text = state.restoreText;
            if (text !== null) state = Object.assign({}, state, {restoreText: null});
            return text;
        },
        clearBlocked () {
            if (state.blocked) set({blocked: null});
        },
        sendText (raw) {
            const text = String(raw || '').trim()
                .slice(0, MAX_TEXT);
            const config = state.config;
            if (!text || !config || config.mode !== 'free' || !config.on || config.muted) return false;
            lastSentText = text;
            if (state.blocked) set({blocked: null});
            return send({type: 'room-chat', text}) !== false;
        },
        sendPhrase (id) {
            const config = state.config;
            if (!config || !config.on || config.muted) return false;
            if (!config.phrases.some(p => p.id === id)) return false;
            lastSentText = null;
            if (state.blocked) set({blocked: null});
            return send({type: 'room-chat', phrase: id}) !== false;
        },
        setOn (on) {
            if (!state.config || !state.config.canModerate) return false;
            set({config: Object.assign({}, state.config, {on: !!on})});
            return send({type: 'room-chat-settings', on: !!on}) !== false;
        },
        setMuted (userId, muted) {
            if (!state.config || !state.config.canModerate || typeof userId !== 'number') return false;
            const rest = state.mutedUserIds.filter(n => n !== userId);
            set({mutedUserIds: muted ? rest.concat([userId]) : rest});
            return send({type: 'room-chat-mute', userId, muted: !!muted}) !== false;
        },
        isMuted: userId => state.mutedUserIds.indexOf(userId) !== -1,
        setHidden (userId, hidden) {
            if (typeof userId !== 'number') return;
            const rest = state.hidden.filter(n => n !== userId);
            const next = hidden ? rest.concat([userId]) : rest;
            if (storage) writeHidden(storage, next);
            set({hidden: next});
        },
        markReported (id) {
            if (state.reported.indexOf(id) === -1) set({reported: state.reported.concat([id])});
        },
        setVisible (key, visible) {
            if (visible) viewers.add(key);
            else viewers.delete(key);
            if (viewers.size && state.unread) set({unread: 0});
        },
        reset () {
            lastSentText = null;
            set({
                config: null,
                messages: [],
                blocked: null,
                restoreText: null,
                unread: 0,
                lastAdded: null,
                mutedUserIds: [],
                reported: []
            });
        }
    };
};

export default {createChatStore, blockedText, MAX_TEXT, BLOCKED_TEXT};
