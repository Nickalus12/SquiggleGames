import {item} from '../model.js';
import {nameKey, scanBroadcasts} from '../broadcasts.js';

const RULE = 'message-not-sent';

const messageNotSent = model => {
    const {sent, received, dynamic} = scanBroadcasts(model);
    if (dynamic) return [];
    const spoken = new Set(sent.map(entry => nameKey(entry.name)));
    return received
        .filter(entry => !spoken.has(nameKey(entry.name)))
        .map(entry => item(RULE, 'info', {
            targetId: entry.target.id,
            blockId: entry.block.id,
            values: {message: entry.name}
        }));
};

messageNotSent.rule = RULE;
messageNotSent.severity = 'info';

export default messageNotSent;
