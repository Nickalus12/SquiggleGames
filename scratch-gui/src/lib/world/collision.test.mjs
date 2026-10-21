import {ok, near, section, done} from './harness.mjs';
import {FLAGS, createGrid, setCell, addTexture} from './tilemap.js';
import {moveBy, overlapFlags, onGround, castRay} from './collision.js';

const level = tileSize => {
    const grid = createGrid({cols: 20, rows: 12, tileSize, origin: [0, 0]});
    const wall = addTexture(grid, 'wall', FLAGS.solid);
    const ledge = addTexture(grid, 'ledge', FLAGS.oneway);
    const spikes = addTexture(grid, 'spikes', FLAGS.hazard);
    for (let c = 0; c < 20; c++) setCell(grid, 'main', c, 10, wall);
    for (let r = 0; r < 10; r++) setCell(grid, 'main', 15, r, wall);
    setCell(grid, 'main', 5, 6, ledge);
    setCell(grid, 'main', 6, 6, ledge);
    setCell(grid, 'main', 9, 9, spikes);
    return grid;
};

const cellBox = (grid, col, row, w, h) => ({
    x: (col + 0.5) * grid.tileSize,
    y: -(row + 0.5) * grid.tileSize,
    w: w || grid.tileSize,
    h: h || grid.tileSize
});

[16, 32].forEach(ts => {
    section(`tile size ${ts}`);
    const grid = level(ts);
    const start = cellBox(grid, 2, 9, ts - 2, ts - 2);

    const fall = moveBy(grid, Object.assign({}, start, {y: start.y + (ts * 3)}), 'y', -ts * 5);
    ok('falling stops on the floor top', near(fall.y - ((ts - 2) / 2), -10 * ts) && fall.hit === 'bottom', fall);
    ok('standing on the floor is on the ground', onGround(grid, Object.assign({}, start, {y: fall.y})));
    ok('one pixel up is not on the ground', !onGround(grid, Object.assign({}, start, {y: fall.y + 1})));

    const right = moveBy(grid, start, 'x', ts * 2);
    ok('a short move right is free', near(right.x, start.x + (ts * 2)) && right.hit === null, right);
    const wallHit = moveBy(grid, start, 'x', ts * 40);
    ok('a long move right stops at the wall', near(wallHit.x + ((ts - 2) / 2), 15 * ts) && wallHit.hit === 'right', wallHit);
    [2, 2.5, 3, 7].forEach(mult => {
        const near14 = cellBox(grid, 13, 9, ts - 2, ts - 2);
        const hit = moveBy(grid, near14, 'x', ts * mult);
        ok(`no tunnelling at ${mult}x tile size per step`, hit.x + ((ts - 2) / 2) <= (15 * ts) + 1e-6 && hit.hit === 'right', hit);
    });
    const left = moveBy(grid, start, 'x', -ts * 10);
    ok('moving left past the level edge is free', near(left.x, start.x - (ts * 10)) && left.hit === null, left);
    const flush = {x: (15 * ts) - (ts / 2), y: start.y, w: ts, h: ts - 2};
    const pushed = moveBy(grid, flush, 'x', 3);
    ok('a box flush against a wall cannot move into it', near(pushed.x, flush.x) && pushed.hit === 'right', pushed);
    const backOff = moveBy(grid, flush, 'x', -3);
    ok('a box flush against a wall can move away', near(backOff.x, flush.x - 3) && backOff.hit === null);

    const below = cellBox(grid, 5, 7, ts - 2, ts - 2);
    const up = moveBy(grid, below, 'y', ts * 3);
    ok('oneway lets a jump pass from below', near(up.y, below.y + (ts * 3)) && up.hit === null, up);
    const above = cellBox(grid, 5, 3, ts - 2, ts - 2);
    const land = moveBy(grid, above, 'y', -ts * 6);
    ok('oneway stops a fall from above', near(land.y - ((ts - 2) / 2), -6 * ts) && land.hit === 'bottom', land);
    ok('standing on oneway is on the ground', onGround(grid, Object.assign({}, above, {y: land.y})));
    const sideways = moveBy(grid, cellBox(grid, 3, 6, ts - 2, ts - 2), 'x', ts * 5);
    ok('oneway does not block sideways', sideways.hit === null);
    const inside = {x: (5.5 * ts), y: -(6.5 * ts), w: ts - 2, h: ts - 2};
    const out = moveBy(grid, inside, 'y', -ts);
    ok('a box inside a oneway tile falls out of it', out.hit === null && near(out.y, inside.y - ts), out);

    const ceiling = createGrid({cols: 4, rows: 4, tileSize: ts, origin: [0, 0]});
    setCell(ceiling, 'flags', 1, 0, FLAGS.solid);
    const head = moveBy(ceiling, cellBox(ceiling, 1, 2, ts - 2, ts - 2), 'y', ts * 5);
    ok('jumping into a ceiling stops at its bottom', near(head.y + ((ts - 2) / 2), -ts) && head.hit === 'top', head);

    ok('overlap finds hazard', (overlapFlags(grid, cellBox(grid, 9, 9)) & FLAGS.hazard) !== 0);
    ok('touching edges is not overlap', (overlapFlags(grid, cellBox(grid, 8, 9)) & FLAGS.hazard) === 0);
    ok('zero move changes nothing', moveBy(grid, start, 'x', 0).x === start.x);
});

section('ray cast');
const room = createGrid({cols: 10, rows: 10, tileSize: 32, origin: [0, 0]});
const stone = addTexture(room, 'stone', FLAGS.solid);
for (let i = 0; i < 10; i++) {
    setCell(room, 'main', i, 0, stone);
    setCell(room, 'main', i, 9, stone);
    setCell(room, 'main', 0, i, stone);
    setCell(room, 'main', 9, i, stone);
}
const eye = {x: 5 * 32, y: -5 * 32};
const east = castRay(room, eye.x, eye.y, 1, 0, 1000);
ok('east wall at 4 tiles', near(east.distance, 4 * 32, 0.01) && east.side === 0, east);
const north = castRay(room, eye.x, eye.y, 0, 1, 1000);
ok('north wall at 4 tiles', near(north.distance, 4 * 32, 0.01) && north.side === 1, north);
const diag = castRay(room, eye.x, eye.y, 1, 1, 1000);
ok('diagonal ray is root two longer', near(diag.distance, 4 * 32 * Math.SQRT2, 0.01), diag);
ok('rays stop at the range', castRay(room, eye.x, eye.y, 1, 0, 50) === null);
const open = createGrid({cols: 3, rows: 3, tileSize: 16, origin: [0, 0]});
const edge = castRay(open, 24, -24, -1, 0, 1000);
ok('the level edge counts as a wall', edge.outside && near(edge.distance, 24, 0.01), edge);

done();
