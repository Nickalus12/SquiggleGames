import {ok, near, section, done} from './harness.mjs';
import {FLAGS, createGrid, setCell, setFloorHeight, addTexture} from './tilemap.js';
import {moveBy, overlapFlags, onGround, castRay} from './collision.js';
import {openDoorAt, closeDoorAt, stepDoors, doorOpenAt} from './doors.js';

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

section('doors and seethrough collision');
{
    const dGrid = createGrid({cols: 10, rows: 6, tileSize: 32, origin: [0, 0]});
    setCell(dGrid, 'flags', 4, 2, FLAGS.door);
    setCell(dGrid, 'flags', 6, 2, FLAGS.seethrough);
    const runner = cellBox(dGrid, 3, 2, 24, 24);
    const blockedByClosed = moveBy(dGrid, runner, 'x', 64);
    ok('a closed door blocks movement', blockedByClosed.hit === 'right' && near(blockedByClosed.x + 12, 4 * 32));
    openDoorAt(dGrid, 4, 2, {cell: true, holdMs: 3000});
    stepDoors(dGrid, 200);
    ok('half-open door at 200 ms has open fraction 0.5', near(doorOpenAt(dGrid, 4, 2), 0.5));
    const narrow = {x: (3.5 * 32), y: -(2 * 32) - 8, w: 8, h: 8};
    const throughHalf = moveBy(dGrid, narrow, 'x', 64);
    ok('a narrow box in the open half passes a half-open door', throughHalf.hit === null && near(throughHalf.x, narrow.x + 64));
    const wideBlocked = moveBy(dGrid, runner, 'x', 64);
    ok('a wide box is still blocked by a half-open door', wideBlocked.hit === 'right');
    stepDoors(dGrid, 200);
    ok('fully open door at 400 ms has open fraction 1', near(doorOpenAt(dGrid, 4, 2), 1));
    const throughOpen = moveBy(dGrid, runner, 'x', 48);
    ok('an open door allows full-size boxes through', throughOpen.hit === null && near(throughOpen.x, runner.x + 48));
    const hitFence = moveBy(dGrid, {x: 5.5 * 32, y: -(2.5 * 32), w: 24, h: 24}, 'x', 64);
    ok('a seethrough tile still blocks collision', hitFence.hit === 'right' && near(hitFence.x + 12, 6 * 32));
    closeDoorAt(dGrid, 4, 2, {cell: true});
    stepDoors(dGrid, 400);
    ok('closing the door makes it block again', near(doorOpenAt(dGrid, 4, 2), 0) &&
        moveBy(dGrid, runner, 'x', 64).hit === 'right');
}

section('walkable floor elevation, stairs, jump step, and pits');
{
    const eGrid = createGrid({cols: 12, rows: 6, tileSize: 32, origin: [0, 0]});
    const riserTex = addTexture(eGrid, 'riser', FLAGS.solid);
    setCell(eGrid, 'main', 3, 2, riserTex);
    setFloorHeight(eGrid, 3, 2, 0.25);
    setCell(eGrid, 'main', 4, 2, riserTex);
    setFloorHeight(eGrid, 4, 2, 0.5);
    setCell(eGrid, 'main', 5, 2, riserTex);
    setFloorHeight(eGrid, 5, 2, 0.75);
    setCell(eGrid, 'main', 6, 2, riserTex);
    setFloorHeight(eGrid, 6, 2, 1);

    const walker = cellBox(eGrid, 2, 2, 20, 20);
    const stepUp025 = moveBy(eGrid, walker, 'x', 32);
    ok('a 0.25 step up is free even when the cell has a solid riser tile in main',
        stepUp025.hit === null && near(stepUp025.x, walker.x + 32), stepUp025);

    const climbStairs = moveBy(eGrid, walker, 'x', 4 * 32);
    ok('consecutive 0.25 stairs climb freely from 0 to 1.0',
        climbStairs.hit === null && near(climbStairs.x, walker.x + (4 * 32)), climbStairs);

    const ledgeGrid = createGrid({cols: 10, rows: 6, tileSize: 32, origin: [0, 0]});
    const tBrick = addTexture(ledgeGrid, 'brick', FLAGS.solid);
    setCell(ledgeGrid, 'main', 3, 2, tBrick);
    setFloorHeight(ledgeGrid, 3, 2, 0.5);
    setCell(ledgeGrid, 'main', 3, 3, tBrick);
    setFloorHeight(ledgeGrid, 3, 3, 0.75);
    setCell(ledgeGrid, 'main', 3, 4, tBrick);
    setFloorHeight(ledgeGrid, 3, 4, 1);

    const atLedge = cellBox(ledgeGrid, 2, 2, 20, 20);
    const walkInto05 = moveBy(ledgeGrid, atLedge, 'x', 32);
    ok('walking into a 0.5 ledge without jumping is blocked as a wall',
        walkInto05.hit === 'right' && near(walkInto05.x + 10, 3 * 32), walkInto05);

    const jumpInto05 = moveBy(ledgeGrid, atLedge, 'x', 32, {jumping: true});
    ok('a 0.5 step up succeeds when jumping in 3D',
        jumpInto05.hit === null && near(jumpInto05.x, atLedge.x + 32), jumpInto05);

    const at075 = cellBox(ledgeGrid, 2, 3, 20, 20);
    const jumpInto075 = moveBy(ledgeGrid, at075, 'x', 32, {jumping: true});
    ok('a 0.75 step up is blocked as a wall even when jumping',
        jumpInto075.hit === 'right' && near(jumpInto075.x + 10, 3 * 32), jumpInto075);

    const at100 = cellBox(ledgeGrid, 2, 4, 20, 20);
    const jumpInto100 = moveBy(ledgeGrid, at100, 'x', 32, {jumping: true});
    ok('a 1.0 step up is blocked as a wall even when jumping',
        jumpInto100.hit === 'right' && near(jumpInto100.x + 10, 3 * 32), jumpInto100);

    const pitGrid = createGrid({cols: 10, rows: 6, tileSize: 32, origin: [0, 0]});
    setFloorHeight(pitGrid, 3, 2, -0.5);
    setFloorHeight(pitGrid, 3, 3, -1);
    const intoPit = moveBy(pitGrid, cellBox(pitGrid, 2, 2, 20, 20), 'x', 32);
    ok('stepping down into a -0.5 pit is free', intoPit.hit === null && near(intoPit.x, (2.5 * 32) + 32));
    const walkOutOfPit = moveBy(pitGrid, cellBox(pitGrid, 3, 2, 20, 20), 'x', 32);
    ok('walking out of a -0.5 pit without jumping is blocked', walkOutOfPit.hit === 'right');
    const jumpOutOfPit = moveBy(pitGrid, cellBox(pitGrid, 3, 2, 20, 20), 'x', 32, {jumping: true});
    ok('jumping out of a -0.5 pit succeeds', jumpOutOfPit.hit === null);
    const jumpOutOfDeepPit = moveBy(pitGrid, cellBox(pitGrid, 3, 3, 20, 20), 'x', 32, {jumping: true});
    ok('a -1.0 deep pit blocks jumping directly to 0 without stairs', jumpOutOfDeepPit.hit === 'right');
}

done();
