const STAGE_WIDTH = 480;
const STAGE_HEIGHT = 360;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const FRAME_RATE = 30;

const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const lerp = (a, b, t) => a + ((b - a) * t);

const toView = (view, x, y) => ({
    x: (x - view.x) * view.zoom,
    y: (y - view.y) * view.zoom,
    scale: view.zoom
});

const toWorld = (view, x, y) => ({
    x: view.x + (x / view.zoom),
    y: view.y + (y / view.zoom)
});

const viewRect = (view, width, height) => {
    const halfW = (width || STAGE_WIDTH) / 2 / view.zoom;
    const halfH = (height || STAGE_HEIGHT) / 2 / view.zoom;
    return {left: view.x - halfW, right: view.x + halfW, bottom: view.y - halfH, top: view.y + halfH};
};

const clampAxis = (value, low, high, half) => {
    if (high - low <= half * 2) return (low + high) / 2;
    return clamp(value, low + half, high - half);
};

const createCamera = options => {
    const opts = options || {};
    const random = opts.random || Math.random;
    const state = {
        active: false,
        x: 0,
        y: 0,
        zoom: 1,
        from: {x: 0, y: 0, zoom: 1},
        follow: null,
        smoothness: 0,
        bounds: null,
        keepInside: false,
        shake: null,
        offset: {x: 0, y: 0}
    };

    const constrain = () => {
        if (!state.keepInside || !state.bounds) return;
        const b = state.bounds;
        state.x = clampAxis(state.x, b.left, b.right, STAGE_WIDTH / 2 / state.zoom);
        state.y = clampAxis(state.y, b.bottom, b.top, STAGE_HEIGHT / 2 / state.zoom);
    };

    const settle = () => {
        constrain();
        state.from = {x: state.x, y: state.y, zoom: state.zoom};
    };

    const holds = new Set();

    const camera = {
        state,
        isActive: () => state.active && holds.size === 0,
        isHeld: () => holds.size > 0,
        hold (owner) {
            const key = owner || {};
            holds.add(key);
            return () => {
                holds.delete(key);
            };
        },
        activate () {
            state.active = true;
        },
        reset () {
            Object.assign(state, {
                active: false,
                x: 0,
                y: 0,
                zoom: 1,
                follow: null,
                smoothness: 0,
                keepInside: false,
                shake: null,
                offset: {x: 0, y: 0}
            });
            state.from = {x: 0, y: 0, zoom: 1};
        },
        set (x, y) {
            state.active = true;
            state.follow = null;
            state.x = num(x, state.x);
            state.y = num(y, state.y);
            settle();
        },
        setZoom (percent) {
            state.active = true;
            state.zoom = clamp(num(percent, 100) / 100, MIN_ZOOM, MAX_ZOOM);
            settle();
        },
        follow (id, smoothness) {
            state.active = true;
            state.follow = id || null;
            state.smoothness = clamp(num(smoothness, 0), 0, 99);
        },
        setBounds (rect) {
            state.bounds = rect ? Object.assign({}, rect) : null;
            constrain();
        },
        keepInside (on) {
            state.active = true;
            state.keepInside = !!on;
            settle();
        },
        shake (seconds, strength) {
            const duration = Math.max(0, num(seconds, 0));
            const power = Math.max(0, num(strength, 0));
            state.active = true;
            state.shake = duration > 0 && power > 0 ? {left: duration, duration, power} : null;
            if (!state.shake) state.offset = {x: 0, y: 0};
        },
        step (dt, followPosition) {
            const seconds = Math.max(0, num(dt, 1 / FRAME_RATE));
            state.from = {x: state.x + state.offset.x, y: state.y + state.offset.y, zoom: state.zoom};
            if (state.follow && followPosition) {
                const alpha = 1 - Math.pow(state.smoothness / 100, seconds * FRAME_RATE);
                state.x = lerp(state.x, followPosition.x, alpha);
                state.y = lerp(state.y, followPosition.y, alpha);
            }
            constrain();
            if (state.shake) {
                state.shake.left -= seconds;
                if (state.shake.left <= 0) {
                    state.shake = null;
                    state.offset = {x: 0, y: 0};
                } else {
                    const power = state.shake.power * (state.shake.left / state.shake.duration);
                    state.offset = {x: ((random() * 2) - 1) * power, y: ((random() * 2) - 1) * power};
                }
            }
        },
        view (progress) {
            const t = clamp(num(progress, 1), 0, 1);
            const to = {x: state.x + state.offset.x, y: state.y + state.offset.y, zoom: state.zoom};
            if (t >= 1) return to;
            return {
                x: lerp(state.from.x, to.x, t),
                y: lerp(state.from.y, to.y, t),
                zoom: lerp(state.from.zoom, to.zoom, t)
            };
        },
        report (name) {
            const view = camera.view(1);
            const rect = viewRect(view);
            switch (String(name).toLowerCase()) {
            case 'x': return view.x;
            case 'y': return view.y;
            case 'zoom': return view.zoom * 100;
            case 'left': return rect.left;
            case 'right': return rect.right;
            case 'top': return rect.top;
            case 'bottom': return rect.bottom;
            default: return 0;
            }
        },
        info () {
            if (!state.active) return null;
            const view = camera.view(1);
            return Object.assign({x: view.x, y: view.y, zoom: view.zoom, follow: state.follow}, viewRect(view));
        }
    };
    return camera;
};

export {
    STAGE_WIDTH,
    STAGE_HEIGHT,
    MIN_ZOOM,
    MAX_ZOOM,
    createCamera,
    toView,
    toWorld,
    viewRect,
    clampAxis
};
