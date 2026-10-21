const AFTER_EXECUTE = 'AFTER_EXECUTE';
const RUN_START = 'PROJECT_RUN_START';
const RUN_STOP = 'PROJECT_RUN_STOP';
const READY = 'SquiggleWorldReady';
const MAX_DT = 0.05;
const FIRST_DT = 1 / 60;

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

const seamFor = runtime => {
    if (typeof window === 'undefined') return null;
    const seam = window.SquiggleWorld;
    return seam && seam.runtime === runtime ? seam : null;
};

const cameraActive = runtime => {
    const seam = seamFor(runtime);
    return !!(seam && typeof seam.camera === 'function' && seam.camera());
};

const loop = {overlays: new Set(), handle: null, request: null, cancel: null, run: null};

const requestFrame = fn => {
    if (loop.request) return loop.request(fn);
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(fn, 16);
};

const cancelFrame = handle => {
    if (loop.request) {
        if (loop.cancel) loop.cancel(handle);
        return;
    }
    if (typeof requestAnimationFrame === 'function') {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
        return;
    }
    clearTimeout(handle);
};

const keepsLoop = () => {
    for (const overlay of loop.overlays) {
        if (overlay.awake() || overlay.isRunning()) return true;
    }
    return false;
};

const schedule = () => {
    if (loop.handle === null && loop.overlays.size) loop.handle = requestFrame(loop.run);
};

loop.run = () => {
    loop.handle = null;
    let failed = false;
    let failure = null;
    for (const overlay of loop.overlays) {
        try {
            if (overlay.awake()) overlay.draw();
        } catch (error) {
            if (!failed) failure = error;
            failed = true;
        }
    }
    if (keepsLoop()) schedule();
    if (failed) throw failure;
};

const setFrameRequest = (request, cancel) => {
    if (loop.handle !== null) cancelFrame(loop.handle);
    loop.handle = null;
    loop.request = request || null;
    loop.cancel = cancel || null;
    if (keepsLoop()) schedule();
};

const liveness = new WeakMap();

const livenessFor = runtime => {
    let entry = liveness.get(runtime);
    if (!entry) {
        entry = {set: new Set(), stale: true};
        liveness.set(runtime, entry);
    }
    return entry;
};

const isAlive = (runtime, target) => {
    const entry = livenessFor(runtime);
    if (entry.stale) {
        entry.set.clear();
        const targets = runtime.executableTargets || [];
        for (let i = 0; i < targets.length; i++) entry.set.add(targets[i]);
        entry.stale = false;
    }
    return entry.set.has(target);
};

const onStep = (runtime, fn) => {
    const seam = seamFor(runtime);
    if (seam) return seam.onAfterExecute(fn);
    runtime.on(AFTER_EXECUTE, fn);
    let dispose = () => runtime.removeListener(AFTER_EXECUTE, fn);
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => dispose();
    const onReady = () => {
        const ready = seamFor(runtime);
        if (!ready) return;
        window.removeEventListener(READY, onReady);
        dispose();
        dispose = ready.onAfterExecute(fn);
    };
    window.addEventListener(READY, onReady);
    return () => {
        window.removeEventListener(READY, onReady);
        dispose();
    };
};

const mountCanvas = (runtime, zIndex, onResize) => {
    const stageCanvas = runtime.renderer && runtime.renderer.canvas;
    const parent = stageCanvas && stageCanvas.parentElement;
    if (typeof document === 'undefined' || !parent) return {canvas: null, release: () => {}};
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = String(zIndex);
    const sync = () => {
        const rect = stageCanvas.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        canvas.style.left = `${rect.left - parentRect.left}px`;
        canvas.style.top = `${rect.top - parentRect.top}px`;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        if (canvas.width !== stageCanvas.width) canvas.width = stageCanvas.width;
        if (canvas.height !== stageCanvas.height) canvas.height = stageCanvas.height;
        onResize();
    };
    parent.style.position = parent.style.position || 'relative';
    parent.appendChild(canvas);
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    if (observer) observer.observe(stageCanvas);
    const listens = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    if (listens) window.addEventListener('resize', sync);
    const release = () => {
        if (observer) observer.disconnect();
        if (listens) window.removeEventListener('resize', sync);
        if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    };
    return {canvas, release};
};

const createOverlay = (runtime, options) => {
    const opts = options || {};
    const state = {
        awake: false,
        last: null,
        drawn: false,
        running: !!(runtime.threads && runtime.threads.length),
        view: null,
        world: null,
        pinned: null,
        lastX: NaN,
        lastY: NaN,
        lastZoom: NaN
    };
    const stats = {draws: 0, total: 0, max: 0, last: 0};
    const identity = (x, y) => ({x, y});

    const overlay = {
        canvas: null,
        ctx: null,
        stats,
        clock: opts.clock || now,
        stageCanvas: runtime.renderer ? runtime.renderer.canvas : null,
        isRunning: () => state.running,
        awake: () => state.awake,
        stageSize () {
            return [runtime.stageWidth || 480, runtime.stageHeight || 360];
        },
        unit () {
            return overlay.canvas ? overlay.canvas.width / overlay.stageSize()[0] : 1;
        },
        view () {
            const seam = seamFor(runtime);
            return seam && typeof seam.getView === 'function' ? seam.getView() : null;
        },
        projector (pinned) {
            const cached = pinned ? state.pinned : state.world;
            if (cached) return cached;
            const [w, h] = overlay.stageSize();
            const canvas = overlay.canvas;
            const sx = (canvas ? canvas.width : w) / w;
            const sy = (canvas ? canvas.height : h) / h;
            const view = pinned ? null : (state.view || overlay.view());
            if (!view) return (x, y) => ({x: (x + (w / 2)) * sx, y: ((h / 2) - y) * sy, scale: sx});
            const vx = view.x;
            const vy = view.y;
            const zoom = view.zoom;
            return (x, y) => ({
                x: (((x - vx) * zoom) + (w / 2)) * sx,
                y: ((h / 2) - ((y - vy) * zoom)) * sy,
                scale: zoom * sx
            });
        },
        project (x, y, pinned) {
            const cached = pinned ? state.pinned : state.world;
            return (cached || overlay.projector(pinned))(x, y);
        },
        toScreen (x, y) {
            const seam = seamFor(runtime);
            if (!seam || typeof seam.toView !== 'function') return identity(x, y);
            const at = seam.toView(x, y);
            return {x: at.x, y: at.y};
        },
        toWorld (x, y) {
            const seam = seamFor(runtime);
            if (!seam || typeof seam.toWorld !== 'function') return identity(x, y);
            return seam.toWorld(x, y);
        },
        alive: target => isAlive(runtime, target),
        onScreen (point, margin) {
            const canvas = overlay.canvas;
            if (!canvas) return true;
            const m = margin || 0;
            return point.x >= -m && point.y >= -m && point.x <= canvas.width + m && point.y <= canvas.height + m;
        },
        wake () {
            state.awake = true;
            schedule();
        },
        draw () {
            const started = now();
            const t = overlay.clock();
            const dt = state.last === null ? FIRST_DT : Math.min(MAX_DT, Math.max(0, (t - state.last) / 1000));
            state.last = t;
            const view = overlay.view();
            state.view = view;
            state.lastX = view ? view.x : NaN;
            state.lastY = view ? view.y : NaN;
            state.lastZoom = view ? view.zoom : NaN;
            let live = false;
            try {
                state.world = overlay.projector(false);
                state.pinned = overlay.projector(true);
                const ctx = overlay.ctx;
                if (ctx && state.drawn) ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
                state.drawn = true;
                live = !!opts.frame(ctx, dt, t / 1000);
            } finally {
                state.view = null;
                state.world = null;
                state.pinned = null;
                if (!live) {
                    state.awake = false;
                    state.last = null;
                }
            }
            const spent = now() - started;
            stats.draws++;
            stats.total += spent;
            stats.last = spent;
            if (spent > stats.max) stats.max = spent;
        },
        moved () {
            const view = overlay.view();
            return !!view && (view.x !== state.lastX || view.y !== state.lastY || view.zoom !== state.lastZoom);
        },
        step () {
            livenessFor(runtime).stale = true;
            if (!state.awake && (overlay.moved() || (opts.sample && opts.sample()))) state.awake = true;
            if (state.awake || state.running) schedule();
        },
        dispose: null
    };

    const mounted = mountCanvas(runtime, opts.zIndex || 10, overlay.wake);
    overlay.canvas = mounted.canvas;
    overlay.ctx = overlay.canvas ? overlay.canvas.getContext('2d') : null;
    loop.overlays.add(overlay);
    const disposeStep = onStep(runtime, overlay.step);
    const start = () => {
        state.running = true;
        overlay.wake();
    };
    const stop = () => {
        state.running = false;
        overlay.wake();
    };
    runtime.on(RUN_START, start);
    runtime.on(RUN_STOP, stop);
    overlay.dispose = () => {
        disposeStep();
        loop.overlays.delete(overlay);
        runtime.removeListener(RUN_START, start);
        runtime.removeListener(RUN_STOP, stop);
        mounted.release();
    };
    overlay.wake();
    return overlay;
};

export {createOverlay, cameraActive, onStep, seamFor, setFrameRequest};
