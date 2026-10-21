import {blocksOf, fieldId, fieldValue, menuValue} from './model.js';

const SENDERS = Object.freeze([
    {opcode: 'event_broadcast', input: 'BROADCAST_INPUT'},
    {opcode: 'event_broadcastandwait', input: 'BROADCAST_INPUT'},
    {opcode: 'squiggletools_broadcastWithData', input: 'MESSAGE'}
]);

const RECEIVER = 'event_whenbroadcastreceived';

const scanBroadcasts = model => {
    const sent = [];
    const received = [];
    let dynamic = false;
    for (const target of model.targets) {
        for (const sender of SENDERS) {
            for (const block of blocksOf(target, sender.opcode)) {
                if (block.shadow) continue;
                const found = menuValue(target.blocks, block, sender.input);
                if (!found) continue;
                if (found.dynamic) {
                    dynamic = true;
                    continue;
                }
                if (!found.value) continue;
                sent.push({target, block, name: found.value, broadcastId: found.id});
            }
        }
        for (const block of blocksOf(target, RECEIVER)) {
            const name = fieldValue(block, 'BROADCAST_OPTION');
            if (name) received.push({target, block, name, broadcastId: fieldId(block, 'BROADCAST_OPTION')});
        }
    }
    return {sent, received, dynamic};
};

const nameKey = name => String(name).toUpperCase();

export {SENDERS, RECEIVER, scanBroadcasts, nameKey};
