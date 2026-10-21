const WIDTH = 240;
const HEIGHT = 180;
const DEFAULT_FOV = 66;
const MIN_FOV = 20;
const MAX_FOV = 140;
const DEFAULT_EYE = 50;
const MIN_EYE = 5;
const MAX_EYE = 95;
const MAX_STEPS = 512;
const SIDE_SHADE = 0.72;
const ALPHA_MIN = 128;
const OPAQUE = 0xff000000;
const FACINGS = 8;
const FOG_FAR = 40;
const FOG_SLOPE = 0.37;

const rad = deg => deg * Math.PI / 180;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const wrapDegrees = deg => {
    const d = ((deg % 360) + 360) % 360;
    return d > 180 ? d - 360 : d;
};

const pixel = (r, g, b) => ((OPAQUE | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0);

const shade = (value, k) => {
    const r = (value & 255) * k;
    const g = ((value >>> 8) & 255) * k;
    const b = ((value >>> 16) & 255) * k;
    return pixel(r, g, b);
};

const tint = (value, k, f, fog) => {
    const keep = k * (1 - f);
    const r = ((value & 255) * keep) + ((fog & 255) * f);
    const g = (((value >>> 8) & 255) * keep) + (((fog >>> 8) & 255) * f);
    const b = (((value >>> 16) & 255) * keep) + (((fog >>> 16) & 255) * f);
    return pixel(r, g, b);
};

const mixColors = (a, b) => tint(a, 1, 0.5, b);

const parseColor = (value, fallback) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return pixel((value >> 16) & 255, (value >> 8) & 255, value & 255);
    }
    const match = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
    if (!match) return fallback;
    const n = parseInt(match[1], 16);
    return pixel((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

const clampFov = fov => {
    const n = Number(fov);
    if (!Number.isFinite(n)) return DEFAULT_FOV;
    return clamp(n, MIN_FOV, MAX_FOV);
};

const clampEye = eye => {
    const n = Number(eye);
    if (!Number.isFinite(n)) return DEFAULT_EYE;
    return clamp(n, MIN_EYE, MAX_EYE);
};

const clampFog = fog => {
    const n = Number(fog);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, 0, 100);
};

const fogEnd = fog => FOG_FAR - (FOG_SLOPE * fog);

const fogFactor = (fog, dist) => (fog > 0 ? Math.min(1, dist / fogEnd(fog)) : 0);

const basis = (direction, fov, out) => {
    const a = rad(direction);
    const k = Math.tan(rad(clampFov(fov)) / 2);
    const view = out || {dir: {x: 0, y: 0}, plane: {x: 0, y: 0}, focal: 0};
    view.dir.x = Math.sin(a);
    view.dir.y = -Math.cos(a);
    view.plane.x = Math.cos(a) * k;
    view.plane.y = Math.sin(a) * k;
    view.focal = (WIDTH / 2) / k;
    return view;
};

const castRay = (map, u, v, rx, ry, out) => {
    let col = Math.floor(u);
    let row = Math.floor(v);
    const dx = rx === 0 ? Infinity : Math.abs(1 / rx);
    const dy = ry === 0 ? Infinity : Math.abs(1 / ry);
    const stepX = rx < 0 ? -1 : 1;
    const stepY = ry < 0 ? -1 : 1;
    let sideX = rx < 0 ? (u - col) * dx : (col + 1 - u) * dx;
    let sideY = ry < 0 ? (v - row) * dy : (row + 1 - v) * dy;
    let side = 0;
    for (let i = 0; i < MAX_STEPS; i++) {
        if (sideX < sideY) {
            sideX += dx;
            col += stepX;
            side = 0;
        } else {
            sideY += dy;
            row += stepY;
            side = 1;
        }
        if (map.solid(col, row)) {
            const hit = out || {};
            const dist = side === 0 ? sideX - dx : sideY - dy;
            const along = side === 0 ? v + (dist * ry) : u + (dist * rx);
            hit.dist = dist;
            hit.side = side;
            hit.col = col;
            hit.row = row;
            hit.wallX = along - Math.floor(along);
            hit.value = map.wallValue(col, row);
            return hit;
        }
    }
    return null;
};

const facingIndex = (spriteDirection, fromSprite) => {
    const bearing = Math.atan2(fromSprite.x, fromSprite.y) * 180 / Math.PI;
    const rel = ((wrapDegrees(spriteDirection - bearing) + 360) % 360);
    return Math.round(rel / (360 / FACINGS)) % FACINGS;
};

const createFrame = () => ({
    width: WIDTH,
    height: HEIGHT,
    pixels: new Uint32Array(WIDTH * HEIGHT),
    zbuffer: new Float32Array(WIDTH),
    heights: new Float32Array(WIDTH),
    hit: {dist: 0, side: 0, col: 0, row: 0, wallX: 0, value: 0},
    view: {dir: {x: 0, y: 0}, plane: {x: 0, y: 0}, focal: 0},
    placed: [],
    result: {crosshair: '', target: null, ahead: Infinity}
});

const eyeOf = scene => clampEye(typeof scene.eye === 'number' ? scene.eye : DEFAULT_EYE) / 100;

const drawSurfaces = (frame, scene, view, eye, fog, fogColor) => {
    const {pixels} = frame;
    const half = HEIGHT / 2;
    for (let y = 0; y < HEIGHT; y++) {
        let color;
        if (fog <= 0) {
            color = y < half ? scene.ceiling : scene.floor;
        } else if (y < half) {
            color = tint(scene.ceiling, 1, fogFactor(fog, ((1 - eye) * view.focal) / (half - y - 0.5)), fogColor);
        } else {
            color = tint(scene.floor, 1, fogFactor(fog, (eye * view.focal) / (y + 0.5 - half)), fogColor);
        }
        pixels.fill(color, y * WIDTH, (y + 1) * WIDTH);
    }
};

const drawWalls = (frame, scene, view, eye, fog, fogColor) => {
    const {pixels, zbuffer, heights} = frame;
    const {dir, plane, focal} = view;
    const half = HEIGHT / 2;
    for (let x = 0; x < WIDTH; x++) {
        const camX = ((2 * (x + 0.5)) / WIDTH) - 1;
        const rx = dir.x + (plane.x * camX);
        const ry = dir.y + (plane.y * camX);
        const hit = castRay(scene.map, scene.player.u, scene.player.v, rx, ry, frame.hit);
        if (!hit) {
            zbuffer[x] = Infinity;
            heights[x] = 0;
            continue;
        }
        const dist = Math.max(1e-4, hit.dist);
        const lineH = focal / dist;
        zbuffer[x] = dist;
        heights[x] = lineH;
        const top = half - ((1 - eye) * lineH);
        const y0 = Math.max(0, Math.floor(top));
        const y1 = Math.min(HEIGHT, Math.ceil(half + (eye * lineH)));
        const tex = scene.texture ? scene.texture(hit.value) : null;
        const k = hit.side === 1 ? SIDE_SHADE : 1;
        const f = fogFactor(fog, dist);
        if (!tex) {
            const flat = tint(scene.wallColor ? scene.wallColor(hit.value) : pixel(160, 160, 170), k, f, fogColor);
            for (let y = y0; y < y1; y++) pixels[(y * WIDTH) + x] = flat;
            continue;
        }
        let tx = Math.floor(hit.wallX * tex.width);
        if ((hit.side === 0 && rx < 0) || (hit.side === 1 && ry > 0)) {
            tx = tex.width - tx - 1;
        }
        tx = clamp(tx, 0, tex.width - 1);
        const step = tex.height / lineH;
        let ty = (y0 - top) * step;
        const plain = k === 1 && f === 0;
        for (let y = y0; y < y1; y++) {
            const ti = clamp(Math.floor(ty), 0, tex.height - 1);
            ty += step;
            const c = tex.data[(ti * tex.width) + tx];
            if ((c >>> 24) < ALPHA_MIN) continue;
            pixels[(y * WIDTH) + x] = plain ? (c | OPAQUE) >>> 0 : tint(c, k, f, fogColor);
        }
    }
};

const place = (frame, count, sprite, tx, depth) => {
    let item = frame.placed[count];
    if (!item) {
        item = {sprite: null, tx: 0, depth: 0};
        frame.placed[count] = item;
    }
    item.sprite = sprite;
    item.tx = tx;
    item.depth = depth;
};

const sortFarToNear = (placed, count) => {
    for (let i = 1; i < count; i++) {
        const item = placed[i];
        let j = i - 1;
        while (j >= 0 && placed[j].depth < item.depth) {
            placed[j + 1] = placed[j];
            j--;
        }
        placed[j + 1] = item;
    }
};

const drawSprites = (frame, scene, view, eye, fog, fogColor) => {
    const {pixels, zbuffer, placed, result} = frame;
    const {dir, plane, focal} = view;
    const det = (plane.x * dir.y) - (dir.x * plane.y);
    const inv = 1 / det;
    const half = HEIGHT / 2;
    const centre = WIDTH >> 1;
    const sprites = scene.sprites || [];
    const total = typeof scene.spriteCount === 'number' ? scene.spriteCount : sprites.length;
    let count = 0;
    for (let i = 0; i < total; i++) {
        const sprite = sprites[i];
        if (!sprite || !sprite.image) continue;
        const rx = sprite.u - scene.player.u;
        const ry = sprite.v - scene.player.v;
        const tx = inv * ((dir.y * rx) - (dir.x * ry));
        const depth = inv * ((-plane.y * rx) + (plane.x * ry));
        if (depth <= 0.05) continue;
        place(frame, count, sprite, tx, depth);
        count++;
    }
    sortFarToNear(placed, count);
    let crosshairDepth = zbuffer[centre];
    for (let i = 0; i < count; i++) {
        const {sprite, depth} = placed[i];
        const img = sprite.image;
        const screenX = (WIDTH / 2) * (1 + (placed[i].tx / depth));
        const h = (focal * (sprite.height || 1)) / depth;
        const w = h * (img.width / img.height);
        const bottom = half + (((eye - (sprite.elevation || 0)) * focal) / depth);
        const top = bottom - h;
        const left = screenX - (w / 2);
        const x0 = Math.max(0, Math.floor(left));
        const x1 = Math.min(WIDTH, Math.ceil(left + w));
        const y0 = Math.max(0, Math.floor(top));
        const y1 = Math.min(HEIGHT, Math.ceil(bottom));
        const f = fogFactor(fog, depth);
        for (let x = x0; x < x1; x++) {
            if (depth >= zbuffer[x]) continue;
            const sx = clamp(Math.floor(((x + 0.5 - left) / w) * img.width), 0, img.width - 1);
            let drew = false;
            for (let y = y0; y < y1; y++) {
                const sy = clamp(Math.floor(((y + 0.5 - top) / h) * img.height), 0, img.height - 1);
                const c = img.data[(sy * img.width) + sx];
                if ((c >>> 24) < ALPHA_MIN) continue;
                pixels[(y * WIDTH) + x] = f === 0 ? (c | OPAQUE) >>> 0 : tint(c, 1, f, fogColor);
                drew = true;
            }
            if (drew && x === centre && depth < crosshairDepth) {
                result.crosshair = sprite.name;
                result.target = sprite.target || null;
                crosshairDepth = depth;
            }
        }
    }
    for (let i = 0; i < count; i++) placed[i].sprite = null;
};

const render = (frame, scene) => {
    const view = basis(scene.player.direction, scene.fov, frame.view);
    const eye = eyeOf(scene);
    const fog = clampFog(scene.fog);
    const fogColor = mixColors(scene.floor, scene.ceiling);
    const result = frame.result;
    result.crosshair = '';
    result.target = null;
    drawSurfaces(frame, scene, view, eye, fog, fogColor);
    drawWalls(frame, scene, view, eye, fog, fogColor);
    drawSprites(frame, scene, view, eye, fog, fogColor);
    result.ahead = frame.zbuffer[WIDTH >> 1];
    return result;
};

const gridMap = (grid, flagsAt, solidBit) => ({
    cols: grid.cols,
    rows: grid.rows,
    solid: (col, row) => col < 0 || row < 0 || col >= grid.cols || row >= grid.rows ||
        (flagsAt(grid, col, row) & solidBit) !== 0,
    wallValue: (col, row) => {
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 0;
        return grid.main[(row * grid.cols) + col];
    }
});

const toCell = (grid, x, y) => ({
    u: (x - grid.origin[0]) / grid.tileSize,
    v: (grid.origin[1] - y) / grid.tileSize
});

const fromCell = (grid, u, v) => ({
    x: grid.origin[0] + (u * grid.tileSize),
    y: grid.origin[1] - (v * grid.tileSize)
});

export {
    WIDTH,
    HEIGHT,
    DEFAULT_FOV,
    MIN_FOV,
    MAX_FOV,
    DEFAULT_EYE,
    MIN_EYE,
    MAX_EYE,
    FACINGS,
    pixel,
    shade,
    tint,
    mixColors,
    parseColor,
    clampFov,
    clampEye,
    clampFog,
    fogEnd,
    fogFactor,
    wrapDegrees,
    basis,
    castRay,
    facingIndex,
    createFrame,
    render,
    gridMap,
    toCell,
    fromCell
};
