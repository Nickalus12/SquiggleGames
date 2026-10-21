import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: bigAsset, COSTUME_BUDGET, SOUND_BUDGET} = await import('./big-asset.js');
const {ok, done} = harness();
const cases = loadFixture('big-asset');

const items = bigAsset(cases.assets);
ok('budgets are 1 MB for costumes and 2 MB for sounds', COSTUME_BUDGET === 1048576 && SOUND_BUDGET === 2097152);
ok('one costume and one sound over budget, exactly at budget is fine', items.length === 2, items.map(entry => entry.values));
const photo = items.find(entry => entry.code === 'big-asset-costume');
ok('costume item names it with its size', photo.values.name === 'photo' && photo.values.kb === 3072);
const song = items.find(entry => entry.code === 'big-asset-sound');
ok('sound item names it', song.values.name === 'song' && song.fixData.index === 1);
ok('info, no fix', items.every(entry => entry.severity === 'info' && entry.fix === null));
done();
