process.removeAllListeners('warning');

const {PALETTE_EVENT, isPaletteKey, listenForPaletteEvent, paletteEventAction} = await import('./keys.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

console.log('isPaletteKey');
ok('ctrl k', isPaletteKey({ctrlKey: true, key: 'k'}));
ok('cmd K', isPaletteKey({metaKey: true, key: 'K'}));
ok('plain k is not', !isPaletteKey({key: 'k'}));
ok('ctrl shift k is not', !isPaletteKey({ctrlKey: true, shiftKey: true, key: 'K'}));
ok('ctrl alt k is not', !isPaletteKey({ctrlKey: true, altKey: true, key: 'k'}));

console.log('paletteEventAction');
const phone = open => ({detail: {open, source: 'phone'}});
ok('the phone event name matches the editor shell', PALETTE_EVENT === 'sq-command-palette');
ok('phone open opens a closed palette', paletteEventAction(phone(true), false) === 'open');
ok('phone close closes an open palette', paletteEventAction(phone(false), true) === 'close');
ok('phone open on an open palette does nothing', paletteEventAction(phone(true), true) === null);
ok('phone close on a closed palette does nothing', paletteEventAction(phone(false), false) === null);
ok('no detail opens', paletteEventAction({}, false) === 'open' && paletteEventAction(null, false) === 'open');

console.log('listenForPaletteEvent');
const target = new EventTarget();
let open = false;
const actions = [];
const stop = listenForPaletteEvent(target, () => open, action => {
    actions.push(action);
    open = action === 'open';
});
const fire = detail => !target.dispatchEvent(new CustomEvent(PALETTE_EVENT, {cancelable: true, detail}));
ok('a cancelable phone event is claimed and opens the palette', fire({open: true, source: 'phone'}) && open === true);
ok('a repeat open is claimed and ignored', fire({open: true, source: 'phone'}) && actions.join() === 'open');
ok('then closes it', fire({open: false, source: 'phone'}) && open === false && actions.join() === 'open,close');
stop();
ok('stops listening on unmount', !fire({open: true, source: 'phone'}) && open === false);
ok('no window is harmless', typeof listenForPaletteEvent(null, () => false, () => {}) === 'function');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
