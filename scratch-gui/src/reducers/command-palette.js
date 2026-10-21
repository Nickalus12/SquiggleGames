const OPEN = 'scratch-gui/command-palette/OPEN';
const CLOSE = 'scratch-gui/command-palette/CLOSE';
const TOGGLE = 'scratch-gui/command-palette/TOGGLE';

const initialState = {
    open: false,
    query: ''
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case OPEN:
        return Object.assign({}, state, {open: true, query: action.query || ''});
    case CLOSE:
        return Object.assign({}, state, {open: false, query: ''});
    case TOGGLE:
        return Object.assign({}, state, {open: !state.open, query: ''});
    default:
        return state;
    }
};

const openCommandPalette = query => ({type: OPEN, query: typeof query === 'string' ? query : ''});
const closeCommandPalette = () => ({type: CLOSE});
const toggleCommandPalette = () => ({type: TOGGLE});

export {
    reducer as default,
    initialState as commandPaletteInitialState,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette
};
