const LADDER = Object.freeze([1, 0.75, 0.5]);
const MODES = Object.freeze(['auto', 'crisp', 'fast']);
const PIXEL_BUDGET = 480 * 360;
const WINDOW = 45;
const OVER_BUDGET = 0.6;
const HEADROOM = 0.35;
const CRISP_DPR = 1.5;

const rungFor = scale => {
    for (let i = 0; i < LADDER.length; i++) {
        if (LADDER[i] <= scale + 1e-9) return i;
    }
    return LADDER.length - 1;
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

const createScalePolicy = (options = {}) => {
    const ticks = new Float64Array(WINDOW);
    const renders = new Float64Array(WINDOW);
    const scratch = new Float64Array(WINDOW);
    const state = {mode: 'auto', rung: 1, ceiling: 1, count: 0, steps: 0};

    const fixedRung = mode => (mode === 'crisp' ? 0 : LADDER.length - 1);

    const policy = {
        get scale () {
            return LADDER[state.rung];
        },
        get mode () {
            return state.mode;
        },
        get steps () {
            return state.steps;
        },
        configure ({mode, dpr, width, height}) {
            state.mode = MODES.indexOf(mode) === -1 ? 'auto' : mode;
            state.count = 0;
            if (state.mode === 'auto') {
                state.ceiling = rungFor(startScale({dpr, width, height}));
                state.rung = state.ceiling;
            } else {
                state.rung = fixedRung(state.mode);
                state.ceiling = state.rung;
            }
            return LADDER[state.rung];
        },
        sample (tickMs, renderMs, frameMs) {
            if (state.mode !== 'auto') return null;
            ticks[state.count] = Math.max(0, Number(tickMs) || 0);
            renders[state.count] = Math.max(0, Number(renderMs) || 0);
            state.count++;
            if (state.count < WINDOW) return null;
            const count = state.count;
            state.count = 0;
            const budget = Math.max(1, Number(frameMs) || (1000 / 30));
            const tick = median(ticks, count, scratch);
            const render = median(renders, count, scratch);
            if (tick > OVER_BUDGET * budget && state.rung < LADDER.length - 1) {
                state.rung++;
                state.steps++;
                return LADDER[state.rung];
            }
            if (state.rung > state.ceiling) {
                const up = LADDER[state.rung - 1] / LADDER[state.rung];
                const projected = tick + (render * ((up * up) - 1));
                if (projected < HEADROOM * budget) {
                    state.rung--;
                    state.steps++;
                    return LADDER[state.rung];
                }
            }
            return null;
        }
    };
    policy.configure(options);
    return policy;
};

export {
    HEADROOM,
    LADDER,
    MODES,
    OVER_BUDGET,
    PIXEL_BUDGET,
    WINDOW,
    createScalePolicy,
    startScale
};
