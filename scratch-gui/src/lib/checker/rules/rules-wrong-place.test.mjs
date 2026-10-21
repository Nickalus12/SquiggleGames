import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: rulesWrongPlace} = await import('./rules-wrong-place.js');
const {ok, done} = harness();
const cases = loadFixture('rules-wrong-place');

ok('reports nothing until rules-schema.json is available', rulesWrongPlace(cases.noSchema).length === 0);
const items = rulesWrongPlace(cases.places);
const by = code => items.filter(entry => entry.code === `rules-${code}`);
ok('every item is an error', items.length > 0 && items.every(entry => entry.severity === 'error'));
const outside = by('outside');
ok('gold blocks outside Game Rules are reported', outside.length === 2, outside);
const hat = outside.find(entry => entry.blockId === 'goldHat');
ok('a gold hat stack can be moved into Game Rules', hat.fix === 'move-to-rules' &&
    hat.fixData.rulesTargetId === 'rules' && hat.fixData.targetId === 'cat');
ok('a gold block inside another stack has no fix', outside.find(entry => entry.blockId === 'goldInner').fix === null);
const unsupported = by('unsupported').map(entry => entry.blockId).sort();
ok('device-only blocks and disallowed field values are unsupported', unsupported.join() === 'say,stopall', unsupported);
ok('a stage variable in Game Rules is global-var', by('global-var').map(entry => entry.blockId).join() === 'glob');
const names = by('name');
ok('an unknown game value name is reported', names.length === 1 && names[0].blockId === 'badname' &&
    names[0].values.name === 'gems');
ok('custom blocks calling each other in a circle', by('cycle').map(entry => entry.blockId).sort().join() === 'defA,defB');
const limit = by('limit');
ok('more game values and teams than the limits', limit.map(entry => `${entry.values.limit}:${entry.values.max}`).sort().join() ===
    'teams:1,vars:2', limit.map(entry => entry.values));
ok('no too-big under the sprite budget', by('too-big').length === 0);
const lone = rulesWrongPlace(cases.noRulesSprite);
ok('with no Game Rules sprite a gold block is reported without a fix', lone.length === 1 && lone[0].fix === null);
done();
