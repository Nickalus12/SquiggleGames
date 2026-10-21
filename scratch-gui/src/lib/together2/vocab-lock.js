import {VOCAB_LOCK} from './net.js';

const LOCKED_NAME_INPUTS = Object.freeze({
    together_broadcastGameMessage: 'NAME',
    together_setSharedVariable: 'NAME',
    together_changeSharedVariable: 'NAME',
    together_tellGame: 'NAME'
});

const DIGIT_RUN = new RegExp(`\\d{${VOCAB_LOCK.digitRun},}`);

const lockReason = text => {
    if (typeof text !== 'string') return null;
    if (text.length > VOCAB_LOCK.text) return 'long';
    if (DIGIT_RUN.test(text)) return 'digits';
    return null;
};

const literalText = (blocks, input) => {
    const block = blocks[input.shadow];
    const field = block && block.shadow && block.fields && block.fields.TEXT;
    return field && typeof field.value === 'string' ? field.value : null;
};

const lockedNames = runtime => {
    const found = [];
    const seen = new Set();
    (runtime && runtime.targets ? runtime.targets : []).forEach(target => {
        if (!target.isOriginal || !target.blocks || !target.blocks._blocks) return;
        const blocks = target.blocks._blocks;
        Object.keys(blocks).forEach(id => {
            const block = blocks[id];
            const inputName = block && LOCKED_NAME_INPUTS[block.opcode];
            if (!inputName || !block.inputs) return;
            const input = block.inputs[inputName];
            if (!input || (input.block && input.block !== input.shadow)) return;
            const name = literalText(blocks, input);
            const reason = lockReason(name);
            if (!reason || seen.has(name)) return;
            seen.add(name);
            found.push({name, reason, blockId: id, target: target.getName()});
        });
    });
    return found;
};

export {
    LOCKED_NAME_INPUTS,
    lockReason,
    lockedNames
};
