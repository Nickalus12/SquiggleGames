import {LOOPS, UNBOUNDED_LOOPS, blocksOf, containers, item, literalNumber, menuValue, targetByName} from '../model.js';

const RULE = 'clone-runaway';
const SAFE_REPEAT = 100;
const COUNTED_INPUTS = Object.freeze({control_repeat: 'TIMES', control_for_each: 'VALUE'});

const runawayLoop = (blocks, entry) => {
    if (UNBOUNDED_LOOPS.indexOf(entry.opcode) !== -1) return true;
    const counted = COUNTED_INPUTS[entry.opcode];
    if (!counted) return LOOPS.indexOf(entry.opcode) !== -1;
    const times = literalNumber(blocks, entry.block, counted);
    return times === null || times > SAFE_REPEAT;
};

const cloneRunaway = model => {
    const items = [];
    for (const target of model.targets) {
        for (const block of blocksOf(target, 'control_create_clone_of')) {
            if (block.shadow) continue;
            const option = menuValue(target.blocks, block, 'CLONE_OPTION');
            if (!option || option.dynamic) continue;
            const cloned = option.value === '_myself_' ? target : targetByName(model, option.value);
            if (!cloned || cloned.isStage) continue;
            if (!containers(target.blocks, block.id).some(entry => runawayLoop(target.blocks, entry))) continue;
            if (blocksOf(cloned, 'control_delete_this_clone').some(found => !found.shadow)) continue;
            items.push(item(RULE, 'warn', {
                targetId: target.id,
                blockId: block.id,
                values: {sprite: cloned.name}
            }));
        }
    }
    return items;
};

cloneRunaway.rule = RULE;
cloneRunaway.severity = 'warn';

export default cloneRunaway;
