import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const expandTarget = (spec, targetIndex) => {
    const blocks = {};
    let counter = 0;
    const prefix = spec.isStage ? 'stage' : `t${targetIndex}`;
    const nextId = () => `${prefix}_${++counter}`;

    const shadowFor = (opcode, field, value, fieldIdValue, parent) => {
        const id = nextId();
        const fields = {};
        fields[field] = {name: field, value: String(value)};
        if (fieldIdValue) fields[field].id = fieldIdValue;
        blocks[id] = {id, opcode, next: null, parent, inputs: {}, fields, shadow: true, topLevel: false};
        return id;
    };

    const literal = (value, parent) => (typeof value === 'number' ?
        shadowFor('math_number', 'NUM', value, null, parent) :
        shadowFor('text', 'TEXT', value, null, parent));

    let makeBlock = null;

    const makeStack = (list, parent) => {
        let first = null;
        let previous = null;
        for (const entry of list) {
            const id = makeBlock(entry, previous || parent);
            if (previous) blocks[previous].next = id;
            else first = id;
            previous = id;
        }
        return first;
    };

    makeBlock = (entry, parent) => {
        const id = entry.id || nextId();
        const block = {
            id,
            opcode: entry.op,
            next: null,
            parent: parent || null,
            inputs: {},
            fields: {},
            shadow: !!entry.shadow,
            topLevel: !parent
        };
        if (!parent) {
            block.x = 0;
            block.y = 0;
        }
        blocks[id] = block;
        Object.keys(entry.f || {}).forEach(name => {
            const value = entry.f[name];
            const pair = Array.isArray(value) ? value : [value, null];
            block.fields[name] = {name, value: String(pair[0])};
            if (pair[1]) block.fields[name].id = pair[1];
            if (pair[2]) block.fields[name].variableType = pair[2];
        });
        Object.keys(entry.in || {}).forEach(name => {
            const value = entry.in[name];
            if (Array.isArray(value)) {
                const shadow = shadowFor(value[0], value[1], value[2], value[3], id);
                block.inputs[name] = {name, block: shadow, shadow};
            } else if (value && typeof value === 'object') {
                const shadow = literal('', id);
                const reporter = makeBlock(value, id);
                block.inputs[name] = {name, block: reporter, shadow};
            } else {
                const shadow = literal(value, id);
                block.inputs[name] = {name, block: shadow, shadow};
            }
        });
        if (entry.sub) {
            const first = makeStack(entry.sub, id);
            block.inputs.SUBSTACK = {name: 'SUBSTACK', block: first, shadow: null};
        }
        if (entry.sub2) {
            const first = makeStack(entry.sub2, id);
            block.inputs.SUBSTACK2 = {name: 'SUBSTACK2', block: first, shadow: null};
        }
        if (entry.m) block.mutation = Object.assign({tagName: 'mutation', children: []}, entry.m);
        return id;
    };

    (spec.scripts || []).forEach(script => makeStack(script, null));
    Object.assign(blocks, spec.blocks || {});

    const variables = {};
    Object.keys(spec.variables || {}).forEach(varId => {
        const v = spec.variables[varId];
        variables[varId] = {id: varId, name: v.name, type: v.type || '', isCloud: !!v.isCloud};
    });

    return {
        id: spec.id || (spec.isStage ? 'stage' : `target${targetIndex}`),
        name: spec.name || (spec.isStage ? 'Stage' : `Sprite${targetIndex}`),
        isStage: !!spec.isStage,
        isRules: !!spec.rules,
        mark: spec.rules && typeof spec.rules === 'object' ? spec.rules : null,
        blocks,
        variables,
        costumes: spec.costumes || [],
        sounds: spec.sounds || []
    };
};

const expandModel = spec => {
    const model = Object.assign({}, spec);
    model.targets = (spec.targets || []).map(expandTarget);
    if (!model.targets.some(target => target.isStage)) model.targets.unshift(expandTarget({isStage: true}, 0));
    ['hatOpcodes', 'reporterOpcodes', 'monitored', 'squiggleOnlyIds'].forEach(key => {
        if (Array.isArray(spec[key])) model[key] = new Set(spec[key]);
    });
    return model;
};

const loadFixture = name => {
    const raw = JSON.parse(fs.readFileSync(path.join(here, `${name}.json`), 'utf8'));
    const cases = {};
    Object.keys(raw).forEach(key => {
        cases[key] = expandModel(raw[key]);
    });
    return cases;
};

const harness = () => {
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
    const done = () => {
        console.log(`\n${pass} passed, ${fail} failed`);
        if (fail) process.exit(1);
    };
    return {ok, done};
};

process.removeAllListeners('warning');

export {expandModel, expandTarget, loadFixture, harness};
