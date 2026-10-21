import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: messageNotSent} = await import('./message-not-sent.js');
const {ok, done} = harness();
const cases = loadFixture('message-not-sent');

ok('a sent message is fine', messageNotSent(cases.paired).length === 0);
const items = messageNotSent(cases.orphan);
ok('a receiver nothing sends is reported', items.length === 1 && items[0].blockId === 'hat1' && items[0].targetId === 'dog');
ok('info severity and no fix', items[0].severity === 'info' && items[0].fix === null);
ok('names the message', items[0].values.message === 'lose');
ok('any computed broadcast silences the rule', messageNotSent(cases.dynamic).length === 0);
done();
