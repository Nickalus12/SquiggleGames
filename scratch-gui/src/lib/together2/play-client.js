import {createGameLink} from './session.js';
import {MAX_OP_NAME, pageSocketBase, playSocketUrl} from './net.js';
import {playCloseText} from './texts.js';
import log from '../log.js';

const NET_BRIDGE_KEYS = Object.freeze([
    '__st', 'send', 'sendInput', 'onTick', 'inGame', 'slot', 'rtt', 'mode', 'tickHz', 'game', 'on',
    'playerName', 'peers', 'peersText', 'connected', 'room', 'sharedVars'
]);

const CHROME_SOURCE = 'squiggle-coplay';
const HOST_SOURCE = 'squiggle-coplay-host';
const ENDED_ERROR = 'no-such-session';
const GAME_ENDED_CODE = 1000;
const SESSION_FULL_CODE = 1013;
const LATENCY_EVERY_MS = 1000;
const PLAYER_COLORS = Object.freeze([
    '#f25f5c', '#2a9d8f', '#5b6ee1', '#f0912b', '#b8336a', '#8cc63f', '#16b3c7', '#b07a4f'
]);

const orEmpty = value => (typeof value === 'undefined' || value === null ? '' : value);

const colorOf = slot => PLAYER_COLORS[Math.abs(Number(slot) | 0) % PLAYER_COLORS.length];

const createPlayClient = ({
    vm,
    code,
    name = '',
    win = typeof window === 'undefined' ? null : window,
    base = win ? pageSocketBase(win.location) : '',
    WebSocketImpl = typeof WebSocket === 'undefined' ? null : WebSocket,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout
}) => {
    const runtime = vm.runtime;
    const handlers = Object.create(null);
    let sharedVars = Object.create(null);
    const known = Object.create(null);
    let peers = [];
    let peersText = '';
    let seenRoster = false;
    let lastRtt = null;
    let lastRttAt = -Infinity;
    let link = null;

    const emit = (type, msg, extra) => {
        const list = handlers[type];
        if (!list) return;
        list.slice().forEach(cb => {
            try {
                cb(msg, extra);
            } catch (e) {
                log.warn('[play] SquiggleNet handler error', type);
            }
        });
    };

    const chrome = (event, detail) => {
        if (!win || !win.parent) return;
        try {
            win.parent.postMessage({source: CHROME_SOURCE, event, detail}, win.location.origin);
        } catch (e) {
            log.warn('[play] chrome post failed', event);
        }
    };

    const player = slot => ({id: Number(slot), name: known[slot], color: colorOf(slot)});

    const roster = () => {
        const mine = link.slot === null ? null : String(link.slot);
        return {
            players: Object.keys(known).map(player),
            driver: null,
            me: mine !== null && known[mine] ? player(mine) : null,
            queue: [],
            driving: false
        };
    };

    const syncNames = () => {
        const names = link.game.names;
        const mine = link.slot === null ? '' : String(link.slot);
        const joined = [];
        const left = [];
        let changed = false;
        Object.keys(names).forEach(slot => {
            if (known[slot] === names[slot]) return;
            if (!(slot in known)) joined.push(slot);
            known[slot] = names[slot];
            changed = true;
        });
        Object.keys(known).forEach(slot => {
            if (slot in names) return;
            left.push({id: Number(slot), name: known[slot]});
            delete known[slot];
            changed = true;
        });
        if (!changed) return;
        peers = Object.keys(known).filter(slot => slot !== mine)
            .map(slot => known[slot]);
        peersText = peers.join(', ');
        const announce = seenRoster;
        seenRoster = true;
        chrome('roster', roster());
        if (!announce) return;
        joined.filter(slot => slot !== mine).forEach(slot => {
            chrome('joined', player(slot));
            emit('peer-joined', {peer: {id: Number(slot), name: known[slot]}});
        });
        left.forEach(gone => {
            chrome('left', gone);
            emit('peer-left', gone);
        });
    };

    const reportLatency = () => {
        const rtt = link.rtt;
        if (rtt === null || rtt === lastRtt || now() - lastRttAt < LATENCY_EVERY_MS) return;
        lastRtt = rtt;
        lastRttAt = now();
        chrome('latency', {ms: rtt});
    };

    const end = () => chrome('error', {error: ENDED_ERROR, message: playCloseText(GAME_ENDED_CODE)});

    link = createGameLink({
        vm,
        url: playSocketUrl(base, code),
        WebSocketImpl,
        now,
        setTimer,
        clearTimer,
        onGameMessage: msg => emit('game', msg),
        onSharedVar: msg => {
            const key = String(orEmpty(msg.name));
            if (key) sharedVars[key] = orEmpty(msg.value);
            emit('game', msg);
        },
        onWelcome: () => chrome('status', {connected: true, code}),
        onDropped: msg => {
            chrome('status', {connected: false, code});
            if (msg && msg.code === SESSION_FULL_CODE) {
                chrome('error', {error: 'session-full', message: playCloseText(SESSION_FULL_CODE)});
            }
        },
        onEnded: msg => {
            emit('game-ended', msg);
            end();
        },
        onClosed: msg => {
            if (msg.reason !== 'stopped') emit('game-ended', msg);
            chrome('status', {connected: false, code});
            if (msg.reason === 'stopped' || (msg.reason === 'bad-frame' && !msg.final)) return;
            if (msg.code === GAME_ENDED_CODE) end();
            else chrome('error', {error: msg.reason, message: playCloseText(msg.code)});
        }
    });

    link.onTick((tick, result) => {
        if (result && result.applied) {
            if (result.keyframe) {
                sharedVars = Object.assign(Object.create(null), tick.sv && typeof tick.sv === 'object' ? tick.sv : {});
                emit('game-state', {vars: sharedVars});
            }
            syncNames();
        }
        emit('tick', tick, result);
        reportLatency();
    });

    const bridge = {
        __st: true,
        send (msg) {
            if (!msg || msg.type !== 'game') return;
            const key = String(orEmpty(msg.name)).slice(0, MAX_OP_NAME);
            if (msg.action === 'var' && key) {
                sharedVars[key] = orEmpty(msg.value);
                link.queue({action: 'set', name: key, value: orEmpty(msg.value)});
            } else if (msg.action === 'var-add' && key && Number.isFinite(Number(msg.delta))) {
                const delta = Number(msg.delta);
                sharedVars[key] = (Number(sharedVars[key]) || 0) + delta;
                link.queue({action: 'change', name: key, delta});
            } else {
                link.relay(msg);
            }
        },
        sendInput (input) {
            return link.sendInput(input);
        },
        onTick (cb) {
            return this.on('tick', cb);
        },
        get inGame () {
            return link.inGame;
        },
        get slot () {
            return link.slot;
        },
        get rtt () {
            return link.rtt;
        },
        get mode () {
            return link.mode;
        },
        get tickHz () {
            return link.tickHz;
        },
        get game () {
            return link.game;
        },
        on (type, cb) {
            if (typeof cb !== 'function') return () => {};
            (handlers[type] = handlers[type] || []).push(cb);
            if (type === 'game-state') {
                queueMicrotask(() => {
                    try {
                        cb({vars: sharedVars});
                    } catch (e) {
                        log.warn('[play] SquiggleNet handler error', type);
                    }
                });
            }
            return () => {
                const list = handlers[type];
                const i = list ? list.indexOf(cb) : -1;
                if (i >= 0) list.splice(i, 1);
            };
        },
        get playerName () {
            return (link.slot !== null && known[String(link.slot)]) || name;
        },
        get peers () {
            return peers;
        },
        get peersText () {
            return peersText;
        },
        get connected () {
            return link.inGame;
        },
        get room () {
            return code;
        },
        get sharedVars () {
            return sharedVars;
        }
    };

    const onFlag = () => link.start();
    const onStop = () => link.stop();
    const onHost = event => {
        const data = event && event.data;
        if (!win || event.origin !== win.location.origin || !data || data.source !== HOST_SOURCE) return;
        if (data.action === 'roster') chrome('roster', roster());
    };

    return {
        bridge,
        link,
        install () {
            runtime.on('PROJECT_START', onFlag);
            runtime.on('PROJECT_STOP_ALL', onStop);
            if (win) {
                win.SquiggleNet = bridge;
                win.ScratchTogetherNet = bridge;
                win.addEventListener('message', onHost);
                try {
                    win.dispatchEvent(new CustomEvent('SquiggleNetReady'));
                    win.dispatchEvent(new CustomEvent('ScratchTogetherNetReady'));
                } catch (e) {
                    log.warn('[play] bridge ready event failed');
                }
            }
            if ((runtime.threads && runtime.threads.length) || (runtime.frameLoop && runtime.frameLoop.running)) {
                link.start();
            }
            return this;
        }
    };
};

export {
    NET_BRIDGE_KEYS,
    PLAYER_COLORS,
    createPlayClient
};
