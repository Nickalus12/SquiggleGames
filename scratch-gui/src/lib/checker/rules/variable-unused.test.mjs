import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: variableUnused} = await import('./variable-unused.js');
const {ok, done} = harness();
const cases = loadFixture('variable-unused');

ok('read, monitored, sensed and cloud variables are fine', variableUnused(cases.used).length === 0,
    variableUnused(cases.used).map(entry => entry.values));
const items = variableUnused(cases.unused);
ok('lists are left alone, two variables reported', items.length === 2, items.map(entry => entry.values));
const never = items.find(entry => entry.values.name === 'never');
ok('a variable with no blocks can be deleted', never.fix === 'delete-variable' &&
    never.fixData.variableId === 'g1' && never.fixData.targetId === 'stage');
ok('it says the stage owns it', never.values.sprite === 'Stage' && never.code === 'variable-unused');
const written = items.find(entry => entry.values.name === 'written');
ok('set but never read has its own words and no fix', written.code === 'variable-unused-set' && written.fix === null);
ok('info severity', items.every(entry => entry.severity === 'info'));
ok('Game Rules values are read by name on the server, so skipped', variableUnused(cases.rules).length === 0);
done();
