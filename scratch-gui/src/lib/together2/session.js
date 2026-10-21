import {createGameSession, gameSocketUrl} from './net.js';
import {createInterpolationBuffer} from './buffer.js';
import {createPrediction} from './prediction.js';
import {applyTick, createGameState, playerName} from './game-state.js';
import {RULES_KEY} from '../collab/project-seam.js';

const SPRITE_LAYER = 'sprite';
const FLAG_VISIBLE = 1;

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

const worldLevel = () => {
    const world = typeof window === 'undefined' ? null : window.SquiggleWorld;
    if (!world || typeof world.currentLevel !== 'function' || typeof world.levels !== 'function') return 0;
    const current = world.currentLevel();
    if (!current) return 0;
    const index = (world.levels() || []).findIndex(level => level && level.id === current);
    return index + 1;
};

const avatarOf = (target, level) => [
    halfPixel(target.x),
    halfPixel(target.y),
    Math.round(target.direction),
    target.currentCostume,
    target.visible ? FLAG_VISIBLE : 0,
    level
];

const renderedDirection = (style, direction, size) => {
    if (style === 'left-right') return {direction: 90, scale: [direction < 0 ? -size : size, size]};
    if (style === 'don\'t rotate') return {direction: 90, scale: [size, size]};
    return {direction, scale: [size, size]};
};

const createAvatarLayer = runtime => {
    const drawn = new Map();
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
            const costume = costumes[Math.max(0, Math.min(costumes.length - 1, a[3] | 0))];
            if (costume && typeof costume.skinId === 'number') r.updateDrawableSkinId(id, costume.skinId);
            r.updateDrawablePosition(id, [a[0], a[1]]);
            const turned = renderedDirection(source.rotationStyle, a[2], source.size);
            r.updateDrawableDirectionScale(id, turned.direction, turned.scale);
            r.updateDrawableVisible(id, (a[4] & FLAG_VISIBLE) === FLAG_VISIBLE);
        },
        remove (slot) {
            const id = drawn.get(slot);
            drawn.delete(slot);
            const r = renderer();
            if (r && typeof id !== 'undefined') r.destroyDrawable(id, SPRITE_LAYER);
        },
        slots () {
            return Array.from(drawn.keys());
        },
        clear () {
            this.slots().forEach(slot => this.remove(slot));
        }
    };
};

const outboundOp = msg => {
    if (!msg || msg.type !== 'game') return null;
    const name = String(msg.name || '');
    if (!name) return null;
    if (msg.action === 'msg') {
        return {
            action: 'msg',
            name,
            value: typeof msg.value === 'undefined' ? '' : String(msg.value)
        };
    }
    return null;
};

const createGameLink = ({
    vm,
    base,
    slug,
    WebSocketImpl,
    now = Date.now,
    setTimer,
    clearTimer,
    onRulesStatus,
    onGameMessage,
    onEnded,
    onClosed
}) => {
    const runtime = vm.runtime;
    const tickHandlers = new Set();
    const buffer = createInterpolationBuffer();
    const prediction = createPrediction();
    const avatars = createAvatarLayer(runtime);
    let game = createGameState();
    let session = null;
    let unsubs = [];

    const own = () => findPlayerSprite(runtime);

    const deliverTick = tick => {
        tickHandlers.forEach(cb => {
            try {
                cb(tick);
            } catch (e) {
                tickHandlers.delete(cb);
            }
        });
    };

    const onTick = tick => {
        const result = applyTick(game, tick);
        const at = now();
        if (result.applied && tick.a && typeof tick.a === 'object') {
            Object.keys(tick.a).forEach(slot => {
                if (tick.a[slot] === null) buffer.drop(slot);
                else buffer.push(slot, tick.t, tick.a[slot], at);
            });
        }
        if (result.keyframe) {
            buffer.slots().forEach(slot => {
                if (!game.avatars[slot]) buffer.drop(slot);
            });
        }
        deliverTick(tick);
        if (!result.applied) return;
        result.events.forEach(event => {
            if (!Number.isInteger(event.f) || event.f === 0 || typeof event.n !== 'string') return;
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
            if (delta) target.setXY(target.x + delta.dx, target.y + delta.dy);
            session.setAvatar(avatarOf(target, worldLevel()));
        }
        const mine = String(session.slot);
        const live = new Set();
        buffer.slots().forEach(slot => {
            if (slot === mine) return;
            live.add(slot);
            avatars.draw(slot, buffer.sample(slot, at), target);
        });
        avatars.slots().forEach(slot => {
            if (!live.has(slot)) avatars.remove(slot);
        });
    };

    const reset = () => {
        unsubs.forEach(off => off());
        unsubs = [];
        runtime.off('AFTER_EXECUTE', frame);
        avatars.clear();
        buffer.clear();
        prediction.reset();
        game = createGameState();
        session = null;
    };

    return {
        start () {
            if (session && !session.stopped) return session;
            reset();
            session = createGameSession({
                url: gameSocketUrl(base, slug),
                WebSocketImpl,
                now,
                setTimer,
                clearTimer
            });
            const current = session;
            unsubs.push(session.on('tick', onTick));
            unsubs.push(session.on('correction', onCorrection));
            unsubs.push(session.on('rules-status', msg => onRulesStatus && onRulesStatus(msg)));
            unsubs.push(session.on('ended', msg => {
                if (onEnded) onEnded(msg);
                if (session === current) current.stop();
            }));
            unsubs.push(session.on('closed', msg => {
                if (session !== current) return;
                reset();
                if (onClosed) onClosed(msg);
            }));
            runtime.on('AFTER_EXECUTE', frame);
            session.start();
            return session;
        },
        stop () {
            if (session) session.stop();
            else reset();
        },
        sendInput (input) {
            if (!session || !session.open || !input) return false;
            const ops = Array.isArray(input.g) ? input.g : [input.g];
            return ops.filter(Boolean)
                .map(op => session.queueOp(op))
                .every(Boolean);
        },
        relay (msg) {
            const op = session && session.open ? outboundOp(msg) : null;
            return op ? session.queueOp(op) : false;
        },
        onTick (cb) {
            if (typeof cb !== 'function') return () => {};
            tickHandlers.add(cb);
            return () => tickHandlers.delete(cb);
        },
        frame,
        get inGame () {
            return !!(session && session.open);
        },
        get slot () {
            return session ? session.slot : null;
        },
        get rtt () {
            return session ? session.rtt : null;
        },
        get game () {
            return game;
        }
    };
};

export {
    avatarOf,
    createAvatarLayer,
    createGameLink,
    findPlayerSprite,
    renderedDirection
};
