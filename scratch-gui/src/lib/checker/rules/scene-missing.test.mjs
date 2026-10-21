import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: sceneMissing} = await import('./scene-missing.js');
const {ok, done} = harness();
const cases = loadFixture('scene-missing');

ok('reports nothing without window.SquiggleWorld lists', sceneMissing(cases.noWorld).length === 0);
const items = sceneMissing(cases.scenes);
ok('one item per missing name per sprite, any scene and computed names skipped', items.length === 2,
    items.map(entry => entry.values));
const boss = items.find(entry => entry.values.name === 'Boss');
ok('points at the first use', boss.blockId === 'bad' && boss.targetId === 'cat');
ok('hat fields are checked', items.some(entry => entry.blockId === 'hat'));
ok('error, fix creates the scene when the world can', boss.severity === 'error' &&
    boss.fix === 'create-scene' && boss.fixData.name === 'Boss');
ok('no fix when the world cannot create scenes', sceneMissing(cases.noCreate)[0].fix === null);
done();
