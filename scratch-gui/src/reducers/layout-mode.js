import {LAYOUT_MODES, PHONE_TABS, detectLayoutMode} from '../lib/layout-mode';

const SET_LAYOUT_MODE = 'scratch-gui/layout-mode/SET_LAYOUT_MODE';
const SET_PHONE_TAB = 'scratch-gui/layout-mode/SET_PHONE_TAB';
const SET_PHONE_MENU_OPEN = 'scratch-gui/layout-mode/SET_PHONE_MENU_OPEN';
const SET_VIEWPORT = 'scratch-gui/layout-mode/SET_VIEWPORT';
const SET_MINI_STAGE = 'scratch-gui/layout-mode/SET_MINI_STAGE';
const SET_TOUCH_CONTROLS = 'scratch-gui/layout-mode/SET_TOUCH_CONTROLS';
const SET_PROJECT_USES_KEYS = 'scratch-gui/layout-mode/SET_PROJECT_USES_KEYS';

const hasCoarsePointer = () => (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
);

const initialState = {
    mode: typeof window === 'undefined' ? LAYOUT_MODES.desktop : detectLayoutMode(window),
    phoneTab: PHONE_TABS.code,
    phoneMenuOpen: false,
    viewportWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
    viewportHeight: typeof window === 'undefined' ? 0 : window.innerHeight,
    miniStage: false,
    touchControls: null,
    projectUsesKeys: false,
    coarsePointer: hasCoarsePointer()
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_LAYOUT_MODE:
        if (!LAYOUT_MODES[action.mode] || action.mode === state.mode) return state;
        return Object.assign({}, state, {
            mode: action.mode,
            phoneMenuOpen: false
        });
    case SET_PHONE_TAB:
        if (!PHONE_TABS[action.tab]) return state;
        return Object.assign({}, state, {
            phoneTab: action.tab,
            phoneMenuOpen: false
        });
    case SET_PHONE_MENU_OPEN:
        return Object.assign({}, state, {
            phoneMenuOpen: !!action.open
        });
    case SET_VIEWPORT:
        if (action.width === state.viewportWidth && action.height === state.viewportHeight) return state;
        return Object.assign({}, state, {
            viewportWidth: action.width,
            viewportHeight: action.height
        });
    case SET_MINI_STAGE:
        return Object.assign({}, state, {
            miniStage: !!action.open
        });
    case SET_TOUCH_CONTROLS:
        return Object.assign({}, state, {
            touchControls: typeof action.show === 'boolean' ? action.show : null
        });
    case SET_PROJECT_USES_KEYS:
        if (!!action.uses === state.projectUsesKeys) return state;
        return Object.assign({}, state, {
            projectUsesKeys: !!action.uses
        });
    default:
        return state;
    }
};

const setLayoutMode = mode => ({
    type: SET_LAYOUT_MODE,
    mode
});

const setPhoneTab = tab => ({
    type: SET_PHONE_TAB,
    tab
});

const setPhoneMenuOpen = open => ({
    type: SET_PHONE_MENU_OPEN,
    open
});

const setViewport = (width, height) => ({
    type: SET_VIEWPORT,
    width,
    height
});

const setMiniStage = open => ({
    type: SET_MINI_STAGE,
    open
});

const setTouchControls = show => ({
    type: SET_TOUCH_CONTROLS,
    show
});

const setProjectUsesKeys = uses => ({
    type: SET_PROJECT_USES_KEYS,
    uses
});

const touchControlsVisible = state => {
    if (state.touchControls !== null) return state.touchControls;
    return state.coarsePointer && state.projectUsesKeys;
};

export {
    reducer as default,
    initialState as layoutModeInitialState,
    setLayoutMode,
    setMiniStage,
    setPhoneMenuOpen,
    setPhoneTab,
    setProjectUsesKeys,
    setTouchControls,
    setViewport,
    touchControlsVisible
};
