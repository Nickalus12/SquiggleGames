import {blocksOf, item, menuValue} from '../model.js';

const RULE = 'tile-missing';
const BLANK = Object.freeze(['', 'empty', 'none']);

const lowerSet = list => new Set(list.map(name => String(name).toLowerCase()));

const costumeNames = model => {
    const names = new Set();
    for (const target of model.targets) {
        if (!target.isStage && !(model.world.tilesets || []).includes(target.name)) continue;
        (target.costumes || []).forEach(costume => names.add(String(costume.name).toLowerCase()));
    }
    return names;
};

const tileMissing = model => {
    const world = model.world;
    if (!world) return [];
    const levels = Array.isArray(world.levels) ? lowerSet(world.levels) : null;
    const tiles = Array.isArray(world.tiles) ? lowerSet(world.tiles) : null;
    const costumes = tiles ? costumeNames(model) : null;
    const items = [];
    const seen = new Set();
    const report = (target, block, kind, value) => {
        const key = `${target.id}:${kind}:${value.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        const canCreate = kind === 'level' ? world.canCreateLevel : world.canCreateTile;
        items.push(item(RULE, 'error', {
            targetId: target.id,
            blockId: block.id,
            keyPart: `${kind}:${value.toLowerCase()}`,
            code: kind === 'level' ? 'tile-missing-level' : 'tile-missing',
            values: {name: value},
            fix: canCreate ? `create-${kind}` : null,
            fixData: canCreate ? {name: value} : null
        }));
    };
    for (const target of model.targets) {
        if (levels && levels.size) {
            for (const block of blocksOf(target, 'squiggleworld_useLevel')) {
                const found = menuValue(target.blocks, block, 'LEVEL');
                if (!found || found.dynamic || !found.value) continue;
                if (!levels.has(found.value.toLowerCase())) report(target, block, 'level', found.value);
            }
        }
        if (tiles) {
            for (const block of blocksOf(target, 'squiggleworld_setTile')) {
                const found = menuValue(target.blocks, block, 'TILE');
                if (!found || found.dynamic) continue;
                const value = found.value.trim();
                if (BLANK.indexOf(value.toLowerCase()) !== -1 || /^\d+$/.test(value)) continue;
                if (tiles.has(value.toLowerCase()) || costumes.has(value.toLowerCase())) continue;
                report(target, block, 'tile', value);
            }
        }
    }
    return items;
};

tileMissing.rule = RULE;
tileMissing.severity = 'error';

export default tileMissing;
