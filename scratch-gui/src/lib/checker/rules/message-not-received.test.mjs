import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: messageNotReceived} = await import('./message-not-received.js');
const {ok, done} = harness();
const cases = loadFixture('message-not-received');

ok('a heard broadcast is fine, names match like the VM ignoring case', messageNotReceived(cases.paired).length === 0);
const items = messageNotReceived(cases.missing);
ok('one item per unheard message name', items.length === 2, items.map(entry => entry.values));
const win = items.find(entry => entry.values.message === 'win');
ok('points at the first sender', win && win.blockId === 'send1' && win.targetId === 'cat');
ok('warn severity', win.severity === 'warn');
ok('fix adds a receiver in that sprite', win.fix === 'add-receiver' &&
    win.fixData.targetId === 'cat' && win.fixData.name === 'win' && win.fixData.broadcastId === 'm2');
const score = items.find(entry => entry.values.message === 'score');
ok('broadcast with data counts as a sender', score && score.blockId === 'send2' && score.fixData.broadcastId === null);
ok('a reporter in the broadcast slot is not reported', messageNotReceived(cases.dynamic).length === 0);
done();
