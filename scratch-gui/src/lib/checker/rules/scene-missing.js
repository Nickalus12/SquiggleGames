import {blocksOf, item, menuValue} from '../model.js';

const RULE = 'scene-missing';
const ANY = '_any_';
const USES = Object.freeze([
    {opcode: 'squigglescenes_switchTo', input: 'SCENE'},
    {opcode: 'squigglescenes_whenSceneStarts', input: 'SCENE'},
    {opcode: 'squigglescenes_whenSceneEnds', input: 'SCENE'}
]);

const sceneMissing = model => {
    const scenes = model.world && Array.isArray(model.world.scenes) ? model.world.scenes : null;
    if (!scenes) return [];
    const known = new Set(scenes.map(name => String(name).toLowerCase()));
    const items = [];
    const seen = new Set();
    for (const target of model.targets) {
        for (const use of USES) {
            for (const block of blocksOf(target, use.opcode)) {
                if (block.shadow) continue;
                const found = menuValue(target.blocks, block, use.input);
                if (!found || found.dynamic || !found.value || found.value === ANY) continue;
                const key = found.value.toLowerCase();
                if (known.has(key) || seen.has(`${target.id}:${key}`)) continue;
                seen.add(`${target.id}:${key}`);
                items.push(item(RULE, 'error', {
                    targetId: target.id,
                    blockId: block.id,
                    keyPart: key,
                    values: {name: found.value},
                    fix: model.world.canCreateScene ? 'create-scene' : null,
                    fixData: model.world.canCreateScene ? {name: found.value} : null
                }));
            }
        }
    }
    return items;
};

sceneMissing.rule = RULE;
sceneMissing.severity = 'error';

export default sceneMissing;
