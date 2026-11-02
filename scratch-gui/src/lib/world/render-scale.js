const LADDER = Object.freeze([2, 1, 0.75, 0.5]);
const RUNGS = Object.freeze({
    '2x': 2,
    '2.0x': 2,
    'sharpest': 1.5,
    'crisp': 1,
    'fast': 0.5,
    'fastest': 0.375
});
const MODES = Object.freeze(['auto', 'crisp', 'fast', 'fastest', 'sharpest', '2x']);
const RUNG_MESSAGES = Object.freeze({
    'auto': Object.freeze({
        id: 'sq.playerSettings.quality.auto',
        defaultMessage: 'Auto',
        description: '3D picture quality choice that adjusts automatically'
    }),
    'crisp': Object.freeze({
        id: 'sq.playerSettings.quality.crisp',
        defaultMessage: 'Crisp',
        description: '3D picture quality choice for sharp resolution'
    }),
    'fast': Object.freeze({
        id: 'sq.playerSettings.quality.fast',
        defaultMessage: 'Fast',
        description: '3D picture quality choice for smooth speed'
    }),
    'fastest': Object.freeze({
        id: 'sq.playerSettings.quality.fastest',
        defaultMessage: 'Fastest',
        description: '3D picture quality choice for maximum frame rate on slow devices'
    }),
    'sharpest': Object.freeze({
        id: 'sq.playerSettings.quality.sharpest',
        defaultMessage: 'Sharpest',
        description: '3D picture quality choice for extra sharp detail'
    }),
    '2x': Object.freeze({
        id: 'sq.playerSettings.quality.2x',
        defaultMessage: '2.0x',
        description: '3D picture quality choice for 2.0x 1280x720 resolution'
    }),
    'textureFilter': Object.freeze({
        id: 'sq.playerSettings.textureFilter',
        defaultMessage: 'Smooth textures',
        description: 'Toggle label for bilinear texture filtering on walls and floors'
    })
});
const DEFAULT_SPRITE_STEP = 1;
const FAST_SPRITE_STEP = 2;
const DEFAULT_RAY_CAP = 40;
const FAST_RAY_CAP = 16;
const PIXEL_BUDGET = 480 * 360;
const WINDOW = 45;
const OVER_BUDGET = 0.6;
const HEADROOM = 0.35;
const CRISP_DPR = 1.5;
const LATE_SHARE_DOWN = 0.05;
const LATE_SHARE_UP = 0.02;
const MIN_PACED_FRAMES = 30;
const MAX_HOLD = 8;
const ULTRA_P95_MS = 6;
const ULTRA_CLEAN_WINDOWS = 8;

const rungFor = scale => {
    for (let i = 0; i < LADDER.length; i++) {
        if (LADDER[i] <= scale + 1e-9) return i;
    }
    return LADDER.length - 1;
};

const normalizeMode = mode => {
    if (mode === '2.0x') return '2x';
    return MODES.indexOf(mode) === -1 ? 'auto' : mode;
};

const floorTexturesFor = (mode, scale) => {
    if (mode === 'fast' || mode === 'fastest') return false;
    if (mode === 'crisp' || mode === 'sharpest' || mode === '2x' || mode === '2.0x') return true;
    return (Number(scale) || 0) > 0.5;
};

const spriteStepFor = (mode, scale) => {
    if (mode === 'fast' || mode === 'fastest') return FAST_SPRITE_STEP;
    if (mode === 'crisp' || mode === 'sharpest' || mode === '2x' || mode === '2.0x') return DEFAULT_SPRITE_STEP;
    return (Number(scale) || 0) <= 0.5 ? FAST_SPRITE_STEP : DEFAULT_SPRITE_STEP;
};

const rayCapFor = (mode, scale) => {
    if (mode === 'fast' || mode === 'fastest') return FAST_RAY_CAP;
    if (mode === 'crisp' || mode === 'sharpest' || mode === '2x' || mode === '2.0x') return DEFAULT_RAY_CAP;
    return (Number(scale) || 0) <= 0.5 ? FAST_RAY_CAP : DEFAULT_RAY_CAP;
};

const textureFilterFor = (mode, scale, enabled = false) => {
    if (!enabled) return false;
    const s = Number(scale) || 0;
    if (mode === 'crisp' || mode === '2x' || mode === '2.0x') return true;
    if (mode === 'manual') return Math.abs(s - 1) < 1e-6 || Math.abs(s - 2) < 1e-6;
    if (mode === 'auto') return s >= 2 - 1e-6;
    return false;
};

const startScale = ({dpr, width, height}) => {
    const wanted = (Number(dpr) || 1) >= CRISP_DPR ? 1 : 0.75;
    const area = Math.max(1, (Number(width) || 480) * (Number(height) || 360));
    const cap = Math.sqrt(PIXEL_BUDGET / area);
    return LADDER[rungFor(Math.min(wanted, cap))];
};

const median = (values, count, scratch) => {
    for (let i = 0; i < count; i++) scratch[i] = values[i];
    const view = scratch.subarray(0, count);
    view.sort();
    return view[Math.floor(count / 2)];
};

const percentile95 = (values, count, scratch) => {
    if (count <= 0) return Infinity;
    for (let i = 0; i < count; i++) scratch[i] = values[i];
    const view = scratch.subarray(0, count);
    view.sort();
    return view[Math.min(count - 1, Math.floor(count * 0.95))];
};

const createScalePolicy = (options = {}) => {
    const ticks = new Float64Array(WINDOW);
    const renders = new Float64Array(WINDOW);
    const scratch = new Float64Array(WINDOW);
    const pacedCosts = new Float64Array(WINDOW * 4);
    const pacedScratch = new Float64Array(WINDOW * 4);
    const state = {
        mode: 'auto',
        rung: 2,
        ceiling: 2,
        scale: 0.75,
        textureFilter: false,
        count: 0,
        steps: 0,
        frames: 0,
        late: 0,
        pacedCount: 0,
        downs: 0,
        hold: 0,
        clean2x: 0
    };

    const policy = {
        get scale () {
            return state.scale;
        },
        get mode () {
            return state.mode;
        },
        get steps () {
            return state.steps;
        },
        get cleanWindows () {
            return state.clean2x;
        },
        get floorTextures () {
            return floorTexturesFor(state.mode, state.scale);
        },
        get spriteStep () {
            return spriteStepFor(state.mode, state.scale);
        },
        get rayCap () {
            return rayCapFor(state.mode, state.scale);
        },
        get textureFilter () {
            return textureFilterFor(state.mode, state.scale, state.textureFilter);
        },
        get bilinear () {
            return textureFilterFor(state.mode, state.scale, state.textureFilter);
        },
        setTextureFilter (enabled) {
            state.textureFilter = Boolean(enabled);
            return policy.textureFilter;
        },
        configure ({mode, dpr, width, height, textureFilter, bilinear} = {}) {
            state.mode = normalizeMode(mode);
            if (typeof textureFilter === 'boolean') {
                state.textureFilter = textureFilter;
            } else if (typeof bilinear === 'boolean') {
                state.textureFilter = bilinear;
            }
            state.count = 0;
            state.frames = 0;
            state.late = 0;
            state.pacedCount = 0;
            state.downs = 0;
            state.hold = 0;
            state.clean2x = 0;
            if (state.mode === 'auto') {
                state.ceiling = rungFor(startScale({dpr, width, height}));
                state.rung = state.ceiling;
                state.scale = LADDER[state.rung];
            } else {
                state.scale = RUNGS[state.mode];
                state.rung = rungFor(state.scale);
                state.ceiling = state.rung;
            }
            return state.scale;
        },
        paced (late, frameCostMs) {
            if (state.mode !== 'auto') return;
            state.frames++;
            if (late) state.late++;
            if (typeof frameCostMs === 'number' && Number.isFinite(frameCostMs) && frameCostMs >= 0 &&
                state.pacedCount < pacedCosts.length) {
                pacedCosts[state.pacedCount++] = frameCostMs;
            }
        },
        recordDisplayFrame (late, frameCostMs) {
            policy.paced(late, frameCostMs);
        },
        sample (tickMs, renderMs, frameMs) {
            if (state.mode !== 'auto') return null;
            ticks[state.count] = Math.max(0, Number(tickMs) || 0);
            renders[state.count] = Math.max(0, Number(renderMs) || 0);
            state.count++;
            if (state.count < WINDOW) return null;
            const count = state.count;
            const frames = state.frames;
            const late = state.late;
            const pacedCount = state.pacedCount;
            const paced = frames >= MIN_PACED_FRAMES;
            const lateShare = paced ? late / frames : 0;
            state.count = 0;
            state.frames = 0;
            state.late = 0;
            state.pacedCount = 0;
            const budget = Math.max(1, Number(frameMs) || (1000 / 30));
            const tick = median(ticks, count, scratch);
            const render = median(renders, count, scratch);
            const tickP95 = percentile95(ticks, count, scratch);
            const displayP95 = pacedCount > 0 ?
                Math.max(tickP95, percentile95(pacedCosts, pacedCount, pacedScratch)) :
                tickP95;
            const over = tick > OVER_BUDGET * budget || lateShare > LATE_SHARE_DOWN;
            if (over && state.rung < LADDER.length - 1) {
                state.clean2x = 0;
                state.rung++;
                state.scale = LADDER[state.rung];
                state.steps++;
                state.downs++;
                state.hold = Math.min(MAX_HOLD, 2 ** state.downs);
                return state.scale;
            }
            if (state.hold > 0) {
                state.clean2x = 0;
                state.hold--;
                return null;
            }
            if (state.rung > state.ceiling) {
                state.clean2x = 0;
                const up = LADDER[state.rung - 1] / LADDER[state.rung];
                const projected = tick + (render * ((up * up) - 1));
                if (projected < HEADROOM * budget && lateShare < LATE_SHARE_UP) {
                    state.rung--;
                    state.scale = LADDER[state.rung];
                    state.steps++;
                    return state.scale;
                }
                return null;
            }
            if (state.rung > 0 && paced && late === 0 && displayP95 < ULTRA_P95_MS) {
                const up2x = LADDER[0] / state.scale;
                const projected2x = tick + (render * ((up2x * up2x) - 1));
                if (projected2x < HEADROOM * budget) {
                    state.clean2x++;
                    if (state.clean2x >= ULTRA_CLEAN_WINDOWS) {
                        state.clean2x = 0;
                        state.rung = 0;
                        state.scale = LADDER[0];
                        state.steps++;
                        return state.scale;
                    }
                    return null;
                }
            }
            state.clean2x = 0;
            return null;
        }
    };
    policy.configure(options);
    return policy;
};

export {
    DEFAULT_RAY_CAP,
    DEFAULT_SPRITE_STEP,
    FAST_RAY_CAP,
    FAST_SPRITE_STEP,
    HEADROOM,
    LATE_SHARE_DOWN,
    LATE_SHARE_UP,
    MAX_HOLD,
    MIN_PACED_FRAMES,
    LADDER,
    MODES,
    OVER_BUDGET,
    PIXEL_BUDGET,
    RUNGS,
    RUNG_MESSAGES,
    ULTRA_CLEAN_WINDOWS,
    ULTRA_P95_MS,
    WINDOW,
    createScalePolicy,
    floorTexturesFor,
    rayCapFor,
    spriteStepFor,
    startScale,
    textureFilterFor
};
