import {blockList, item} from '../model.js';

const RULE = 'squiggle-only';

const extensionOf = opcode => {
    const cut = opcode.indexOf('_');
    return cut > 0 ? opcode.slice(0, cut) : '';
};

const squiggleOnly = model => {
    const ids = model.squiggleOnlyIds;
    if (!ids || !ids.size) return [];
    const items = [];
    for (const target of model.targets) {
        const found = new Map();
        for (const block of blockList(target)) {
            if (block.shadow) continue;
            const ext = extensionOf(block.opcode);
            if (!ids.has(ext)) continue;
            if (!found.has(ext)) found.set(ext, []);
            found.get(ext).push(block.id);
        }
        found.forEach((blockIds, ext) => {
            items.push(item(RULE, 'info', {
                targetId: target.id,
                blockId: blockIds[0],
                keyPart: ext,
                values: {
                    count: blockIds.length,
                    kit: (model.kitNames && model.kitNames[ext]) || ext,
                    sprite: target.name
                }
            }));
        });
    }
    return items;
};

squiggleOnly.rule = RULE;
squiggleOnly.severity = 'info';

export default squiggleOnly;
