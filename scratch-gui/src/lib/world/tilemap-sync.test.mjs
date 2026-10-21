import {createRequire} from 'node:module';
import {ok, section, done, stubRenderer} from './harness.mjs';

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');
const RenderWebGL = require('scratch-render/src/RenderWebGL.js');
const twgl = createRequire(require.resolve('scratch-render/src/RenderWebGL.js'))('twgl.js');

vmLog.warn = () => {};
vmLog.info = () => {};
globalThis.document = {hidden: true};

const {installWorldSeams} = await import('./seams.js');
const {getWorld, extendSeam} = await import('./world.js');
const {FLAGS, createGrid, addTexture, setCell, encodeLevel, getCell} = await import('./tilemap.js');
const {PATCH_TYPE, MAX_RUNS, MAX_BYTES, encodeSegments, decodeSegments, readPatch, compareStamp, createTilemapSync} =
    await import('./tilemap-sync.js');

const level = textures => {
    const grid = createGrid({id: 'yard', name: 'Yard', cols: 128, rows: 128, tileSize: 16});
    textures.forEach(([name, flags]) => addTexture(grid, name, flags));
    for (let c = 0; c < 128; c++) setCell(grid, 'main', c, 120, 1);
    return grid;
};

const project = textures => ({
    targets: [{
        isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
        currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
        videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
    }],
    monitors: [],
    extensions: [],
    extensionStorage: {squiggleworld: {format: 1, levels: [encodeLevel(level(textures))]}},
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const peer = async (author, textures) => {
    const vm = new VM();
    await vm.loadProject(JSON.stringify(project(textures || [['grass', FLAGS.solid], ['brick', FLAGS.solid]])));
    const world = getWorld(vm.runtime, {createCanvas: () => null, loadImage: () => null});
    const timers = [];
    const outbox = [];
    const sync = createTilemapSync({
        world,
        author,
        send: patch => outbox.push(JSON.parse(JSON.stringify(patch))),
        setTimer: (fn, ms) => timers.push({fn, ms}) - 1,
        clearTimer: id => {
            if (timers[id]) timers[id].fn = null;
        }
    });
    const tick = () => timers.splice(0).forEach(t => t.fn && t.fn());
    return {vm, world, sync, outbox, timers, tick};
};

const cellsOf = (world, layer) => {
    const grid = world.level('yard');
    const out = [];
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            const v = getCell(grid, layer, col, row);
            out.push(layer === 'flags' || !v ? v : grid.tiles[v - 1].name);
        }
    }
    return out.join();
};

const same = (a, b) => ['back', 'main', 'front', 'flags'].every(layer => cellsOf(a.world, layer) === cellsOf(b.world, layer));

section('rle segments');
const segs = encodeSegments([
    {col: 3, row: 1, value: 2}, {col: 1, row: 1, value: 2}, {col: 2, row: 1, value: 2},
    {col: 9, row: 1, value: 0}, {col: 0, row: 4, value: 1}, {col: 1, row: 4, value: 3}
]);
ok('contiguous cells share a segment and equal values a run', JSON.stringify(segs) === '[[1,1,2,3],[1,9,0,1],[4,0,1,1,3,1]]',
    segs);
ok('segments decode back to the cells', decodeSegments(segs, 3).length === 6);
ok('a value past the palette is rejected', decodeSegments([[0, 0, 4, 1]], 3) === null);
ok('a run past the row end is rejected', decodeSegments([[0, 120, 1, 9]], 3) === null);
ok('a negative row is rejected', decodeSegments([[-1, 0, 1, 1]], 3) === null);
ok('a fractional count is rejected', decodeSegments([[0, 0, 1, 1.5]], 3) === null);
ok('stamps order by base, then author, then seq', compareStamp([1, 'b', 0], [2, 'a', 0]) < 0 &&
    compareStamp([1, 'b', 0], [1, 'a', 9]) > 0 && compareStamp([1, 'a', 1], [1, 'a', 2]) < 0);

section('patch validation');
const good = {type: PATCH_TYPE, level: 'yard', base: 0, author: 'x', seq: 0, palette: [{name: 'grass', flags: 1}],
    layers: {main: [[0, 0, 1, 2]]}};
ok('a well formed patch reads', readPatch(good) !== null);
ok('an unknown layer is rejected', readPatch(Object.assign({}, good, {layers: {sky: [[0, 0, 1, 1]]}})) === null);
ok('a wrong type is rejected', readPatch(Object.assign({}, good, {type: 'snapshot'})) === null);
ok('a missing base is rejected', readPatch(Object.assign({}, good, {base: '1'})) === null);
ok('a palette entry without a name is rejected', readPatch(Object.assign({}, good, {palette: [{flags: 1}]})) === null);
ok('flags values go up to the flag mask', readPatch(Object.assign({}, good, {layers: {flags: [[0, 0, 15, 1]]}})) &&
    readPatch(Object.assign({}, good, {layers: {flags: [[0, 0, 16, 1]]}})) === null);

section('local edits coalesce at 50 ms');
const a = await peer('alice');
const b = await peer('bob');
a.world.paintCells('yard', 'main', [{col: 1, row: 1, value: 1}, {col: 2, row: 1, value: 1}]);
a.world.paintCells('yard', 'main', [{col: 2, row: 1, value: 2}, {col: 3, row: 1, value: 2}]);
a.world.paintCells('yard', 'flags', [{col: 5, row: 5, value: FLAGS.goal}]);
ok('nothing is sent before the timer fires', a.outbox.length === 0 && a.sync.pendingCells() === 4);
ok('one timer at 50 ms for the whole window', a.timers.length === 1 && a.timers[0].ms === 50);
a.tick();
const p1 = a.outbox[0];
ok('one patch for the window', a.outbox.length === 1 && p1.type === 'tilemap-patch' && p1.level === 'yard');
ok('the patch carries the base version and author', p1.base === 0 && p1.author === 'alice' && p1.seq === 0);
ok('the latest value per cell wins inside the window', JSON.stringify(p1.layers.main) === '[[1,1,1,1,2,2]]',
    p1.layers.main);
ok('texture values travel as palette names', p1.palette.map(t => t.name).join() === 'grass,brick');
ok('flags travel as raw bits', JSON.stringify(p1.layers.flags) === '[[5,5,8,1]]');
ok('the sender version moves to 1 and is saved', a.world.level('yard').v === 1 &&
    a.vm.runtime.extensionStorage.squiggleworld.levels[0].v === 1);
ok('a one cell edit is a small frame, never a snapshot', JSON.stringify(p1).length < 220, JSON.stringify(p1).length);

section('apply');
const r1 = b.sync.apply(p1);
ok('the receiver applies the patch', r1.ok && r1.changed === 4 && r1.v === 1, r1);
ok('both peers hold the same level', same(a, b));
ok('a remote apply does not echo', (b.tick(), b.outbox.length === 0) && b.timers.length === 0);
const r2 = b.sync.apply(p1);
ok('applying the same patch twice changes nothing', r2.ok && r2.changed === 0 && r2.v === 1 && same(a, b));
ok('an unknown level asks for a resync', b.sync.apply(Object.assign({}, p1, {level: 'nope'})).reason === 'unknown-level');
ok('a malformed patch is refused', b.sync.apply({type: PATCH_TYPE}).ok === false);

section('palette names map to local indexes');
const c = await peer('carol', [['brick', FLAGS.solid], ['grass', FLAGS.solid]]);
c.sync.apply(p1);
const nameAt = (w, col, row) => {
    const grid = w.level('yard');
    const v = getCell(grid, 'main', col, row);
    return v ? grid.tiles[v - 1].name : '';
};
ok('a peer with textures in another order paints the same names', [1, 2, 3].every(col =>
    nameAt(c.world, col, 1) === nameAt(a.world, col, 1)) && nameAt(c.world, 1, 1) === 'grass');
const fresh = {type: PATCH_TYPE, level: 'yard', base: 1, author: 'alice', seq: 9,
    palette: [{name: 'lava', flags: FLAGS.hazard}], layers: {main: [[7, 7, 1, 1]]}};
c.sync.apply(fresh);
const cGrid = c.world.level('yard');
ok('a texture the receiver lacks is added with its flags', cGrid.tiles.some(t => t.name === 'lava' && t.flags === FLAGS.hazard) &&
    cGrid.tiles[getCell(cGrid, 'main', 7, 7) - 1].name === 'lava');

section('concurrent edits converge in any order');
const x = await peer('xena');
const y = await peer('yuri');
x.world.paintCells('yard', 'main', [{col: 10, row: 10, value: 1}, {col: 11, row: 10, value: 1}]);
y.world.paintCells('yard', 'main', [{col: 10, row: 10, value: 2}]);
x.tick();
y.tick();
const px = x.outbox.shift();
const py = y.outbox.shift();
ok('both patches share base 0', px.base === 0 && py.base === 0);
x.sync.apply(py);
y.sync.apply(px);
ok('crossed patches converge', same(x, y), [getCell(x.world.level('yard'), 'main', 10, 10), getCell(y.world.level('yard'), 'main', 10, 10)]);
ok('the higher author wins a tie on base', x.world.level('yard').tiles[getCell(x.world.level('yard'), 'main', 10, 10) - 1].name ===
    'brick');
const z1 = await peer('zed');
const z2 = await peer('zed2');
z1.sync.apply(px);
z1.sync.apply(py);
z2.sync.apply(py);
z2.sync.apply(px);
ok('a third peer gets the same level in either order', same(z1, z2) && same(z1, x));

section('older patches lose to newer ones');
const s = await peer('sam');
const t = await peer('tess');
s.world.paintCells('yard', 'main', [{col: 0, row: 0, value: 1}]);
s.tick();
s.world.paintCells('yard', 'main', [{col: 0, row: 0, value: 2}]);
s.tick();
const [s1, s2] = s.outbox.splice(0);
ok('versions climb per patch', s1.base === 0 && s2.base === 1 && s.world.level('yard').v === 2);
const late = t.sync.apply(s2);
ok('a patch ahead of the receiver flags a gap', late.gap === true);
t.sync.apply(s1);
ok('the late older patch does not undo the newer one', same(s, t) && t.world.level('yard').v === 2);

section('a pending local stroke wins and still converges');
const m = await peer('mia');
const n = await peer('ned');
n.world.paintCells('yard', 'main', [{col: 4, row: 4, value: 1}]);
n.tick();
const pn = n.outbox.shift();
m.world.paintCells('yard', 'main', [{col: 4, row: 4, value: 2}]);
const rm = m.sync.apply(pn);
ok('the incoming write to a pending cell is skipped', rm.changed === 0 &&
    getCell(m.world.level('yard'), 'main', 4, 4) === 2);
m.tick();
const pm = m.outbox.shift();
ok('the local patch goes out on top of the version it saw', pm.base === 1);
n.sync.apply(pm);
ok('both end on the local stroke', same(m, n));

section('a whole-level fill splits into bounded frames');
const f = await peer('fill');
const g = await peer('grid');
const all = [];
for (let row = 0; row < 128; row++) {
    for (let col = 0; col < 128; col++) all.push({col, row, value: ((col + row) % 2) + 1});
}
f.world.paintCells('yard', 'main', all);
f.tick();
const parts = f.outbox.splice(0);
const runsIn = p => Object.values(p.layers).reduce((sum, list) => sum + list.reduce((k, seg) => k + ((seg.length - 2) / 2), 0), 0);
ok('a checkerboard fill splits into several patches', parts.length > 1 && parts.every(p => runsIn(p) <= MAX_RUNS),
    parts.map(runsIn));
ok('each part takes the next version', parts.every((p, i) => p.base === i) && f.world.level('yard').v === parts.length);
parts.slice().reverse()
    .forEach(p => g.sync.apply(p));
ok('the parts rebuild the level in any order', same(f, g) && g.world.level('yard').v === parts.length);

section('frames stay under the 32 KB relay cap');
const names = [];
for (let i = 0; i < 48; i++) names.push([`${String(i).padStart(2, '0')}${'w'.repeat(98)}`, FLAGS.solid]);
const wide = await peer('wide', names);
const wideTo = await peer('wideto', names);
const sparse = [];
for (let row = 0; row < 128; row++) {
    for (let col = 0; col < 128; col += 2) sparse.push({col, row, value: 10 + ((col + row) % 39)});
}
wide.world.paintCells('yard', 'front', sparse);
wide.tick();
const wideParts = wide.outbox.splice(0);
const sizes = wideParts.map(p => JSON.stringify(p).length);
ok('sparse cells with long texture names split under the cap', wideParts.length > 1 &&
    sizes.every(size => size <= MAX_BYTES && size <= 32 * 1024), sizes);
wideParts.forEach(p => wideTo.sync.apply(p));
ok('the size split still rebuilds the level', same(wide, wideTo));

section('seam and dispose');
const vm2 = new VM();
vm2.attachRenderer(stubRenderer(RenderWebGL, twgl));
const seam = installWorldSeams(vm2);
extendSeam(seam);
await vm2.loadProject(JSON.stringify(project([['grass', 1]])));
const wire = [];
const connected = seam.connectTilemap(patch => wire.push(patch), {author: 'seam', delay: 0});
getWorld(vm2.runtime).paintCells('yard', 'main', [{col: 0, row: 0, value: 1}]);
connected.flush();
ok('SquiggleWorld.connectTilemap wires a sync to the live world', wire.length === 1 && wire[0].author === 'seam');
connected.dispose();
getWorld(vm2.runtime).paintCells('yard', 'main', [{col: 1, row: 0, value: 1}]);
ok('dispose stops listening', connected.pendingCells() === 0 && connected.flush() === 0);

done();
