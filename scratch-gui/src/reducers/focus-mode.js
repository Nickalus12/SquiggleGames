const SET = 'scratch-gui/focus-mode/SET';
const TOGGLE = 'scratch-gui/focus-mode/TOGGLE';
const MOVE_PIP = 'scratch-gui/focus-mode/MOVE_PIP';

const initialState = {
    active: false,
    pip: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET:
        return action.active === state.active ? state : Object.assign({}, state, {active: action.active});
    case TOGGLE:
        return Object.assign({}, state, {active: !state.active});
    case MOVE_PIP:
        return Object.assign({}, state, {pip: action.pip});
    default:
        return state;
    }
};

const setFocusMode = active => ({type: SET, active: !!active});
const enterFocusMode = () => setFocusMode(true);
const exitFocusMode = () => setFocusMode(false);
const toggleFocusMode = () => ({type: TOGGLE});
const movePip = (x, y) => ({
    type: MOVE_PIP,
    pip: Number.isFinite(x) && Number.isFinite(y) ? {x: Math.round(x), y: Math.round(y)} : null
});

export {
    reducer as default,
    initialState as focusModeInitialState,
    setFocusMode,
    enterFocusMode,
    exitFocusMode,
    toggleFocusMode,
    movePip
};
