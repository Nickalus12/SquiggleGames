import {ok, near, section, done} from './harness.mjs';

const {FLAGS, addTexture, createGrid, flagsAt, setCell} = await import('./tilemap.js');
const ray = await import('./raycast.js');
const {facingCostume} = await import('./view3d.js');

const {WIDTH, HEIGHT, basis, castRay, createFrame, facingIndex, gridMap, parseColor, pixel, mixColors, fogEnd,
    render, toCell, fromCell, clampFov, clampEye, clampFog, wrapDegrees} = ray;

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
    console.log(`  info  64x64 textured level, 24 billboards: median ${median.toFixed(3)} ms, ` +
        `p95 ${p95.toFixed(3)} ms`);
    ok('median frame under 4 ms', median < 4, median);
    ok('p95 frame under 4 ms', p95 < 4, p95);
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

done();
