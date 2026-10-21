const SET_ITEMS = 'scratch-gui/checker/SET_ITEMS';
const SET_OPEN = 'scratch-gui/checker/SET_OPEN';
const TOGGLE_OPEN = 'scratch-gui/checker/TOGGLE_OPEN';

const initialState = {
    items: [],
    open: false,
    checked: false
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_ITEMS:
        return Object.assign({}, state, {items: action.items, checked: true});
    case SET_OPEN:
        return Object.assign({}, state, {open: action.open});
    case TOGGLE_OPEN:
        return Object.assign({}, state, {open: !state.open});
    default:
        return state;
    }
};

const setCheckerItems = items => ({type: SET_ITEMS, items: Array.isArray(items) ? items : []});
const openCheckerPanel = () => ({type: SET_OPEN, open: true});
const closeCheckerPanel = () => ({type: SET_OPEN, open: false});
const toggleCheckerPanel = () => ({type: TOGGLE_OPEN});

const countBySeverity = items => items.reduce((counts, entry) => {
    counts[entry.severity] = (counts[entry.severity] || 0) + 1;
    return counts;
}, {error: 0, warn: 0, info: 0});

const topSeverity = items => {
    const counts = countBySeverity(items);
    if (counts.error) return 'error';
    if (counts.warn) return 'warn';
    if (counts.info) return 'info';
    return null;
};

export {
    reducer as default,
    initialState as checkerInitialState,
    setCheckerItems,
    openCheckerPanel,
    closeCheckerPanel,
    toggleCheckerPanel,
    countBySeverity,
    topSeverity
};
