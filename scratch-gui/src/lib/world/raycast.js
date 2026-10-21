const WIDTH = 240;
const HEIGHT = 180;
const DEFAULT_FOV = 66;
const MIN_FOV = 20;
const MAX_FOV = 140;
const MAX_STEPS = 512;
const RADIUS = 0.2;
const SIDE_SHADE = 0.72;
const ALPHA_MIN = 128;
const FACINGS = 8;

const rad = deg => deg * Math.PI / 180;

const wrapDegrees = deg => {
    const d = ((deg % 360) + 360) % 360;
    return d > 180 ? d - 360 : d;
};

const pixel = (r, g, b) => (((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0);

const shade = (value, k) => {
    const r = (value & 255) * k;
    const g = ((value >>> 8) & 255) * k;
    const b = ((value >>> 16) & 255) * k;
    return pixel(r, g, b);
};

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
    return Math.max(MIN_FOV, Math.min(MAX_FOV, n));
};

const basis = (direction, fov) => {
    const a = rad(direction);
    const dir = {x: Math.sin(a), y: -Math.cos(a)};
    const k = Math.tan(rad(clampFov(fov)) / 2);
    return {dir, plane: {x: Math.cos(a) * k, y: Math.sin(a) * k}, focal: (WIDTH / 2) / k};
};

const castRay = (map, u, v, rx, ry) => {
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
            const dist = side === 0 ? sideX - dx : sideY - dy;
            let wallX = side === 0 ? v + (dist * ry) : u + (dist * rx);
            wallX -= Math.floor(wallX);
            return {dist, side, col, row, wallX, value: map.wallValue(col, row)};
        }
    }
    return null;
};

const distanceAhead = (map, player) => {
    const {dir} = basis(player.direction, DEFAULT_FOV);
    const hit = castRay(map, player.u, player.v, dir.x, dir.y);
    return hit ? hit.dist : Infinity;
};

const blocked = (map, u, v, radius) => (
    map.solid(Math.floor(u - radius), Math.floor(v - radius)) ||
    map.solid(Math.floor(u + radius), Math.floor(v - radius)) ||
    map.solid(Math.floor(u - radius), Math.floor(v + radius)) ||
    map.solid(Math.floor(u + radius), Math.floor(v + radius))
);

const moveAhead = (map, player, cells, radius) => {
    const r = typeof radius === 'number' ? radius : RADIUS;
    const a = rad(player.direction);
    const total = Number(cells) || 0;
    const parts = Math.max(1, Math.ceil(Math.abs(total) / 0.25));
    const du = (Math.sin(a) * total) / parts;
    const dv = (-Math.cos(a) * total) / parts;
    let u = player.u;
    let v = player.v;
    let hit = false;
    for (let i = 0; i < parts; i++) {
        if (blocked(map, u + du, v, r)) hit = true;
        else u += du;
        if (blocked(map, u, v + dv, r)) hit = true;
        else v += dv;
    }
    return {u, v, hit};
};

const facingIndex = (spriteDirection, fromSprite) => {
    const bearing = Math.atan2(fromSprite.x, fromSprite.y) * 180 / Math.PI;
    const rel = ((wrapDegrees(bearing - spriteDirection) + 360) % 360);
    return Math.round(rel / (360 / FACINGS)) % FACINGS;
};

const createFrame = () => ({
    width: WIDTH,
    height: HEIGHT,
    pixels: new Uint32Array(WIDTH * HEIGHT),
    zbuffer: new Float32Array(WIDTH),
    heights: new Float32Array(WIDTH)
});

const drawWalls = (frame, scene, view) => {
    const {pixels, zbuffer, heights} = frame;
    const {dir, plane, focal} = view;
    const half = HEIGHT / 2;
    for (let x = 0; x < WIDTH; x++) {
        const camX = ((2 * (x + 0.5)) / WIDTH) - 1;
        const rx = dir.x + (plane.x * camX);
        const ry = dir.y + (plane.y * camX);
        const hit = castRay(scene.map, scene.player.u, scene.player.v, rx, ry);
        if (!hit) {
            zbuffer[x] = Infinity;
            heights[x] = 0;
            continue;
        }
        const dist = Math.max(1e-4, hit.dist);
        const lineH = focal / dist;
        zbuffer[x] = dist;
        heights[x] = lineH;
        const top = half - (lineH / 2);
        const y0 = Math.max(0, Math.floor(top));
        const y1 = Math.min(HEIGHT, Math.ceil(half + (lineH / 2)));
        const tex = scene.texture ? scene.texture(hit.value) : null;
        const k = hit.side === 1 ? SIDE_SHADE : 1;
        if (!tex) {
            const flat = shade(scene.wallColor ? scene.wallColor(hit.value) : pixel(160, 160, 170), k);
            for (let y = y0; y < y1; y++) pixels[(y * WIDTH) + x] = flat;
            continue;
        }
        let tx = Math.floor(hit.wallX * tex.width);
        if ((hit.side === 0 && rx < 0) || (hit.side === 1 && ry > 0)) {
            tx = tex.width - tx - 1;
        }
        tx = Math.max(0, Math.min(tex.width - 1, tx));
        const step = tex.height / lineH;
        let ty = (y0 - top) * step;
        for (let y = y0; y < y1; y++) {
            const ti = Math.min(tex.height - 1, Math.max(0, Math.floor(ty)));
            ty += step;
            const c = tex.data[(ti * tex.width) + tx];
            pixels[(y * WIDTH) + x] = (c >>> 24) < ALPHA_MIN ? shade(scene.ceiling, 1) : (k === 1 ? c : shade(c, k));
        }
    }
};

const drawSprites = (frame, scene, view) => {
    const {pixels, zbuffer} = frame;
    const {dir, plane, focal} = view;
    const det = (plane.x * dir.y) - (dir.x * plane.y);
    const inv = 1 / det;
    const half = HEIGHT / 2;
    const centre = WIDTH >> 1;
    const placed = [];
    for (const sprite of scene.sprites || []) {
        if (!sprite.image) continue;
        const rx = sprite.u - scene.player.u;
        const ry = sprite.v - scene.player.v;
        const tx = inv * ((dir.y * rx) - (dir.x * ry));
        const depth = inv * ((-plane.y * rx) + (plane.x * ry));
        if (depth <= 0.05) continue;
        placed.push({sprite, tx, depth});
    }
    placed.sort((a, b) => b.depth - a.depth);
    let crosshair = '';
    let crosshairDepth = zbuffer[centre];
    for (const item of placed) {
        const {sprite, depth} = item;
        const img = sprite.image;
        const screenX = (WIDTH / 2) + ((item.tx / depth) * focal);
        const h = (focal * (sprite.height || 1)) / depth;
        const w = h * (img.width / img.height);
        const bottom = half + ((focal * 0.5) / depth);
        const top = bottom - h;
        const left = screenX - (w / 2);
        const x0 = Math.max(0, Math.floor(left));
        const x1 = Math.min(WIDTH, Math.ceil(left + w));
        const y0 = Math.max(0, Math.floor(top));
        const y1 = Math.min(HEIGHT, Math.ceil(bottom));
        for (let x = x0; x < x1; x++) {
            if (depth >= zbuffer[x]) continue;
            const sx = Math.min(img.width - 1, Math.floor(((x + 0.5 - left) / w) * img.width));
            let drew = false;
            for (let y = y0; y < y1; y++) {
                const sy = Math.min(img.height - 1, Math.floor(((y + 0.5 - top) / h) * img.height));
                const c = img.data[(sy * img.width) + sx];
                if ((c >>> 24) < ALPHA_MIN) continue;
                pixels[(y * WIDTH) + x] = c;
                drew = true;
            }
            if (drew && x === centre && depth < crosshairDepth) {
                crosshair = sprite.name;
                crosshairDepth = depth;
            }
        }
    }
    return crosshair;
};

const render = (frame, scene) => {
    const view = basis(scene.player.direction, scene.fov);
    const half = (WIDTH * HEIGHT) / 2;
    frame.pixels.fill(scene.ceiling, 0, half);
    frame.pixels.fill(scene.floor, half);
    drawWalls(frame, scene, view);
    const crosshair = drawSprites(frame, scene, view);
    return {crosshair, ahead: frame.zbuffer[WIDTH >> 1]};
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
    FACINGS,
    pixel,
    shade,
    parseColor,
    clampFov,
    wrapDegrees,
    basis,
    castRay,
    distanceAhead,
    moveAhead,
    facingIndex,
    createFrame,
    render,
    gridMap,
    toCell,
    fromCell
};
