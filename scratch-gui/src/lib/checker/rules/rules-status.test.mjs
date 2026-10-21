import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: rulesStatus} = await import('./rules-status.js');
const {ok, done} = harness();
const cases = loadFixture('rules-status');

ok('no status, nothing reported', rulesStatus(cases.none).length === 0);
const items = rulesStatus(cases.errors);
ok('compile and run errors both listed', items.length === 3, items.map(entry => entry.code));
const limit = items.find(entry => entry.code === 'rules-limit');
ok('limit carries its detail for the kid words', limit.values.limit === 'timers' && limit.values.max === 16 &&
    limit.blockId === 'b1' && limit.targetId === 'rules');
const repeat = items.find(entry => entry.code === 'rules-loop-cap');
ok('repeat counts carried as n', repeat.values.n === 4);
ok('an error with no block points at the Game Rules sprite', items.find(entry => entry.code === 'rules-too-big').blockId === null);
ok('errors, no fix', items.every(entry => entry.severity === 'error' && entry.fix === null));
ok('local results belong to rules-wrong-place, not repeated here', rulesStatus(cases.local).length === 0);
done();
