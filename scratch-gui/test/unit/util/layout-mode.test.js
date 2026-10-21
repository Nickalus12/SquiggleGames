import {
    LAYOUT_MODES,
    PHONE_QUERY,
    TABLET_QUERY,
    detectLayoutMode,
    isPhoneLandscape,
    layoutModeFor,
    phoneStageWidth,
    watchLayoutMode
} from '../../../src/lib/layout-mode';

const fakeWindow = matches => {
    const listeners = new Map();
    return {
        listeners,
        matches,
        matchMedia (query) {
            return {
                get matches () {
                    return !!matches[query];
                },
                addEventListener (type, fn) {
                    listeners.set(query, fn);
                },
                removeEventListener (type, fn) {
                    if (listeners.get(query) === fn) listeners.delete(query);
                }
            };
        }
    };
};

describe('layoutModeFor', () => {
    test('phone wins over tablet', () => {
        expect(layoutModeFor({phone: true, tablet: true})).toBe(LAYOUT_MODES.phone);
    });

    test('tablet when only tablet matches', () => {
        expect(layoutModeFor({phone: false, tablet: true})).toBe(LAYOUT_MODES.tablet);
    });

    test('desktop otherwise', () => {
        expect(layoutModeFor({phone: false, tablet: false})).toBe(LAYOUT_MODES.desktop);
    });
});

describe('detectLayoutMode', () => {
    test('desktop without matchMedia', () => {
        expect(detectLayoutMode(null)).toBe(LAYOUT_MODES.desktop);
        expect(detectLayoutMode({})).toBe(LAYOUT_MODES.desktop);
    });

    test('reads the phone and tablet queries', () => {
        expect(detectLayoutMode(fakeWindow({[PHONE_QUERY]: true}))).toBe(LAYOUT_MODES.phone);
        expect(detectLayoutMode(fakeWindow({[TABLET_QUERY]: true}))).toBe(LAYOUT_MODES.tablet);
        expect(detectLayoutMode(fakeWindow({}))).toBe(LAYOUT_MODES.desktop);
    });
});

describe('watchLayoutMode', () => {
    test('reports the new mode on change and unsubscribes', () => {
        const win = fakeWindow({});
        const onChange = jest.fn();
        const stop = watchLayoutMode(win, onChange);
        expect(win.listeners.size).toBe(2);
        win.matches[PHONE_QUERY] = true;
        win.listeners.get(PHONE_QUERY)();
        expect(onChange).toHaveBeenCalledWith(LAYOUT_MODES.phone);
        stop();
        expect(win.listeners.size).toBe(0);
    });

    test('is a no-op without matchMedia', () => {
        const stop = watchLayoutMode(null, jest.fn());
        expect(typeof stop).toBe('function');
        stop();
    });
});

describe('phoneStageWidth', () => {
    const stage = {stageWidth: 480, stageHeight: 360};

    test('zero before the viewport is known', () => {
        expect(phoneStageWidth(Object.assign({viewportWidth: 0, viewportHeight: 0, tab: 'stage'}, stage)))
            .toBe(0);
    });

    test('portrait stage tab fills the width', () => {
        expect(phoneStageWidth(Object.assign({viewportWidth: 390, viewportHeight: 844, tab: 'stage'}, stage)))
            .toBe(374);
    });

    test('portrait with controls is limited by height', () => {
        const width = phoneStageWidth(Object.assign({
            viewportWidth: 390,
            viewportHeight: 600,
            tab: 'stage',
            controls: true
        }, stage));
        expect(width).toBe(Math.floor((600 - 52 - 60 - 16 - 52 - 168) * (4 / 3)));
    });

    test('landscape with controls leaves room for the side pads', () => {
        const width = phoneStageWidth(Object.assign({
            viewportWidth: 844,
            viewportHeight: 390,
            tab: 'stage',
            controls: true
        }, stage));
        expect(width).toBeLessThanOrEqual(844 - 16 - 264);
        expect(width).toBeLessThanOrEqual(Math.floor((390 - 52 - 60 - 16) * (4 / 3)));
    });

    test('code tab gives the mini stage size', () => {
        expect(phoneStageWidth(Object.assign({viewportWidth: 390, viewportHeight: 844, tab: 'code'}, stage)))
            .toBe(176);
        expect(phoneStageWidth(Object.assign({viewportWidth: 300, viewportHeight: 640, tab: 'code'}, stage)))
            .toBe(135);
    });

    test('never smaller than 120', () => {
        expect(phoneStageWidth(Object.assign({viewportWidth: 390, viewportHeight: 200, tab: 'stage'}, stage)))
            .toBe(120);
    });
});

test('isPhoneLandscape', () => {
    expect(isPhoneLandscape({viewportWidth: 844, viewportHeight: 390})).toBe(true);
    expect(isPhoneLandscape({viewportWidth: 390, viewportHeight: 844})).toBe(false);
});
