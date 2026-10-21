import layoutModeReducer, {
    layoutModeInitialState,
    setLayoutMode,
    setMiniStage,
    setPhoneMenuOpen,
    setPhoneTab,
    setProjectUsesKeys,
    setTouchControls,
    setViewport,
    touchControlsVisible
} from '../../../src/reducers/layout-mode';

const baseState = () => Object.assign({}, layoutModeInitialState, {
    mode: 'desktop',
    phoneTab: 'code',
    phoneMenuOpen: false,
    touchControls: null,
    projectUsesKeys: false,
    coarsePointer: false
});

test('initial state is defined', () => {
    let state;
    expect(layoutModeReducer(state, {type: 'anything'})).toBeDefined();
});

test('setLayoutMode changes mode and closes the phone menu', () => {
    const state = Object.assign(baseState(), {phoneMenuOpen: true});
    const next = layoutModeReducer(state, setLayoutMode('phone'));
    expect(next.mode).toBe('phone');
    expect(next.phoneMenuOpen).toBe(false);
});

test('setLayoutMode ignores unknown and unchanged modes', () => {
    const state = baseState();
    expect(layoutModeReducer(state, setLayoutMode('watch'))).toBe(state);
    expect(layoutModeReducer(state, setLayoutMode('desktop'))).toBe(state);
});

test('setPhoneTab switches tab and closes the menu', () => {
    const state = Object.assign(baseState(), {phoneMenuOpen: true});
    const next = layoutModeReducer(state, setPhoneTab('stage'));
    expect(next.phoneTab).toBe('stage');
    expect(next.phoneMenuOpen).toBe(false);
});

test('setPhoneTab ignores unknown tabs', () => {
    const state = baseState();
    expect(layoutModeReducer(state, setPhoneTab('chat'))).toBe(state);
});

test('setPhoneMenuOpen coerces to boolean', () => {
    const next = layoutModeReducer(baseState(), setPhoneMenuOpen(1));
    expect(next.phoneMenuOpen).toBe(true);
});

test('setViewport stores size and keeps identity when unchanged', () => {
    const next = layoutModeReducer(baseState(), setViewport(390, 844));
    expect(next.viewportWidth).toBe(390);
    expect(next.viewportHeight).toBe(844);
    expect(layoutModeReducer(next, setViewport(390, 844))).toBe(next);
});

test('setMiniStage toggles the mini stage', () => {
    const next = layoutModeReducer(baseState(), setMiniStage(true));
    expect(next.miniStage).toBe(true);
    expect(layoutModeReducer(next, setMiniStage(false)).miniStage).toBe(false);
});

test('setTouchControls keeps booleans and resets anything else to auto', () => {
    const shown = layoutModeReducer(baseState(), setTouchControls(true));
    expect(shown.touchControls).toBe(true);
    expect(layoutModeReducer(shown, setTouchControls(null)).touchControls).toBeNull();
    expect(layoutModeReducer(shown, setTouchControls('yes')).touchControls).toBeNull();
});

test('setProjectUsesKeys keeps identity when unchanged', () => {
    const state = baseState();
    expect(layoutModeReducer(state, setProjectUsesKeys(false))).toBe(state);
    expect(layoutModeReducer(state, setProjectUsesKeys(true)).projectUsesKeys).toBe(true);
});

describe('touchControlsVisible', () => {
    test('auto shows only for touch screens on projects that listen for keys', () => {
        const state = baseState();
        expect(touchControlsVisible(state)).toBe(false);
        expect(touchControlsVisible(Object.assign(state, {projectUsesKeys: true}))).toBe(false);
        expect(touchControlsVisible(Object.assign(state, {coarsePointer: true}))).toBe(true);
    });

    test('a manual choice wins over auto', () => {
        const auto = Object.assign(baseState(), {coarsePointer: true, projectUsesKeys: true});
        expect(touchControlsVisible(Object.assign({}, auto, {touchControls: false}))).toBe(false);
        expect(touchControlsVisible(Object.assign(baseState(), {touchControls: true}))).toBe(true);
    });
});
