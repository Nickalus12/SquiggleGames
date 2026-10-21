import {
    blockList,
    blocksOf,
    descendants,
    fieldId,
    fieldValue,
    inputBlock,
    item,
    menuValue,
    rulesTarget,
    spriteTargets
} from '../model.js';

const RULE = 'rules-wrong-place';
const LIST_FIELDS = Object.freeze(['VARIABLE', 'LIST']);

const namesOf = list => (Array.isArray(list) ? list : [])
    .map(entry => (entry && typeof entry === 'object' ? entry.name : entry))
    .filter(name => typeof name === 'string' && name);

const schemaSets = schema => {
    const gold = new Set();
    const specs = new Map();
    Object.keys(schema.cards || {}).forEach(card => {
        (schema.cards[card] || []).forEach(spec => {
            if (!spec || typeof spec !== 'object') return;
            gold.add(`${card}_${spec.opcode}`);
            specs.set(`${card}_${spec.opcode}`, spec);
        });
    });
    const allowed = new Set(Object.keys(schema.core || {}));
    gold.forEach(opcode => allowed.add(opcode));
    return {gold, allowed, specs};
};

const proccodeOf = block => (block && block.mutation && block.mutation.proccode) || '';

const cycles = target => {
    const calls = new Map();
    const defs = new Map();
    for (const def of blocksOf(target, 'procedures_definition')) {
        const code = proccodeOf(inputBlock(target.blocks, def, 'custom_block'));
        if (!code) continue;
        defs.set(code, def);
        calls.set(code, new Set(descendants(target.blocks, def.next)
            .filter(block => block.opcode === 'procedures_call')
            .map(proccodeOf)));
    }
    const onCycle = new Set();
    const visit = (code, path) => {
        const at = path.indexOf(code);
        if (at !== -1) {
            path.slice(at).forEach(entry => onCycle.add(entry));
            return;
        }
        if (!calls.has(code) || path.length > 256) return;
        calls.get(code).forEach(next => visit(next, path.concat(code)));
    };
    defs.forEach((def, code) => visit(code, []));
    return Array.from(onCycle).filter(code => defs.has(code))
        .map(code => defs.get(code));
};

const timerNames = target => {
    const names = new Set(['timer']);
    blockList(target).forEach(block => {
        if (/_menu_timers$/.test(block.opcode)) {
            const value = fieldValue(block, 'timers');
            if (value) names.add(value);
        }
    });
    return names;
};

const menuNames = (schema, target, mark, menu) => {
    const def = schema.menus && schema.menus[menu];
    if (!def) return null;
    if (Array.isArray(def.items)) return new Set(def.items);
    switch (def.source) {
    case 'variables':
        return new Set(Object.keys(target.variables)
            .map(id => target.variables[id])
            .filter(variable => variable.type === '')
            .map(variable => variable.name));
    case 'players':
        return new Set(namesOf(mark && mark.players));
    case 'teams':
        return new Set(namesOf(mark && mark.teams));
    case 'boards':
        return new Set(namesOf(mark && mark.boards));
    case 'timers':
        return timerNames(target);
    default:
        return null;
    }
};

const rulesWrongPlace = model => {
    const schema = model.rules && model.rules.schema;
    if (!schema || !schema.cards) return [];
    const {gold, allowed, specs} = schemaSets(schema);
    const rules = rulesTarget(model);
    const limits = schema.limits || {};
    const items = [];
    const add = (target, code, fields) => items.push(item(RULE, 'error', Object.assign({
        targetId: target.id,
        code: `rules-${code}`,
        values: {}
    }, fields, {keyPart: `${code}:${fields.keyPart || fields.blockId || ''}`})));

    for (const target of model.targets) {
        if (target === rules) continue;
        for (const block of blockList(target)) {
            if (block.shadow || !gold.has(block.opcode)) continue;
            add(target, 'outside', {
                blockId: block.id,
                fix: rules ? 'move-to-rules' : null,
                fixData: rules ? {targetId: target.id, blockId: block.id, rulesTargetId: rules.id} : null
            });
        }
    }
    if (!rules) return items;

    const mark = rules.mark || null;
    const canMoveOut = spriteTargets(model).some(target => target !== rules);
    for (const block of blockList(rules)) {
        if (block.shadow) continue;
        if (!allowed.has(block.opcode)) {
            add(rules, 'unsupported', {
                blockId: block.id,
                fix: canMoveOut ? 'move-out' : null,
                fixData: canMoveOut ? {targetId: rules.id, blockId: block.id} : null
            });
            continue;
        }
        const allowedFields = schema.fields && schema.fields[block.opcode];
        if (allowedFields) {
            const bad = Object.keys(allowedFields).some(name => {
                const value = fieldValue(block, name);
                return value !== null && allowedFields[name].indexOf(value) === -1;
            });
            if (bad) add(rules, 'unsupported', {blockId: block.id});
        }
        if (LIST_FIELDS.some(name => {
            const id = fieldId(block, name);
            return id && !rules.variables[id];
        })) {
            add(rules, 'global-var', {blockId: block.id});
        }
        const spec = specs.get(block.opcode);
        if (spec && spec.args) {
            Object.keys(spec.args).forEach(arg => {
                const menu = spec.args[arg].menu;
                if (!menu) return;
                const found = menuValue(rules.blocks, block, arg);
                if (!found || found.dynamic || !found.value) return;
                const names = menuNames(schema, rules, mark, menu);
                if (names && !names.has(found.value)) {
                    add(rules, 'name', {blockId: block.id, keyPart: `${block.id}:${arg}`, values: {name: found.value}});
                }
            });
        }
    }

    cycles(rules).forEach(def => add(rules, 'cycle', {blockId: def.id}));

    const vars = Object.keys(rules.variables).map(id => rules.variables[id]);
    const counts = {
        vars: vars.filter(variable => variable.type === '').length,
        lists: vars.filter(variable => variable.type === 'list').length,
        playerValues: namesOf(mark && mark.players).length,
        teams: namesOf(mark && mark.teams).length,
        boards: namesOf(mark && mark.boards).length,
        timers: timerNames(rules).size - 1
    };
    Object.keys(counts).forEach(limit => {
        const max = limits[limit];
        if (Number.isFinite(max) && counts[limit] > max) {
            add(rules, 'limit', {keyPart: limit, values: {limit, max}});
        }
    });

    const bytes = JSON.stringify({blocks: rules.blocks, variables: rules.variables}).length;
    if (Number.isFinite(limits.spriteBytes) && bytes > limits.spriteBytes) {
        add(rules, 'too-big', {keyPart: 'sprite', values: {kb: Math.round(bytes / 1024)}});
    }
    return items;
};

rulesWrongPlace.rule = RULE;
rulesWrongPlace.severity = 'error';

export default rulesWrongPlace;
