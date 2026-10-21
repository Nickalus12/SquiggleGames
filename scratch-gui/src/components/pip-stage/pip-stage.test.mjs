process.removeAllListeners('warning');

const {MARGIN, clampPip, defaultPip, resolvePip, nudge, isFocusKey} = await import('./geometry.js');
const {
    default: reducer, focusModeInitialState, setFocusMode, enterFocusMode, exitFocusMode, toggleFocusMode, movePip
} = await import('../../reducers/focus-mode.js');
const {FOCUS_BUTTON, returnFocus} = await import('./focus-return.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    const extra = !cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : '';
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const size = {width: 256, height: 228};
const view = {width: 1280, height: 800};

console.log('geometry');
ok('default sits bottom right', same(defaultPip(size, view), {x: 1280 - 256 - MARGIN, y: 800 - 228 - MARGIN}));
ok('clamps left and top', same(clampPip({x: -50, y: -9}, size, view), {x: MARGIN, y: MARGIN}));
ok('clamps right and bottom', same(clampPip({x: 5000, y: 5000}, size, view), defaultPip(size, view)));
ok('rounds', same(clampPip({x: 100.4, y: 200.6}, size, view), {x: 100, y: 201}));
ok('tiny viewport pins to margin', same(clampPip({x: 300, y: 300}, size, {width: 200, height: 100}), {x: MARGIN, y: MARGIN}));
ok('resolve uses saved', same(resolvePip({x: 40, y: 50}, size, view), {x: 40, y: 50}));
ok('resolve reclamps saved after resize', same(resolvePip({x: 1200, y: 700}, size, {width: 800, height: 600}),
    {x: 800 - 256 - MARGIN, y: 600 - 228 - MARGIN}));
ok('resolve without saved is default', same(resolvePip(null, size, view), defaultPip(size, view)));
ok('nudge left', same(nudge({x: 100, y: 100}, 'ArrowLeft', false), {x: 84, y: 100}));
ok('nudge down big', same(nudge({x: 100, y: 100}, 'ArrowDown', true), {x: 100, y: 164}));
ok('nudge other key', nudge({x: 0, y: 0}, 'Enter', false) === null);

console.log('isFocusKey');
ok('ctrl shift F', isFocusKey({ctrlKey: true, shiftKey: true, key: 'F'}));
ok('cmd shift f', isFocusKey({metaKey: true, shiftKey: true, key: 'f'}));
ok('ctrl f is not', !isFocusKey({ctrlKey: true, key: 'f'}));
ok('shift f is not', !isFocusKey({shiftKey: true, key: 'F'}));
ok('ctrl alt shift f is not', !isFocusKey({ctrlKey: true, altKey: true, shiftKey: true, key: 'F'}));

console.log('focus-mode reducer');
const initial = reducer(undefined, {type: 'init'});
ok('initial state', same(initial, focusModeInitialState) && initial.active === false && initial.pip === null);
ok('enter', reducer(initial, enterFocusMode()).active === true);
ok('exit', reducer({active: true, pip: null}, exitFocusMode()).active === false);
ok('set same returns same object', reducer(initial, setFocusMode(false)) === initial);
ok('toggle twice', reducer(reducer(initial, toggleFocusMode()), toggleFocusMode()).active === false);
ok('move rounds', same(reducer(initial, movePip(10.6, 20.2)).pip, {x: 11, y: 20}));
ok('move with NaN clears', reducer({active: true, pip: {x: 1, y: 1}}, movePip(NaN, 3)).pip === null);
ok('toggle keeps pip', same(reducer({active: true, pip: {x: 5, y: 6}}, toggleFocusMode()).pip, {x: 5, y: 6}));
ok('unknown action unchanged', reducer(initial, {type: 'other'}) === initial);

console.log('focus return');
const fakeDoc = (button, attached) => {
    const doc = {body: {}, focused: [], querySelector: query => (query === FOCUS_BUTTON ? button : null)};
    doc.activeElement = doc.body;
    doc.contains = element => attached.indexOf(element) !== -1;
    return doc;
};
const element = (doc, name) => ({focus: () => doc.focused.push(name)});
const frames = [];
const raf = fn => frames.push(fn);
const docA = fakeDoc(null, []);
const kept = element(docA, 'kept');
docA.contains = node => node === kept;
returnFocus(docA, kept, null, raf);
ok('a saved element still on the page gets focus back at once', same(docA.focused, ['kept']) && frames.length === 0);
const docB = fakeDoc(null, []);
const header = element(docB, 'header');
docB.querySelector = query => (query === FOCUS_BUTTON ? header : null);
returnFocus(docB, element(docB, 'gone'), null, raf);
ok('a detached saved element waits a frame', docB.focused.length === 0 && frames.length === 1);
frames.shift()();
ok('then the stage header focus button gets focus', same(docB.focused, ['header']));
const docC = fakeDoc(null, []);
returnFocus(docC, null, null, raf);
frames.shift()();
ok('no header button is a no-op', docC.focused.length === 0);
const docD = fakeDoc(null, []);
docD.activeElement = {};
returnFocus(docD, element(docD, 'saved'), null, raf);
ok('focus the child already moved is left alone', docD.focused.length === 0 && frames.length === 0);
const docE = fakeDoc(null, []);
returnFocus(docE, null, null, null);
ok('without requestAnimationFrame it is a no-op', docE.focused.length === 0 && frames.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
