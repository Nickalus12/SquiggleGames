import {FLAG_NAMES, PAINT_LAYERS, TOOLS} from '../lib/world/painter.js';

const SET_PAINTER_OPEN = 'scratch-gui/world-ui/SET_PAINTER_OPEN';
const SET_PAINTER_TOOL = 'scratch-gui/world-ui/SET_PAINTER_TOOL';
const SET_PAINTER_TILE = 'scratch-gui/world-ui/SET_PAINTER_TILE';
const SET_PAINTER_LAYER = 'scratch-gui/world-ui/SET_PAINTER_LAYER';
const SET_PAINTER_FLAG = 'scratch-gui/world-ui/SET_PAINTER_FLAG';
const SET_PAINTER_GRID = 'scratch-gui/world-ui/SET_PAINTER_GRID';

const initialState = {
    painterOpen: false,
    tool: 'paint',
    tile: 1,
    layer: 'main',
    flag: 'solid',
    showGrid: true
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_PAINTER_OPEN:
        if (!!action.open === state.painterOpen) return state;
        return Object.assign({}, state, {painterOpen: !!action.open});
    case SET_PAINTER_TOOL:
        if (TOOLS.indexOf(action.tool) === -1 || action.tool === state.tool) return state;
        return Object.assign({}, state, {tool: action.tool});
    case SET_PAINTER_TILE: {
        const tile = Math.max(1, Math.floor(Number(action.tile) || 0));
        if (tile === state.tile) return state;
        return Object.assign({}, state, {tile});
    }
    case SET_PAINTER_LAYER:
        if (PAINT_LAYERS.indexOf(action.layer) === -1 || action.layer === state.layer) return state;
        return Object.assign({}, state, {layer: action.layer});
    case SET_PAINTER_FLAG:
        if (FLAG_NAMES.indexOf(action.flag) === -1 || action.flag === state.flag) return state;
        return Object.assign({}, state, {flag: action.flag});
    case SET_PAINTER_GRID:
        if (!!action.show === state.showGrid) return state;
        return Object.assign({}, state, {showGrid: !!action.show});
    default:
        return state;
    }
};

const setPainterOpen = open => ({
    type: SET_PAINTER_OPEN,
    open
});

const setPainterTool = tool => ({
    type: SET_PAINTER_TOOL,
    tool
});

const setPainterTile = tile => ({
    type: SET_PAINTER_TILE,
    tile
});

const setPainterLayer = layer => ({
    type: SET_PAINTER_LAYER,
    layer
});

const setPainterFlag = flag => ({
    type: SET_PAINTER_FLAG,
    flag
});

const setPainterGrid = show => ({
    type: SET_PAINTER_GRID,
    show
});

export {
    reducer as default,
    initialState as worldUiInitialState,
    setPainterOpen,
    setPainterTool,
    setPainterTile,
    setPainterLayer,
    setPainterFlag,
    setPainterGrid
};
