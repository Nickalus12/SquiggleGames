import {item} from '../model.js';
import {nameKey, scanBroadcasts} from '../broadcasts.js';

const RULE = 'message-not-received';

const messageNotReceived = model => {
    const {sent, received} = scanBroadcasts(model);
    const heard = new Set(received.map(entry => nameKey(entry.name)));
    const reported = new Set();
    const items = [];
    for (const entry of sent) {
        const key = nameKey(entry.name);
        if (heard.has(key) || reported.has(key)) continue;
        reported.add(key);
        items.push(item(RULE, 'warn', {
            targetId: entry.target.id,
            blockId: entry.block.id,
            keyPart: key,
            values: {message: entry.name},
            fix: 'add-receiver',
            fixData: {targetId: entry.target.id, name: entry.name, broadcastId: entry.broadcastId}
        }));
    }
    return items;
};

messageNotReceived.rule = RULE;
messageNotReceived.severity = 'warn';

export default messageNotReceived;
