import {ok, section, done} from './harness.mjs';
import {
    FLAGS, MAX_SIZE, encodeRow, decodeRow, createGrid, encodeLevel, cloneGrid, setCell, getCell, flagsAt,
    cellAt, cellCenter, levelRect, tileIndex, addTexture, base64, solidBits, toRulesLevel, solidRows
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
ok('setCell reports no change for the same value', setCell(grid, 'main', 0, 5, wall) === false);
ok('setCell refuses cells outside', setCell(grid, 'main', 10, 0, 1) === false);
ok('tile flags come from the texture', (flagsAt(grid, 3, 5) & FLAGS.solid) !== 0);
ok('cell flags add to tile flags', flagsAt(grid, 7, 2) === FLAGS.goal && flagsAt(grid, 4, 4) === FLAGS.hazard);
ok('outside cells have no flags', flagsAt(grid, -1, 0) === 0);

const stored = encodeLevel(grid);
const json = JSON.stringify(stored);
const again = createGrid(JSON.parse(json));
ok('level round trips through JSON', JSON.stringify(encodeLevel(again)) === json);
ok('every layer survives', ['back', 'main', 'front', 'flags'].every(name =>
    again[name].every((v, i) => v === grid[name][i])));
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

done();
