import {item} from '../model.js';

const RULE = 'big-asset';
const COSTUME_BUDGET = 1024 * 1024;
const SOUND_BUDGET = 2 * 1024 * 1024;

const bigAsset = model => {
    const items = [];
    const check = (target, list, kind, budget) => {
        (list || []).forEach((asset, i) => {
            const bytes = Number(asset && asset.bytes) || 0;
            if (bytes <= budget) return;
            items.push(item(RULE, 'info', {
                targetId: target.id,
                keyPart: `${kind}:${asset.assetId || i}`,
                code: `big-asset-${kind}`,
                values: {name: asset.name, kb: Math.round(bytes / 1024), budgetKb: Math.round(budget / 1024)},
                fixData: {targetId: target.id, kind, index: i}
            }));
        });
    };
    for (const target of model.targets) {
        check(target, target.costumes, 'costume', COSTUME_BUDGET);
        check(target, target.sounds, 'sound', SOUND_BUDGET);
    }
    return items;
};

bigAsset.rule = RULE;
bigAsset.severity = 'info';

export {COSTUME_BUDGET, SOUND_BUDGET};
export default bigAsset;
