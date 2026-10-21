const TICK_MS = 50;
const RENDER_DELAY_MS = 100;
const MAX_EXTRAPOLATE_MS = 100;
const MAX_SAMPLES = 20;
const CLOCK_DRIFT_MS = 1;

const createTickClock = ({tickMs = TICK_MS} = {}) => {
    let offset = null;
    return {
        observe (t, nowMs) {
            const sample = nowMs - (t * tickMs);
            offset = offset === null ? sample : Math.min(sample, offset + CLOCK_DRIFT_MS);
            return offset;
        },
        tickAt (nowMs) {
            return offset === null ? null : (nowMs - offset) / tickMs;
        },
        reset () {
            offset = null;
        }
    };
};

const lerp = (a, b, f) => a + ((b - a) * f);

const wrapAngle = degrees => {
    const out = ((((degrees + 180) % 360) + 360) % 360) - 180;
    return out === -180 ? 180 : out;
};

const shortTurn = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;

const lerpAngle = (a, b, f) => wrapAngle(a + (shortTurn(a, b) * f));

const copyInto = (out, a) => {
    out.length = a.length;
    for (let i = 0; i < a.length; i++) out[i] = a[i];
    return out;
};

const blend = (from, to, f, out) => {
    copyInto(out, f < 1 ? from : to);
    out[0] = lerp(from[0], to[0], f);
    out[1] = lerp(from[1], to[1], f);
    out[2] = lerpAngle(from[2], to[2], f);
    return out;
};

const createInterpolationBuffer = ({
    tickMs = TICK_MS,
    delayMs = RENDER_DELAY_MS,
    maxExtrapolateMs = MAX_EXTRAPOLATE_MS
} = {}) => {
    const slots = new Map();
    const clock = createTickClock({tickMs});
    const delayTicks = delayMs / tickMs;
    const maxAhead = maxExtrapolateMs / tickMs;

    const sampleSlot = (list, at, out) => {
        if (!list.length) return null;
        const first = list[0];
        if (at <= first.t) return copyInto(out, first.a);
        const last = list[list.length - 1];
        if (at >= last.t) {
            if (list.length < 2) return copyInto(out, last.a);
            const prev = list[list.length - 2];
            const ahead = Math.min(at - last.t, maxAhead);
            return blend(prev.a, last.a, 1 + (ahead / (last.t - prev.t)), out);
        }
        for (let i = list.length - 1; i > 0; i--) {
            const from = list[i - 1];
            const to = list[i];
            if (at >= from.t) return blend(from.a, to.a, (at - from.t) / (to.t - from.t), out);
        }
        return copyInto(out, first.a);
    };

    return {
        clock,
        push (slot, t, a, nowMs) {
            if (!Array.isArray(a) || a.length < 3 || !Number.isFinite(t)) return;
            if (Number.isFinite(nowMs)) clock.observe(t, nowMs);
            const key = String(slot);
            const list = slots.get(key) || [];
            if (list.length && t <= list[list.length - 1].t) {
                if (t === list[list.length - 1].t) list[list.length - 1].a = a.slice();
                return;
            }
            list.push({t, a: a.slice()});
            if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES);
            slots.set(key, list);
        },
        renderTick (nowMs) {
            const now = clock.tickAt(nowMs);
            return now === null ? null : now - delayTicks;
        },
        sample (slot, nowMs, out) {
            const list = slots.get(String(slot));
            const at = this.renderTick(nowMs);
            if (!list || at === null) return null;
            return sampleSlot(list, at, out || []);
        },
        sampleAt (slot, at, out) {
            const list = slots.get(String(slot));
            return list ? sampleSlot(list, at, out || []) : null;
        },
        drop (slot) {
            slots.delete(String(slot));
        },
        slots (out) {
            const into = out || [];
            into.length = 0;
            slots.forEach((list, key) => into.push(key));
            return into;
        },
        clear () {
            slots.clear();
            clock.reset();
        }
    };
};

export {
    TICK_MS,
    RENDER_DELAY_MS,
    MAX_EXTRAPOLATE_MS,
    createTickClock,
    createInterpolationBuffer,
    lerpAngle
};
