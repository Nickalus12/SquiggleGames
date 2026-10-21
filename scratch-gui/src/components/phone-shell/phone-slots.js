const listeners = new Set();
const sheetHosts = new Set();

let state = {
    sheet: null,
    topBar: []
};

const emit = () => {
    listeners.forEach(listener => listener(state));
};

const getState = () => state;

const isSheetHostMounted = () => sheetHosts.size > 0;

const registerSheetHost = () => {
    const token = {};
    sheetHosts.add(token);
    return () => {
        sheetHosts.delete(token);
    };
};

const subscribe = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const openSheet = ({id, title, render, size = 'half'}) => {
    state = Object.assign({}, state, {sheet: {id, title, render, size}});
    emit();
};

const closeSheet = id => {
    if (!state.sheet) return;
    if (id && state.sheet.id !== id) return;
    state = Object.assign({}, state, {sheet: null});
    emit();
};

const removeTopBarItem = id => {
    const next = state.topBar.filter(item => item.id !== id);
    if (next.length === state.topBar.length) return;
    state = Object.assign({}, state, {topBar: next});
    emit();
};

const addTopBarItem = ({id, order = 0, render}) => {
    const next = state.topBar
        .filter(item => item.id !== id)
        .concat({id, order, render})
        .sort((a, b) => a.order - b.order);
    state = Object.assign({}, state, {topBar: next});
    emit();
    return () => removeTopBarItem(id);
};

export {
    addTopBarItem,
    closeSheet,
    getState,
    isSheetHostMounted,
    openSheet,
    registerSheetHost,
    removeTopBarItem,
    subscribe
};
