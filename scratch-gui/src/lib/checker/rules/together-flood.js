import {LOOPS, blocksOf, containers, hasWait, item, loopBody} from '../model.js';

const RULE = 'together-flood';
const SENDS = Object.freeze(['together_broadcastGameMessage']);

const togetherFlood = model => {
    const items = [];
    for (const target of model.targets) {
        for (const opcode of SENDS) {
            for (const block of blocksOf(target, opcode)) {
                if (block.shadow) continue;
                const loop = containers(target.blocks, block.id).find(entry => LOOPS.indexOf(entry.opcode) !== -1);
                if (!loop || hasWait(loopBody(target.blocks, loop.block))) continue;
                items.push(item(RULE, 'warn', {
                    targetId: target.id,
                    blockId: block.id,
                    fix: 'add-wait',
                    fixData: {targetId: target.id, afterBlockId: block.id, seconds: 0.1}
                }));
            }
        }
    }
    return items;
};

togetherFlood.rule = RULE;
togetherFlood.severity = 'warn';

export {SENDS};
export default togetherFlood;
