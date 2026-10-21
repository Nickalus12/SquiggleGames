import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: variableUnused, DEFAULT_VARIABLE_ID} = await import('./variable-unused.js');
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
const stockModel = (blocks, monitored) => ({
    monitored: monitored || null,
    targets: [
        {id: 'stage', name: 'Stage', isStage: true, blocks: blocks || {},
            variables: {[DEFAULT_VARIABLE_ID]: {name: 'my variable', type: '', value: 0}}},
        {id: 'sprite', name: 'Sprite1', isStage: false, blocks: {}, variables: {}}
    ]
});
ok('the stock project variable alone is not reported', variableUnused(stockModel()).length === 0);
const setOnly = variableUnused(stockModel({
    s1: {id: 's1', opcode: 'data_setvariableto', topLevel: true, inputs: {},
        fields: {VARIABLE: {name: 'VARIABLE', id: DEFAULT_VARIABLE_ID, value: 'my variable'}}}
}));
ok('once a block sets it, the stock variable is checked like any other',
    setOnly.length === 1 && setOnly[0].code === 'variable-unused-set', setOnly.map(entry => entry.code));
ok('a monitored stock variable is fine', variableUnused(stockModel(null, new Set([DEFAULT_VARIABLE_ID]))).length === 0);
const spriteCopy = stockModel();
spriteCopy.targets[1].variables = {[DEFAULT_VARIABLE_ID]: {name: 'my variable', type: '', value: 0}};
ok('the exemption is the stage default only', variableUnused(spriteCopy).length === 1);
done();
