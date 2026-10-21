import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: squiggleOnly} = await import('./squiggle-only.js');
const {ok, done} = harness();
const cases = loadFixture('squiggle-only');

ok('Scratch blocks are fine', squiggleOnly(cases.plain).length === 0);
const items = squiggleOnly(cases.mixed);
ok('one item per kit per sprite, menu shadows not counted', items.length === 2, items.map(entry => entry.values));
const tools = items.find(entry => entry.blockId === 't1');
ok('uses the kit name and counts its blocks', tools.values.kit === 'Game Tools' && tools.values.count === 2);
const together = items.find(entry => entry.blockId === 'g1');
ok('falls back to the id', together.values.kit === 'together');
ok('info, no fix', items.every(entry => entry.severity === 'info' && entry.fix === null));
done();
