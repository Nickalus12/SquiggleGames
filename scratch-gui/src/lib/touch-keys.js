const TOUCH_KEYS = [
    {name: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37, scratchKey: 'left arrow'},
    {name: 'ArrowUp', key: 'ArrowUp', keyCode: 38, scratchKey: 'up arrow'},
    {name: 'ArrowDown', key: 'ArrowDown', keyCode: 40, scratchKey: 'down arrow'},
    {name: 'ArrowRight', key: 'ArrowRight', keyCode: 39, scratchKey: 'right arrow'},
    {name: 'space', key: ' ', keyCode: 32, scratchKey: 'space'}
];

const touchKeyByName = name => TOUCH_KEYS.find(k => k.name === name) || null;

const keyboardData = (name, isDown) => {
    const touchKey = touchKeyByName(name);
    if (!touchKey) return null;
    return {key: touchKey.key, keyCode: touchKey.keyCode, isDown: !!isDown};
};

const TOUCH_SCRATCH_KEYS = new Set(TOUCH_KEYS.map(k => k.scratchKey));

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
            for (const k of TOUCH_SCRATCH_KEYS) found.add(k);
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

export {
    TOUCH_KEYS,
    keyboardData,
    listenedTouchKeys,
    projectWantsTouchKeys,
    touchKeyByName
};
