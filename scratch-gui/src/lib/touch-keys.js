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

const THUMBSTICK_DEADZONE = 0.18;

const thumbstickDirections = (dx, dy, radius, deadzone = THUMBSTICK_DEADZONE) => {
    const r = Math.max(1, Number(radius) || 56);
    const dist = Math.hypot(dx, dy);
    const mag = dist / r;
    const maxTravel = r * 0.58;
    const scale = dist > maxTravel && dist > 0 ? maxTravel / dist : 1;
    const knobX = Math.round(dx * scale * 10) / 10;
    const knobY = Math.round(dy * scale * 10) / 10;
    if (mag < deadzone) {
        return {active: false, directions: [], knobX: 0, knobY: 0};
    }
    const nx = dx / Math.max(1e-5, dist);
    const ny = dy / Math.max(1e-5, dist);
    const directions = [];
    if (ny < -0.38) directions.push('up');
    if (nx < -0.38) directions.push('left');
    if (nx > 0.38) directions.push('right');
    if (ny > 0.38) directions.push('down');
    return {active: true, directions, knobX, knobY};
};

const GAMEPAD_MOVE_INNER = 0.24;
const GAMEPAD_LOOK_INNER = 0.265;
const GAMEPAD_OUTER = 0.97;
const GAMEPAD_TRIGGER_INNER = 0.118;
const GAMEPAD_LOOK_EXPONENT = 2;
const GAMEPAD_LOOK_SPEED = 200;
const GAMEPAD_MIN_LOOK_SPEED = 90;
const GAMEPAD_MAX_LOOK_SPEED = 360;

const TOUCH_LOOK_SENSITIVITY = 0.3;
const TOUCH_LOOK_MIN_SENSITIVITY = 0.15;
const TOUCH_LOOK_MAX_SENSITIVITY = 0.5;
const TOUCH_LOOK_SLOP = 6;

const DEFAULT_DIRECTION_KEYS = Object.freeze({
    up: ['w', 'ArrowUp'],
    left: ['a', 'ArrowLeft'],
    right: ['d', 'ArrowRight'],
    down: ['s', 'ArrowDown']
});

const clampNum = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const gamepadRadialStick = (
    rawX,
    rawY,
    inner = GAMEPAD_LOOK_INNER,
    outer = GAMEPAD_OUTER,
    exponent = 1
) => {
    const x = Number(rawX) || 0;
    const y = Number(rawY) || 0;
    const mag = Math.hypot(x, y);
    if (mag <= inner || mag <= 1e-5) {
        return {x: 0, y: 0, magnitude: 0};
    }
    const span = Math.max(1e-5, outer - inner);
    const norm = clampNum((mag - inner) / span, 0, 1);
    const curved = exponent === 1 ? norm : Math.pow(norm, exponent);
    const scale = curved / mag;
    return {
        x: x * scale,
        y: y * scale,
        magnitude: curved
    };
};

const resolveScratchKeys = targetsOrKeys => {
    if (!targetsOrKeys) return [];
    if (targetsOrKeys instanceof Set) return Array.from(targetsOrKeys);
    if (Array.isArray(targetsOrKeys)) {
        if (targetsOrKeys.length > 0 && typeof targetsOrKeys[0] === 'object') {
            return Array.from(listenedTouchKeys(targetsOrKeys));
        }
        return targetsOrKeys;
    }
    return [];
};

const buttonValue = btn => {
    if (!btn) return 0;
    if (typeof btn === 'number') return btn;
    if (typeof btn.value === 'number') return btn.value;
    return btn.pressed ? 1 : 0;
};

const gamepadMoveKeys = (first, second, third) => {
    const isPadObject = first && typeof first === 'object';
    const axes = isPadObject && Array.isArray(first.axes) ? first.axes : [first, second];
    const buttons = isPadObject && Array.isArray(first.buttons) ? first.buttons : [];
    const targetsOrKeys = isPadObject ? second : third;
    const stick = gamepadRadialStick(axes[0], axes[1], GAMEPAD_MOVE_INNER, GAMEPAD_OUTER, 1);
    const directions = [];
    if (stick.y < -0.35 || buttonValue(buttons[12]) > 0.5) directions.push('up');
    if (stick.x < -0.35 || buttonValue(buttons[14]) > 0.5) directions.push('left');
    if (stick.x > 0.35 || buttonValue(buttons[15]) > 0.5) directions.push('right');
    if (stick.y > 0.35 || buttonValue(buttons[13]) > 0.5) directions.push('down');
    const scratchKeys = resolveScratchKeys(targetsOrKeys);
    const layout = touchLayoutFor(scratchKeys);
    const names = [];
    const seen = new Set();
    const pushName = name => {
        if (name && !seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    };
    directions.forEach(dir => {
        const cell = layout.pad.find(c => c.direction === dir);
        const list = cell && cell.names.length ? cell.names : DEFAULT_DIRECTION_KEYS[dir];
        (list || []).forEach(pushName);
    });
    const actionPressed = buttonValue(buttons[0]) > 0.5 || buttonValue(buttons[7]) > GAMEPAD_TRIGGER_INNER;
    if (actionPressed) {
        const primaryAction = layout.actions[0] || 'space';
        pushName(primaryAction);
    }
    return names;
};

const syncGamepadKeys = (postKey, heldSet, nextNames) => {
    const held = heldSet || new Set();
    const next = new Set(nextNames || []);
    for (const prev of Array.from(held)) {
        if (!next.has(prev)) {
            held.delete(prev);
            if (typeof postKey === 'function') postKey(prev, false);
        }
    }
    for (const name of next) {
        if (!held.has(name)) {
            held.add(name);
            if (typeof postKey === 'function') postKey(name, true);
        }
    }
    return held;
};

const gamepadLookDelta = (rawX, rawY, dtSec = 1 / 60, opts = {}) => {
    const stick = gamepadRadialStick(
        rawX,
        rawY,
        GAMEPAD_LOOK_INNER,
        GAMEPAD_OUTER,
        GAMEPAD_LOOK_EXPONENT
    );
    if (stick.magnitude <= 0) {
        return {yawDelta: 0, pitchDelta: 0, active: false};
    }
    const dt = clampNum(Number(dtSec) || (1 / 60), 0, 0.25);
    const mouseSpeed = Number(opts.mouseSpeed) > 0 ? Number(opts.mouseSpeed) : 12;
    const rate = clampNum(
        GAMEPAD_LOOK_SPEED * (mouseSpeed / 12),
        GAMEPAD_MIN_LOOK_SPEED,
        GAMEPAD_MAX_LOOK_SPEED
    );
    const yawDelta = stick.x * rate * dt;
    const allowPitch = opts.lookUpDown !== false;
    const sign = opts.invertLook ? 1 : -1;
    const pitchDelta = allowPitch ? (sign * stick.y * rate * dt) : 0;
    return {yawDelta, pitchDelta, active: true};
};

const isRightHalfTouch = (clientX, rect) => {
    if (!rect || !(rect.width > 0)) return false;
    return (Number(clientX) - (Number(rect.left) || 0)) >= (rect.width * 0.5);
};

const createTouchLookState = () => ({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    active: false
});

const startTouchLook = (state, pointerId, clientX, clientY, rect) => {
    const target = state || createTouchLookState();
    if (target.pointerId !== null || !isRightHalfTouch(clientX, rect)) return false;
    const x = Number(clientX) || 0;
    const y = Number(clientY) || 0;
    target.pointerId = pointerId;
    target.startX = x;
    target.startY = y;
    target.lastX = x;
    target.lastY = y;
    target.active = false;
    return true;
};

const moveTouchLook = (state, pointerId, clientX, clientY, opts = {}) => {
    if (!state || state.pointerId !== pointerId) {
        return {yawDelta: 0, pitchDelta: 0, active: false};
    }
    const x = Number(clientX) || 0;
    const y = Number(clientY) || 0;
    if (!state.active) {
        const travel = Math.hypot(x - state.startX, y - state.startY);
        if (travel <= TOUCH_LOOK_SLOP) {
            return {yawDelta: 0, pitchDelta: 0, active: false};
        }
        const ratio = TOUCH_LOOK_SLOP / travel;
        state.lastX = state.startX + ((x - state.startX) * ratio);
        state.lastY = state.startY + ((y - state.startY) * ratio);
        state.active = true;
    }
    const dx = x - state.lastX;
    const dy = y - state.lastY;
    state.lastX = x;
    state.lastY = y;
    const mouseSpeed = Number(opts.mouseSpeed) > 0 ? Number(opts.mouseSpeed) : 12;
    const degPerPx = clampNum(
        TOUCH_LOOK_SENSITIVITY * (mouseSpeed / 12),
        TOUCH_LOOK_MIN_SENSITIVITY,
        TOUCH_LOOK_MAX_SENSITIVITY
    );
    const yawDelta = dx * degPerPx;
    const allowPitch = opts.lookUpDown !== false;
    const sign = opts.invertLook ? 1 : -1;
    const pitchDelta = allowPitch ? (sign * dy * degPerPx) : 0;
    return {yawDelta, pitchDelta, active: true};
};

const endTouchLook = (state, pointerId) => {
    if (!state || (typeof pointerId !== 'undefined' && state.pointerId !== pointerId)) return false;
    state.pointerId = null;
    state.startX = 0;
    state.startY = 0;
    state.lastX = 0;
    state.lastY = 0;
    state.active = false;
    return true;
};

export {
    GAMEPAD_LOOK_EXPONENT,
    GAMEPAD_LOOK_INNER,
    GAMEPAD_LOOK_SPEED,
    GAMEPAD_MAX_LOOK_SPEED,
    GAMEPAD_MIN_LOOK_SPEED,
    GAMEPAD_MOVE_INNER,
    GAMEPAD_OUTER,
    GAMEPAD_TRIGGER_INNER,
    MAX_ACTIONS,
    THUMBSTICK_DEADZONE,
    TOUCH_KEYS,
    TOUCH_LOOK_MAX_SENSITIVITY,
    TOUCH_LOOK_MIN_SENSITIVITY,
    TOUCH_LOOK_SENSITIVITY,
    TOUCH_LOOK_SLOP,
    createTouchLookState,
    endTouchLook,
    gamepadLookDelta,
    gamepadMoveKeys,
    gamepadRadialStick,
    isRightHalfTouch,
    keyboardData,
    listenedTouchKeys,
    moveTouchLook,
    projectWantsTouchKeys,
    startTouchLook,
    syncGamepadKeys,
    thumbstickDirections,
    touchKeyByName,
    touchLayoutFor
};
