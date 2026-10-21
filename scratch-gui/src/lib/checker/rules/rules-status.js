import {item, rulesTarget} from '../model.js';

const RULE = 'rules-status';

const rulesStatus = model => {
    const status = model.rulesStatus;
    if (!status) return [];
    const rules = rulesTarget(model);
    const items = [];
    [status.compile, status.run].forEach(part => {
        if (!part || part.phase === 'local' || !Array.isArray(part.errors)) return;
        part.errors.forEach((error, i) => {
            const detail = error.detail && typeof error.detail === 'object' ? error.detail : {};
            const n = Number.isFinite(error.n) ? error.n : 1;
            items.push(item(RULE, 'error', {
                targetId: rules ? rules.id : null,
                blockId: error.blockId || null,
                keyPart: `${part.phase}:${error.code}:${error.blockId || i}`,
                code: `rules-${error.code}`,
                values: {
                    limit: typeof detail.limit === 'string' ? detail.limit : '',
                    max: Number.isFinite(detail.max) ? detail.max : 0,
                    n,
                    text: typeof error.text === 'string' ? error.text : ''
                }
            }));
        });
    });
    return items;
};

rulesStatus.rule = RULE;
rulesStatus.severity = 'error';

export default rulesStatus;
