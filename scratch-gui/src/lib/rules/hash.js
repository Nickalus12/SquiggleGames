import schema from './rules-schema.js';
import {RULES_KEY} from '../collab/project-seam.js';
import {canonical} from '../collab/hash.js';

const markSet = storage => {
    const mark = storage && storage[RULES_KEY];
    return mark && Number.isInteger(mark.opcodeSet) ? mark.opcodeSet : schema.opcodeSet;
};

const rulesPayload = (sprite, opcodeSet, levels) => {
    const storage = (sprite && sprite.extensionStorage) || {};
    return {
        blocks: sprite && sprite.blocks,
        variables: sprite && sprite.variables,
        lists: sprite && sprite.lists,
        [RULES_KEY]: storage[RULES_KEY],
        opcodeSet: Number.isInteger(opcodeSet) ? opcodeSet : markSet(storage),
        levels: Array.isArray(levels) ? levels : []
    };
};

const toHex = buffer => Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

const sha256Hex = text => {
    const subtle = typeof crypto === 'undefined' ? null : crypto.subtle;
    if (!subtle) return Promise.reject(new Error('crypto.subtle is not available'));
    return subtle.digest('SHA-256', new TextEncoder().encode(text)).then(toHex);
};

const hashRules = (sprite, opcodeSet, levels) => sha256Hex(canonical(rulesPayload(sprite, opcodeSet, levels)));

const hasRuleBlocks = sprite => !!(sprite && sprite.blocks && Object.keys(sprite.blocks).length);

export {
    canonical,
    rulesPayload,
    sha256Hex,
    hashRules,
    hasRuleBlocks
};
