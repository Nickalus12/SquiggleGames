import keyMirror from 'keymirror';

const LAYOUT_MODES = keyMirror({
    phone: null,
    tablet: null,
    desktop: null
});

const PHONE_TABS = keyMirror({
    code: null,
    stage: null,
    sprites: null,
    media: null,
    room: null
});

const PHONE_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023px)';

const PHONE_FLYOUT_WIDTH = 180;
const PHONE_CATEGORY_WIDTH = 60;
const PHONE_TOOLBOX_WIDTH = PHONE_CATEGORY_WIDTH + PHONE_FLYOUT_WIDTH;

const TARGET_SIZE = 36;
const TOUCH_TARGET_SIZE = 44;
const PANEL_RADIUS = 10;
const MOTION_FAST_MS = 140;
const MOTION_SHEET_MS = 240;
const PHONE_SHEET_MAX_RATIO = 0.55;

const targetSizeFor = ({mode, coarsePointer}) => (
    (mode === LAYOUT_MODES.phone || coarsePointer) ? TOUCH_TARGET_SIZE : TARGET_SIZE
);

const prefersReducedMotion = win => !!(
    win && typeof win.matchMedia === 'function' &&
    win.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const motionMs = (win, ms) => (prefersReducedMotion(win) ? Math.min(ms, 80) : ms);

const layoutModeFor = ({phone, tablet}) => {
    if (phone) return LAYOUT_MODES.phone;
    if (tablet) return LAYOUT_MODES.tablet;
    return LAYOUT_MODES.desktop;
};

const canMatchMedia = win => !!(win && typeof win.matchMedia === 'function');

const detectLayoutMode = win => {
    if (!canMatchMedia(win)) return LAYOUT_MODES.desktop;
    return layoutModeFor({
        phone: win.matchMedia(PHONE_QUERY).matches,
        tablet: win.matchMedia(TABLET_QUERY).matches
    });
};

const watchLayoutMode = (win, onChange) => {
    if (!canMatchMedia(win)) return () => {};
    const queries = [win.matchMedia(PHONE_QUERY), win.matchMedia(TABLET_QUERY)];
    const handleChange = () => onChange(detectLayoutMode(win));
    for (const query of queries) {
        if (query.addEventListener) query.addEventListener('change', handleChange);
        else query.addListener(handleChange);
    }
    return () => {
        for (const query of queries) {
            if (query.removeEventListener) query.removeEventListener('change', handleChange);
            else query.removeListener(handleChange);
        }
    };
};

const PHONE_TOP_BAR_HEIGHT = 52;
const PHONE_TAB_BAR_HEIGHT = 60;
const PHONE_STAGE_GUTTER = 8;
const PHONE_SPRITE_ROW_HEIGHT = 52;
const PHONE_MINI_STAGE_MAX_WIDTH = 176;
const PHONE_SIDE_CONTROLS_WIDTH = 132;
const PHONE_BOTTOM_CONTROLS_HEIGHT = 168;

const isPhoneLandscape = ({viewportWidth, viewportHeight}) => viewportWidth > viewportHeight;

const phoneStageWidth = ({viewportWidth, viewportHeight, stageWidth, stageHeight, tab, controls}) => {
    if (!viewportWidth || !viewportHeight) return 0;
    if (tab === PHONE_TABS.code) {
        return Math.round(Math.min(PHONE_MINI_STAGE_MAX_WIDTH, viewportWidth * 0.45));
    }
    const aspect = stageWidth / stageHeight;
    const landscape = isPhoneLandscape({viewportWidth, viewportHeight});
    let maxWidth = viewportWidth - (2 * PHONE_STAGE_GUTTER);
    let maxHeight = viewportHeight - PHONE_TOP_BAR_HEIGHT - PHONE_TAB_BAR_HEIGHT - (2 * PHONE_STAGE_GUTTER);
    if (landscape) {
        if (controls) maxWidth -= 2 * PHONE_SIDE_CONTROLS_WIDTH;
    } else {
        maxHeight -= PHONE_SPRITE_ROW_HEIGHT;
        if (controls) maxHeight -= PHONE_BOTTOM_CONTROLS_HEIGHT;
    }
    return Math.max(120, Math.floor(Math.min(maxWidth, maxHeight * aspect)));
};

export {
    LAYOUT_MODES,
    MOTION_FAST_MS,
    MOTION_SHEET_MS,
    PANEL_RADIUS,
    PHONE_SHEET_MAX_RATIO,
    PHONE_TABS,
    PHONE_QUERY,
    TABLET_QUERY,
    PHONE_FLYOUT_WIDTH,
    PHONE_TOOLBOX_WIDTH,
    TARGET_SIZE,
    TOUCH_TARGET_SIZE,
    detectLayoutMode,
    isPhoneLandscape,
    layoutModeFor,
    motionMs,
    phoneStageWidth,
    prefersReducedMotion,
    targetSizeFor,
    watchLayoutMode
};
