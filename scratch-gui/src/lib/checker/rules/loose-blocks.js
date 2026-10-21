import {indexTarget, isHat, isReporter, item} from '../model.js';

const RULE = 'loose-blocks';

const looseBlocks = model => {
    const items = [];
    for (const target of model.targets) {
        const loose = indexTarget(target).tops.filter(block => (
            !isHat(model, block.opcode) && (block.next || !isReporter(model, block.opcode))
        ));
        if (!loose.length) continue;
        items.push(item(RULE, 'info', {
            targetId: target.id,
            blockId: loose[0].id,
            keyPart: 'stacks',
            values: {count: loose.length, sprite: target.name},
            fix: 'clean-up',
            fixData: {targetId: target.id, blockIds: loose.map(block => block.id)}
        }));
    }
    return items;
};

looseBlocks.rule = RULE;
looseBlocks.severity = 'info';

export default looseBlocks;
