import {blocksOf, item} from '../model.js';

const RULE = 'custom-block-missing';

const proccodeOf = block => (block.mutation && typeof block.mutation.proccode === 'string' ?
    block.mutation.proccode :
    '');

const readable = code => code.replace(/%[snb]/g, '()')
    .replace(/\s+/g, ' ')
    .trim();

const customBlockMissing = model => {
    const items = [];
    for (const target of model.targets) {
        const defined = new Set(blocksOf(target, 'procedures_prototype').map(proccodeOf));
        const missing = new Map();
        for (const call of blocksOf(target, 'procedures_call')) {
            const code = proccodeOf(call);
            if (!code || defined.has(code)) continue;
            if (!missing.has(code)) missing.set(code, []);
            missing.get(code).push(call.id);
        }
        missing.forEach((ids, code) => {
            items.push(item(RULE, 'error', {
                targetId: target.id,
                blockId: ids[0],
                keyPart: code,
                values: {name: readable(code), count: ids.length, sprite: target.name},
                fix: 'remove-calls',
                fixData: {targetId: target.id, blockIds: ids}
            }));
        });
    }
    return items;
};

customBlockMissing.rule = RULE;
customBlockMissing.severity = 'error';

export default customBlockMissing;
