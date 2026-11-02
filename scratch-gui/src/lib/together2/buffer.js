const TICK_MS = 50;
const MIN_RENDER_DELAY_MS = 50;
const RENDER_DELAY_MS = 100;
const MID_RENDER_DELAY_MS = 150;
const MAX_RENDER_DELAY_MS = 200;
const MAX_EXTRAPOLATE_MS = 100;
const MAX_SAMPLES = 20;
const CLOCK_DRIFT_MS = 1;
const CLOCK_REBASE_MS = 500;
const CLOCK_REBASE_SAMPLES = 3;
const CLOCK_REGRESS_TICKS = 40;
const JITTER_WINDOW_MS = 10000;
const JITTER_LOW_MS = 20;
const JITTER_HIGH_MS = 70;
const INBOUND_GAP_MS = 200;
const SEAM_EASE_MS = 150;
const SEAM_MAX_PX = 60;
const WEAK_ON_MS = 2000;
const WEAK_OFF_MS = 5000;
const RECONNECTING_AFTER_MS = 1000;
const WEAK_RTT_P50_MS = 150;
const WEAK_RTT_P95_MS = 250;
const WEAK_EXTRAPOLATE_RATIO = 0.05;
const WEAK_SNAPS_COUNT = 2;
const WEAK_GAPS_COUNT = 2;
const WEAK_TEXT = 'Weak connection';
const RECONNECTING_TEXT = 'Reconnecting';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const percentile = (values, q) => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
    return sorted[idx];
};

const renderDelayForJitter = (jitterP95, {
    minDelayMs = MIN_RENDER_DELAY_MS,
    maxDelayMs = MAX_RENDER_DELAY_MS
} = {}) => {
    const j = Number.isFinite(jitterP95) ? jitterP95 : 0;
    let target = RENDER_DELAY_MS;
    if (j > JITTER_HIGH_MS) target = MAX_RENDER_DELAY_MS;
    else if (j > JITTER_LOW_MS) target = MID_RENDER_DELAY_MS;
    return clamp(target, minDelayMs, maxDelayMs);
};

const pingBucket = rttMs => {
    if (!Number.isFinite(rttMs) || rttMs <= 80) return 'good';
    if (rttMs <= WEAK_RTT_P50_MS) return 'ok';
    return 'weak';
};

const extrapolateStep = (aheadTicks, maxAheadTicks) => {
    if (aheadTicks <= 0 || maxAheadTicks <= 0) return 0;
    if (aheadTicks >= maxAheadTicks) return maxAheadTicks;
    const half = maxAheadTicks * 0.5;
    if (aheadTicks <= half) return aheadTicks;
    const s = (aheadTicks - half) / half;
    const eased = 1 - ((1 - s) * (1 - s));
    return half + (half * eased);
};

const createTickClock = ({tickMs = TICK_MS, windowMs = JITTER_WINDOW_MS} = {}) => {
    let offset = null;
    let behind = 0;
    let lastObserveMs = null;
    let lastObserveTick = null;
    let inHoleBurst = false;
    let resets = 0;
    const arrivals = [];
    const gaps = [];
    const holes = [];

    const prune = nowMs => {
        if (!Number.isFinite(nowMs)) return;
        const cutoff = nowMs - windowMs;
        while (arrivals.length && arrivals[0].at < cutoff) arrivals.shift();
        while (gaps.length && gaps[0] < cutoff) gaps.shift();
        while (holes.length && holes[0].to < cutoff) holes.shift();
    };

    return {
        observe (t, nowMs) {
            if (Number.isFinite(nowMs) && Number.isFinite(t)) {
                prune(nowMs);
                if (lastObserveMs !== null && t >= lastObserveTick) {
                    const dtMs = Math.max(0, nowMs - lastObserveMs);
                    const dtTicks = Math.max(1, t - lastObserveTick);
                    if (dtMs > INBOUND_GAP_MS) {
                        gaps.push(nowMs);
                        holes.push({from: lastObserveMs, to: nowMs});
                        inHoleBurst = true;
                    } else if (dtMs === 0 && inHoleBurst) {
                        inHoleBurst = true;
                    } else {
                        inHoleBurst = false;
                        const jitter = Math.abs(dtMs - (dtTicks * tickMs));
                        arrivals.push({at: nowMs, jitter, gap: dtMs});
                    }
                }
                lastObserveMs = nowMs;
                lastObserveTick = t;
            }
            const sample = nowMs - (t * tickMs);
            if (offset === null) {
                offset = sample;
            } else if (sample - offset > CLOCK_REBASE_MS) {
                behind += 1;
                offset = behind >= CLOCK_REBASE_SAMPLES ? sample : offset + CLOCK_DRIFT_MS;
                if (behind >= CLOCK_REBASE_SAMPLES) {
                    behind = 0;
                    resets += 1;
                }
            } else {
                behind = 0;
                offset = Math.min(sample, offset + CLOCK_DRIFT_MS);
            }
            return offset;
        },
        tickAt (nowMs) {
            return offset === null ? null : (nowMs - offset) / tickMs;
        },
        jitterP95 (nowMs, spanMs = windowMs) {
            if (Number.isFinite(nowMs)) prune(nowMs);
            if (!arrivals.length) return 0;
            const cutoff = Number.isFinite(nowMs) ? nowMs - spanMs : -Infinity;
            const vals = [];
            for (let i = 0; i < arrivals.length; i++) {
                if (arrivals[i].at >= cutoff) vals.push(arrivals[i].jitter);
            }
            return percentile(vals, 0.95);
        },
        inboundGaps (nowMs, spanMs = windowMs) {
            if (Number.isFinite(nowMs)) prune(nowMs);
            if (!Number.isFinite(nowMs)) return gaps.length;
            const cutoff = nowMs - spanMs;
            let count = 0;
            for (let i = 0; i < gaps.length; i++) {
                if (gaps[i] >= cutoff) count += 1;
            }
            return count;
        },
        inHole (atMs) {
            for (let i = 0; i < holes.length; i++) {
                if (atMs >= holes[i].from && atMs <= holes[i].to) return true;
            }
            if (lastObserveMs !== null && atMs - lastObserveMs > INBOUND_GAP_MS) return true;
            return false;
        },
        lastArrivalAt () {
            return lastObserveMs;
        },
        get resets () {
            return resets;
        },
        reset () {
            offset = null;
            behind = 0;
            lastObserveMs = null;
            lastObserveTick = null;
            inHoleBurst = false;
            resets += 1;
            arrivals.length = 0;
            gaps.length = 0;
            holes.length = 0;
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
    minDelayMs = MIN_RENDER_DELAY_MS,
    maxDelayMs = MAX_RENDER_DELAY_MS,
    maxExtrapolateMs = MAX_EXTRAPOLATE_MS,
    adaptive = true,
    windowMs = JITTER_WINDOW_MS
} = {}) => {
    const slots = new Map();
    const meta = new Map();
    const clock = createTickClock({tickMs, windowMs});
    const fixedDelay = delayMs !== RENDER_DELAY_MS || !adaptive;
    const baseDelayMs = clamp(delayMs, minDelayMs, maxDelayMs);
    const maxAhead = maxExtrapolateMs / tickMs;
    const frameSamples = [];
    let effectiveDelayMs = baseDelayMs;
    let lastRenderNowMs = null;
    let lastRenderTick = null;
    let lastResetSeen = 0;
    let clears = 0;

    const pruneFrames = nowMs => {
        if (!Number.isFinite(nowMs)) return;
        const cutoff = nowMs - windowMs;
        while (frameSamples.length && frameSamples[0].at < cutoff) frameSamples.shift();
    };

    const sampleSlot = (list, at, out) => {
        if (!list.length) return null;
        const first = list[0];
        if (at <= first.t) return copyInto(out, first.a);
        const last = list[list.length - 1];
        if (at >= last.t) {
            if (list.length < 2) return copyInto(out, last.a);
            const prev = list[list.length - 2];
            const span = Math.max(1, last.t - prev.t);
            const ahead = extrapolateStep(at - last.t, maxAhead);
            return blend(prev.a, last.a, 1 + (ahead / span), out);
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
        delayMs (nowMs) {
            if (fixedDelay) return baseDelayMs;
            return renderDelayForJitter(clock.jitterP95(nowMs), {minDelayMs, maxDelayMs});
        },
        push (slot, t, a, nowMs) {
            if (!Array.isArray(a) || a.length < 3 || !Number.isFinite(t)) return;
            if (Number.isFinite(nowMs)) clock.observe(t, nowMs);
            const key = String(slot);
            let list = slots.get(key) || [];
            if (list.length && list[list.length - 1].t - t > CLOCK_REGRESS_TICKS) {
                slots.clear();
                meta.clear();
                clock.reset();
                clears += 1;
                lastRenderTick = null;
                if (Number.isFinite(nowMs)) clock.observe(t, nowMs);
                list = [];
            }
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
            if (now === null) return null;
            const targetDelay = this.delayMs(nowMs);
            if (lastRenderNowMs === null || clock.resets !== lastResetSeen ||
                nowMs < lastRenderNowMs || nowMs - lastRenderNowMs > 250) {
                effectiveDelayMs = targetDelay;
                lastResetSeen = clock.resets;
                if (lastRenderNowMs !== null && nowMs < lastRenderNowMs) lastRenderTick = null;
            } else if (effectiveDelayMs !== targetDelay) {
                const maxStep = Math.max(0.5, (nowMs - lastRenderNowMs) * 0.5);
                if (targetDelay > effectiveDelayMs) {
                    effectiveDelayMs = Math.min(targetDelay, effectiveDelayMs + maxStep);
                } else {
                    effectiveDelayMs = Math.max(targetDelay, effectiveDelayMs - maxStep);
                }
            }
            lastRenderNowMs = nowMs;
            let raw = now - (effectiveDelayMs / tickMs);
            if (lastRenderTick !== null && raw < lastRenderTick) raw = lastRenderTick;
            lastRenderTick = raw;
            return raw;
        },
        sample (slot, nowMs, out) {
            const key = String(slot);
            const list = slots.get(key);
            const at = this.renderTick(nowMs);
            if (!list || !list.length || at === null) return null;
            const into = out || [];
            const last = list[list.length - 1];
            const isExtrap = at > last.t;
            if (Number.isFinite(nowMs)) {
                pruneFrames(nowMs);
                frameSamples.push({at: nowMs, slot: key, extrapolating: isExtrap});
            }
            sampleSlot(list, at, into);
            let state = meta.get(key);
            if (!state) {
                state = {
                    extrapolating: isExtrap,
                    lastLastT: last.t,
                    lastX: into[0],
                    lastY: into[1],
                    seam: null
                };
                meta.set(key, state);
                return into;
            }
            if (state.extrapolating && last.t > state.lastLastT && Number.isFinite(nowMs)) {
                const ex = state.lastX - into[0];
                const ey = state.lastY - into[1];
                const dist = Math.hypot(ex, ey);
                if (dist > 0.5 && dist <= SEAM_MAX_PX) {
                    state.seam = {ex, ey, start: nowMs};
                }
            }
            if (state.seam && Number.isFinite(nowMs)) {
                const p = (nowMs - state.seam.start) / SEAM_EASE_MS;
                if (p >= 1 || p < 0) {
                    state.seam = null;
                } else {
                    const ease = 1 - (p * p * (3 - (2 * p)));
                    into[0] += state.seam.ex * ease;
                    into[1] += state.seam.ey * ease;
                }
            }
            state.extrapolating = isExtrap;
            state.lastLastT = last.t;
            state.lastX = into[0];
            state.lastY = into[1];
            return into;
        },
        sampleAt (slot, at, out) {
            const list = slots.get(String(slot));
            return list ? sampleSlot(list, at, out || []) : null;
        },
        extrapolatingRatio (nowMs, spanMs = windowMs) {
            if (Number.isFinite(nowMs)) pruneFrames(nowMs);
            const cutoff = Number.isFinite(nowMs) ? nowMs - spanMs : -Infinity;
            const bySlot = new Map();
            for (let i = 0; i < frameSamples.length; i++) {
                const entry = frameSamples[i];
                if (entry.at >= cutoff && !clock.inHole(entry.at)) {
                    let counts = bySlot.get(entry.slot);
                    if (!counts) {
                        counts = {total: 0, extrap: 0};
                        bySlot.set(entry.slot, counts);
                    }
                    counts.total += 1;
                    if (entry.extrapolating) counts.extrap += 1;
                }
            }
            let maxRatio = 0;
            for (const counts of bySlot.values()) {
                if (counts.total >= 5) {
                    const ratio = counts.extrap / counts.total;
                    if (ratio > maxRatio) maxRatio = ratio;
                }
            }
            return maxRatio;
        },
        drop (slot) {
            const key = String(slot);
            slots.delete(key);
            meta.delete(key);
        },
        slots (out) {
            const into = out || [];
            into.length = 0;
            for (const key of slots.keys()) into.push(key);
            return into;
        },
        get clears () {
            return clears;
        },
        clear () {
            slots.clear();
            meta.clear();
            frameSamples.length = 0;
            effectiveDelayMs = baseDelayMs;
            lastRenderNowMs = null;
            lastRenderTick = null;
            clock.reset();
        }
    };
};

const createConnectionHealth = ({
    buffer = null,
    prediction = null,
    windowMs = JITTER_WINDOW_MS,
    onMs = WEAK_ON_MS,
    offMs = WEAK_OFF_MS,
    reconnectingAfterMs = RECONNECTING_AFTER_MS
} = {}) => {
    const rttSamples = [];
    let weak = false;
    let reconnecting = false;
    let badSince = null;
    let lastBadAt = null;
    let latchUntil = -Infinity;
    let clearedAt = -Infinity;
    let prevGaps = 0;
    let prevSnaps = 0;
    let connected = false;
    let droppedAt = null;

    const pruneRtt = nowMs => {
        if (!Number.isFinite(nowMs)) return;
        const cutoff = nowMs - windowMs;
        while (rttSamples.length && rttSamples[0].at < cutoff) rttSamples.shift();
    };

    const rttStats = (nowMs, spanMs = windowMs) => {
        pruneRtt(nowMs);
        const cutoff = Number.isFinite(nowMs) ? nowMs - spanMs : -Infinity;
        const vals = [];
        for (let i = 0; i < rttSamples.length; i++) {
            if (rttSamples[i].at >= cutoff) vals.push(rttSamples[i].ms);
        }
        return {
            p50: percentile(vals, 0.5),
            p95: percentile(vals, 0.95),
            latest: vals.length ? vals[vals.length - 1] : null
        };
    };

    return {
        observeRtt (ms, nowMs) {
            if (!Number.isFinite(ms) || !Number.isFinite(nowMs)) return;
            pruneRtt(nowMs);
            rttSamples.push({at: nowMs, ms});
        },
        setConnected (isConnected, nowMs) {
            if (isConnected) {
                connected = true;
                droppedAt = null;
                reconnecting = false;
            } else {
                if (connected && droppedAt === null && Number.isFinite(nowMs)) droppedAt = nowMs;
                connected = false;
            }
        },
        evaluate (nowMs) {
            if (!Number.isFinite(nowMs)) return {weak, reconnecting, label: weak ? WEAK_TEXT : ''};
            const lastTickAt = buffer && buffer.clock ? buffer.clock.lastArrivalAt() : null;
            const tickSilent = connected && lastTickAt !== null && (nowMs - lastTickAt) >= reconnectingAfterMs;
            const socketDropped = !connected && droppedAt !== null;
            reconnecting = Boolean(tickSilent || socketDropped);

            const activeSpan = Math.min(windowMs, Math.max(0, nowMs - clearedAt));
            const rtt10 = rttStats(nowMs, activeSpan);
            const rtt5 = rttStats(nowMs, offMs);
            const jitter10 = buffer && buffer.clock ? buffer.clock.jitterP95(nowMs, activeSpan) : 0;
            const jitterAll = buffer && buffer.clock ? buffer.clock.jitterP95(nowMs, windowMs) : 0;
            const extrap10 = buffer ? buffer.extrapolatingRatio(nowMs, activeSpan) : 0;
            const extrap5 = buffer ? buffer.extrapolatingRatio(nowMs, offMs) : 0;
            const gaps10 = buffer && buffer.clock ? buffer.clock.inboundGaps(nowMs, activeSpan) : 0;
            const gaps5 = buffer && buffer.clock ? buffer.clock.inboundGaps(nowMs, offMs) : 0;
            const snaps10 = prediction && typeof prediction.snapsInWindow === 'function' ?
                prediction.snapsInWindow(nowMs) : 0;

            if ((gaps10 >= WEAK_GAPS_COUNT && gaps10 > prevGaps) ||
                (snaps10 >= WEAK_SNAPS_COUNT && snaps10 > prevSnaps)) {
                latchUntil = Math.max(latchUntil, nowMs + onMs);
                lastBadAt = nowMs;
                if (badSince === null) badSince = nowMs;
            }
            prevGaps = gaps10;
            prevSnaps = snaps10;

            const rttBad = rtt10.p50 > WEAK_RTT_P50_MS || rtt10.p95 > WEAK_RTT_P95_MS;
            const jitterBad = jitter10 > JITTER_HIGH_MS;
            const extrapBad = extrap10 > WEAK_EXTRAPOLATE_RATIO;
            const discreteBad = nowMs <= latchUntil || gaps10 >= WEAK_GAPS_COUNT || snaps10 >= WEAK_SNAPS_COUNT;
            const anyTrigger = Boolean(reconnecting || rttBad || jitterBad || extrapBad || discreteBad);

            const rtt5Bad = rtt5.p50 > WEAK_RTT_P50_MS || rtt5.p95 > WEAK_RTT_P95_MS;
            const extrap5Bad = extrap5 > WEAK_EXTRAPOLATE_RATIO;
            const recentBad = Boolean(reconnecting || rtt5Bad || jitterBad || extrap5Bad);
            if (recentBad) lastBadAt = nowMs;

            if (anyTrigger) {
                if (badSince === null) badSince = nowMs;
                if (nowMs - badSince >= onMs) weak = true;
            } else {
                badSince = null;
            }

            if (weak) {
                const quietStart = lastBadAt === null ? nowMs : lastBadAt;
                if (!reconnecting && !rtt5Bad && !extrap5Bad && gaps5 === 0 && (nowMs - quietStart) >= offMs) {
                    weak = false;
                    badSince = null;
                    latchUntil = -Infinity;
                    clearedAt = nowMs;
                    prevGaps = 0;
                    prevSnaps = 0;
                }
            }

            return {
                weak,
                reconnecting,
                label: reconnecting ? RECONNECTING_TEXT : (weak ? WEAK_TEXT : ''),
                delayMs: buffer ? buffer.delayMs(nowMs) : RENDER_DELAY_MS,
                jitterP95: jitterAll,
                rttP50: rtt10.p50,
                rttP95: rtt10.p95
            };
        },
        get weak () {
            return weak;
        },
        get reconnecting () {
            return reconnecting;
        },
        reset () {
            rttSamples.length = 0;
            weak = false;
            reconnecting = false;
            badSince = null;
            lastBadAt = null;
            latchUntil = -Infinity;
            clearedAt = -Infinity;
            prevGaps = 0;
            prevSnaps = 0;
            connected = false;
            droppedAt = null;
        }
    };
};

export {
    TICK_MS,
    MIN_RENDER_DELAY_MS,
    RENDER_DELAY_MS,
    MID_RENDER_DELAY_MS,
    MAX_RENDER_DELAY_MS,
    MAX_EXTRAPOLATE_MS,
    JITTER_WINDOW_MS,
    JITTER_LOW_MS,
    JITTER_HIGH_MS,
    WEAK_ON_MS,
    WEAK_OFF_MS,
    RECONNECTING_AFTER_MS,
    WEAK_TEXT,
    RECONNECTING_TEXT,
    createConnectionHealth,
    createTickClock,
    createInterpolationBuffer,
    extrapolateStep,
    lerpAngle,
    pingBucket,
    renderDelayForJitter
};
