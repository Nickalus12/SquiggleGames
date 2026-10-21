const OPEN = 'scratch-gui/room-panel/OPEN';
const CLOSE = 'scratch-gui/room-panel/CLOSE';
const TOGGLE = 'scratch-gui/room-panel/TOGGLE';

const initialState = {
    open: false
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case OPEN:
        return state.open ? state : Object.assign({}, state, {open: true});
    case CLOSE:
        return state.open ? Object.assign({}, state, {open: false}) : state;
    case TOGGLE:
        return Object.assign({}, state, {open: !state.open});
    default:
        return state;
    }
};

const openRoomPanel = () => ({type: OPEN});
const closeRoomPanel = () => ({type: CLOSE});
const toggleRoomPanel = () => ({type: TOGGLE});

export {
    reducer as default,
    initialState as roomPanelInitialState,
    openRoomPanel,
    closeRoomPanel,
    toggleRoomPanel
};
