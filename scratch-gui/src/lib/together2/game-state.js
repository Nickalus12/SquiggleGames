const KEYFRAME_EVERY = 40;

const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

const createGameState = () => ({
    t: -1,
    kf: -1,
    values: {},
    players: {},
    avatars: {},
    round: 0,
    teams: {},
    timers: {},
    refused: 0
});

const mergeInto = (into, delta) => {
    if (!isObject(delta)) return;
    Object.keys(delta).forEach(key => {
        if (delta[key] === null) delete into[key];
        else into[key] = delta[key];
    });
};

const applyY = (state, y, keyframe) => {
    if (keyframe) {
        state.round = 0;
        state.teams = {};
        state.timers = {};
    }
    if (!isObject(y)) return;
    if (Number.isFinite(y.round)) state.round = y.round;
    if (isObject(y.teams)) mergeInto(state.teams, y.teams);
    if (isObject(y.timers)) mergeInto(state.timers, y.timers);
};

const applyTick = (state, tick) => {
    if (!tick || !Number.isFinite(tick.t)) return {applied: false, events: []};
    const keyframe = tick.kf === 1 || tick.kf === true;
    if (!keyframe && state.kf < 0) return {applied: false, needKeyframe: true, events: []};
    if (!keyframe && tick.t <= state.t) return {applied: false, stale: true, events: []};
    if (keyframe) {
        state.values = {};
        state.players = {};
        state.avatars = {};
        state.kf = tick.t;
    }
    mergeInto(state.values, tick.v);
    if (isObject(tick.p)) {
        Object.keys(tick.p).forEach(slot => {
            const delta = tick.p[slot];
            if (delta === null) {
                delete state.players[slot];
                return;
            }
            if (!state.players[slot]) state.players[slot] = {};
            mergeInto(state.players[slot], delta);
        });
    }
    if (isObject(tick.a)) {
        Object.keys(tick.a).forEach(slot => {
            const avatar = tick.a[slot];
            if (avatar === null) delete state.avatars[slot];
            else if (Array.isArray(avatar)) state.avatars[slot] = avatar.slice();
        });
    }
    applyY(state, tick.y, keyframe);
    if (Number.isFinite(tick.r)) state.refused = tick.r;
    state.t = tick.t;
    const events = Array.isArray(tick.e) ? tick.e.filter(isObject) : [];
    return {applied: true, keyframe, events};
};

const playerValue = (state, slot, name) => {
    const values = state.players[String(slot)];
    if (!values || !Object.prototype.hasOwnProperty.call(values, name)) return '';
    return values[name];
};

const gameValue = (state, name) => (Object.prototype.hasOwnProperty.call(state.values, name) ? state.values[name] : '');

export {
    KEYFRAME_EVERY,
    createGameState,
    applyTick,
    playerValue,
    gameValue
};
