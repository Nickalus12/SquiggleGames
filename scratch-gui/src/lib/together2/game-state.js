const KEYFRAME_EVERY = 40;
const TICK_SECONDS = 0.05;

const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

const createGameState = (tickSeconds = TICK_SECONDS) => ({
    tickSeconds,
    t: -1,
    kf: -1,
    values: {},
    players: {},
    avatars: {},
    round: 0,
    running: false,
    names: {},
    teams: {},
    timers: {},
    boards: [],
    places: {},
    lastHit: 0,
    refused: 0
});

const mergeInto = (into, delta) => {
    if (!isObject(delta)) return;
    Object.keys(delta).forEach(key => {
        if (delta[key] === null) delete into[key];
        else into[key] = delta[key];
    });
};

const forgetSlot = (state, slot) => {
    delete state.names[slot];
    delete state.players[slot];
    delete state.teams[slot];
    delete state.avatars[slot];
    if (String(state.lastHit) === slot) state.lastHit = 0;
};

const applyRound = (state, round) => {
    const [n, running] = Array.isArray(round) ? round : [round, true];
    if (!Number.isFinite(n)) return;
    state.round = n;
    state.running = running === true || running === 1;
};

const applyNames = (state, names) => {
    Object.keys(names).forEach(slot => {
        if (names[slot] === null) forgetSlot(state, slot);
        else state.names[slot] = String(names[slot]);
    });
};

const applyY = (state, y, keyframe) => {
    if (keyframe) {
        state.round = 0;
        state.running = false;
        state.names = {};
        state.teams = {};
        state.timers = {};
        state.boards = [];
        state.places = {};
    }
    if (!isObject(y)) return;
    if (typeof y.round !== 'undefined') applyRound(state, y.round);
    if (isObject(y.names)) applyNames(state, y.names);
    if (isObject(y.teams)) mergeInto(state.teams, y.teams);
    if (isObject(y.timers)) mergeInto(state.timers, y.timers);
    if (Array.isArray(y.boards)) state.boards = y.boards.filter(isObject);
    if (isObject(y.places)) mergeInto(state.places, y.places);
};

const applyHits = (state, events) => {
    events.forEach(event => {
        if (Number.isInteger(event.hit)) state.lastHit = event.hit;
    });
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
    applyHits(state, events);
    return {applied: true, keyframe, events};
};

const playerValue = (state, slot, name) => {
    const values = state.players[String(slot)];
    if (!values || !Object.prototype.hasOwnProperty.call(values, name)) return '';
    return values[name];
};

const gameValue = (state, name) => (Object.prototype.hasOwnProperty.call(state.values, name) ? state.values[name] : '');

const timeLeft = (state, name) => {
    const end = Number(state.timers[name]);
    if (!Number.isFinite(end) || state.t < 0) return 0;
    return Math.max(0, Math.round((end - state.t) * state.tickSeconds * 100) / 100);
};

const teamName = (state, slot, teams) => {
    const index = state.teams[String(slot)];
    if (typeof index === 'string') return index;
    if (!Number.isInteger(index) || index < 1 || !Array.isArray(teams)) return '';
    return typeof teams[index - 1] === 'string' ? teams[index - 1] : '';
};

const playerName = (state, slot) => state.names[String(slot)] || '';

export {
    KEYFRAME_EVERY,
    TICK_SECONDS,
    createGameState,
    applyTick,
    playerValue,
    gameValue,
    timeLeft,
    teamName,
    playerName
};
