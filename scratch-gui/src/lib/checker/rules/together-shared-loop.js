import {
    CONDITIONALS,
    LOOPS,
    UNBOUNDED_LOOPS,
    blocksOf,
    containers,
    hasWait,
    item,
    loopBody,
    menuValue
} from '../model.js';

const RULE = 'together-shared-loop';
const SETS = Object.freeze(['together_setSharedVariable', 'together_changeSharedVariable']);

const togetherSharedLoop = model => {
    const items = [];
    for (const target of model.targets) {
        for (const opcode of SETS) {
            for (const block of blocksOf(target, opcode)) {
                if (block.shadow) continue;
                const around = containers(target.blocks, block.id);
                const loopAt = around.findIndex(entry => LOOPS.indexOf(entry.opcode) !== -1);
                if (loopAt === -1) continue;
                const loop = around[loopAt];
                if (UNBOUNDED_LOOPS.indexOf(loop.opcode) === -1) continue;
                if (around.slice(0, loopAt).some(entry => CONDITIONALS.indexOf(entry.opcode) !== -1)) continue;
                if (hasWait(loopBody(target.blocks, loop.block))) continue;
                const name = menuValue(target.blocks, block, 'NAME');
                items.push(item(RULE, 'warn', {
                    targetId: target.id,
                    blockId: block.id,
                    values: {name: name && !name.dynamic ? name.value : ''}
                }));
            }
        }
    }
    return items;
};

togetherSharedLoop.rule = RULE;
togetherSharedLoop.severity = 'warn';

export {SETS};
export default togetherSharedLoop;
