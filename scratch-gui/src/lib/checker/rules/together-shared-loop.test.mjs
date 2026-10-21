import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: togetherSharedLoop} = await import('./together-shared-loop.js');
const {ok, done} = harness();
const cases = loadFixture('together-shared-loop');

const items = togetherSharedLoop(cases.everyFrame);
ok('a shared variable set in a bare forever is reported', items.length === 1 && items[0].blockId === 'set');
ok('names the variable, warn, no fix', items[0].values.name === 'x' && items[0].severity === 'warn' && items[0].fix === null);
ok('a wait, an if, or a counted repeat is fine', togetherSharedLoop(cases.fine).length === 0,
    togetherSharedLoop(cases.fine));
done();
