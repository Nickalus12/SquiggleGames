import {ok, near, section, done} from './harness.mjs';

const {FLAGS, createGrid, addTexture, getCell, setCell} = await import('./tilemap.js');
const {
    TOOLS, MAX_UNDO, ORIGIN, toStage, toWorld, cellFromClient, cellToClient, line, floodCells, rectCells, createPainter,
    clampZoom, zoomAround, panBy, pinchView, revealCell
} = await import('./painter.js');
const {createTilemapSync, decodeSegments} = await import('./tilemap-sync.js');
const worldUi = (await import('../../reducers/world-ui.js'));
const reduce = worldUi.default;

const fakeWorld = () => {
    const grid = createGrid({id: 'yard', name: 'Yard', cols: 20, rows: 12, tileSize: 16, origin: [-160, 96]});
    addTexture(grid, 'grass', FLAGS.solid);
    addTexture(grid, 'water', 0);
    const listeners = new Map();
    const events = {
        on (name, fn) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(fn);
            return () => listeners.get(name).delete(fn);
        },
        emit (name, payload) {
            (listeners.get(name) || []).forEach(fn => fn(payload));
        }
    };
    const log = [];
    const world = {
        grid,
        log,
        events,
        currentId: () => grid.id,
        level: key => (key === grid.id ? grid : null),
        saveLevel: () => {},
        addTile: (key, name, flags) => addTexture(grid, name, flags),
        paintCells (key, layer, cells, origin) {
            if (key !== grid.id) return [];
            const changed = cells.filter(cell => setCell(grid, layer, cell.col, cell.row, cell.value))
                .map(cell => ({col: cell.col, row: cell.row, value: cell.value}));
            if (changed.length) {
                log.push({layer, origin, count: changed.length});
                events.emit('cells', {level: grid.id, layer, cells: changed, origin: origin || 'local'});
            }
            return changed;
        }
    };
    return world;
};

const count = (grid, layer, value) => grid[layer].reduce((n, v) => n + (v === value ? 1 : 0), 0);

section('coordinates');
{
    const rect = {left: 100, top: 50, width: 960, height: 720};
    const centre = toStage(rect, 580, 410);
    ok('client centre maps to stage 0,0', near(centre.x, 0) && near(centre.y, 0), centre);
    const corner = toStage(rect, 100, 50);
    ok('client top left maps to -240,180', near(corner.x, -240) && near(corner.y, 180), corner);
    const zoomed = toWorld({x: 100, y: -20, zoom: 2}, {x: 40, y: 10});
    ok('stage point under a zoomed camera maps to world', near(zoomed.x, 120) && near(zoomed.y, -15), zoomed);
    const world = fakeWorld();
    const view = {x: 0, y: 0, zoom: 1};
    const cell = cellFromClient(world.grid, view, rect, 100 + 2 + ((80 + 8) * 2), 50 + 2 + ((84 + 8) * 2));
    ok('cellFromClient finds the cell under the pointer', cell && cell.col === 0 && cell.row === 0, cell);
    ok('outside the level gives null', cellFromClient(world.grid, view, rect, 101, 51) === null);
    const box = cellToClient(world.grid, view, rect, 0, 0);
    ok('cellToClient inverts cellFromClient', near(box.left, 160) && near(box.top, 168) && near(box.width, 32), box);
    const panned = {x: 32, y: 0, zoom: 2};
    const box2 = cellToClient(world.grid, panned, rect, 3, 0);
    const back = cellFromClient(world.grid, panned, rect, rect.left + box2.left + 1, rect.top + box2.top + 1);
    ok('round trip under a panned zoomed camera', back && back.col === 3 && back.row === 0, back);
}

section('painter view');
{
    const view = {x: 10, y: -20, zoom: 1};
    const zoomed = zoomAround(view, {x: 60, y: 30}, 2);
    const before = toWorld(view, {x: 60, y: 30});
    const after = toWorld(zoomed, {x: 60, y: 30});
    ok('zoom keeps the world point under the pointer', near(before.x, after.x) && near(before.y, after.y), zoomed);
    ok('zoom clamps to the painter range', clampZoom(100) === 8 && clampZoom(0.01) === 0.25 && clampZoom('x') === 1);
    const panned = panBy({x: 0, y: 0, zoom: 2}, 40, -20);
    ok('drag moves the world with the finger', near(panned.x, -20) && near(panned.y, 10) && panned.zoom === 2, panned);
    const from = {a: {x: -20, y: 0}, b: {x: 20, y: 0}};
    const to = {a: {x: -30, y: 10}, b: {x: 50, y: 10}};
    const pinched = pinchView(view, from, to);
    const anchor = toWorld(view, {x: 0, y: 0});
    const moved = toWorld(pinched, {x: 10, y: 10});
    ok('pinch scales by the finger spread', near(pinched.zoom, 2), pinched);
    ok('pinch keeps the world point between the fingers', near(anchor.x, moved.x) && near(anchor.y, moved.y), moved);
    ok('pinch with touching fingers keeps the zoom', pinchView(view, {a: {x: 0, y: 0}, b: {x: 0, y: 0}}, to).zoom === 1);
    const big = createGrid({id: 'big', name: 'Big', cols: 100, rows: 100, tileSize: 16, origin: [-240, 180]});
    const home = {x: 0, y: 0, zoom: 1};
    ok('a cell already in view keeps the view', revealCell(big, home, 2, 2) === home);
    const right = revealCell(big, home, 40, 2);
    const shown = cellToClient(big, right, {left: 0, top: 0, width: 480, height: 360}, 40, 2);
    ok('a cell off the right edge pans it into view', shown.left >= 0 && near(shown.left + shown.width, 480), shown);
    const down = revealCell(big, home, 2, 60);
    const low = cellToClient(big, down, {left: 0, top: 0, width: 480, height: 360}, 2, 60);
    ok('a cell below the view pans it into view', near(low.top + low.height, 360), low);
    const far = cellFromClient(big, right, {left: 0, top: 0, width: 480, height: 360}, shown.left + 1, shown.top + 1);
    ok('cells past the stage are reachable through the painter view', far && far.col === 40 && far.row === 2, far);
}

section('geometry');
{
    const diag = line({col: 0, row: 0}, {col: 4, row: 2});
    ok('line runs end to end without gaps', diag.length === 5 && diag[4].col === 4 && diag[4].row === 2, diag);
    ok('line to itself is one cell', line({col: 3, row: 3}, {col: 3, row: 3}).length === 1);
    const world = fakeWorld();
    for (let c = 0; c < 20; c++) setCell(world.grid, 'main', c, 5, 1);
    const above = floodCells(world.grid, 'main', 0, 0);
    ok('flood fill stops at a wall row', above.length === 100, above.length);
    ok('rect clamps to the level', rectCells(world.grid, {col: -3, row: -3}, {col: 1, row: 1}).length === 4);
}

section('strokes go through the world');
{
    const world = fakeWorld();
    let changes = 0;
    const painter = createPainter({world, onChange: () => changes++});
    const settings = {layer: 'main', tile: 2, flag: 'solid'};
    painter.begin('paint', settings, {col: 1, row: 1});
    painter.move({col: 5, row: 1});
    painter.end({col: 5, row: 1});
    ok('paint drag fills the dragged row', count(world.grid, 'main', 2) === 5, count(world.grid, 'main', 2));
    ok('every write carries the painter origin', world.log.every(entry => entry.origin === ORIGIN), world.log);
    ok('a stroke is one undo step', painter.canUndo() && changes === 1);
    const undos = painter.canUndo();
    painter.begin('paint', settings, {col: 1, row: 4});
    painter.move({col: 3, row: 4});
    ok('discard drops a stroke a second finger interrupts', painter.discard() === true &&
        getCell(world.grid, 'main', 1, 4) === 0 && getCell(world.grid, 'main', 3, 4) === 0 && !painter.stroking());
    ok('a discarded stroke leaves no undo step', painter.canUndo() === undos && painter.discard() === false);
    painter.begin('erase', settings, {col: 3, row: 1});
    painter.end({col: 3, row: 1});
    ok('erase clears a cell', getCell(world.grid, 'main', 3, 1) === 0);
    painter.undo();
    ok('undo restores the erased cell', getCell(world.grid, 'main', 3, 1) === 2);
    painter.undo();
    ok('undo again removes the painted row', count(world.grid, 'main', 2) === 0);
    ok('redo is available after undo', painter.canRedo());
    painter.redo();
    ok('redo repaints the row', count(world.grid, 'main', 2) === 5);
    painter.begin('paint', settings, {col: 0, row: 9});
    painter.end();
    ok('a new stroke clears redo', !painter.canRedo());
}

section('fill, rect, pick, flag, spawn');
{
    const world = fakeWorld();
    const painter = createPainter({world});
    const settings = {layer: 'back', tile: 1, flag: 'hazard'};
    const fill = painter.begin('fill', settings, {col: 0, row: 0});
    ok('fill finishes in one press', fill.done && !painter.stroking());
    ok('fill covers the empty layer', count(world.grid, 'back', 1) === 240);
    painter.undo();
    ok('fill undoes in one step', count(world.grid, 'back', 1) === 0);
    painter.begin('rect', {layer: 'front', tile: 2}, {col: 2, row: 2});
    painter.move({col: 4, row: 3});
    ok('rect previews without writing', count(world.grid, 'front', 2) === 0 && painter.preview().last.col === 4);
    painter.end({col: 4, row: 3});
    ok('rect writes the box on release', count(world.grid, 'front', 2) === 6);
    const picked = painter.begin('pick', {layer: 'front'}, {col: 3, row: 3});
    ok('pick reads the tile under the cursor', picked.value === 2 && !painter.stroking());
    painter.begin('flag', settings, {col: 7, row: 7});
    painter.move({col: 8, row: 7});
    painter.end();
    ok('flag stroke sets the bit on fresh cells', getCell(world.grid, 'flags', 8, 7) === FLAGS.hazard);
    painter.begin('flag', settings, {col: 7, row: 7});
    painter.end();
    ok('flag stroke starting on a set cell clears it', getCell(world.grid, 'flags', 7, 7) === 0 &&
        getCell(world.grid, 'flags', 8, 7) === FLAGS.hazard);
    setCell(world.grid, 'flags', 9, 7, FLAGS.solid);
    painter.begin('flag', settings, {col: 9, row: 7});
    painter.end();
    ok('flag keeps the other bits', getCell(world.grid, 'flags', 9, 7) === (FLAGS.solid | FLAGS.hazard));
    painter.begin('spawn', settings, {col: 0, row: 0});
    const spawn = painter.end({col: 0, row: 0});
    ok('spawn returns the cell centre', spawn.point.x === -152 && spawn.point.y === 88, spawn);
    painter.begin('bounds', settings, {col: 2, row: 1});
    painter.move({col: 11, row: 6});
    ok('bounds previews as a box', painter.preview().tool === 'bounds');
    const before = world.log.length;
    const framed = painter.end({col: 11, row: 6});
    ok('bounds writes no cells', world.log.length === before);
    ok('bounds covers whole cells in world units', framed.bounds.left === -128 && framed.bounds.right === 32 &&
        framed.bounds.top === 80 && framed.bounds.bottom === -16, framed.bounds);
    ok('unknown tools are refused', painter.begin('lasso', settings, {col: 0, row: 0}) === null);
    ok('all design tools are listed', ['paint', 'erase', 'fill', 'rect', 'pick', 'flag', 'spawn', 'bounds']
        .every(tool => TOOLS.indexOf(tool) !== -1));
}

section('undo stack is bounded');
{
    const world = fakeWorld();
    const painter = createPainter({world});
    for (let i = 0; i < MAX_UNDO + 20; i++) {
        painter.begin('paint', {layer: 'main', tile: (i % 2) + 1}, {col: i % 20, row: Math.floor(i / 20) % 12});
        painter.end();
    }
    let steps = 0;
    while (painter.undo()) steps++;
    ok('undo depth caps at MAX_UNDO', steps === MAX_UNDO, steps);
    const noop = createPainter({world: fakeWorld()});
    noop.begin('paint', {layer: 'main', tile: 1}, {col: 0, row: 0});
    noop.end();
    noop.begin('paint', {layer: 'main', tile: 1}, {col: 0, row: 0});
    noop.end();
    const first = noop.undo();
    ok('a stroke that changes nothing adds no undo step', first && !noop.canUndo());
}

section('strokes reach tilemap-sync');
{
    const world = fakeWorld();
    const sent = [];
    const timers = [];
    const sync = createTilemapSync({
        world,
        send: patch => sent.push(patch),
        author: 'alpha',
        setTimer: fn => timers.push(fn) && timers.length,
        clearTimer: () => {}
    });
    const painter = createPainter({world});
    painter.begin('paint', {layer: 'main', tile: 1}, {col: 0, row: 2});
    painter.move({col: 3, row: 2});
    painter.end();
    ok('a stroke queues cells in the sync', sync.pendingCells() === 4, sync.pendingCells());
    sync.flush();
    ok('flush sends one tilemap patch', sent.length === 1 && sent[0].layers.main.length === 1, sent);
    const cells = decodeSegments(sent[0].layers.main, 1);
    ok('patch carries the stroke cells', cells.length === 4 && cells.every(c => c.row === 2 && c.value === 1), cells);
    painter.undo();
    sync.flush();
    ok('undo is sent as its own patch', sent.length === 2 && decodeSegments(sent[1].layers.main, 0).length === 4);
    sync.dispose();
}

section('world-ui reducer');
{
    let state = reduce(undefined, {type: '@@INIT'});
    ok('painter starts closed on the paint tool', !state.painterOpen && state.tool === 'paint' && state.layer === 'main');
    state = reduce(state, worldUi.setPainterOpen(true));
    ok('open toggles', state.painterOpen);
    const same = reduce(state, worldUi.setPainterOpen(true));
    ok('same value keeps identity', same === state);
    ok('unknown tool is ignored', reduce(state, worldUi.setPainterTool('lasso')) === state);
    state = reduce(state, worldUi.setPainterTool('fill'));
    ok('known tool is set', state.tool === 'fill');
    ok('layer must be a paint layer', reduce(state, worldUi.setPainterLayer('flags')) === state);
    state = reduce(state, worldUi.setPainterTile('3.7'));
    ok('tile is a positive integer', state.tile === 3);
    state = reduce(state, worldUi.setPainterFlag('goal'));
    ok('flag names come from tilemap FLAGS', state.flag === 'goal');
    ok('bad flag is ignored', reduce(state, worldUi.setPainterFlag('lava')) === state);
}

done();
