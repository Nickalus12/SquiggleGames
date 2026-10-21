import {EventEmitter} from 'events';
import {ok, near, section, done} from './harness.mjs';

const {FLAGS, addTexture, createGrid, flagsAt, setCell} = await import('./tilemap.js');
const ray = await import('./raycast.js');
const {HUD_LAYER, RESOLUTION, createView3d, facingCostume} = await import('./view3d.js');

const {WIDTH, HEIGHT, basis, castRay, createFrame, distanceAhead, facingIndex, gridMap, moveAhead, parseColor, pixel,
    render, toCell, fromCell, clampFov, wrapDegrees} = ray;

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
    ok('distanceAhead matches the box (facing right)', near(distanceAhead(map, {u: 5.5, v: 4.5, direction: 90}),
        cols - 1 - 5.5, 1e-9));
    const up = distanceAhead(map, {u: 5.5, v: 4.5, direction: 0});
    ok('distanceAhead matches the box (facing up)', near(up, 3.5, 1e-9), up);
    const diag = distanceAhead(map, {u: 5.5, v: 4.5, direction: 135});
    const wantDiag = boxDistance(cols, rows, 5.5, 4.5, Math.sin(Math.PI * 0.75), -Math.cos(Math.PI * 0.75));
    ok('distanceAhead matches the box on a diagonal', Math.abs(diag - wantDiag) / wantDiag < 0.01, [diag, wantDiag]);
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

section('8-direction facing');
ok('viewer in front gives 0', facingIndex(90, {x: 10, y: 0}) === 0);
ok('viewer on the left side gives 6', facingIndex(90, {x: 0, y: 10}) === 6);
ok('viewer behind gives 4', facingIndex(90, {x: -10, y: 0}) === 4);
ok('viewer on the right side gives 2', facingIndex(90, {x: 0, y: -10}) === 2);
ok('diagonal gives 1', facingIndex(0, {x: 10, y: 10}) === 1);
ok('rounding snaps to the nearest 45', facingIndex(0, {x: Math.sin(0.3), y: Math.cos(0.3)}) === 0 &&
    facingIndex(0, {x: Math.sin(0.5), y: Math.cos(0.5)}) === 1);
{
    const costumes = ['guard-0', 'guard-1', 'guard-2', 'guard-3', 'guard-4', 'guard-5', 'guard-6', 'guard-7']
        .map(name => ({name}));
    const target = {x: 0, y: 0, direction: 90, currentCostume: 0, getCostumes: () => costumes};
    ok('facingCostume picks guard-4 from behind', facingCostume(target, {x: -50, y: 0}).name === 'guard-4');
    ok('facingCostume picks guard-2 from the right side', facingCostume(target, {x: 0, y: -50}).name === 'guard-2');
    const plain = {x: 0, y: 0, direction: 90, currentCostume: 0, getCostumes: () => [{name: 'coin'}]};
    ok('facingCostume keeps a plain costume', facingCostume(plain, {x: -50, y: 0}).name === 'coin');
}

section('moving stops at walls');
{
    const map = mapOf(room(12, 12));
    const run = moveAhead(map, {u: 6, v: 6, direction: 0}, 100);
    ok('running into a wall stops at the radius', run.hit && near(run.v, 1.2, 0.26) && near(run.u, 6), run);
    ok('never inside a solid cell', !map.solid(Math.floor(run.u), Math.floor(run.v - 0.2)));
    const slide = moveAhead(map, {u: 6, v: 2, direction: 45}, 3);
    ok('a diagonal into a wall slides along it', slide.hit && slide.u > 7.5 && slide.v >= 1.2, slide);
    const free = moveAhead(map, {u: 6, v: 6, direction: 90}, 2);
    ok('open floor moves the full distance', !free.hit && near(free.u, 8) && near(free.v, 6), free);
    const backward = moveAhead(map, {u: 6, v: 6, direction: 90}, -2);
    ok('negative steps move backwards', near(backward.u, 4), backward);
    const thin = room(12, 12);
    setCell(thin, 'flags', 8, 6, FLAGS.solid);
    const fast = moveAhead(mapOf(thin), {u: 6.5, v: 6.5, direction: 90}, 5);
    ok('a big step does not tunnel through a one-cell wall', fast.u < 8, fast);
}

section('frame time under 4 ms');
{
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

section('view3d glue');
{
    const runtime = new EventEmitter();
    const calls = [];
    let nextId = 1;
    runtime.renderer = {
        createBitmapSkin: (image, res) => {
            calls.push(['skin', res]);
            return 7;
        },
        updateBitmapSkin: (id, image, res) => calls.push(['update', id, res]),
        createDrawable: group => {
            calls.push(['drawable', group]);
            return nextId++;
        },
        updateDrawableSkinId: (id, skin) => calls.push(['skinId', id, skin]),
        updateDrawablePosition: (id, pos) => calls.push(['pos', id, pos]),
        updateDrawableDirectionScale: (id, dir, scale) => calls.push(['scale', id, dir, scale]),
        updateDrawableVisible: (id, on) => calls.push(['visible', id, on]),
        destroyDrawable: (id, group) => calls.push(['destroy', id, group]),
        destroySkin: id => calls.push(['destroySkin', id])
    };
    const grid = room(16, 16, {texture: true, tileSize: 32, origin: [-256, 256]});
    const brick = {name: 'brick', asset: {}, assetId: 'brick', dataFormat: 'png', size: [32, 32]};
    const guardCostume = {name: 'guard', asset: {}, assetId: 'guard', dataFormat: 'png', size: [32, 32]};
    const stage = {isStage: true, getCostumes: () => [brick]};
    const guard = {
        isStage: false,
        isOriginal: true,
        visible: true,
        x: 0,
        y: 0,
        size: 100,
        direction: 90,
        currentCostume: 0,
        getName: () => 'Guard',
        getCostumes: () => [guardCostume]
    };
    runtime.targets = [stage, guard];
    runtime.getTargetForStage = () => stage;
    runtime.getSpriteTargetByName = () => null;
    const world = {
        current: () => grid,
        camera: {isActive: () => true, view: () => ({x: 100, y: 50, zoom: 2})}
    };
    const loads = [];
    const view = createView3d(runtime, world, {
        toBitmap: (pixels, w, h) => ({pixels, w, h}),
        loadImage: costume => {
            loads.push(costume.assetId);
            return Promise.resolve({width: 8, height: 8, costume});
        },
        createCanvas: (w, h) => ({
            getContext: () => ({
                clearRect: () => null,
                drawImage: () => null,
                getImageData: () => {
                    const data = new Uint8ClampedArray(w * h * 4);
                    new Uint32Array(data.buffer).fill(RED);
                    return {data};
                }
            })
        })
    });
    view.setPlayer(-256 + (8 * 32), 256 - (12 * 32), 0);
    view.setBillboard(guard, true);
    guard.x = -256 + (8 * 32);
    guard.y = 256 - (6 * 32);
    view.setOn(true);
    ok('turning on makes one drawable in sq-hud', calls.filter(c => c[0] === 'drawable').length === 1 &&
        calls.find(c => c[0] === 'drawable')[1] === HUD_LAYER);
    ok('the skin is a bitmap at half resolution so 240x180 fills the stage',
        calls.find(c => c[0] === 'skin')[1] === RESOLUTION && RESOLUTION === 0.5);
    const pos = calls.filter(c => c[0] === 'pos').pop();
    const scale = calls.filter(c => c[0] === 'scale').pop();
    ok('the HUD follows the camera', pos[2][0] === 100 && pos[2][1] === 50, pos);
    ok('the HUD scale undoes the camera zoom', scale[3][0] === 50 && scale[3][1] === 50, scale);
    await new Promise(resolve => setTimeout(resolve, 0));
    ok('wall and billboard costumes load once each', loads.sort().join(',') === 'brick,guard', loads);
    runtime.emit('BEFORE_EXECUTE');
    runtime.emit('AFTER_EXECUTE');
    ok('each step updates the same skin', calls.filter(c => c[0] === 'update').length === 1 &&
        calls.filter(c => c[0] === 'skin').length === 1);
    ok('the guard ahead is in the crosshair', view.crosshair() === 'Guard', view.crosshair());
    const ahead = view.distanceAhead();
    ok('distance to wall ahead is in stage units', near(ahead, (12 - 1) * 32, 1e-6), ahead);
    const hit = view.move(1000);
    ok('moving stops at the wall in stage units', hit && near(view.player().y, 256 - (1.2 * 32), 8), view.player());
    view.turn(200);
    ok('turning wraps the direction', view.player().direction === -160, view.player());
    view.setFov(400);
    ok('field of view clamps', view.fov() === ray.MAX_FOV);
    view.setColors('#112233', 'bad');
    runtime.emit('AFTER_EXECUTE');
    ok('floor colour applies, a bad ceiling keeps the old one',
        view.frame.pixels[(HEIGHT - 1) * WIDTH] === pixel(17, 34, 51) &&
        view.frame.pixels[0] === pixel(0x8f, 0xb4, 0xd6));
    const stats = view.stats();
    ok('frame stats are recorded', stats.frames >= 3 && stats.medianMs >= 0, stats);
    runtime.emit('PROJECT_STOP_ALL');
    ok('stop turns the view off and hides it', !view.isOn() && calls[calls.length - 1][0] === 'visible' &&
        calls[calls.length - 1][2] === false);
    const before = calls.length;
    runtime.emit('AFTER_EXECUTE');
    ok('no drawing while off', calls.length === before);
    const clone = {isOriginal: false, sprite: {clones: [guard]}};
    ok('clones of a billboard are billboards', view.isBillboard(clone));
    runtime.emit('PROJECT_LOADED');
    ok('loading a project destroys the HUD and clears billboards', calls.some(c => c[0] === 'destroy' &&
        c[2] === HUD_LAYER) && !view.isBillboard(guard));
    view.dispose();
    ok('dispose removes listeners', runtime.listenerCount('AFTER_EXECUTE') === 0);
}

done();
