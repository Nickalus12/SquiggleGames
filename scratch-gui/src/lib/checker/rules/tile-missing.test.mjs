import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: tileMissing} = await import('./tile-missing.js');
const {ok, done} = harness();
const cases = loadFixture('tile-missing');

ok('reports nothing without window.SquiggleWorld lists', tileMissing(cases.noWorld).length === 0);
const items = tileMissing(cases.world);
ok('a missing level and two missing tiles', items.length === 3, items.map(entry => entry.values));
const level = items.find(entry => entry.code === 'tile-missing-level');
ok('level names checked ignoring case', level && level.blockId === 'lvl' && level.values.name === 'Moon');
ok('no level fix unless the world can create levels', level.fix === null);
const tile = items.find(entry => entry.values.name === 'lava');
ok('tileset costumes, numbers and empty count as tiles', tile && tile.blockId === 'tile' && tile.code === 'tile-missing');
ok('a costume of a sprite that is not a tileset is not a tile', items.some(entry => entry.values.name === 'cat-a'));
ok('tile fix when the world can create tiles', tile.fix === 'create-tile' && tile.fixData.name === 'lava');
ok('error severity', items.every(entry => entry.severity === 'error'));
const partial = tileMissing(cases.levelsOnly);
ok('with only a level list, tiles are not guessed', partial.length === 1 && partial[0].code === 'tile-missing-level');
done();
