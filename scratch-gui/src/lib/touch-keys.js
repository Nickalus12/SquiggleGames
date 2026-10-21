const letterKey = (c, pad) => ({name: c, key: c, keyCode: c.toUpperCase().charCodeAt(0), scratchKey: c, pad});
const digitKey = c => ({name: c, key: c, keyCode: c.charCodeAt(0), scratchKey: c});

const PAD_LETTERS = {w: 'up', a: 'left', s: 'down', d: 'right'};

const TOUCH_KEYS = [
    {name: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37, scratchKey: 'left arrow', pad: 'left'},
    {name: 'ArrowUp', key: 'ArrowUp', keyCode: 38, scratchKey: 'up arrow', pad: 'up'},
    {name: 'ArrowDown', key: 'ArrowDown', keyCode: 40, scratchKey: 'down arrow', pad: 'down'},
    {name: 'ArrowRight', key: 'ArrowRight', keyCode: 39, scratchKey: 'right arrow', pad: 'right'},
    {name: 'space', key: ' ', keyCode: 32, scratchKey: 'space'},
    {name: 'shift', key: 'Shift', keyCode: 16, scratchKey: 'shift'},
    {name: 'enter', key: 'Enter', keyCode: 13, scratchKey: 'enter'},
    ...'abcdefghijklmnopqrstuvwxyz'.split('').map(c => letterKey(c, PAD_LETTERS[c])),
    ...'0123456789'.split('').map(digitKey)
];

const PAD_DIRECTIONS = ['up', 'left', 'right', 'down'];
const ACTION_PRIORITY = ['space', 'e', 'f', 'q', 'shift', 'enter'];
const MAX_ACTIONS = 4;
const ANY_KEY_NAMES = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'space'];

const touchKeyByName = name => TOUCH_KEYS.find(k => k.name === name) || null;

const keyboardData = (name, isDown) => {
    const touchKey = touchKeyByName(name);
    if (!touchKey) return null;
    return {key: touchKey.key, keyCode: touchKey.keyCode, isDown: !!isDown};
};

const TOUCH_SCRATCH_KEYS = new Set(TOUCH_KEYS.map(k => k.scratchKey));
const ANY_SCRATCH_KEYS = ANY_KEY_NAMES.map(name => touchKeyByName(name).scratchKey);

const fieldValue = (block, name) => {
    const field = block && block.fields && block.fields[name];
    return field ? String(field.value).toLowerCase() : null;
};

const keyOfInput = (blocks, block) => {
    const input = block.inputs && block.inputs.KEY_OPTION;
    if (!input || !input.block) return null;
    const menu = blocks[input.block];
    if (!menu || menu.opcode !== 'sensing_keyoptions') return 'any';
    return fieldValue(menu, 'KEY_OPTION');
};

const listenedKeysOfBlocks = (blocks, found) => {
    for (const id of Object.keys(blocks)) {
        const block = blocks[id];
        let key = null;
        if (block.opcode === 'event_whenkeypressed') key = fieldValue(block, 'KEY_OPTION');
        else if (block.opcode === 'sensing_keypressed') key = keyOfInput(blocks, block);
        if (key === 'any') {
            for (const k of ANY_SCRATCH_KEYS) found.add(k);
        } else if (key && TOUCH_SCRATCH_KEYS.has(key)) {
            found.add(key);
        }
    }
    return found;
};

const listenedTouchKeys = targets => {
    const found = new Set();
    for (const target of targets || []) {
        if (target.isOriginal === false) continue;
        const blocks = target.blocks && target.blocks._blocks;
        if (blocks) listenedKeysOfBlocks(blocks, found);
    }
    return found;
};

const projectWantsTouchKeys = targets => listenedTouchKeys(targets).size > 0;

const touchLayoutFor = scratchKeys => {
    const given = Array.from(scratchKeys || []);
    const listened = new Set(given.length ? given : ANY_SCRATCH_KEYS);
    const keys = TOUCH_KEYS.filter(k => listened.has(k.scratchKey));
    const pad = PAD_DIRECTIONS
        .map(direction => ({
            direction,
            names: keys.filter(k => k.pad === direction).map(k => k.name)
        }))
        .filter(cell => cell.names.length);
    const prioritised = ACTION_PRIORITY.filter(name => keys.some(k => k.name === name));
    const rest = keys
        .filter(k => !k.pad && k.name.length === 1 && prioritised.indexOf(k.name) === -1)
        .map(k => k.name);
    return {pad, actions: prioritised.concat(rest).slice(0, MAX_ACTIONS)};
};

export {
    MAX_ACTIONS,
    TOUCH_KEYS,
    keyboardData,
    listenedTouchKeys,
    projectWantsTouchKeys,
    touchKeyByName,
    touchLayoutFor
};
