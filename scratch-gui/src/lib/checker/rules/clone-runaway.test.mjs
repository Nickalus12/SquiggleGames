import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: cloneRunaway} = await import('./clone-runaway.js');
const {ok, done} = harness();
const cases = loadFixture('clone-runaway');

ok('clones that delete themselves are fine', cloneRunaway(cases.deletes).length === 0);
ok('a short repeat or no loop is fine', cloneRunaway(cases.bounded).length === 0);
const items = cloneRunaway(cases.runaway);
ok('a forever loop cloning a sprite with no delete is reported', items.length === 1 && items[0].blockId === 'make');
ok('names the cloned sprite, warn, no fix', items[0].values.sprite === 'Star' && items[0].severity === 'warn' && items[0].fix === null);
const big = cloneRunaway(cases.bigRepeat);
ok('a repeat past 100 counts as a runaway', big.length === 1 && big[0].blockId === 'many');
done();
