import {FLAG_NAMES, PAINT_LAYERS, TOOLS} from '../lib/world/painter.js';
import {clampFloorHeight, clampHeight} from '../lib/world/tilemap.js';

const SET_PAINTER_OPEN = 'scratch-gui/world-ui/SET_PAINTER_OPEN';
const SET_PAINTER_TOOL = 'scratch-gui/world-ui/SET_PAINTER_TOOL';
const SET_PAINTER_TILE = 'scratch-gui/world-ui/SET_PAINTER_TILE';
const SET_PAINTER_LAYER = 'scratch-gui/world-ui/SET_PAINTER_LAYER';
const SET_PAINTER_FLAG = 'scratch-gui/world-ui/SET_PAINTER_FLAG';
const SET_PAINTER_HEIGHT = 'scratch-gui/world-ui/SET_PAINTER_HEIGHT';
const SET_PAINTER_FLOOR_HEIGHT = 'scratch-gui/world-ui/SET_PAINTER_FLOOR_HEIGHT';
const SET_PAINTER_GRID = 'scratch-gui/world-ui/SET_PAINTER_GRID';

const initialState = {
    painterOpen: false,
    tool: 'paint',
    tile: 1,
    layer: 'main',
    flag: 'solid',
    height: 1,
    floorHeight: 0,
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
    case SET_PAINTER_FLAG: {
        const normalized = action.flag === 'see-through' ? 'seethrough' : action.flag;
        if (FLAG_NAMES.indexOf(normalized) === -1 || normalized === state.flag) return state;
        return Object.assign({}, state, {flag: normalized});
    }
    case SET_PAINTER_HEIGHT: {
        const num = Number(action.height);
        if (!Number.isFinite(num)) return state;
        const height = clampHeight(num);
        const layer = state.tool === 'height' && state.layer === 'floor' ? 'main' : state.layer;
        if (height === state.height && layer === state.layer) return state;
        return Object.assign({}, state, {height, layer});
    }
    case SET_PAINTER_FLOOR_HEIGHT: {
        const num = Number(action.floorHeight);
        if (!Number.isFinite(num)) return state;
        const floorHeight = clampFloorHeight(num);
        const layer = state.tool === 'height' ? 'floor' : state.layer;
        if (floorHeight === state.floorHeight && layer === state.layer) return state;
        return Object.assign({}, state, {floorHeight, layer});
    }
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

const setPainterHeight = height => ({
    type: SET_PAINTER_HEIGHT,
    height
});

const setPainterFloorHeight = floorHeight => ({
    type: SET_PAINTER_FLOOR_HEIGHT,
    floorHeight
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
    setPainterHeight,
    setPainterFloorHeight,
    setPainterGrid
};
