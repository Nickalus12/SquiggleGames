const EASE_MS = 150;
const SNAP_PX = 30;

const createPrediction = ({easeMs = EASE_MS, snapPx = SNAP_PX} = {}) => {
    let cid = 0;
    let snaps = 0;
    let pending = null;
    return {
        correct (correction, local, nowMs) {
            if (!Array.isArray(correction) || correction.length < 3) return null;
            const [x, y, next] = correction;
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(next) || next <= cid) return null;
            cid = next;
            const ex = x - local.x;
            const ey = y - local.y;
            if (Math.hypot(ex, ey) > snapPx) {
                snaps++;
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
            const delta = {dx: pending.ex * part, dy: pending.ey * part};
            if (f >= 1) pending = null;
            return delta;
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
        reset () {
            cid = 0;
            snaps = 0;
            pending = null;
        }
    };
};

export {
    EASE_MS,
    SNAP_PX,
    createPrediction
};
