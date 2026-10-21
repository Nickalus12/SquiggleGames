import {blockList, fieldId, fieldValue, inputBlock, isCovered, item, stageOf} from '../model.js';

const RULE = 'variable-unused';
const READS = Object.freeze(['data_variable', 'data_showvariable', 'data_hidevariable']);
const DEFAULT_VARIABLE_ID = '`jEk@4|i[#Fk?(8x)AV.-my variable';

const markIds = mark => {
    const ids = new Set();
    if (!mark) return ids;
    ['secret', 'saved'].forEach(key => (Array.isArray(mark[key]) ? mark[key] : []).forEach(id => ids.add(id)));
    return ids;
};

const sensedNames = model => {
    const byTarget = new Map();
    const anywhere = new Set();
    for (const target of model.targets) {
        for (const block of blockList(target)) {
            if (block.opcode !== 'sensing_of' || block.shadow) continue;
            const property = fieldValue(block, 'PROPERTY');
            if (!property) continue;
            if (isCovered(block, 'OBJECT')) {
                anywhere.add(property);
                continue;
            }
            const menu = inputBlock(target.blocks, block, 'OBJECT');
            const objectName = menu ? fieldValue(menu, 'OBJECT') : null;
            if (!objectName) continue;
            if (!byTarget.has(objectName)) byTarget.set(objectName, new Set());
            byTarget.get(objectName).add(property);
        }
    }
    return {byTarget, anywhere};
};

const variableUnused = model => {
    const reads = new Set();
    const uses = new Set();
    for (const target of model.targets) {
        for (const block of blockList(target)) {
            const id = fieldId(block, 'VARIABLE');
            if (!id) continue;
            uses.add(id);
            if (READS.indexOf(block.opcode) !== -1) reads.add(id);
        }
    }
    if (model.monitored) model.monitored.forEach(id => reads.add(id));
    const sensed = sensedNames(model);
    const stage = stageOf(model);
    const items = [];
    for (const target of model.targets) {
        if (target.isRules) continue;
        const kept = markIds(target.mark);
        const sensedHere = sensed.byTarget.get(target.isStage ? '_stage_' : target.name) || new Set();
        for (const varId of Object.keys(target.variables || {})) {
            const variable = target.variables[varId];
            if (!variable || variable.type !== '' || variable.isCloud) continue;
            if (reads.has(varId) || kept.has(varId)) continue;
            if (target.isStage && varId === DEFAULT_VARIABLE_ID && !uses.has(varId)) continue;
            if (sensedHere.has(variable.name) || sensed.anywhere.has(variable.name)) continue;
            const used = uses.has(varId);
            items.push(item(RULE, 'info', {
                targetId: target.id,
                keyPart: varId,
                code: used ? 'variable-unused-set' : 'variable-unused',
                values: {name: variable.name, sprite: target.isStage && stage ? stage.name : target.name},
                fix: used ? null : 'delete-variable',
                fixData: used ? null : {targetId: target.id, variableId: varId}
            }));
        }
    }
    return items;
};

variableUnused.rule = RULE;
variableUnused.severity = 'info';

export {DEFAULT_VARIABLE_ID};
export default variableUnused;
