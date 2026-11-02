import {ok, section, done} from './harness.mjs';
import {
    FLAGS, FLAG_MASK, MAX_SIZE, encodeRow, decodeRow, createGrid, encodeLevel, cloneGrid, setCell, getCell, flagsAt,
    flagBit, heightAt, setHeight, floorHeightAt, setFloorHeight, clampFloorHeight, cellAt, cellCenter, levelRect,
    tileIndex, addTexture, base64, solidBits, toRulesLevel, solidRows
} from './tilemap.js';

section('RLE rows');
const row = Uint8Array.from([0, 0, 0, 3, 3, 1, 0, 0]);
const encoded = encodeRow(row, 0, row.length);
ok('encodes runs as value, count pairs', JSON.stringify(encoded) === '[0,3,3,2,1,1,0,2]', encoded);
const back = new Uint8Array(row.length);
ok('decodes a full row', decodeRow(encoded, back, 0, back.length, 48));
ok('round trip is exact', back.every((v, i) => v === row[i]));
const short = new Uint8Array(4);
ok('a short row reports incomplete', decodeRow([5, 2], short, 0, 4, 48) === false);
ok('values over the cap decode as empty', (() => {
    const c = new Uint8Array(3);
    decodeRow([99, 3], c, 0, 3, 48);
    return c.every(v => v === 0);
})());
ok('junk rows decode as empty', (() => {
    const c = new Uint8Array(3);
    decodeRow('nope', c, 0, 3, 48);
    return c.every(v => v === 0);
})());

section('levels');
const grid = createGrid({id: 'cave', cols: 10, rows: 6, tileSize: 32, tileset: 'Tiles'});
ok('defaults origin to the stage top left', grid.origin[0] === -240 && grid.origin[1] === 180);
ok('size is clamped to 128', createGrid({cols: 500, rows: 900}).cols === MAX_SIZE);
ok('tile size falls back to 16', createGrid({tileSize: 20}).tileSize === 16);
const wall = addTexture(grid, 'wall', FLAGS.solid);
const lava = addTexture(grid, 'lava', FLAGS.hazard);
ok('textures get 1-based ids', wall === 1 && lava === 2);
ok('adding a known texture returns its id', addTexture(grid, 'WALL') === 1);
ok('textures cap at 48', (() => {
    const g = createGrid({});
    for (let i = 0; i < 60; i++) addTexture(g, `t${i}`);
    return g.tiles.length === 48 && addTexture(g, 'extra') === 0;
})());
for (let c = 0; c < 10; c++) setCell(grid, 'main', c, 5, wall);
setCell(grid, 'main', 4, 4, lava);
setCell(grid, 'flags', 7, 2, FLAGS.goal);
setCell(grid, 'back', 1, 1, 2);
setCell(grid, 'front', 2, 3, 1);
setCell(grid, 'floor', 3, 2, 1);
setCell(grid, 'ceiling', 4, 1, 2);
setCell(grid, 'light', 5, 2, 45);
ok('light defaults to 100 and clamps 0..100', getCell(grid, 'light', 0, 0) === 100 &&
    getCell(grid, 'light', 5, 2) === 45 &&
    (setCell(grid, 'light', 6, 2, 250), getCell(grid, 'light', 6, 2) === 100) &&
    getCell(grid, 'light', -1, 0) === 100);
ok('floor and ceiling default to 0 and store tile ids', getCell(grid, 'floor', 0, 0) === 0 &&
    getCell(grid, 'floor', 3, 2) === 1 && getCell(grid, 'ceiling', 4, 1) === 2);
ok('setCell reports no change for the same value', setCell(grid, 'main', 0, 5, wall) === false);
ok('setCell refuses cells outside', setCell(grid, 'main', 10, 0, 1) === false);
ok('tile flags come from the texture', (flagsAt(grid, 3, 5) & FLAGS.solid) !== 0);
ok('cell flags add to tile flags', flagsAt(grid, 7, 2) === FLAGS.goal && flagsAt(grid, 4, 4) === FLAGS.hazard);
ok('outside cells have no flags', flagsAt(grid, -1, 0) === 0);

const stored = encodeLevel(grid);
const json = JSON.stringify(stored);
const again = createGrid(JSON.parse(json));
ok('level round trips through JSON', JSON.stringify(encodeLevel(again)) === json);
ok('every layer survives', ['back', 'main', 'front', 'floor', 'ceiling', 'light', 'flags'].every(name =>
    again[name].every((v, i) => v === grid[name][i])));
const legacyRaw = JSON.parse(json);
delete legacyRaw.layers.floor;
delete legacyRaw.layers.ceiling;
delete legacyRaw.layers.light;
const legacyGrid = createGrid(legacyRaw);
ok('legacy level without floor, ceiling, or light loads with flat defaults',
    legacyGrid.floor.every(v => v === 0) &&
    legacyGrid.ceiling.every(v => v === 0) &&
    legacyGrid.light.every(v => v === 100));
ok('stored rows are RLE', stored.layers.main[5].length === 2 && stored.layers.main[5][1] === 10);
const big = createGrid({cols: 128, rows: 128, tileSize: 16});
for (let i = 0; i < 128; i++) setCell(big, 'main', i, i, 1);
const bigJson = JSON.stringify(encodeLevel(big));
ok('a 128 x 128 level round trips', JSON.stringify(encodeLevel(createGrid(JSON.parse(bigJson)))) === bigJson);
const copy = cloneGrid(grid);
setCell(copy, 'main', 0, 0, 2);
ok('clone does not share cells', getCell(grid, 'main', 0, 0) === 0 && getCell(copy, 'main', 0, 0) === 2);

section('coordinates');
const at = cellAt(grid, -240 + 33, 180 - 65);
ok('cellAt maps world to column and row', at.col === 1 && at.row === 2, at);
const centre = cellCenter(grid, 1, 2);
ok('cellCenter is inside the cell', cellAt(grid, centre.x, centre.y).col === 1 && cellAt(grid, centre.x, centre.y).row === 2);
const rect = levelRect(grid);
ok('levelRect spans cols times tile size', rect.right - rect.left === 320 && rect.top - rect.bottom === 192);
ok('tileIndex takes names, numbers and empty', tileIndex(grid, 'Lava') === 2 && tileIndex(grid, 1) === 1 &&
    tileIndex(grid, 'empty') === 0 && tileIndex(grid, 'missing') === -1 && tileIndex(grid, '2') === 2);

section('rules level for the server');
ok('base64 matches the standard alphabet', base64(Uint8Array.from([77, 97, 110])) === 'TWFu' &&
    base64(Uint8Array.from([77, 97])) === 'TWE=' && base64(Uint8Array.from([77])) === 'TQ==');
const bits = solidBits(grid);
ok('solid bitset is row major, low bit first', bits[(5 * 10) >> 3] & (1 << ((5 * 10) & 7)));
const rules = toRulesLevel(grid, true);
ok('rules level carries id, cols, rows, tile and origin', rules.id === 'cave' && rules.cols === 10 &&
    rules.rows === 6 && rules.tile === 32 && rules.origin[1] === 180);
ok('solid is base64 of the bitset', rules.solid === base64(bits));
ok('solid is left out unless asked', !('solid' in toRulesLevel(grid, false)));
ok('flag rows are RLE of effective flags', solidRows(grid)[5][0] === FLAGS.solid && solidRows(grid)[5][1] === 10);

section('door, seethrough, and heights');
ok('door and seethrough flags are 16 and 32 with mask 63', FLAGS.door === 16 && FLAGS.seethrough === 32 && FLAG_MASK === 63);
ok('flagBit resolves door and see-through aliases', flagBit('door') === FLAGS.door &&
    flagBit('seethrough') === FLAGS.seethrough && flagBit('see-through') === FLAGS.seethrough);
const hGrid = createGrid({id: 'heights', cols: 6, rows: 4, tileSize: 32});
addTexture(hGrid, 'lowwall', FLAGS.solid, 0.5);
setCell(hGrid, 'main', 1, 1, 1);
ok('tile height comes from texture when cell height is unset', heightAt(hGrid, 1, 1) === 0.5 && heightAt(hGrid, 0, 0) === 1);
setHeight(hGrid, 2, 1, 2.5);
setHeight(hGrid, 3, 1, 0.1);
setHeight(hGrid, 4, 1, 9);
ok('cell height clamps between 0.25 and 4', heightAt(hGrid, 2, 1) === 2.5 &&
    heightAt(hGrid, 3, 1) === 0.25 && heightAt(hGrid, 4, 1) === 4);
const hStored = encodeLevel(hGrid);
const hBack = createGrid(JSON.parse(JSON.stringify(hStored)));
ok('heights round trip through encodeLevel', heightAt(hBack, 1, 1) === 0.5 &&
    heightAt(hBack, 2, 1) === 2.5 && heightAt(hBack, 3, 1) === 0.25 && heightAt(hBack, 4, 1) === 4);
setHeight(hBack, 2, 1, 0);
ok('setting height to 0 clears cell override', heightAt(hBack, 2, 1) === 1);

setFloorHeight(hGrid, 1, 2, 0.25);
setFloorHeight(hGrid, 2, 2, 0.5);
setFloorHeight(hGrid, 3, 2, 2.7);
setFloorHeight(hGrid, 4, 2, -0.5);
setFloorHeight(hGrid, 5, 2, -3);
ok('floorHeightAt defaults to 0 and clamps -1..2 in 0.25 steps',
    floorHeightAt(hGrid, 0, 2) === 0 &&
    floorHeightAt(hGrid, 1, 2) === 0.25 &&
    floorHeightAt(hGrid, 2, 2) === 0.5 &&
    floorHeightAt(hGrid, 3, 2) === 2 &&
    floorHeightAt(hGrid, 4, 2) === -0.5 &&
    floorHeightAt(hGrid, 5, 2) === -1 &&
    clampFloorHeight(0.37) === 0.25 &&
    clampFloorHeight(0.38) === 0.5);
const fhStored = encodeLevel(hGrid);
const fhBack = createGrid(JSON.parse(JSON.stringify(fhStored)));
ok('floorHeights round trip through encodeLevel',
    floorHeightAt(fhBack, 1, 2) === 0.25 &&
    floorHeightAt(fhBack, 2, 2) === 0.5 &&
    floorHeightAt(fhBack, 3, 2) === 2 &&
    floorHeightAt(fhBack, 4, 2) === -0.5 &&
    floorHeightAt(fhBack, 5, 2) === -1);
setFloorHeight(fhBack, 2, 2, 0);
ok('setting floorHeight to 0 clears cell floor elevation', floorHeightAt(fhBack, 2, 2) === 0);

done();
