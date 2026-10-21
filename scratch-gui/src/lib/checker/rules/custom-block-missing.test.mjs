import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: customBlockMissing} = await import('./custom-block-missing.js');
const {ok, done} = harness();
const cases = loadFixture('custom-block-missing');

ok('a call with its definition is fine', customBlockMissing(cases.defined).length === 0);
const items = customBlockMissing(cases.missing);
ok('a definition in another sprite does not count', items.length === 1 && items[0].targetId === 'cat', items);
ok('error severity', items[0].severity === 'error');
ok('one item covers every call', items[0].values.count === 2 && items[0].blockId === 'c1');
ok('name reads like the block', items[0].values.name === 'spin () times', items[0].values);
ok('fix removes the calls', items[0].fix === 'remove-calls' && items[0].fixData.blockIds.join() === 'c1,c2');
done();
