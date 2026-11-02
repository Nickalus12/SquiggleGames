const EASE_MS = 150;
const SNAP_PX = 30;
const TELEPORT_PX = SNAP_PX;
const SNAP_WINDOW_MS = 10000;

const pruneWindow = (list, nowMs, windowMs) => {
    if (!Number.isFinite(nowMs)) return;
    const cutoff = nowMs - windowMs;
    while (list.length && list[0] < cutoff) list.shift();
};

const createPrediction = ({
    easeMs = EASE_MS,
    snapPx = SNAP_PX,
    windowMs = SNAP_WINDOW_MS
} = {}) => {
    let cid = 0;
    let snaps = 0;
    let corrections = 0;
    let pending = null;
    const snapTimes = [];
    const correctionTimes = [];
    const delta = {dx: 0, dy: 0};
    return {
        correct (correction, local, nowMs, options) {
            if (!Array.isArray(correction) || correction.length < 3 || !local) return null;
            const [x, y, next] = correction;
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(next) || next <= cid) return null;
            cid = next;
            corrections++;
            if (Number.isFinite(nowMs)) {
                pruneWindow(correctionTimes, nowMs, windowMs);
                correctionTimes.push(nowMs);
            }
            const ex = x - local.x;
            const ey = y - local.y;
            const dist = Math.hypot(ex, ey);
            const teleport = Boolean((options && options.teleport) || correction[3] === 1);
            if (teleport || dist > snapPx) {
                snaps++;
                if (Number.isFinite(nowMs)) {
                    pruneWindow(snapTimes, nowMs, windowMs);
                    snapTimes.push(nowMs);
                }
                pending = null;
                return {kind: 'snap', x, y, cid};
            }
            pending = {ex, ey, start: nowMs, done: 0};
            return {kind: 'ease', x, y, cid};
        },
        step (nowMs) {
            if (!pending) return null;
            const f = Math.min(1, Math.max(0, (nowMs - pending.start) / easeMs));
            const part = f - pending.done;
            pending.done = f;
            delta.dx = pending.ex * part;
            delta.dy = pending.ey * part;
            if (f >= 1) pending = null;
            return delta;
        },
        snapsInWindow (nowMs) {
            pruneWindow(snapTimes, nowMs, windowMs);
            return snapTimes.length;
        },
        correctionsInWindow (nowMs) {
            pruneWindow(correctionTimes, nowMs, windowMs);
            return correctionTimes.length;
        },
        get easing () {
            return !!pending;
        },
        get cid () {
            return cid;
        },
        get snaps () {
            return snaps;
        },
        get corrections () {
            return corrections;
        },
        reset () {
            cid = 0;
            snaps = 0;
            corrections = 0;
            snapTimes.length = 0;
            correctionTimes.length = 0;
            pending = null;
        }
    };
};

export {
    EASE_MS,
    SNAP_PX,
    SNAP_WINDOW_MS,
    TELEPORT_PX,
    createPrediction
};
