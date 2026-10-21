process.removeAllListeners('warning');

const {
    MAX_ACTIONS,
    TOUCH_KEYS,
    keyboardData,
    listenedTouchKeys,
    projectWantsTouchKeys,
    touchKeyByName,
    touchLayoutFor
} = await import('./touch-keys.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${typeof detail === 'undefined' ? '' : ` : ${JSON.stringify(detail)}`}`);
    }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const hat = (id, key) => ({[id]: {opcode: 'event_whenkeypressed', fields: {KEY_OPTION: {value: key}}, inputs: {}}});
const sensing = (id, key) => ({
    [id]: {opcode: 'sensing_keypressed', fields: {}, inputs: {KEY_OPTION: {block: `${id}m`}}},
    [`${id}m`]: {opcode: 'sensing_keyoptions', fields: {KEY_OPTION: {value: key}}, inputs: {}}
});
const target = (...parts) => ({isOriginal: true, blocks: {_blocks: Object.assign({}, ...parts)}});
const cell = (layout, direction) => {
    const found = layout.pad.find(c => c.direction === direction);
    return found ? found.names : null;
};

const names = TOUCH_KEYS.map(k => k.name);
ok('one table, names unique', new Set(names).size === names.length);
ok('the table holds arrows, wasd, space, shift, enter, letters and digits',
    ['ArrowUp', 'w', 'a', 's', 'd', 'space', 'shift', 'enter', 'e', 'z', '0', '9'].every(n => names.includes(n)));
ok('letters post their key and upper-case key code', same(keyboardData('w', true), {key: 'w', keyCode: 87, isDown: true}));
ok('digits post their key code', same(keyboardData('7', false), {key: '7', keyCode: 55, isDown: false}));
ok('shift and enter post DOM key names', keyboardData('shift', true).key === 'Shift' && keyboardData('enter', true).key === 'Enter');
ok('unknown names post nothing', keyboardData('nope', true) === null);
ok('wasd sit on the pad', ['w', 'a', 's', 'd'].map(n => touchKeyByName(n).pad).join() === 'up,left,down,right');

const doom = listenedTouchKeys([target(
    hat('a', 'up arrow'), hat('b', 'down arrow'), hat('c', 'left arrow'), hat('d', 'right arrow'),
    hat('e', 'w'), sensing('f', 'space'), sensing('g', 'e')
)]);
ok('the scan finds arrows, w, space and e', same(Array.from(doom).sort(),
    ['down arrow', 'e', 'left arrow', 'right arrow', 'space', 'up arrow', 'w']));
ok('the scan ignores keys the table does not hold', listenedTouchKeys([target(hat('a', 'escape'))]).size === 0);
ok('clones are skipped', listenedTouchKeys([{isOriginal: false, blocks: {_blocks: hat('a', 'w')}}]).size === 0);
ok('a reporter in the key input counts as arrows plus space',
    same(Array.from(listenedTouchKeys([target({x: {opcode: 'sensing_keypressed', fields: {},
        inputs: {KEY_OPTION: {block: 'r'}}}, r: {opcode: 'operator_join', fields: {}, inputs: {}}})])).sort(),
    ['down arrow', 'left arrow', 'right arrow', 'space', 'up arrow']));
ok('projectWantsTouchKeys', projectWantsTouchKeys([target(hat('a', 'q'))]) && !projectWantsTouchKeys([target()]));

const both = touchLayoutFor(doom);
ok('arrows plus w: the up cell posts both', same(cell(both, 'up'), ['ArrowUp', 'w']));
ok('arrows only on the other cells', same(cell(both, 'left'), ['ArrowLeft']) && same(cell(both, 'down'), ['ArrowDown']));
ok('pad order is up, left, right, down', same(both.pad.map(c => c.direction), ['up', 'left', 'right', 'down']));
ok('actions are space then e', same(both.actions, ['space', 'e']));

const wasd = touchLayoutFor(['w', 'a', 's', 'd']);
ok('wasd only: cells post letters', same(wasd.pad.map(c => c.names[0]), ['w', 'a', 'd', 's']) &&
    wasd.pad.every(c => c.names.length === 1));
ok('wasd only: no action buttons', wasd.actions.length === 0);

const arrows = touchLayoutFor(['up arrow', 'left arrow']);
ok('only listened directions get a cell', same(arrows.pad.map(c => c.direction), ['up', 'left']));

const many = touchLayoutFor(['enter', 'shift', 'q', 'f', 'e', 'space', 'z', '1']);
ok('priority space, e, f, q and at most four', same(many.actions, ['space', 'e', 'f', 'q']) && MAX_ACTIONS === 4);
ok('shift then enter after the letters run out', same(touchLayoutFor(['enter', 'shift', 'space']).actions,
    ['space', 'shift', 'enter']));
ok('other letters and digits fill the rest', same(touchLayoutFor(['z', '1', 'e']).actions, ['e', 'z', '1']));
ok('pad letters never become buttons', same(touchLayoutFor(['w', 'space', 'x']).actions, ['space', 'x']));

const empty = touchLayoutFor([]);
ok('no listened keys falls back to arrows and space',
    empty.pad.length === 4 && same(empty.actions, ['space']));
ok('a Set works as input', same(touchLayoutFor(new Set(['space'])).actions, ['space']));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
