import {blocksWhere, item} from '../model.js';

const RULE = 'pen-with-camera';
const PEN = Object.freeze(['pen_penDown', 'pen_stamp']);

const penWithCamera = model => {
    if (!model.worldMode) return [];
    const items = [];
    for (const target of model.targets) {
        const found = blocksWhere(target, opcode => PEN.indexOf(opcode) !== -1);
        if (!found.length) continue;
        items.push(item(RULE, 'warn', {
            targetId: target.id,
            blockId: found[0].id,
            keyPart: 'pen',
            values: {count: found.length, sprite: target.name}
        }));
    }
    return items;
};

penWithCamera.rule = RULE;
penWithCamera.severity = 'warn';

export default penWithCamera;
