const AFTER_EXECUTE = 'AFTER_EXECUTE';
const RUN_START = 'PROJECT_RUN_START';
const RUN_STOP = 'PROJECT_RUN_STOP';
const READY = 'SquiggleWorldReady';

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
    if (typeof document === 'undefined' || !parent) return null;
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
    if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(stageCanvas);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', sync);
    }
    return canvas;
};

const createOverlay = (runtime, options) => {
    const opts = options || {};
    const maxDt = opts.maxDt || 0.05;
    const state = {awake: false, pending: false, last: null, drawn: false, running: false};
    const stats = {draws: 0, total: 0, max: 0, last: 0};

    const overlay = {
        canvas: null,
        ctx: null,
        stats,
        clock: opts.clock || now,
        stageCanvas: runtime.renderer ? runtime.renderer.canvas : null,
        isRunning: () => state.running,
        stageSize () {
            return [runtime.stageWidth || 480, runtime.stageHeight || 360];
        },
        unit () {
            return overlay.canvas ? overlay.canvas.width / overlay.stageSize()[0] : 1;
        },
        projector (pinned) {
            const seam = pinned ? null : seamFor(runtime);
            const [w, h] = overlay.stageSize();
            const canvas = overlay.canvas;
            const sx = (canvas ? canvas.width : w) / w;
            const sy = (canvas ? canvas.height : h) / h;
            if (!seam) return (x, y) => ({x: (x + (w / 2)) * sx, y: ((h / 2) - y) * sy, scale: sx});
            return (x, y) => {
                const view = seam.toView(x, y);
                return {x: (view.x + (w / 2)) * sx, y: ((h / 2) - view.y) * sy, scale: view.scale * sx};
            };
        },
        project (x, y, pinned) {
            return overlay.projector(pinned)(x, y);
        },
        onScreen (point, margin) {
            const canvas = overlay.canvas;
            if (!canvas) return true;
            const m = margin || 0;
            return point.x >= -m && point.y >= -m && point.x <= canvas.width + m && point.y <= canvas.height + m;
        },
        wake () {
            state.awake = true;
        },
        draw () {
            state.pending = false;
            const started = now();
            const t = overlay.clock();
            const dt = state.last === null ? 1 / 30 : Math.min(maxDt, Math.max(0, (t - state.last) / 1000));
            state.last = t;
            const ctx = overlay.ctx;
            if (ctx && state.drawn) ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
            const live = !!opts.frame(ctx, dt, t / 1000);
            const spent = now() - started;
            stats.draws++;
            stats.total += spent;
            stats.last = spent;
            if (spent > stats.max) stats.max = spent;
            state.drawn = true;
            if (!live) {
                state.awake = false;
                state.last = null;
            }
        },
        step () {
            if (!state.awake || state.pending) return;
            state.pending = true;
            Promise.resolve().then(overlay.draw);
        },
        dispose: null
    };

    overlay.canvas = mountCanvas(runtime, opts.zIndex || 10, overlay.wake);
    overlay.ctx = overlay.canvas ? overlay.canvas.getContext('2d') : null;
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
        runtime.removeListener(RUN_START, start);
        runtime.removeListener(RUN_STOP, stop);
        if (overlay.canvas && overlay.canvas.parentElement) overlay.canvas.parentElement.removeChild(overlay.canvas);
    };
    return overlay;
};

export {createOverlay, cameraActive, seamFor};
