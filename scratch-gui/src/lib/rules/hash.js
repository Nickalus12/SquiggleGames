import schema from './rules-schema.json';
import {RULES_KEY} from '../collab/project-seam.js';

const canonical = value => {
    if (value === null || typeof value === 'undefined') return 'null';
    if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : '0';
    if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (typeof value === 'object') {
        const keys = Object.keys(value)
            .filter(key => typeof value[key] !== 'undefined' && typeof value[key] !== 'function')
            .sort();
        return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return 'null';
};

const rulesPayload = sprite => {
    const storage = (sprite && sprite.extensionStorage) || {};
    return {
        blocks: (sprite && sprite.blocks) || {},
        variables: (sprite && sprite.variables) || {},
        lists: (sprite && sprite.lists) || {},
        [RULES_KEY]: storage[RULES_KEY] || null,
        opcodeSet: schema.opcodeSet
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

const hashRules = sprite => sha256Hex(canonical(rulesPayload(sprite)));

const hasRuleBlocks = sprite => !!(sprite && sprite.blocks && Object.keys(sprite.blocks).length);

export {
    canonical,
    rulesPayload,
    sha256Hex,
    hashRules,
    hasRuleBlocks
};
