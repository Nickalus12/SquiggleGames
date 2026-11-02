import {ok, near, section, done} from './harness.mjs';

const {FLAGS, HEIGHT_ANIM_MS, addTexture, animateHeightAt, createGrid, flagsAt, floorHeightAt, heightAt, lightAt,
    renderedHeightAt, setCell, setFloorHeight, setHeight} = await import('./tilemap.js');
const {OPEN_MS, HOLD_MS, MAX_DOORS, openDoorAt, closeDoorAt, stepDoors, doorOpenAt, setDoorProgress,
    isDoorOpenAt, encodeDoorValues, applyDoorValues} = await import('./doors.js');
const ray = await import('./raycast.js');
const {facingCostume} = await import('./view3d.js');

const {WIDTH, HEIGHT, MAX_LIGHTS, MAX_SEETHROUGH, DEFAULT_DOOR_TEXTURE, basis, castRay, castRayMulti,
    createFrame, markCellDirty, createLightBuffer, updateLightBuffer, drawSurfaces, drawFloorElevations, drawWalls,
    facingIndex, gridMap, parseColor, pickCrosshair, pixel, mixColors,
    fogEnd, render, toCell, fromCell, clampFov, clampEye, clampFog, clampFalloff,
    lightFalloffFactor, horizonOf, wrapDegrees} = ray;

const room = (cols, rows, options) => {
    const opts = options || {};
    const grid = createGrid({id: 'box',
        name: 'Box',
        cols,
        rows,
        tileSize: opts.tileSize || 32,
        origin: opts.origin || [-240, 180]});
    if (opts.texture) addTexture(grid, 'brick', FLAGS.solid);
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            if (col === 0 || row === 0 || col === cols - 1 || row === rows - 1) {
                if (opts.texture) setCell(grid, 'main', col, row, 1);
                else setCell(grid, 'flags', col, row, FLAGS.solid);
            }
        }
    }
    return grid;
};

const mapOf = grid => gridMap(grid, flagsAt, FLAGS.solid);

const boxDistance = (cols, rows, u, v, rx, ry) => {
    const hits = [];
    if (rx > 0) hits.push((cols - 1 - u) / rx);
    if (rx < 0) hits.push((1 - u) / rx);
    if (ry > 0) hits.push((rows - 1 - v) / ry);
    if (ry < 0) hits.push((1 - v) / ry);
    return Math.min(...hits);
};

const solidImage = (w, h, color) => {
    const data = new Uint32Array(w * h);
    data.fill(color);
    return {width: w, height: h, data};
};

const RED = pixel(220, 30, 30);
const BLUE = pixel(30, 30, 220);

section('helpers');
ok('pixel packs RGBA little endian', pixel(1, 2, 3) === (((255 << 24) | (3 << 16) | (2 << 8) | 1) >>> 0));
ok('parseColor reads #rrggbb', parseColor('#ff8000', 0) === pixel(255, 128, 0));
ok('parseColor reads a number', parseColor(0x00ff00, 0) === pixel(0, 255, 0));
ok('parseColor keeps fallback on junk', parseColor('nope', 7) === 7);
ok('fov clamps', clampFov(5) === ray.MIN_FOV && clampFov(500) === ray.MAX_FOV && clampFov('x') === ray.DEFAULT_FOV);
ok('eye height clamps 5 to 95', clampEye(0) === ray.MIN_EYE && clampEye(100) === ray.MAX_EYE &&
    clampEye('x') === ray.DEFAULT_EYE);
ok('fog clamps 0 to 100', clampFog(-5) === 0 && clampFog(500) === 100 && clampFog('x') === 0);
ok('fog 100 ends at 3 cells, fog 1 near 40', near(fogEnd(100), 3) && near(fogEnd(1), 39.63));
ok('wrapDegrees keeps -180..180', wrapDegrees(270) === -90 && wrapDegrees(-270) === 90 && wrapDegrees(180) === 180);
const grid0 = room(10, 10);
const cell0 = toCell(grid0, -240 + 48, 180 - 80);
ok('toCell maps stage to cells', near(cell0.u, 1.5) && near(cell0.v, 2.5), cell0);
const back = fromCell(grid0, cell0.u, cell0.v);
ok('fromCell inverts toCell', near(back.x, -192) && near(back.y, 100), back);
const b90 = basis(90, 66);
ok('direction 90 faces +u', near(b90.dir.x, 1) && near(b90.dir.y, 0));
const b0 = basis(0, 66);
ok('direction 0 faces up the stage (-v)', near(b0.dir.x, 0) && near(b0.dir.y, -1));
ok('plane is perpendicular to dir', near((b0.dir.x * b0.plane.x) + (b0.dir.y * b0.plane.y), 0));

section('wall distances within 1%');
{
    const cols = 24;
    const rows = 18;
    const map = mapOf(room(cols, rows));
    const spots = [[5.5, 4.5], [12.25, 9.75], [2.1, 15.7], [20.9, 1.3]];
    let worst = 0;
    let rays = 0;
    for (const [u, v] of spots) {
        for (let deg = -180; deg < 180; deg += 7.5) {
            const view = basis(deg, 66);
            for (let x = 0; x < WIDTH; x += 17) {
                const camX = ((2 * (x + 0.5)) / WIDTH) - 1;
                const rx = view.dir.x + (view.plane.x * camX);
                const ry = view.dir.y + (view.plane.y * camX);
                const hit = castRay(map, u, v, rx, ry);
                const want = boxDistance(cols, rows, u, v, rx, ry);
                const err = Math.abs(hit.dist - want) / want;
                worst = Math.max(worst, err);
                rays++;
            }
        }
    }
    ok(`${rays} rays from 4 spots stay within 1% of the analytic distance`, worst < 0.01, worst);
    const reused = {};
    const again = castRay(map, 5.5, 4.5, 1, 0, reused);
    ok('castRay fills the hit object it is given', again === reused && near(reused.dist, cols - 1 - 5.5, 1e-9));
}

section('fisheye correction');
{
    const grid = room(41, 12);
    const frame = createFrame();
    const scene = {map: mapOf(grid), player: {u: 20.5, v: 5.5, direction: 0}, fov: 66, floor: BLUE, ceiling: RED};
    render(frame, scene);
    const heights = Array.from(frame.heights);
    const lo = Math.min(...heights);
    const hi = Math.max(...heights);
    ok('a flat wall seen head on has equal column heights', (hi - lo) / hi < 1e-6, [lo, hi]);
    ok('perpendicular distance is 4.5 cells in every column', Array.from(frame.zbuffer).every(d => near(d, 4.5, 1e-5)));
    const focal = basis(0, 66).focal;
    ok('column height is focal / distance', near(hi, focal / 4.5, 1e-3), [hi, focal / 4.5]);
    const turned = createFrame();
    render(turned, Object.assign({}, scene, {player: {u: 20.5, v: 5.5, direction: 20}}));
    const left = turned.heights[10];
    const right = turned.heights[WIDTH - 10];
    ok('turning right brings the left side of the wall nearer', left > right, [left, right]);
    const mid = Array.from(turned.heights.slice(20, WIDTH - 20));
    const monotonic = mid.every((h, i) => i === 0 || h <= mid[i - 1] + 1e-6);
    ok('heights fall monotonically across an angled flat wall', monotonic);
}

section('frame contents');
{
    const grid = room(16, 16, {texture: true});
    const frame = createFrame();
    const tex = solidImage(8, 8, pixel(200, 100, 50));
    const scene = {
        map: mapOf(grid),
        player: {u: 8, v: 8, direction: 90},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        texture: value => (value === 1 ? tex : null)
    };
    render(frame, scene);
    ok('top row is ceiling', frame.pixels[0] === RED);
    ok('bottom row is floor', frame.pixels[(HEIGHT - 1) * WIDTH] === BLUE);
    ok('centre is textured wall', frame.pixels[(90 * WIDTH) + 120] === pixel(200, 100, 50));
    const flat = createFrame();
    render(flat, Object.assign({}, scene, {texture: () => null, wallColor: () => pixel(10, 20, 30)}));
    ok('missing texture falls back to a flat colour', flat.pixels[(90 * WIDTH) + 120] === pixel(10, 20, 30));
    const side = createFrame();
    render(side, Object.assign({}, scene, {texture: () => null,
        wallColor: () => pixel(100, 100, 100),
        player: {u: 8, v: 8, direction: 0}}));
    ok('walls facing along v are shaded darker', side.pixels[(90 * WIDTH) + 120] === pixel(72, 72, 72),
        side.pixels[(90 * WIDTH) + 120].toString(16));
}

section('billboards and the z-buffer');
{
    const grid = room(20, 20);
    setCell(grid, 'flags', 10, 5, FLAGS.solid);
    const map = mapOf(grid);
    const frame = createFrame();
    const near1 = {name: 'Near', u: 10.5, v: 8.5, image: solidImage(8, 8, RED), height: 1};
    const far1 = {name: 'Far', u: 10.5, v: 3.5, image: solidImage(8, 8, BLUE), height: 1};
    const base = {map, player: {u: 10.5, v: 12.5, direction: 0}, fov: 66, floor: 0, ceiling: 0};
    const r1 = render(frame, Object.assign({}, base, {sprites: [far1, near1]}));
    ok('the nearer billboard is in the crosshair', r1.crosshair === 'Near', r1.crosshair);
    ok('the billboard draws at the centre', frame.pixels[(HEIGHT / 2 * WIDTH) + 120] === RED);
    const r2 = render(frame, Object.assign({}, base, {sprites: [far1]}));
    const blue = Array.from(frame.pixels).filter(c => c === BLUE).length;
    ok('a billboard behind a wall is hidden', blue === 0 && r2.crosshair === '', [blue, r2.crosshair]);
    const r3 = render(frame, Object.assign({}, base, {player: {u: 10.5, v: 12.5, direction: 180}, sprites: [near1]}));
    ok('a billboard behind the player is skipped', r3.crosshair === '' &&
        !Array.from(frame.pixels).some(c => c === RED));
    const holey = solidImage(8, 8, RED);
    holey.data.fill(0, 0, 32);
    const half = {name: 'Half', u: 10.5, v: 8.5, image: holey, height: 1};
    const r4 = render(frame, Object.assign({}, base, {sprites: [half]}));
    ok('transparent texels do not cover the wall', r4.crosshair === 'Half' &&
        frame.pixels[(Math.floor((HEIGHT / 2) - 10) * WIDTH) + 120] !== RED);
    const off = render(frame, Object.assign({}, base, {sprites: [{name: 'Side',
        u: 12,
        v: 8.5,
        image: solidImage(8, 8, RED),
        height: 1}]}));
    ok('a billboard off centre is drawn but not in the crosshair', off.crosshair === '' &&
        Array.from(frame.pixels).some(c => c === RED));
}

section('billboard columns match the rays');
{
    const grid = room(20, 20);
    const map = mapOf(grid);
    const frame = createFrame();
    const player = {u: 10.5, v: 12.5, direction: 0};
    const view = basis(player.direction, 66);
    const spot = {u: 11.5, v: 8.5};
    let best = -1;
    let bestMiss = Infinity;
    const cellCols = [];
    for (let x = 0; x < WIDTH; x++) {
        const camX = ((2 * (x + 0.5)) / WIDTH) - 1;
        const rx = view.dir.x + (view.plane.x * camX);
        const ry = view.dir.y + (view.plane.y * camX);
        const len = Math.hypot(rx, ry);
        const miss = Math.abs(((spot.u - player.u) * ry) - ((spot.v - player.v) * rx)) / len;
        if (miss < bestMiss) {
            bestMiss = miss;
            best = x;
        }
        const pillar = room(20, 20);
        setCell(pillar, 'flags', 11, 8, FLAGS.solid);
        const hit = castRay(mapOf(pillar), player.u, player.v, rx, ry);
        if (hit && hit.col === 11 && hit.row === 8) cellCols.push(x);
    }
    const thin = solidImage(2, 64, RED);
    render(frame, {map, player, fov: 66, floor: 0, ceiling: 0,
        sprites: [{name: 'Pole', u: spot.u, v: spot.v, image: thin, height: 1}]});
    const drawn = [];
    for (let x = 0; x < WIDTH; x++) {
        if (frame.pixels[((HEIGHT / 2) * WIDTH) + x] === RED) drawn.push(x);
    }
    const centre = (drawn[0] + drawn[drawn.length - 1]) / 2;
    ok('the billboard centre is the column whose ray passes through it', Math.abs(centre - best) <= 1,
        [centre, best]);
    ok('every drawn column is one whose ray hits the billboard cell', drawn.length > 0 &&
        drawn.every(x => cellCols.indexOf(x) !== -1), [drawn[0], drawn[drawn.length - 1], cellCols[0],
        cellCols[cellCols.length - 1]]);
}

section('eye height');
{
    const grid = room(41, 12);
    const scene = {map: mapOf(grid), player: {u: 20.5, v: 5.5, direction: 0}, fov: 66, floor: BLUE, ceiling: RED,
        wallColor: () => pixel(10, 20, 30)};
    const column = frame => {
        let top = -1;
        let bottom = -1;
        for (let y = 0; y < HEIGHT; y++) {
            if (frame.pixels[(y * WIDTH) + 120] === ray.shade(pixel(10, 20, 30), 0.72)) {
                if (top === -1) top = y;
                bottom = y;
            }
        }
        return {top, bottom};
    };
    const mid = createFrame();
    render(mid, scene);
    const low = createFrame();
    render(low, Object.assign({}, scene, {eye: 20}));
    const high = createFrame();
    render(high, Object.assign({}, scene, {eye: 80}));
    const m = column(mid);
    const l = column(low);
    const h = column(high);
    ok('eye height 50 centres the wall on the horizon', Math.abs((HEIGHT / 2 - m.top) - (m.bottom + 1 - HEIGHT / 2)) <= 1,
        m);
    ok('a low eye sees more wall above the horizon', l.top < m.top && l.bottom < m.bottom, [l, m]);
    ok('a high eye sees more wall below the horizon', h.top > m.top && h.bottom > m.bottom, [h, m]);
    const floorFrame = createFrame();
    const flat = {name: 'Flat', u: 20.5, v: 2.5, image: solidImage(8, 8, BLUE), height: 0.25};
    render(floorFrame, Object.assign({}, scene, {floor: 0, eye: 80, sprites: [flat]}));
    let foot = -1;
    for (let y = 0; y < HEIGHT; y++) if (floorFrame.pixels[(y * WIDTH) + 120] === BLUE) foot = y;
    const focal = basis(0, 66).focal;
    ok('a billboard stands on the floor at its depth', Math.abs(foot + 1 - ((HEIGHT / 2) + (0.8 * focal / 3))) <= 1,
        [foot, (HEIGHT / 2) + (0.8 * focal / 3)]);
    const raised = createFrame();
    render(raised, Object.assign({}, scene, {floor: 0, eye: 80, sprites: [Object.assign({}, flat, {elevation: 0.5})]}));
    let lifted = -1;
    for (let y = 0; y < HEIGHT; y++) if (raised.pixels[(y * WIDTH) + 120] === BLUE) lifted = y;
    ok('3D height lifts a billboard by wall heights', Math.abs((foot - lifted) - (0.5 * focal / 3)) <= 1,
        [foot, lifted]);
}

section('fog');
{
    const grid = room(41, 12);
    const wall = pixel(200, 200, 200);
    const scene = {map: mapOf(grid), player: {u: 20.5, v: 5.5, direction: 0}, fov: 66, floor: BLUE, ceiling: RED,
        wallColor: () => wall};
    const clear = createFrame();
    render(clear, scene);
    ok('fog 0 leaves walls and floor untouched', clear.pixels[(90 * WIDTH) + 120] === ray.shade(wall, 0.72) &&
        clear.pixels[(HEIGHT - 1) * WIDTH] === BLUE);
    const thick = createFrame();
    render(thick, Object.assign({}, scene, {fog: 100}));
    const fogColor = mixColors(BLUE, RED);
    ok('a wall past the fog end is the fog colour', thick.pixels[(90 * WIDTH) + 120] === fogColor,
        thick.pixels[(90 * WIDTH) + 120].toString(16));
    ok('the fog colour mixes floor and ceiling', fogColor === pixel(125, 30, 125), fogColor.toString(16));
    const light = createFrame();
    render(light, Object.assign({}, scene, {fog: 50}));
    const near1 = light.pixels[(HEIGHT - 1) * WIDTH];
    const far1 = light.pixels[((HEIGHT / 2) + 2) * WIDTH];
    ok('floor rows fade with distance', near1 !== far1 && near1 !== BLUE && (far1 & 255) > (near1 & 255),
        [near1.toString(16), far1.toString(16)]);
    const top = light.pixels[0];
    ok('ceiling rows fade too', top !== RED);
}

section('wall texels');
{
    const grid = room(16, 16, {texture: true});
    const glass = solidImage(8, 8, 0);
    const scene = {map: mapOf(grid), player: {u: 8, v: 8, direction: 90}, fov: 66, floor: BLUE, ceiling: RED,
        texture: () => glass};
    const frame = createFrame();
    render(frame, scene);
    ok('a transparent texel below the horizon shows the floor', frame.pixels[(100 * WIDTH) + 120] === BLUE);
    ok('a transparent texel above the horizon shows the ceiling', frame.pixels[(80 * WIDTH) + 120] === RED);
    const tinted = solidImage(8, 8, ((200 << 24) | (10 << 16) | (20 << 8) | 30) >>> 0);
    render(frame, Object.assign({}, scene, {texture: () => tinted}));
    ok('a part-alpha texel is written opaque', (frame.pixels[(90 * WIDTH) + 120] >>> 24) === 255);
}

section('8-direction facing');
ok('viewer in front gives 0', facingIndex(90, {x: 10, y: 0}) === 0);
ok('viewer on the sprite left gives 2, its left side shows', facingIndex(90, {x: 0, y: 10}) === 2);
ok('viewer behind gives 4', facingIndex(90, {x: -10, y: 0}) === 4);
ok('viewer on the sprite right gives 6, its right side shows', facingIndex(90, {x: 0, y: -10}) === 6);
ok('front left diagonal gives 1', facingIndex(0, {x: -10, y: 10}) === 1);
ok('front right diagonal gives 7', facingIndex(0, {x: 10, y: 10}) === 7);
ok('back diagonals give 3 and 5', facingIndex(0, {x: -10, y: -10}) === 3 && facingIndex(0, {x: 10, y: -10}) === 5);
ok('rounding snaps to the nearest 45', facingIndex(0, {x: Math.sin(0.3), y: Math.cos(0.3)}) === 0 &&
    facingIndex(0, {x: Math.sin(0.5), y: Math.cos(0.5)}) === 7);
{
    const costumes = ['guard-1', 'guard-2', 'guard-3', 'guard-4', 'guard-5', 'guard-6', 'guard-7', 'guard-8']
        .map(name => ({name}));
    const target = {x: 0, y: 0, direction: 90, currentCostume: 0, getCostumes: () => costumes};
    ok('facingCostume picks guard-1 from in front', facingCostume(target, {x: 50, y: 0}).name === 'guard-1');
    ok('facingCostume picks guard-5 from behind', facingCostume(target, {x: -50, y: 0}).name === 'guard-5');
    ok('facingCostume picks guard-3 from the sprite left', facingCostume(target, {x: 0, y: 50}).name === 'guard-3');
    ok('facingCostume picks guard-7 from the sprite right', facingCostume(target, {x: 0, y: -50}).name === 'guard-7');
    ok('facingCostume picks guard-2 from front left', facingCostume(target, {x: 50, y: 50}).name === 'guard-2');
    ok('facingCostume picks guard-8 from front right', facingCostume(target, {x: 50, y: -50}).name === 'guard-8');
    const cache = new WeakMap();
    facingCostume(target, {x: -50, y: 0}, cache);
    ok('facingCostume caches the view set per costume', cache.get(costumes[0]).views.length === 8);
    const walk = ['walk-1', 'walk-2', 'walk-3', 'walk-4', 'walk-5', 'walk-6', 'walk-7', 'walk-8', 'step-1', 'step-5']
        .map(name => ({name}));
    const animated = {x: 0, y: 0, direction: 90, currentCostume: 8, getCostumes: () => walk};
    ok('a -1 frame swaps to its own view', facingCostume(animated, {x: -50, y: 0}).name === 'step-5');
    ok('a missing view keeps the -1 frame', facingCostume(animated, {x: 0, y: -50}).name === 'step-1');
    const plain = {x: 0, y: 0, direction: 90, currentCostume: 0, getCostumes: () => [{name: 'coin'}]};
    ok('facingCostume keeps a plain costume', facingCostume(plain, {x: -50, y: 0}).name === 'coin');
}

if (process.env.SQ_PERF === '1') {
    section('frame time under 4 ms');
    const size = 64;
    const grid = room(size, size, {texture: true});
    for (let i = 4; i < size - 4; i += 6) {
        for (let j = 4; j < size - 4; j += 2) setCell(grid, 'main', i, j, 1);
    }
    const tex = solidImage(64, 64, pixel(150, 90, 60));
    for (let i = 0; i < tex.data.length; i += 7) tex.data[i] = pixel(90, 60, 40);
    const sprites = [];
    for (let i = 0; i < 24; i++) {
        sprites.push({name: `S${i}`,
            u: 2 + ((i * 7) % 58) + 0.5,
            v: 2 + ((i * 11) % 58) + 0.5,
            image: solidImage(32, 48, RED),
            height: 1});
    }
    const frame = createFrame();
    const scene = {map: mapOf(grid),
        player: {u: 2.5, v: 2.5, direction: 135},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        texture: () => tex,
        sprites};
    for (let i = 0; i < 30; i++) render(frame, scene);
    const samples = [];
    for (let i = 0; i < 300; i++) {
        scene.player = {u: 2.5 + ((i % 50) * 0.05), v: 2.5 + ((i % 30) * 0.05), direction: (i * 3) % 360};
        const t0 = performance.now();
        render(frame, scene);
        samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[150];
    const p95 = samples[285];
    console.log(`  info  64x64 textured level, 24 billboards (240x180): median ${median.toFixed(3)} ms, ` +
        `p95 ${p95.toFixed(3)} ms`);
    ok('median frame under 4 ms', median < 4, median);
    ok('p95 frame under 4 ms', p95 < 4, p95);

    const wideFrame = createFrame(640, 360);
    const wideScene = Object.assign({}, scene, {
        floorMode: 'brick',
        ceilingMode: 'sky',
        floorTex: tex,
        lightFalloff: 20,
        floorTextures: true
    });
    for (let i = 0; i < 10; i++) render(wideFrame, wideScene);
    const wideSamples = [];
    for (let i = 0; i < 60; i++) {
        wideScene.player = {u: 2.5 + ((i % 50) * 0.05), v: 2.5 + ((i % 30) * 0.05), direction: (i * 3) % 360};
        const t0 = performance.now();
        render(wideFrame, wideScene);
        wideSamples.push(performance.now() - t0);
    }
    wideSamples.sort((a, b) => a - b);
    const wideMedian = wideSamples[30];
    const wideP95 = wideSamples[57];
    console.log(`  info  640x360 floor+sky+falloff level, 24 billboards: median ${wideMedian.toFixed(3)} ms, ` +
        `p95 ${wideP95.toFixed(3)} ms`);
    ok('640x360 floor+sky+falloff median under 4 ms', wideMedian < 4, wideMedian);

    const grid2 = room(size, size, {texture: true});
    for (let i = 4; i < size - 4; i += 6) {
        for (let j = 4; j < size - 4; j += 2) setCell(grid2, 'main', i, j, 1);
    }
    const grateId = addTexture(grid2, 'grate', FLAGS.seethrough);
    const doorId = addTexture(grid2, 'door', FLAGS.door);
    const tallId = addTexture(grid2, 'tall', FLAGS.solid, 4);
    for (let c = 4; c < 20; c++) setCell(grid2, 'main', c, 10, grateId);
    setCell(grid2, 'main', 12, 8, doorId);
    openDoorAt(grid2, 12, 8, {cell: true, holdMs: 5000});
    stepDoors(grid2, 200);
    setCell(grid2, 'main', 14, 12, tallId);
    const grateTex = solidImage(64, 64, 0);
    for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x += 8) {
            grateTex.data[(y * 64) + x] = pixel(180, 190, 200);
            grateTex.data[(y * 64) + x + 1] = pixel(180, 190, 200);
        }
    }
    const scene2 = {
        map: mapOf(grid2),
        player: {u: 2.5, v: 2.5, direction: 135},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        texture: v => (v === grateId ? grateTex : tex),
        sprites
    };
    for (let i = 0; i < 30; i++) render(frame, scene2);
    const samples2 = [];
    for (let i = 0; i < 300; i++) {
        scene2.player = {u: 2.5 + ((i % 50) * 0.05), v: 2.5 + ((i % 30) * 0.05), direction: (i * 3) % 360};
        const t0 = performance.now();
        render(frame, scene2);
        samples2.push(performance.now() - t0);
    }
    samples2.sort((a, b) => a - b);
    const median2 = samples2[150];
    const p952 = samples2[285];
    console.log(`  info  64x64 see-through row + 1 door + 1 height-4 tile: median ${median2.toFixed(3)} ms, ` +
        `p95 ${p952.toFixed(3)} ms`);
    ok('mixed-geometry median frame under 4 ms', median2 < 4, median2);
    ok('mixed-geometry p95 frame under 4 ms', p952 < 4, p952);

    const denseSize = 48;
    const denseGrid = room(denseSize, denseSize, {texture: true});
    for (let i = 4; i < denseSize - 4; i += 6) {
        for (let j = 4; j < denseSize - 4; j += 2) setCell(denseGrid, 'main', i, j, 1);
    }
    const denseSprites = [];
    for (let i = 0; i < 16; i++) {
        denseSprites.push({
            name: `D${i}`,
            u: 2 + ((i * 5) % 42) + 0.5,
            v: 2 + ((i * 9) % 42) + 0.5,
            image: solidImage(48, 64, RED),
            height: 1
        });
    }
    const denseMap = mapOf(denseGrid);
    const runDense = (label, extra) => {
        const df = createFrame(640, 360);
        df.timings = {};
        const ds = Object.assign({
            map: denseMap,
            player: {u: 3.5, v: 3.5, direction: 135},
            fov: 90,
            fog: 30,
            floor: BLUE,
            ceiling: RED,
            texture: () => tex,
            sprites: denseSprites
        }, extra);
        for (let i = 0; i < 15; i++) {
            ds.player = {u: 3.5 + ((i % 30) * 0.05), v: 3.5 + ((i % 20) * 0.05), direction: (i * 5) % 360};
            render(df, ds);
        }
        const tot = [];
        const surf = [];
        const wall = [];
        for (let i = 0; i < 30; i++) {
            ds.player = {u: 3.5 + ((i % 30) * 0.05), v: 3.5 + ((i % 20) * 0.05), direction: (i * 5) % 360};
            const t0 = performance.now();
            render(df, ds);
            tot.push(performance.now() - t0);
            surf.push(df.timings.surfacesMs || 0);
            wall.push(df.timings.wallTexMs || 0);
        }
        tot.sort((a, b) => a - b);
        surf.sort((a, b) => a - b);
        wall.sort((a, b) => a - b);
        const res = {
            renderMedian: tot[15],
            renderP95: tot[28],
            surfacesMedian: surf[15],
            surfacesP95: surf[28],
            wallsMedian: wall[15]
        };
        console.log(
            `  info  dense 48x48 640x360 ${label}: render med ${res.renderMedian.toFixed(3)} ms ` +
            `(p95 ${res.renderP95.toFixed(3)} ms), surfaces med ${res.surfacesMedian.toFixed(3)} ms, ` +
            `walls med ${res.wallsMedian.toFixed(3)} ms`
        );
        return res;
    };
    const flatRes = runDense('flat_fill', {floorMode: 'flat', ceilingMode: 'flat', lightFalloff: 0});
    const skyRes = runDense('sky_strip', {floorMode: 'flat', ceilingMode: 'sky', lightFalloff: 0});
    const shadeRes = runDense('shade_table', {floorMode: 'flat', ceilingMode: 'flat', lightFalloff: 30});
    const onePlaneRes = runDense('one_floor_plane', {
        floorMode: 'brick', ceilingMode: 'flat', floorTex: tex, floorTextures: true, lightFalloff: 0
    });
    const twoPlanesRes = runDense('two_planes', {
        floorMode: 'brick',
        ceilingMode: 'brick',
        floorTex: tex,
        ceilTex: tex,
        floorTextures: true,
        lightFalloff: 30
    });
    const floorSkyRes = runDense('floor_plus_sky', {
        floorMode: 'brick', ceilingMode: 'sky', floorTex: tex, floorTextures: true, lightFalloff: 30
    });
    ok('dense 48x48 640x360 flat fill under 2 ms', flatRes.renderMedian < 2, flatRes.renderMedian);
    ok('dense 48x48 640x360 sky strip under 2 ms', skyRes.renderMedian < 2, skyRes.renderMedian);
    ok('dense 48x48 640x360 shade table under 2 ms', shadeRes.renderMedian < 2, shadeRes.renderMedian);
    ok('dense 48x48 640x360 one plane under 3 ms', onePlaneRes.renderMedian < 3, onePlaneRes.renderMedian);
    ok('dense 48x48 640x360 two planes under 4 ms', twoPlanesRes.renderMedian < 4, twoPlanesRes.renderMedian);
    ok('dense 48x48 640x360 floor+sky under 3 ms', floorSkyRes.renderMedian < 3, floorSkyRes.renderMedian);
}

section('no allocation per frame');
{
    const grid = room(16, 16, {texture: true});
    const frame = createFrame();
    const tex = solidImage(8, 8, pixel(200, 100, 50));
    const sprites = [0, 1, 2].map(i => ({name: `S${i}`, u: 4 + i, v: 4, image: solidImage(4, 4, RED), height: 1}));
    const scene = {map: mapOf(grid), player: {u: 8, v: 8, direction: 0}, fov: 66, floor: BLUE, ceiling: RED,
        texture: () => tex, sprites};
    const first = render(frame, scene);
    const pooled = frame.placed.slice();
    const second = render(frame, scene);
    ok('the result object is reused', first === second);
    ok('the placed pool is reused', frame.placed.length === pooled.length &&
        frame.placed.every(item => pooled.indexOf(item) !== -1));
    ok('pooled entries drop their sprite after a frame', frame.placed.every(item => item.sprite === null));
    const view = frame.view;
    const dir = view.dir;
    const plane = view.plane;
    for (let i = 0; i < 100; i++) {
        scene.player.direction = i * 7;
        render(frame, scene);
    }
    ok('the view basis is reused across 100 frames', frame.view === view && view.dir === dir &&
        view.plane === plane && near(view.dir.x, Math.sin(693 * Math.PI / 180)));
    const out = {dir: {x: 0, y: 0}, plane: {x: 0, y: 0}, focal: 0};
    const filled = basis(90, 66, out);
    ok('basis fills the object it is given', filled === out && near(out.dir.x, 1) &&
        near(out.focal, b90.focal) && near(out.plane.y, b90.plane.y));
}

const hashPixels = pixels => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < pixels.length; i++) {
        h = Math.imul(h ^ pixels[i], 16777619) >>> 0;
    }
    return h >>> 0;
};

section('golden frame hash and column caching');
{
    const grid = createGrid({id: 'golden', name: 'Golden', cols: 16, rows: 16, tileSize: 32, origin: [-256, 256]});
    addTexture(grid, 'brick', FLAGS.solid);
    for (let i = 0; i < 16; i++) {
        setCell(grid, 'main', i, 0, 1);
        setCell(grid, 'main', i, 15, 1);
        setCell(grid, 'main', 0, i, 1);
        setCell(grid, 'main', 15, i, 1);
    }
    setCell(grid, 'main', 6, 5, 1);
    setCell(grid, 'main', 10, 6, 1);
    const wallTex = {width: 16, height: 16, data: new Uint32Array(256)};
    for (let i = 0; i < 256; i++) {
        wallTex.data[i] = pixel(80 + ((i * 13) & 127), 50 + ((i * 7) & 127), 40 + ((i * 19) & 127));
    }
    const sprTex = {width: 12, height: 16, data: new Uint32Array(192)};
    for (let i = 0; i < 192; i++) {
        sprTex.data[i] = (i % 12 === 0 || i % 12 === 11) ? 0 : pixel(200, 40 + (i & 63), 30);
    }
    const scout = {name: 'Scout', u: 8.9, v: 7.5, image: sprTex, height: 0.9, elevation: 0};
    const orb = {name: 'Orb', u: 7.4, v: 6.2, image: sprTex, height: 0.6, elevation: 0.15};
    const offscreen = {name: 'Offscreen', u: 2.0, v: 11.0, image: sprTex, height: 1.0, elevation: 0};
    const scene = {
        map: mapOf(grid),
        player: {u: 8.25, v: 11.5, direction: 15},
        fov: 68,
        fog: 55,
        eye: 48,
        floor: pixel(0x3b, 0x32, 0x28),
        ceiling: pixel(0x17, 0x15, 0x13),
        texture: v => (v === 1 ? wallTex : null),
        sprites: [scout, orb, offscreen]
    };
    const frame = createFrame(320, 180);
    render(frame, scene);
    const golden = hashPixels(frame.pixels);
    ok('fixed camera frame matches golden pixel hash', golden === 0x640bae70, golden.toString(16));
    scout.u = 9.4;
    render(frame, scene);
    const movedHash = hashPixels(frame.pixels);
    ok('moving a billboard while camera stays still changes the frame', movedHash !== golden);
    scout.u = 8.9;
    render(frame, scene);
    ok('cached wall columns restore the exact golden pixel hash', hashPixels(frame.pixels) === golden);
    const aimed = Object.assign({}, scene, {player: {u: 8.9, v: 11.5, direction: 0}});
    const full = render(frame, aimed);
    const picked = pickCrosshair(frame, aimed);
    ok('pickCrosshair matches full render crosshair at centre column',
        full.crosshair === 'Scout' && picked.crosshair === full.crosshair, [full.crosshair, picked.crosshair]);
    ok('height-1 level stays on the single-hit fast path', frame._multiHit === false);

    const floorTex = {width: 64, height: 64, data: new Uint32Array(64 * 64)};
    for (let i = 0; i < floorTex.data.length; i++) {
        floorTex.data[i] = pixel(40 + (i & 31), 60 + ((i >> 6) & 31), 90 + ((i * 3) & 31));
    }
    const skyScene = Object.assign({}, scene, {ceilingMode: 'sky'});
    render(frame, skyScene);
    const skyGolden = hashPixels(frame.pixels);
    const falloffScene = Object.assign({}, scene, {fog: 0, lightFalloff: 50});
    render(frame, falloffScene);
    const falloffGolden = hashPixels(frame.pixels);
    const floorOnlyScene = Object.assign({}, scene, {floorMode: 'brick', floorTex, floorTextures: true});
    render(frame, floorOnlyScene);
    const floorGolden = hashPixels(frame.pixels);
    const floorOffScene = Object.assign({}, floorOnlyScene, {floorTextures: false});
    render(frame, floorOffScene);
    const floorOffGolden = hashPixels(frame.pixels);
    ok('floorTextures false matches flat-colour golden hash 0x640bae70',
        floorOffGolden === 0x640bae70, floorOffGolden.toString(16));

    setCell(grid, 'floor', 8, 10, 1);
    setCell(grid, 'light', 8, 9, 50);
    const sectorScene = Object.assign({}, scene, {map: mapOf(grid), floorTextures: false});
    render(frame, sectorScene);
    const sectorGolden = hashPixels(frame.pixels);
    const litScene = Object.assign({}, scene, {
        map: mapOf(grid),
        floorMode: 'brick',
        ceilingMode: 'sky',
        floorTex,
        lightFalloff: 20,
        lights: [{u: 8.5, v: 9.5, color: pixel(0x22, 0xd3, 0xee), radius: 3}]
    });
    const litFrame = createFrame(320, 180);
    render(litFrame, litScene);
    const litGolden = hashPixels(litFrame.pixels);
    ok('sky look feature matches golden hash 0xd325f0da', skyGolden === 0xd325f0da, skyGolden.toString(16));
    ok('fog-0 distance shade matches golden hash 0xef200976', falloffGolden === 0xef200976, falloffGolden.toString(16));
    ok('floor texture matches golden hash 0x91962b31', floorGolden === 0x91962b31, floorGolden.toString(16));
    ok('sector light matches golden hash 0x466f52dd', sectorGolden === 0x466f52dd, sectorGolden.toString(16));
    ok('full textured + sky + lighting scene matches golden hash 0xda710c98',
        litGolden === 0xda710c98, litGolden.toString(16));
    render(litFrame, litScene);
    ok('cached background preserves textured + sky + lighting golden pixel hash',
        hashPixels(litFrame.pixels) === litGolden);

    const shadeGrid = room(24, 24);
    setCell(shadeGrid, 'flags', 12, 9, FLAGS.solid);
    const shadeScene = {
        map: mapOf(shadeGrid),
        player: {u: 12.5, v: 11.5, direction: 0},
        fov: 66,
        fog: 0,
        lightFalloff: 50,
        floor: BLUE,
        ceiling: RED,
        wallColor: () => pixel(200, 200, 200)
    };
    const shadeFrame = createFrame(240, 180);
    render(shadeFrame, shadeScene);
    const oneTileBlue = (shadeFrame.pixels[(90 * 240) + 120] >>> 16) & 255;
    const farWallBlue = (shadeFrame.pixels[(90 * 240) + 20] >>> 16) & 255;
    ok('with fog 0 and distance shade on, a far wall channel is lower than a one-tile wall channel (82 vs 23)',
        oneTileBlue === 82 && farWallBlue === 23 && oneTileBlue - farWallBlue >= 40, [oneTileBlue, farWallBlue]);
}

section('floor caster, sky, lighting, and horizon pure functions');
{
    const frame = createFrame(120, 90);
    ok('createFrame sets horizon to h / 2', frame.horizon === 45);
    ok('horizonOf reads frame.horizon or scene.horizon',
        horizonOf(frame, {}) === 45 && horizonOf(frame, {horizon: 30}) === 30);

    const view = basis(90, 66, frame.view, 120);
    const redFloor = solidImage(64, 64, pixel(220, 20, 30));
    const greenCeil = solidImage(64, 64, pixel(20, 210, 40));
    drawSurfaces(frame, {
        player: {u: 4.5, v: 4.5, direction: 90},
        fov: 66,
        floor: pixel(10, 10, 10),
        ceiling: pixel(20, 20, 20),
        floorMode: 'tile_a',
        ceilingMode: 'tile_b',
        floorTex: redFloor,
        ceilingTex: greenCeil,
        floorTextures: true
    }, view, 0.5, 0, pixel(15, 15, 15), null);
    ok('drawSurfaces samples ceiling texture above horizon and floor texture below',
        frame.pixels[10 * 120 + 60] === pixel(20, 210, 40) &&
        frame.pixels[80 * 120 + 60] === pixel(220, 20, 30));

    drawSurfaces(frame, {
        player: {u: 4.5, v: 4.5, direction: 90},
        fov: 66,
        floor: pixel(10, 10, 10),
        ceiling: pixel(20, 20, 20),
        floorMode: 'tile_a',
        ceilingMode: 'tile_b',
        floorTex: redFloor,
        ceilingTex: greenCeil,
        floorTextures: false
    }, view, 0.5, 0, pixel(15, 15, 15), null);
    ok('floorTextures false falls back to flat colours',
        frame.pixels[10 * 120 + 60] === pixel(20, 20, 20) &&
        frame.pixels[80 * 120 + 60] === pixel(10, 10, 10));

    drawSurfaces(frame, {
        player: {u: 4.5, v: 4.5, direction: 0},
        fov: 66,
        floor: pixel(10, 10, 10),
        ceiling: pixel(20, 20, 20),
        ceilingMode: 'sky'
    }, view, 0.5, 0, pixel(15, 15, 15), null);
    const skyRow0 = frame.pixels.slice(12 * 120, 13 * 120);
    drawSurfaces(frame, {
        player: {u: 4.5, v: 4.5, direction: 90},
        fov: 66,
        floor: pixel(10, 10, 10),
        ceiling: pixel(20, 20, 20),
        ceilingMode: 'sky'
    }, view, 0.5, 0, pixel(15, 15, 15), null);
    const skyRow90 = frame.pixels.slice(12 * 120, 13 * 120);
    ok('sky ceiling scrolls horizontally when yaw changes',
        skyRow0.some((p, idx) => p !== skyRow90[idx]));

    frame.horizon = 25;
    drawSurfaces(frame, {
        player: {u: 4.5, v: 4.5, direction: 0},
        fov: 66,
        floor: pixel(100, 110, 120),
        ceiling: pixel(10, 20, 30)
    }, view, 0.5, 0, pixel(50, 50, 50), null);
    ok('shifting frame.horizon moves the ceiling/floor boundary',
        frame.pixels[24 * 120] === pixel(10, 20, 30) &&
        frame.pixels[25 * 120] === pixel(100, 110, 120));
    frame.horizon = 45;

    const lGrid = createGrid({cols: 8, rows: 8});
    setCell(lGrid, 'light', 2, 2, 50);
    const lMap = mapOf(lGrid);
    const buf = createLightBuffer(8, 8);
    const firstUpdate = updateLightBuffer(buf, lMap, [{u: 4.5, v: 4.5, color: pixel(255, 128, 0), radius: 2.5}]);
    const v1 = buf.version;
    const secondUpdate = updateLightBuffer(buf, lMap, [{u: 4.5, v: 4.5, color: pixel(255, 128, 0), radius: 2.5}]);
    ok('light buffer updates once and skips recomputing when nothing moved',
        firstUpdate === true && secondUpdate === false && buf.version === v1);
    ok('per-tile light scales cell brightness and sprite glow adds light at its cell',
        buf.level[(2 * 8) + 2] === 128 && buf.level[(4 * 8) + 4] > 256 && buf.glowR[(4 * 8) + 4] > 0);
    const twenty = Array.from({length: 20}, (_, i) => ({
        u: (i % 8) + 0.5,
        v: Math.floor(i / 8) + 0.5,
        color: pixel(200, 200, 200),
        radius: 1.5
    }));
    updateLightBuffer(buf, lMap, twenty);
    ok('sprite glow lights cap at 16', buf._lightCount === MAX_LIGHTS && MAX_LIGHTS === 16);
    ok('lightFalloffFactor and clampFalloff behave monotonically',
        clampFalloff(-5) === 0 && clampFalloff(180) === 100 &&
        lightFalloffFactor(0, 10) === 1 && lightFalloffFactor(50, 4) < lightFalloffFactor(50, 2));
}

section('doors: recessed raycast and pure timing');
{
    const grid = room(12, 12);
    setCell(grid, 'flags', 6, 5, FLAGS.door);
    const map = mapOf(grid);
    const closedHit = castRay(map, 6.5, 8.5, 0, -1);
    ok('a closed door is hit recessed half a tile inside its cell',
        closedHit && closedHit.door === true && near(closedHit.dist, 3, 1e-6), closedHit);
    ok('openDoorAt opens over 400 ms and holds for holdMs', OPEN_MS === 400 && HOLD_MS === 3000);
    openDoorAt(grid, 6, 5, {cell: true, holdMs: 1000});
    stepDoors(grid, 200);
    ok('at 200 ms door is 50% open',
        near(doorOpenAt(grid, 6, 5), 0.5, 1e-6) && !isDoorOpenAt(grid, 6, 5, {cell: true}));
    const leftRay = castRay(map, 6.25, 8.5, 0, -1);
    const rightRay = castRay(map, 6.75, 8.5, 0, -1);
    ok('ray in the open half (u=6.25 < 6.5) passes through to the back wall',
        leftRay && leftRay.door === false && leftRay.row === 0 && near(leftRay.dist, 7.5, 1e-6), leftRay);
    ok('ray in the closed half (u=6.75 >= 6.5) hits the door with shifted wallX',
        rightRay && rightRay.door === true && near(rightRay.dist, 3, 1e-6) && near(rightRay.wallX, 0.25, 1e-6),
        rightRay);
    stepDoors(grid, 200);
    ok('at 400 ms door is 100% open', near(doorOpenAt(grid, 6, 5), 1, 1e-6) && isDoorOpenAt(grid, 6, 5, {cell: true}));
    const openRay = castRay(map, 6.75, 8.5, 0, -1);
    ok('ray passes completely through a fully open door', openRay && openRay.door === false && openRay.row === 0);
    const blocker = [{x: -240 + (6.5 * 32), y: 180 - (5.5 * 32), w: 20, h: 20}];
    stepDoors(grid, 1500, blocker);
    ok('door stays open past hold time while blocked by a sprite box', near(doorOpenAt(grid, 6, 5), 1, 1e-6));
    stepDoors(grid, 1000, []);
    stepDoors(grid, 200, []);
    ok('once unblocked, door holds then slides closed over 400 ms', near(doorOpenAt(grid, 6, 5), 0.5, 1e-6));
    stepDoors(grid, 100, blocker);
    ok('a blocker entering a closing door reverses it back toward open', doorOpenAt(grid, 6, 5) > 0.5);
    closeDoorAt(grid, 6, 5, {cell: true});
    stepDoors(grid, 400, []);
    ok('door finishes closing to 0 when unblocked', near(doorOpenAt(grid, 6, 5), 0, 1e-6));
    const frame = createFrame(120, 90);
    const backWallColor = pixel(90, 140, 210);
    render(frame, {
        map,
        player: {u: 6.5, v: 7.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        wallColor: () => backWallColor
    });
    const closedDoorHash = hashPixels(frame.pixels);
    const centerColor = frame.pixels[(45 * 120) + 60];
    ok('closed door renders with DEFAULT_DOOR_TEXTURE on single-hit path',
        frame._multiHit === false && (DEFAULT_DOOR_TEXTURE.data.includes(centerColor) || centerColor !== BLUE));
    ok('closed door matches golden hash', closedDoorHash === 0xf47d207a, closedDoorHash.toString(16));
    const solidRoomGrid = room(12, 12);
    setCell(solidRoomGrid, 'flags', 6, 5, FLAGS.solid);
    const solidRoomMap = mapOf(solidRoomGrid);
    const solidHit = castRay(solidRoomMap, 6.5, 8.5, 0, -1);
    const solidFrame = createFrame(120, 90);
    render(solidFrame, {
        map: solidRoomMap,
        player: {u: 6.5, v: 7.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        wallColor: () => backWallColor
    });
    const solidWallInDoorRoomHash = hashPixels(solidFrame.pixels);
    ok('solid wall in the same room matches golden hash and differs from closed door by half-tile recess',
        solidWallInDoorRoomHash === 0x8fce4bbd && solidWallInDoorRoomHash !== closedDoorHash &&
        near(closedHit.dist - solidHit.dist, 0.5, 1e-6),
        [solidWallInDoorRoomHash.toString(16), closedDoorHash.toString(16)]);
    openDoorAt(grid, 6, 5, {cell: true, holdMs: 1000});
    stepDoors(grid, 200);
    render(frame, {
        map,
        player: {u: 6.5, v: 7.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        wallColor: () => backWallColor,
        wallKey: 2
    });
    const halfOpenDoorHash = hashPixels(frame.pixels);
    const openingPixel = frame.pixels[(45 * 120) + 52];
    const slabPixel = frame.pixels[(45 * 120) + 68];
    ok('half-open door opening columns match the back wall, not the door texture',
        openingPixel === ray.shade(backWallColor, 0.72) && slabPixel !== openingPixel,
        [openingPixel, slabPixel]);
    ok('half-open door matches golden hash', halfOpenDoorHash === 0xe413585b, halfOpenDoorHash.toString(16));
    const capGrid = room(24, 24);
    for (let c = 1; c <= 20; c++) {
        setCell(capGrid, 'flags', c, 5, FLAGS.door);
        openDoorAt(capGrid, c, 5, {cell: true});
    }
    const encodedDoors = encodeDoorValues(capGrid);
    ok('multiplayer door values cap at MAX_DOORS (16)', Object.keys(encodedDoors).length === MAX_DOORS);
    const peerGrid = room(24, 24);
    for (let c = 1; c <= 20; c++) setCell(peerGrid, 'flags', c, 5, FLAGS.door);
    const appliedCount = applyDoorValues(peerGrid, encodedDoors);
    ok('applyDoorValues syncs remote door open targets', appliedCount === MAX_DOORS);

    const slideFrame = createFrame(240, 180);
    const runSlide60Hz = interpolate => {
        const g = room(12, 12);
        setCell(g, 'flags', 6, 5, FLAGS.door);
        openDoorAt(g, 6, 5, {cell: true, holdMs: 2000});
        const m = mapOf(g);
        let prevHash = null;
        let unchanged = 0;
        for (let stepIdx = 0; stepIdx < 12; stepIdx++) {
            stepDoors(g, 1000 / 30);
            for (let sub = 0; sub < 2; sub++) {
                if (interpolate) setDoorProgress(g, (sub + 1) / 2);
                render(slideFrame, {
                    map: m,
                    player: {u: 6.5, v: 6.5, direction: 0},
                    fov: 66,
                    floor: BLUE,
                    ceiling: RED,
                    wallColor: () => backWallColor,
                    wallKey: (stepIdx * 2) + sub + 1
                });
                const h = hashPixels(slideFrame.pixels);
                if (prevHash !== null && h === prevHash) unchanged++;
                prevHash = h;
            }
        }
        return unchanged / 24;
    };
    const stepOnlyUnchangedRatio = runSlide60Hz(false);
    const interpolatedUnchangedRatio = runSlide60Hz(true);
    ok('door slide at 60 Hz over 400 ms: 30 Hz step-only holds 0.5 of frames while setDoorProgress holds 0',
        near(stepOnlyUnchangedRatio, 0.5, 1e-6) && interpolatedUnchangedRatio === 0,
        [stepOnlyUnchangedRatio, interpolatedUnchangedRatio]);
}

section('see-through tiles and 4-hit cap');
{
    const grid = room(16, 16);
    for (let r = 2; r <= 7; r++) setCell(grid, 'flags', 8, r, FLAGS.seethrough);
    const map = mapOf(grid);
    const hits = castRayMulti(map, 8.5, 10.5, 0, -1);
    const seeHits = hits.filter(h => h.seethrough);
    const lastHit = hits[hits.length - 1];
    ok('castRayMulti caps see-through hits at 4 per column and still hits the solid wall behind',
        MAX_SEETHROUGH === 4 && seeHits.length === 4 && !lastHit.seethrough && lastHit.row === 0, hits);
    const sixGrid = room(12, 12, {texture: true});
    const fenceColors = [
        pixel(220, 50, 50),
        pixel(50, 220, 50),
        pixel(50, 120, 230),
        pixel(230, 210, 40),
        pixel(220, 60, 210),
        pixel(50, 220, 220)
    ];
    const fenceTextures = {};
    const fenceIds = [];
    for (let i = 0; i < 6; i++) {
        const id = addTexture(sixGrid, `fence${i + 1}`, FLAGS.seethrough);
        fenceIds.push(id);
        const fTex = solidImage(8, 8, 0);
        for (let y = 0; y < 8; y++) fTex.data[(y * 8) + (i + 1)] = fenceColors[i];
        fenceTextures[id] = fTex;
        setCell(sixGrid, 'main', 6, 7 - i, id);
    }
    const sixFrame = createFrame(120, 90);
    const sixWallTex = solidImage(8, 8, pixel(40, 180, 60));
    render(sixFrame, {
        map: mapOf(sixGrid),
        player: {u: 6.5, v: 9.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        texture: v => (v === 1 ? sixWallTex : (fenceTextures[v] || null))
    });
    const shadedFenceColors = fenceColors.map(c => ray.shade(c, 0.72));
    const fencePixelCounts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < sixFrame.pixels.length; i++) {
        const p = sixFrame.pixels[i];
        const idx = shadedFenceColors.indexOf(p);
        if (idx !== -1) fencePixelCounts[idx]++;
    }
    const drawnFences = fencePixelCounts.filter(c => c > 0).length;
    ok('six see-through fences on one ray draw the nearest 4 and skip the 5th and 6th',
        drawnFences === 4 &&
        fencePixelCounts[0] > 0 && fencePixelCounts[1] > 0 &&
        fencePixelCounts[2] > 0 && fencePixelCounts[3] > 0 &&
        fencePixelCounts[4] === 0 && fencePixelCounts[5] === 0,
        fencePixelCounts);
    const g2 = room(12, 12, {texture: true});
    const grateId = addTexture(g2, 'grate', FLAGS.seethrough);
    setCell(g2, 'main', 6, 5, grateId);
    const wallTex = solidImage(8, 8, pixel(40, 180, 60));
    const grateTex = solidImage(8, 8, 0);
    for (let y = 0; y < 8; y++) {
        grateTex.data[(y * 8) + 0] = pixel(200, 200, 210);
        grateTex.data[(y * 8) + 4] = pixel(200, 200, 210);
    }
    const frame = createFrame(120, 90);
    const guard = {name: 'Guard', u: 6.5, v: 3.5, image: solidImage(8, 8, RED), height: 1};
    render(frame, {
        map: mapOf(g2),
        player: {u: 6.5, v: 7.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        texture: v => (v === 1 ? wallTex : (v === grateId ? grateTex : null)),
        sprites: [guard]
    });
    const midRow = 45 * 120;
    let sawGrateBar = false;
    let sawBehindWall = false;
    let sawSpriteThroughGrate = false;
    for (let x = 20; x < 100; x++) {
        const c = frame.pixels[midRow + x];
        if (c === ray.shade(pixel(200, 200, 210), 0.72)) sawGrateBar = true;
        if (c === ray.shade(pixel(40, 180, 60), 0.72)) sawBehindWall = true;
        if (c === RED) sawSpriteThroughGrate = true;
    }
    ok('see-through texture draws opaque bars and skips transparent texels to show wall and sprite behind',
        sawGrateBar && sawBehindWall && sawSpriteThroughGrate,
        [sawGrateBar, sawBehindWall, sawSpriteThroughGrate]);
    const fenceHash = hashPixels(frame.pixels);
    ok('fence frame matches golden hash', fenceHash === 0x3bc51ea5, fenceHash.toString(16));
}

section('per-tile wall heights (0.25 to 4) and running top edge');
{
    const grid = room(16, 16);
    setCell(grid, 'flags', 8, 6, FLAGS.solid);
    setHeight(grid, 8, 6, 0.25);
    setCell(grid, 'flags', 8, 4, FLAGS.solid);
    setHeight(grid, 8, 4, 0.5);
    setCell(grid, 'flags', 8, 2, FLAGS.solid);
    setHeight(grid, 8, 2, 4);
    const map = mapOf(grid);
    const hits = castRayMulti(map, 8.5, 8.5, 0, -1);
    ok('multi-hit ray records 0.25 wall, 0.5 wall, and 4.0 tall wall in near-to-far order',
        hits.length === 3 && near(hits[0].height, 0.25) && near(hits[1].height, 0.5) && near(hits[2].height, 4),
        hits);
    const cLow = pixel(220, 180, 40);
    const cMid = pixel(40, 180, 220);
    const cTall = pixel(180, 60, 220);
    setCell(grid, 'main', 8, 6, addTexture(grid, 'low', FLAGS.solid, 0.25));
    setCell(grid, 'main', 8, 4, addTexture(grid, 'mid', FLAGS.solid, 0.5));
    setCell(grid, 'main', 8, 2, addTexture(grid, 'tall', FLAGS.solid, 4));
    const frame = createFrame(120, 90);
    render(frame, {
        map: mapOf(grid),
        player: {u: 8.5, v: 8.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        wallColor: v => (v === 1 ? cLow : (v === 2 ? cMid : cTall))
    });
    const colPixels = [];
    for (let y = 0; y < 90; y++) colPixels.push(frame.pixels[(y * 120) + 60]);
    const sLow = ray.shade(cLow, 0.72);
    const sMid = ray.shade(cMid, 0.72);
    const sTall = ray.shade(cTall, 0.72);
    const tallTop = colPixels.indexOf(sTall);
    const midTop = colPixels.indexOf(sMid);
    const lowTop = colPixels.indexOf(sLow);
    const floorBetween = colPixels.slice(midTop, lowTop).includes(BLUE);
    ok('taller wall (4.0) extends to the top of the view (y=0)', tallTop === 0, tallTop);
    ok('running top edge stacks tall wall above mid wall above low wall',
        tallTop < midTop && midTop < lowTop && lowTop > 45, [tallTop, midTop, lowTop]);
    ok('floor shows behind the 0.25 low wall', floorBetween);
    const shortWallHash = hashPixels(frame.pixels);
    ok('variable wall heights frame matches golden hash', shortWallHash === 0xde5e759f, shortWallHash.toString(16));
    let singleCols = 0;
    let multiCols = 0;
    for (let x = 0; x < 120; x++) {
        if (frame.colHitCount[x] === 0) singleCols++;
        else multiCols++;
    }
    ok('per-column fast path: columns hitting full-height walls stay on single-hit while low-wall columns use multi',
        singleCols > 0 && multiCols > 0, [singleCols, multiCols]);

    const tallOnly = room(16, 16);
    setCell(tallOnly, 'flags', 8, 5, FLAGS.solid);
    setCell(tallOnly, 'flags', 8, 2, FLAGS.solid);
    setHeight(tallOnly, 8, 2, 4);
    const tallHits = castRayMulti(mapOf(tallOnly), 8.5, 8.5, 0, -1);
    ok('a height-1 solid breaks the ray even when a height-4 tile exists behind it',
        tallHits.length === 1 && tallHits[0].row === 5 && tallHits[0].height === 1, tallHits);
    const tallFrame = createFrame(120, 90);
    setCell(tallOnly, 'flags', 8, 5, 0);
    render(tallFrame, {
        map: mapOf(tallOnly),
        player: {u: 8.5, v: 8.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        wallColor: () => cTall
    });
    ok('a map with height-4 and height-1 walls keeps every column on the single-hit fast path',
        tallFrame._multiHit === false && tallFrame.colHitCount.every(c => c === 0) &&
        tallFrame.pixels[60] === ray.shade(cTall, 0.72));
}

section('frame.horizon contract');
{
    const grid = room(16, 16);
    const frame = createFrame(120, 90);
    ok('createFrame defaults frame.horizon to height / 2', frame.horizon === 45 && typeof drawWalls === 'function');
    const wallColor = pixel(100, 150, 200);
    const shaded = ray.shade(wallColor, 0.72);
    const scene = {
        map: mapOf(grid),
        player: {u: 8.5, v: 8.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        wallColor: () => wallColor
    };
    render(frame, scene);
    const topAt45 = Array.from({length: 90}, (_, y) => frame.pixels[(y * 120) + 60]).indexOf(shaded);
    frame.horizon = 65;
    render(frame, scene);
    const topAt65 = Array.from({length: 90}, (_, y) => frame.pixels[(y * 120) + 60]).indexOf(shaded);
    ok('shifting frame.horizon down by 20 rows shifts wall top down by 20 rows', topAt65 - topAt45 === 20,
        [topAt45, topAt65]);
}

section('dirty-cell column cache, 0.25 s height animation, and cell-change golden frame');
{
    const grid = room(16, 16, {texture: true});
    const lavaId = addTexture(grid, 'lava', 0);
    const ceilId = addTexture(grid, ' grates ', 0);
    setCell(grid, 'main', 8, 5, 1);
    const brickTex = solidImage(64, 64, pixel(180, 90, 60));
    const lavaTex = solidImage(64, 64, pixel(240, 80, 20));
    const ceilTex = solidImage(64, 64, pixel(50, 160, 210));
    const map = mapOf(grid);
    const frame = createFrame(120, 90);
    const scene = {
        map,
        player: {u: 8.5, v: 8.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        texture: v => (v === 1 ? brickTex : (v === lavaId ? lavaTex : (v === ceilId ? ceilTex : null)))
    };
    render(frame, scene);
    const baseHash = hashPixels(frame.pixels);
    ok('initial render casts all columns', frame._lastRecastCols === 120);
    render(frame, scene);
    ok('unchanged frame casts 0 columns', frame._lastRecastCols === 0);

    setCell(grid, 'floor', 8, 7, lavaId);
    setCell(grid, 'ceiling', 8, 7, ceilId);
    setCell(grid, 'light', 8, 6, 40);
    ok('lightAt reads updated cell light', lightAt(grid, 8, 6) === 40);
    render(frame, scene);
    const surfaceChangedHash = hashPixels(frame.pixels);
    ok('floor, ceiling, and light cell changes redraw surfaces with 0 wall rays recast',
        frame._lastRecastCols === 0 && surfaceChangedHash !== baseHash);

    ok('HEIGHT_ANIM_MS is 250 ms (0.25 s)', HEIGHT_ANIM_MS === 250);
    animateHeightAt(grid, 8, 5, 2);
    ok('heightAt immediately reports target height 2 while renderedHeightAt starts at 1',
        heightAt(grid, 8, 5) === 2 && near(renderedHeightAt(grid, 8, 5), 1, 1e-6));

    stepDoors(grid, 125);
    ok('at 125 ms (half of 0.25 s), renderedHeightAt is 1.5',
        near(renderedHeightAt(grid, 8, 5), 1.5, 1e-6));
    render(frame, scene);
    const midRecastCols = frame._lastRecastCols;
    const midHash = hashPixels(frame.pixels);
    const freshMid = createFrame(120, 90);
    render(freshMid, Object.assign({}, scene, {map: mapOf(grid)}));
    ok('changing one cell height marks only that cell columns dirty and matches full render bit-for-bit',
        midRecastCols > 0 && midRecastCols < 45 && midHash === hashPixels(freshMid.pixels) &&
        midHash !== surfaceChangedHash,
        [midRecastCols, midHash.toString(16)]);

    stepDoors(grid, 125);
    ok('at 250 ms (0.25 s), height animation completes at target height 2',
        near(renderedHeightAt(grid, 8, 5), 2, 1e-6) && grid._heightAnims.size === 0);
    render(frame, scene);
    const finalRecastCols = frame._lastRecastCols;
    const finalCellChangeHash = hashPixels(frame.pixels);
    const freshFinal = createFrame(120, 90);
    render(freshFinal, Object.assign({}, scene, {map: mapOf(grid)}));
    ok('completed pillar rise recasts only dirty columns and matches full render and golden hash',
        finalRecastCols === midRecastCols &&
        finalCellChangeHash === hashPixels(freshFinal.pixels) &&
        finalCellChangeHash !== midHash &&
        finalCellChangeHash === 0x06b129af,
        finalCellChangeHash.toString(16));

    const marked = markCellDirty(frame, 8, 5);
    render(frame, scene);
    ok('markCellDirty marks and recasts only the columns intersecting that cell',
        marked === midRecastCols && frame._lastRecastCols === marked);
}

section('bilinear texture filter for walls and floors');
{
    const grid = room(16, 16);
    setCell(grid, 'main', 8, 6, 1);
    const twoByTwo = new Uint32Array([
        pixel(200, 20, 20), pixel(20, 20, 200),
        pixel(20, 200, 20), pixel(200, 200, 20)
    ]);
    const tex = {width: 2, height: 2, data: twoByTwo};
    const frameNearest = createFrame(240, 180);
    const frameBilinear = createFrame(240, 180);
    const baseScene = {
        map: mapOf(grid),
        player: {u: 8.5, v: 8.5, direction: 0},
        fov: 66,
        floor: BLUE,
        ceiling: RED,
        floorMode: 'tex',
        floorTex: tex,
        texture: () => tex
    };
    render(frameNearest, Object.assign({}, baseScene, {bilinear: false}));
    render(frameBilinear, Object.assign({}, baseScene, {bilinear: true}));
    const exactTexels = new Set(Array.from(twoByTwo));
    let blendedWallPixels = 0;
    let blendedFloorPixels = 0;
    for (let y = 60; y < 120; y++) {
        const c = frameBilinear.pixels[(y * 240) + 120];
        if (!exactTexels.has(c) && c !== RED && c !== BLUE) blendedWallPixels++;
    }
    for (let y = 140; y < 175; y++) {
        for (let x = 40; x < 200; x++) {
            const c = frameBilinear.pixels[(y * 240) + x];
            if (!exactTexels.has(c) && c !== RED && c !== BLUE) blendedFloorPixels++;
        }
    }
    ok('bilinear filter blends adjacent wall texels into smooth intermediate colors',
        blendedWallPixels > 10, blendedWallPixels);
    ok('bilinear filter blends adjacent floor texels into smooth intermediate colors',
        blendedFloorPixels > 100, blendedFloorPixels);
    render(frameBilinear, Object.assign({}, baseScene, {bilinear: false}));
    ok('disabling bilinear invalidates cached background and matches nearest-neighbour bit-for-bit',
        hashPixels(frameBilinear.pixels) === hashPixels(frameNearest.pixels));
}

section('floor elevation sectors, stairs, pits, and Fast rung cost');
{
    const grid = room(16, 16, {texture: true});
    const cWall = pixel(140, 140, 150);
    const cStep1 = pixel(220, 120, 40);
    const cStep2 = pixel(40, 200, 120);
    const cStep3 = pixel(60, 140, 240);
    const cPit = pixel(200, 50, 180);
    const tStep1 = addTexture(grid, 'step1', FLAGS.solid);
    const tStep2 = addTexture(grid, 'step2', FLAGS.solid);
    const tStep3 = addTexture(grid, 'step3', FLAGS.solid);
    const tPit = addTexture(grid, 'pit', FLAGS.solid);

    const frame = createFrame(120, 90);
    const baseScene = {
        map: mapOf(grid),
        player: {u: 8.5, v: 10.5, direction: 0, z: 0},
        fov: 66,
        fog: 0,
        floor: BLUE,
        ceiling: RED,
        wallColor: v => {
            if (v === tStep1) return cStep1;
            if (v === tStep2) return cStep2;
            if (v === tStep3) return cStep3;
            if (v === tPit) return cPit;
            return cWall;
        }
    };
    render(frame, baseScene);
    const flatHash = hashPixels(frame.pixels);
    setFloorHeight(grid, 8, 8, 0);
    baseScene.map = mapOf(grid);
    render(frame, baseScene);
    ok('zero floor height keeps flat render bit-identical', hashPixels(frame.pixels) === flatHash);
    ok('typeof drawFloorElevations is function', typeof drawFloorElevations === 'function');

    setCell(grid, 'main', 8, 4, tStep1);
    setFloorHeight(grid, 8, 4, 0.25);
    setCell(grid, 'main', 8, 3, tStep2);
    setFloorHeight(grid, 8, 3, 0.5);
    setCell(grid, 'main', 8, 2, tStep3);
    setFloorHeight(grid, 8, 2, 0.75);
    baseScene.map = mapOf(grid);
    baseScene.player = {u: 8.5, v: 6.5, direction: 0, z: 0};
    ok('gridMap reports floorHeight values',
        baseScene.map.floorHeight(8, 4) === 0.25 &&
        baseScene.map.floorHeight(8, 3) === 0.5 &&
        baseScene.map.floorHeight(8, 2) === 0.75 &&
        floorHeightAt(grid, 8, 3) === 0.5);
    render(frame, baseScene);
    const sStep1 = ray.shade(cStep1, 0.72);
    const sStep2 = ray.shade(cStep2, 0.72);
    const sStep3 = ray.shade(cStep3, 0.72);
    const sBackWall = ray.shade(cWall, 0.72);
    const col = [];
    for (let y = 0; y < 90; y++) col.push(frame.pixels[(y * 120) + 60]);
    const idxBack = col.indexOf(sBackWall);
    const idx3 = col.indexOf(sStep3);
    const idx2 = col.indexOf(sStep2);
    const idx1 = col.indexOf(sStep1);
    ok('primary ray passes over raised floor stairs to hit back wall', idxBack >= 0 && idxBack < 45, idxBack);
    ok('consecutive 0.25 stairs render visible riser faces stacked near-to-far',
        idx3 > idxBack && idx2 > idx3 && idx1 > idx2, [idxBack, idx3, idx2, idx1]);

    const pitGrid = room(16, 16, {texture: true});
    const tPitWall = addTexture(pitGrid, 'pitwall', FLAGS.solid);
    setCell(pitGrid, 'main', 8, 8, tPitWall);
    setFloorHeight(pitGrid, 8, 8, -0.5);
    const pitScene = Object.assign({}, baseScene, {
        map: mapOf(pitGrid),
        player: {u: 8.5, v: 10.5, direction: 0, z: 0},
        wallColor: v => (v === tPitWall ? cPit : cWall)
    });
    render(frame, pitScene);
    const pitCol = [];
    for (let y = 0; y < 90; y++) pitCol.push(frame.pixels[(y * 120) + 60]);
    const sPit = ray.shade(cPit, 0.72);
    ok('pit cell (-0.5) renders visible back-edge riser face climbing back to 0',
        pitCol.indexOf(sPit) > 45, pitCol.indexOf(sPit));

    const elevFrame0 = createFrame(120, 90);
    const elevFrameHigh = createFrame(120, 90);
    render(elevFrame0, Object.assign({}, baseScene, {player: {u: 8.5, v: 10.5, direction: 0, z: 0}}));
    render(elevFrameHigh, Object.assign({}, baseScene, {player: {u: 8.5, v: 10.5, direction: 0, z: 0.5}}));
    const wallTopZ0 = Array.from({length: 90}, (_, y) => elevFrame0.pixels[(y * 120) + 60]).indexOf(sBackWall);
    const wallTopZ05 = Array.from({length: 90}, (_, y) => elevFrameHigh.pixels[(y * 120) + 60]).indexOf(sBackWall);
    ok('standing on elevated floor (player.z = 0.5) shifts wall projection down',
        wallTopZ05 > wallTopZ0, [wallTopZ0, wallTopZ05]);

    const perfFlatGrid = room(32, 32, {texture: true});
    const perfElevGrid = room(32, 32, {texture: true});
    for (let c = 4; c < 28; c += 3) {
        setFloorHeight(perfElevGrid, c, 12, 0.25);
        setFloorHeight(perfElevGrid, c, 11, 0.5);
        setFloorHeight(perfElevGrid, c, 10, -0.5);
    }
    const wallTex = solidImage(64, 64, pixel(150, 90, 60));
    const fastFrame = createFrame(320, 180);
    const flatFastScene = {
        map: mapOf(perfFlatGrid),
        player: {u: 16.5, v: 20.5, direction: 0, z: 0},
        fov: 66,
        fog: 30,
        floor: BLUE,
        ceiling: RED,
        floorTextures: false,
        texture: () => wallTex
    };
    const elevFastScene = Object.assign({}, flatFastScene, {
        map: mapOf(perfElevGrid)
    });
    for (let i = 0; i < 40; i++) {
        flatFastScene.player.direction = (i * 7) % 360;
        render(fastFrame, flatFastScene);
        elevFastScene.player.direction = (i * 7) % 360;
        render(fastFrame, elevFastScene);
    }
    const flatTimes = [];
    const elevTimes = [];
    for (let i = 0; i < 80; i++) {
        const dir = (i * 5) % 360;
        flatFastScene.player.direction = dir;
        const t0 = performance.now();
        render(fastFrame, flatFastScene);
        flatTimes.push(performance.now() - t0);
        elevFastScene.player.direction = dir;
        const t1 = performance.now();
        render(fastFrame, elevFastScene);
        elevTimes.push(performance.now() - t1);
    }
    flatTimes.sort((a, b) => a - b);
    elevTimes.sort((a, b) => a - b);
    const flatMed = Math.max(0.02, flatTimes[40]);
    const elevMed = elevTimes[40];
    const ratio = elevMed / flatMed;
    ok('Fast rung cost with floor elevations stays under 1.3x flat floor',
        ratio < 1.3 || (elevMed - flatMed) < 0.05, {flatMed, elevMed, ratio});
}

done();
