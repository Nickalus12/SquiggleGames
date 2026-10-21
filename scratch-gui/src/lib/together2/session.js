import {MAX_OP_NAME, MAX_OP_VALUE, RECONNECT_MIN_MS, createGameSession, gameSocketUrl, wireValue} from './net.js';
import {TICK_MS, createInterpolationBuffer} from './buffer.js';
import {createPrediction} from './prediction.js';
import {applyTick, createGameState, playerName} from './game-state.js';
import {RULES_KEY} from '../collab/project-seam.js';

const SPRITE_LAYER = 'sprite';
const FLAG_VISIBLE = 1;
const MAX_X = 480;
const MAX_Y = 360;
const MAX_COSTUME = 1000;
const MAX_LEVEL = 100;
const BAD_FRAME_WINDOW_MS = 60 * 1000;

const halfPixel = value => Math.round(value * 2) / 2;

const markOf = target => {
    const storage = target && target.extensionStorage;
    return storage && storage[RULES_KEY] && typeof storage[RULES_KEY] === 'object' ? storage[RULES_KEY] : null;
};

const findPlayerSprite = runtime => {
    const sprites = ((runtime && runtime.targets) || []).filter(t => t.isOriginal && !t.isStage);
    const playable = sprites.filter(t => {
        const mark = markOf(t);
        return !mark || mark.role !== 'rules';
    });
    return playable.find(t => {
        const mark = markOf(t);
        return mark && mark.role === 'player';
    }) || playable[0] || null;
};

const squiggleWorld = () => (typeof window === 'undefined' ? null : window.SquiggleWorld);

const blockedAt = (x, y) => {
    const world = squiggleWorld();
    return !!(world && typeof world.solidAt === 'function' && world.solidAt(x, y));
};

const worldLevel = () => {
    const world = squiggleWorld();
    if (!world || typeof world.currentLevel !== 'function' || typeof world.levels !== 'function') return 0;
    const current = world.currentLevel();
    if (!current) return 0;
    const levels = world.levels() || [];
    for (let i = 0; i < levels.length; i++) {
        if (levels[i] && levels[i].id === current) return i + 1;
    }
    return 0;
};

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const wholeDirection = direction => {
    const turned = ((Math.round(direction) % 360) + 360) % 360;
    return turned > 180 ? turned - 360 : turned;
};

const avatarOf = (target, level, out) => {
    const a = out || [];
    a.length = 6;
    a[0] = halfPixel(clamp(target.x, -MAX_X, MAX_X));
    a[1] = halfPixel(clamp(target.y, -MAX_Y, MAX_Y));
    a[2] = wholeDirection(target.direction);
    a[3] = clamp((target.currentCostume | 0) + 1, 1, MAX_COSTUME);
    a[4] = target.visible ? FLAG_VISIBLE : 0;
    a[5] = clamp(level | 0, 0, MAX_LEVEL);
    return a;
};

const renderedDirection = (style, direction, size, out) => {
    const turned = out || {direction: 0, scale: [0, 0]};
    turned.direction = style === 'left-right' || style === 'don\'t rotate' ? 90 : direction;
    turned.scale[0] = style === 'left-right' && direction < 0 ? -size : size;
    turned.scale[1] = size;
    return turned;
};

const createAvatarLayer = runtime => {
    const drawn = new Map();
    const position = [0, 0];
    const turned = {direction: 0, scale: [0, 0]};
    const renderer = () => runtime.renderer || null;
    return {
        draw (slot, a, source) {
            const r = renderer();
            if (!r || !source || !a) return;
            let id = drawn.get(slot);
            if (typeof id === 'undefined') {
                id = r.createDrawable(SPRITE_LAYER);
                drawn.set(slot, id);
            }
            const costumes = source.sprite.costumes;
            const costume = costumes[clamp((a[3] | 0) - 1, 0, costumes.length - 1)];
            if (costume && typeof costume.skinId === 'number') r.updateDrawableSkinId(id, costume.skinId);
            position[0] = a[0];
            position[1] = a[1];
            r.updateDrawablePosition(id, position);
            renderedDirection(source.rotationStyle, a[2], source.size, turned);
            r.updateDrawableDirectionScale(id, turned.direction, turned.scale);
            r.updateDrawableVisible(id, (a[4] & FLAG_VISIBLE) === FLAG_VISIBLE);
        },
        remove (slot) {
            const id = drawn.get(slot);
            drawn.delete(slot);
            const r = renderer();
            if (r && typeof id !== 'undefined') r.destroyDrawable(id, SPRITE_LAYER);
        },
        slots (out) {
            const into = out || [];
            into.length = 0;
            for (const slot of drawn.keys()) into.push(slot);
            return into;
        },
        clear () {
            this.slots().forEach(slot => this.remove(slot));
        }
    };
};

const outboundOp = msg => {
    if (!msg || msg.type !== 'game') return null;
    const name = String(msg.name || '').slice(0, MAX_OP_NAME);
    if (!name) return null;
    if (msg.action === 'msg') {
        return {
            action: 'msg',
            name,
            value: wireValue((typeof msg.value === 'undefined' ? '' : String(msg.value)).slice(0, MAX_OP_VALUE))
        };
    }
    return null;
};

const createGameLink = ({
    vm,
    base,
    slug,
    url,
    WebSocketImpl,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onRulesStatus,
    onGameMessage,
    onEnded,
    onClosed,
    onWelcome: onOpen,
    onDropped,
    onSharedVar
}) => {
    const runtime = vm.runtime;
    const tickHandlers = new Set();
    const prediction = createPrediction();
    const avatars = createAvatarLayer(runtime);
    const ownAvatar = [];
    const sampled = [];
    const bufferSlots = [];
    const drawnSlots = [];
    const live = new Set();
    let tickMs = TICK_MS;
    let buffer = createInterpolationBuffer({tickMs});
    let game = createGameState(tickMs / 1000);
    let session = null;
    let unsubs = [];
    let ownTarget = null;
    let ownTargets = null;
    let ownCount = -1;
    let mineSlot = null;
    let mineKey = '';
    let badFrames = 0;
    let lastBadFrameAt = null;
    let latched = null;
    let rejoinTimer = null;

    const forgetOwn = () => {
        ownTargets = null;
    };

    const own = () => {
        const targets = runtime.targets;
        if (targets !== ownTargets || !targets || targets.length !== ownCount) {
            ownTarget = findPlayerSprite(runtime);
            ownTargets = targets;
            ownCount = targets ? targets.length : -1;
        }
        return ownTarget;
    };

    const onWelcome = msg => {
        const hz = msg && Number.isFinite(msg.tickHz) && msg.tickHz > 0 ? msg.tickHz : 0;
        if (!hz) return;
        game.tickSeconds = 1 / hz;
        if (1000 / hz === tickMs) return;
        tickMs = 1000 / hz;
        buffer = createInterpolationBuffer({tickMs});
    };

    const deliverTick = (tick, result) => {
        tickHandlers.forEach(cb => {
            try {
                cb(tick, result);
            } catch (e) {
                tickHandlers.delete(cb);
            }
        });
    };

    const onTick = tick => {
        const result = applyTick(game, tick);
        if (result.applied && tick.a && typeof tick.a === 'object') {
            buffer.clock.observe(tick.t, now());
            Object.keys(tick.a).forEach(slot => {
                if (tick.a[slot] === null) buffer.drop(slot);
                else buffer.push(slot, tick.t, tick.a[slot]);
            });
        }
        if (result.keyframe) {
            buffer.slots(bufferSlots).forEach(slot => {
                if (!game.avatars[slot]) buffer.drop(slot);
            });
        }
        deliverTick(tick, result);
        if (!result.applied) return;
        result.events.forEach(event => {
            if (!Number.isInteger(event.f) || event.f === 0 || typeof event.n !== 'string') return;
            if (session && event.f === session.slot) return;
            if (onGameMessage) {
                onGameMessage({
                    action: 'msg',
                    name: event.n,
                    value: typeof event.v === 'undefined' ? '' : event.v,
                    from: event.f,
                    fromName: playerName(game, event.f)
                });
            }
        });
    };

    const onCorrection = correction => {
        const target = own();
        if (!target || !session) return;
        const result = prediction.correct(correction, {x: target.x, y: target.y}, now());
        if (!result) return;
        if (result.kind === 'snap') target.setXY(result.x, result.y);
        session.setCid(result.cid);
    };

    const frame = () => {
        if (!session) return;
        const at = now();
        const target = own();
        if (target) {
            const delta = prediction.step(at);
            if (delta && !blockedAt(target.x + delta.dx, target.y + delta.dy)) {
                target.setXY(target.x + delta.dx, target.y + delta.dy);
            }
            session.setAvatar(avatarOf(target, worldLevel(), ownAvatar));
        }
        if (session.slot !== mineSlot) {
            mineSlot = session.slot;
            mineKey = String(mineSlot);
        }
        live.clear();
        buffer.slots(bufferSlots);
        for (let i = 0; i < bufferSlots.length; i++) {
            const slot = bufferSlots[i];
            if (slot !== mineKey) {
                live.add(slot);
                avatars.draw(slot, buffer.sample(slot, at, sampled), target);
            }
        }
        avatars.slots(drawnSlots);
        for (let i = 0; i < drawnSlots.length; i++) {
            if (!live.has(drawnSlots[i])) avatars.remove(drawnSlots[i]);
        }
    };

    const reset = () => {
        unsubs.forEach(off => off());
        unsubs = [];
        runtime.off('AFTER_EXECUTE', frame);
        runtime.off('PROJECT_CHANGED', forgetOwn);
        avatars.clear();
        buffer.clear();
        prediction.reset();
        game = createGameState(tickMs / 1000);
        session = null;
        forgetOwn();
        mineSlot = null;
    };

    const cancelRejoin = () => {
        if (rejoinTimer !== null) clearTimer(rejoinTimer);
        rejoinTimer = null;
    };

    const closeKind = msg => {
        const reason = msg && msg.reason;
        if (reason === 'reload') return 'final';
        if (reason !== 'bad-frame') return 'other';
        badFrames += 1;
        const at = now();
        const second = lastBadFrameAt !== null && at - lastBadFrameAt <= BAD_FRAME_WINDOW_MS;
        lastBadFrameAt = at;
        return second ? 'final' : 'rejoin';
    };

    const link = {
        start () {
            if (latched) return null;
            cancelRejoin();
            if (session && !session.stopped) return session;
            reset();
            session = createGameSession({
                url: url || gameSocketUrl(base, slug),
                WebSocketImpl,
                now,
                setTimer,
                clearTimer
            });
            const current = session;
            unsubs.push(session.on('welcome', msg => {
                onWelcome(msg);
                if (onOpen) onOpen(msg);
            }));
            unsubs.push(session.on('dropped', msg => onDropped && onDropped(msg)));
            unsubs.push(session.on('game', msg => {
                if (onSharedVar && msg && msg.action === 'var') onSharedVar(msg);
            }));
            unsubs.push(session.on('tick', onTick));
            unsubs.push(session.on('correction', onCorrection));
            unsubs.push(session.on('rules-status', msg => onRulesStatus && onRulesStatus(msg)));
            unsubs.push(session.on('ended', msg => {
                if (onEnded) onEnded(msg);
                if (session === current) current.stop();
            }));
            unsubs.push(session.on('closed', msg => {
                if (session !== current) return;
                const kind = closeKind(msg);
                if (kind === 'final') latched = msg.reason;
                reset();
                if (onClosed) onClosed(Object.assign({}, msg, {final: kind === 'final'}));
                if (kind === 'rejoin') {
                    rejoinTimer = setTimer(() => {
                        rejoinTimer = null;
                        if (!latched && !session) link.start();
                    }, RECONNECT_MIN_MS);
                }
            }));
            runtime.on('AFTER_EXECUTE', frame);
            runtime.on('PROJECT_CHANGED', forgetOwn);
            session.start();
            return session;
        },
        stop () {
            cancelRejoin();
            if (session) session.stop();
            else reset();
        },
        sendInput (input) {
            if (!session || !session.open || session.stopped || !input) return false;
            const ops = Array.isArray(input.g) ? input.g : [input.g];
            return ops.filter(Boolean)
                .map(op => session.queueOp(op))
                .every(Boolean);
        },
        queue (op) {
            return !!(session && !session.stopped && op && session.queueOp(op));
        },
        relay (msg) {
            const op = session && session.open && !session.stopped ? outboundOp(msg) : null;
            return op ? session.queueOp(op) : false;
        },
        onTick (cb) {
            if (typeof cb !== 'function') return () => {};
            tickHandlers.add(cb);
            return () => tickHandlers.delete(cb);
        },
        frame,
        get inGame () {
            return !!(session && session.open && !session.stopped);
        },
        get slot () {
            return session ? session.slot : null;
        },
        get badFrames () {
            return badFrames;
        },
        get rtt () {
            return session ? session.rtt : null;
        },
        get mode () {
            return session ? session.mode : null;
        },
        get tickHz () {
            return 1000 / tickMs;
        },
        get game () {
            return game;
        },
        get latched () {
            return latched;
        }
    };
    return link;
};

export {
    avatarOf,
    blockedAt,
    createAvatarLayer,
    createGameLink,
    findPlayerSprite,
    outboundOp,
    renderedDirection,
    worldLevel
};
