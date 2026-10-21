const CORE_HATS = Object.freeze([
    'event_whenflagclicked',
    'event_whenkeypressed',
    'event_whenthisspriteclicked',
    'event_whenstageclicked',
    'event_whentouchingobject',
    'event_whenbackdropswitchesto',
    'event_whengreaterthan',
    'event_whenbroadcastreceived',
    'control_start_as_clone',
    'procedures_definition'
]);

const CORE_REPORTERS = Object.freeze([
    'motion_xposition',
    'motion_yposition',
    'motion_direction',
    'looks_costumenumbername',
    'looks_backdropnumbername',
    'looks_size',
    'sound_volume',
    'sensing_touchingobject',
    'sensing_touchingcolor',
    'sensing_coloristouchingcolor',
    'sensing_distanceto',
    'sensing_answer',
    'sensing_keypressed',
    'sensing_mousedown',
    'sensing_mousex',
    'sensing_mousey',
    'sensing_loudness',
    'sensing_timer',
    'sensing_of',
    'sensing_current',
    'sensing_dayssince2000',
    'sensing_username',
    'data_variable',
    'data_listcontents',
    'data_itemoflist',
    'data_itemnumoflist',
    'data_lengthoflist',
    'data_listcontainsitem'
]);

const REPORTER_PREFIXES = Object.freeze(['operator_', 'argument_reporter_']);

const LOOPS = Object.freeze([
    'control_forever',
    'control_repeat',
    'control_repeat_until',
    'control_while',
    'control_for_each'
]);

const UNBOUNDED_LOOPS = Object.freeze(['control_forever', 'control_repeat_until', 'control_while']);

const CONDITIONALS = Object.freeze(['control_if', 'control_if_else', 'control_wait_until']);

const WAITS = Object.freeze([
    'control_wait',
    'control_wait_until',
    'event_broadcastandwait',
    'sensing_askandwait',
    'looks_sayforsecs',
    'looks_thinkforsecs',
    'sound_playuntildone',
    'motion_glidesecstoxy',
    'motion_glideto',
    'text2speech_speakAndWait'
]);

const SEVERITY_RANK = Object.freeze({error: 0, warn: 1, info: 2});

const blockList = target => Object.keys(target.blocks || {})
    .map(id => target.blocks[id])
    .filter(Boolean);

const indexTarget = target => {
    if (target.index) return target.index;
    const byOpcode = new Map();
    const tops = [];
    for (const block of blockList(target)) {
        if (!byOpcode.has(block.opcode)) byOpcode.set(block.opcode, []);
        byOpcode.get(block.opcode).push(block);
        if (block.topLevel && !block.shadow) tops.push(block);
    }
    const index = {byOpcode, tops};
    Object.defineProperty(target, 'index', {value: index, enumerable: false, configurable: true});
    return index;
};

const blocksOf = (target, opcode) => indexTarget(target).byOpcode.get(opcode) || [];

const blocksWhere = (target, test) => blockList(target).filter(block => !block.shadow && test(block.opcode, block));

const fieldValue = (block, name) => {
    const field = block && block.fields && block.fields[name];
    if (!field) return null;
    return typeof field.value === 'undefined' || field.value === null ? '' : String(field.value);
};

const fieldId = (block, name) => {
    const field = block && block.fields && block.fields[name];
    return field && field.id ? field.id : null;
};

const inputBlock = (blocks, block, name) => {
    const input = block && block.inputs && block.inputs[name];
    if (!input || !input.block) return null;
    return blocks[input.block] || null;
};

const isCovered = (block, name) => {
    const input = block && block.inputs && block.inputs[name];
    return !!(input && input.block && input.shadow && input.block !== input.shadow);
};

const menuValue = (blocks, block, name) => {
    const own = fieldValue(block, name);
    if (own !== null) return {value: own, id: fieldId(block, name), dynamic: false};
    if (isCovered(block, name)) return {value: null, id: null, dynamic: true};
    const shadow = inputBlock(blocks, block, name);
    if (!shadow || !shadow.fields) return null;
    const keys = Object.keys(shadow.fields);
    if (!keys.length) return null;
    return {value: fieldValue(shadow, keys[0]), id: fieldId(shadow, keys[0]), dynamic: false};
};

const literalNumber = (blocks, block, name) => {
    const found = menuValue(blocks, block, name);
    if (!found || found.dynamic) return null;
    const n = Number(found.value);
    return found.value !== '' && Number.isFinite(n) ? n : null;
};

const slotOf = (parent, childId) => {
    const inputs = parent.inputs || {};
    for (const key of Object.keys(inputs)) {
        if (inputs[key] && inputs[key].block === childId) return key;
    }
    return null;
};

const containers = (blocks, id) => {
    const out = [];
    let child = blocks[id];
    let guard = 0;
    while (child && child.parent && guard++ < 10000) {
        const parent = blocks[child.parent];
        if (!parent) break;
        if (parent.next !== child.id) {
            const slot = slotOf(parent, child.id);
            if (slot && slot.indexOf('SUBSTACK') === 0) out.push({block: parent, opcode: parent.opcode, slot});
        }
        child = parent;
    }
    return out;
};

const topOf = (blocks, id) => {
    let block = blocks[id];
    let guard = 0;
    while (block && block.parent && blocks[block.parent] && guard++ < 10000) block = blocks[block.parent];
    return block || null;
};

const descendants = (blocks, startId) => {
    const out = [];
    const stack = startId ? [startId] : [];
    const seen = new Set();
    while (stack.length) {
        const id = stack.pop();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const block = blocks[id];
        if (!block) continue;
        out.push(block);
        if (block.next) stack.push(block.next);
        const inputs = block.inputs || {};
        for (const key of Object.keys(inputs)) {
            if (inputs[key] && inputs[key].block) stack.push(inputs[key].block);
        }
    }
    return out;
};

const loopBody = (blocks, loop) => {
    const input = loop.inputs && loop.inputs.SUBSTACK;
    return input && input.block ? descendants(blocks, input.block) : [];
};

const hasWait = (body, waits) => body.some(block => !block.shadow && (waits || WAITS).indexOf(block.opcode) !== -1);

const isHat = (model, opcode) => CORE_HATS.indexOf(opcode) !== -1 ||
    !!(model.hatOpcodes && model.hatOpcodes.has(opcode));

const isReporter = (model, opcode) => CORE_REPORTERS.indexOf(opcode) !== -1 ||
    REPORTER_PREFIXES.some(prefix => opcode.indexOf(prefix) === 0) ||
    !!(model.reporterOpcodes && model.reporterOpcodes.has(opcode));

const spriteTargets = model => model.targets.filter(target => !target.isStage);

const stageOf = model => model.targets.find(target => target.isStage) || null;

const targetByName = (model, name) => model.targets.find(target => !target.isStage && target.name === name) || null;

const rulesTarget = model => model.targets.find(target => target.isRules) || null;

const item = (rule, severity, fields) => Object.assign({
    rule,
    severity,
    targetId: null,
    blockId: null,
    code: rule,
    values: {},
    fix: null,
    fixData: null
}, fields, {
    key: `${rule}:${fields.targetId || ''}:${fields.keyPart || fields.blockId || ''}`
});

const sortItems = items => items.slice().sort((a, b) => (
    (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) ||
    (a.rule < b.rule ? -1 : (a.rule > b.rule ? 1 : 0)) ||
    (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0))
));

export {
    CORE_HATS,
    CORE_REPORTERS,
    LOOPS,
    UNBOUNDED_LOOPS,
    CONDITIONALS,
    WAITS,
    SEVERITY_RANK,
    blockList,
    indexTarget,
    blocksOf,
    blocksWhere,
    fieldValue,
    fieldId,
    inputBlock,
    isCovered,
    menuValue,
    literalNumber,
    containers,
    topOf,
    descendants,
    loopBody,
    hasWait,
    isHat,
    isReporter,
    spriteTargets,
    stageOf,
    targetByName,
    rulesTarget,
    item,
    sortItems
};
