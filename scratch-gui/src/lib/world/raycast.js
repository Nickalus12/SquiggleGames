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

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

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

const basis = (direction, fov, out, width) => {
    const a = rad(direction);
    const k = Math.tan(rad(clampFov(fov)) / 2);
    const view = out || {dir: {x: 0, y: 0}, plane: {x: 0, y: 0}, focal: 0};
    const w = width || WIDTH;
    view.dir.x = Math.sin(a);
    view.dir.y = -Math.cos(a);
    view.plane.x = Math.cos(a) * k;
    view.plane.y = Math.sin(a) * k;
    view.focal = (w / 2) / k;
    return view;
};

const castRay = (map, u, v, rx, ry, out) => {
    let col = Math.floor(u) | 0;
    let row = Math.floor(v) | 0;
    const dx = rx === 0 ? Infinity : Math.abs(1 / rx);
    const dy = ry === 0 ? Infinity : Math.abs(1 / ry);
    const stepX = rx < 0 ? -1 : 1;
    const stepY = ry < 0 ? -1 : 1;
    let sideX = rx < 0 ? (u - col) * dx : (col + 1 - u) * dx;
    let sideY = ry < 0 ? (v - row) * dy : (row + 1 - v) * dy;
    let side = 0;
    const main = map._main;
    if (main) {
        const cols = map.cols | 0;
        const rows = map.rows | 0;
        const flags = map._flags;
        const tiles = map._tiles;
        const bit = map._bit | 0;
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
            const oob = col < 0 || row < 0 || col >= cols || row >= rows;
            let solid = oob;
            let val = 0;
            if (!oob) {
                const idx = (row * cols) + col;
                val = main[idx];
                const tf = val > 0 && tiles[val - 1] ? tiles[val - 1].flags : 0;
                solid = ((flags[idx] | tf) & bit) !== 0;
            }
            if (solid) {
                const hit = out || {};
                const dist = side === 0 ? sideX - dx : sideY - dy;
                const along = side === 0 ? v + (dist * ry) : u + (dist * rx);
                hit.dist = dist;
                hit.side = side;
                hit.col = col;
                hit.row = row;
                hit.wallX = along - Math.floor(along);
                hit.value = val;
                return hit;
            }
        }
        return null;
    }
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

const facingIndex = (spriteDirection, fromSprite, dy) => {
    const x = typeof dy === 'number' ? fromSprite : fromSprite.x;
    const y = typeof dy === 'number' ? dy : fromSprite.y;
    const bearing = Math.atan2(x, y) * 180 / Math.PI;
    const rel = ((wrapDegrees(spriteDirection - bearing) + 360) % 360);
    return Math.round(rel / (360 / FACINGS)) % FACINGS;
};

const createFrame = (width, height) => {
    const w = Math.max(60, Math.round(Number(width) || WIDTH));
    const h = Math.max(45, Math.round(Number(height) || HEIGHT));
    return {
        width: w,
        height: h,
        pixels: new Uint32Array(w * h),
        zbuffer: new Float32Array(w),
        heights: new Float32Array(w),
        bgPixels: new Uint32Array(w * h),
        bgZbuffer: new Float32Array(w),
        bgHeights: new Float32Array(w),
        rowColors: new Uint32Array(h),
        syRow: new Int32Array(h),
        colOk: new Uint8Array(w),
        colSide: new Uint8Array(w),
        colVal: new Int32Array(w),
        colDist: new Float64Array(w),
        colWallX: new Float64Array(w),
        colRx: new Float64Array(w),
        colRy: new Float64Array(w),
        hit: {dist: 0, side: 0, col: 0, row: 0, wallX: 0, value: 0},
        view: {dir: {x: 0, y: 0}, plane: {x: 0, y: 0}, focal: 0},
        placed: [],
        result: {crosshair: '', target: null, ahead: Infinity},
        timings: null,
        _surfCeiling: -1,
        _surfFloor: -1,
        _surfFog: -1,
        _surfEye: -1,
        _surfFocal: -1,
        _rayMap: null,
        _rayWallKey: -1,
        _rayU: NaN,
        _rayV: NaN,
        _rayDir: NaN,
        _rayFov: NaN,
        _bgValid: false,
        _bgEye: NaN,
        _bgFog: NaN,
        _bgFloor: -1,
        _bgCeiling: -1,
        _bgTex: null,
        _bgWallColor: null
    };
};

const eyeOf = scene => clampEye(typeof scene.eye === 'number' ? scene.eye : DEFAULT_EYE) / 100;

const drawSurfaces = (frame, scene, view, eye, fog, fogColor) => {
    const {pixels, rowColors} = frame;
    const w = frame.width || WIDTH;
    const h = frame.height || HEIGHT;
    if (frame._surfCeiling !== scene.ceiling || frame._surfFloor !== scene.floor ||
        frame._surfFog !== fog || frame._surfEye !== eye || frame._surfFocal !== view.focal) {
        frame._surfCeiling = scene.ceiling;
        frame._surfFloor = scene.floor;
        frame._surfFog = fog;
        frame._surfEye = eye;
        frame._surfFocal = view.focal;
        const half = h / 2;
        for (let y = 0; y < h; y++) {
            let color;
            if (fog <= 0) {
                color = y < half ? scene.ceiling : scene.floor;
            } else if (y < half) {
                color = tint(scene.ceiling, 1, fogFactor(fog, ((1 - eye) * view.focal) / (half - y - 0.5)), fogColor);
            } else {
                color = tint(scene.floor, 1, fogFactor(fog, (eye * view.focal) / (y + 0.5 - half)), fogColor);
            }
            rowColors[y] = color;
        }
    }
    for (let y = 0, rowStart = 0; y < h; y++, rowStart += w) {
        pixels.fill(rowColors[y], rowStart, rowStart + w);
    }
};

const castColumns = (frame, scene, view) => {
    const w = frame.width || WIDTH;
    const wallKey = typeof scene.wallKey === 'number' ? scene.wallKey : 0;
    const u = scene.player.u;
    const v = scene.player.v;
    const dir = scene.player.direction;
    const fov = clampFov(scene.fov);
    if (frame._rayMap === scene.map && frame._rayWallKey === wallKey &&
        frame._rayU === u && frame._rayV === v && frame._rayDir === dir && frame._rayFov === fov) {
        return true;
    }
    const {colOk, colSide, colVal, colDist, colWallX, colRx, colRy, hit} = frame;
    const {dir: vDir, plane} = view;
    const map = scene.map;
    for (let x = 0; x < w; x++) {
        const camX = ((2 * (x + 0.5)) / w) - 1;
        const rx = vDir.x + (plane.x * camX);
        const ry = vDir.y + (plane.y * camX);
        colRx[x] = rx;
        colRy[x] = ry;
        const h = castRay(map, u, v, rx, ry, hit);
        if (!h) {
            colOk[x] = 0;
            continue;
        }
        colOk[x] = 1;
        colSide[x] = h.side;
        colVal[x] = h.value;
        colDist[x] = h.dist;
        colWallX[x] = h.wallX;
    }
    frame._rayMap = map;
    frame._rayWallKey = wallKey;
    frame._rayU = u;
    frame._rayV = v;
    frame._rayDir = dir;
    frame._rayFov = fov;
    frame._bgValid = false;
    return false;
};

const sampleWalls = (frame, scene, view, eye, fog, fogColor) => {
    const {pixels, zbuffer, heights, colOk, colSide, colVal, colDist, colWallX, colRx, colRy} = frame;
    const {focal} = view;
    const w = frame.width || WIDTH;
    const h = frame.height || HEIGHT;
    const half = h / 2;
    const getTex = scene.texture;
    const getWallColor = scene.wallColor;
    for (let x = 0; x < w; x++) {
        if (!colOk[x]) {
            zbuffer[x] = Infinity;
            heights[x] = 0;
            continue;
        }
        const dist = Math.max(1e-4, colDist[x]);
        const lineH = focal / dist;
        zbuffer[x] = dist;
        heights[x] = lineH;
        const top = half - ((1 - eye) * lineH);
        const y0 = Math.max(0, Math.floor(top));
        const y1 = Math.min(h, Math.ceil(half + (eye * lineH)));
        const val = colVal[x];
        const side = colSide[x];
        const tex = getTex ? getTex(val) : null;
        const k = side === 1 ? SIDE_SHADE : 1;
        const f = fogFactor(fog, dist);
        if (!tex) {
            const flat = tint(getWallColor ? getWallColor(val) : pixel(160, 160, 170), k, f, fogColor);
            for (let y = y0, pixIdx = (y0 * w) + x; y < y1; y++, pixIdx += w) pixels[pixIdx] = flat;
            continue;
        }
        const texW = tex.width | 0;
        const texH = tex.height | 0;
        const texHMax = texH - 1;
        let tx = Math.floor(colWallX[x] * texW) | 0;
        if ((side === 0 && colRx[x] < 0) || (side === 1 && colRy[x] > 0)) {
            tx = texW - tx - 1;
        }
        if (tx < 0) tx = 0;
        else if (tx >= texW) tx = texW - 1;
        const step = texH / lineH;
        let ty = (y0 - top) * step;
        const plain = k === 1 && f === 0;
        const texData = tex.data;
        let pixIdx = (y0 * w) + x;
        if (plain) {
            for (let y = y0; y < y1; y++, pixIdx += w) {
                let ti = Math.floor(ty) | 0;
                ty += step;
                if (ti < 0) ti = 0;
                else if (ti > texHMax) ti = texHMax;
                const c = texData[(ti * texW) + tx];
                if ((c >>> 24) < ALPHA_MIN) continue;
                pixels[pixIdx] = (c | OPAQUE) >>> 0;
            }
        } else {
            const keep = k * (1 - f);
            const fogR = (fogColor & 255) * f;
            const fogG = ((fogColor >>> 8) & 255) * f;
            const fogB = ((fogColor >>> 16) & 255) * f;
            let prevC = -1;
            let prevOut = 0;
            for (let y = y0; y < y1; y++, pixIdx += w) {
                let ti = Math.floor(ty) | 0;
                ty += step;
                if (ti < 0) ti = 0;
                else if (ti > texHMax) ti = texHMax;
                const c = texData[(ti * texW) + tx];
                if ((c >>> 24) < ALPHA_MIN) continue;
                if (c !== prevC) {
                    prevC = c;
                    const r = (((c & 255) * keep) + fogR) & 255;
                    const g = ((((c >>> 8) & 255) * keep) + fogG) & 255;
                    const b = ((((c >>> 16) & 255) * keep) + fogB) & 255;
                    prevOut = (OPAQUE | (b << 16) | (g << 8) | r) >>> 0;
                }
                pixels[pixIdx] = prevOut;
            }
        }
    }
};

const place = (frame, count, sprite, tx, depth, left, top, w, h, x0, x1, y0, y1) => {
    let item = frame.placed[count];
    if (!item) {
        item = {sprite: null, tx: 0, depth: 0, left: 0, top: 0, w: 0, h: 0, x0: 0, x1: 0, y0: 0, y1: 0};
        frame.placed[count] = item;
    }
    item.sprite = sprite;
    item.tx = tx;
    item.depth = depth;
    item.left = left;
    item.top = top;
    item.w = w;
    item.h = h;
    item.x0 = x0;
    item.x1 = x1;
    item.y0 = y0;
    item.y1 = y1;
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
    const {pixels, zbuffer, placed, result, syRow} = frame;
    const {dir, plane, focal} = view;
    const fw = frame.width || WIDTH;
    const fh = frame.height || HEIGHT;
    const det = (plane.x * dir.y) - (dir.x * plane.y);
    const inv = 1 / det;
    const half = fh / 2;
    const centre = fw >> 1;
    const sprites = scene.sprites || [];
    const total = typeof scene.spriteCount === 'number' ? scene.spriteCount : sprites.length;
    let count = 0;
    for (let i = 0; i < total; i++) {
        const sprite = sprites[i];
        if (!sprite || !sprite.image) continue;
        const rx = sprite.u - scene.player.u;
        const ry = sprite.v - scene.player.v;
        const depth = inv * ((-plane.y * rx) + (plane.x * ry));
        if (depth <= 0.05) continue;
        const tx = inv * ((dir.y * rx) - (dir.x * ry));
        const img = sprite.image;
        const screenX = (fw / 2) * (1 + (tx / depth));
        const h = (focal * (sprite.height || 1)) / depth;
        const w = h * (img.width / img.height);
        const left = screenX - (w / 2);
        const x0 = Math.max(0, Math.floor(left));
        const x1 = Math.min(fw, Math.ceil(left + w));
        if (x0 >= x1) continue;
        const bottom = half + (((eye - (sprite.elevation || 0)) * focal) / depth);
        const top = bottom - h;
        const y0 = Math.max(0, Math.floor(top));
        const y1 = Math.min(fh, Math.ceil(bottom));
        if (y0 >= y1) continue;
        place(frame, count, sprite, tx, depth, left, top, w, h, x0, x1, y0, y1);
        count++;
    }
    sortFarToNear(placed, count);
    let crosshairDepth = zbuffer[centre];
    for (let i = 0; i < count; i++) {
        const {sprite, depth, left, top, w, h, x0, x1, y0, y1} = placed[i];
        const img = sprite.image;
        const imgW = img.width | 0;
        const imgH = img.height | 0;
        const imgWMax = imgW - 1;
        const imgHMax = imgH - 1;
        const imgData = img.data;
        for (let y = y0; y < y1; y++) {
            let sy = Math.floor(((y + 0.5 - top) / h) * imgH) | 0;
            if (sy < 0) sy = 0;
            else if (sy > imgHMax) sy = imgHMax;
            syRow[y] = sy * imgW;
        }
        const f = fogFactor(fog, depth);
        const plain = f === 0;
        const keep = 1 - f;
        const fogR = (fogColor & 255) * f;
        const fogG = ((fogColor >>> 8) & 255) * f;
        const fogB = ((fogColor >>> 16) & 255) * f;
        for (let x = x0; x < x1; x++) {
            if (depth >= zbuffer[x]) continue;
            let sx = Math.floor(((x + 0.5 - left) / w) * imgW) | 0;
            if (sx < 0) sx = 0;
            else if (sx > imgWMax) sx = imgWMax;
            let drew = false;
            let pixIdx = (y0 * fw) + x;
            if (plain) {
                for (let y = y0; y < y1; y++, pixIdx += fw) {
                    const c = imgData[syRow[y] + sx];
                    if ((c >>> 24) < ALPHA_MIN) continue;
                    pixels[pixIdx] = (c | OPAQUE) >>> 0;
                    drew = true;
                }
            } else {
                let prevC = -1;
                let prevOut = 0;
                for (let y = y0; y < y1; y++, pixIdx += fw) {
                    const c = imgData[syRow[y] + sx];
                    if ((c >>> 24) < ALPHA_MIN) continue;
                    if (c !== prevC) {
                        prevC = c;
                        const r = (((c & 255) * keep) + fogR) & 255;
                        const g = ((((c >>> 8) & 255) * keep) + fogG) & 255;
                        const b = ((((c >>> 16) & 255) * keep) + fogB) & 255;
                        prevOut = (OPAQUE | (b << 16) | (g << 8) | r) >>> 0;
                    }
                    pixels[pixIdx] = prevOut;
                    drew = true;
                }
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

const pickCrosshair = (frame, scene) => {
    const fw = frame.width || WIDTH;
    const fh = frame.height || HEIGHT;
    const view = basis(scene.player.direction, scene.fov, frame.view, fw);
    const eye = eyeOf(scene);
    const half = fh / 2;
    const centre = fw >> 1;
    const camX = ((2 * (centre + 0.5)) / fw) - 1;
    const rx0 = view.dir.x + (view.plane.x * camX);
    const ry0 = view.dir.y + (view.plane.y * camX);
    const hit = castRay(scene.map, scene.player.u, scene.player.v, rx0, ry0, frame.hit);
    let crosshairDepth = hit ? Math.max(1e-4, hit.dist) : Infinity;
    let crosshair = '';
    let target = null;
    const {dir, plane, focal} = view;
    const det = (plane.x * dir.y) - (dir.x * plane.y);
    const inv = 1 / det;
    const sprites = scene.sprites || [];
    const total = typeof scene.spriteCount === 'number' ? scene.spriteCount : sprites.length;
    for (let i = 0; i < total; i++) {
        const sprite = sprites[i];
        if (!sprite || !sprite.image) continue;
        const rx = sprite.u - scene.player.u;
        const ry = sprite.v - scene.player.v;
        const depth = inv * ((-plane.y * rx) + (plane.x * ry));
        if (depth <= 0.05 || depth >= crosshairDepth) continue;
        const tx = inv * ((dir.y * rx) - (dir.x * ry));
        const img = sprite.image;
        const screenX = (fw / 2) * (1 + (tx / depth));
        const h = (focal * (sprite.height || 1)) / depth;
        const w = h * (img.width / img.height);
        const left = screenX - (w / 2);
        const x0 = Math.max(0, Math.floor(left));
        const x1 = Math.min(fw, Math.ceil(left + w));
        if (centre < x0 || centre >= x1) continue;
        const bottom = half + (((eye - (sprite.elevation || 0)) * focal) / depth);
        const top = bottom - h;
        const y0 = Math.max(0, Math.floor(top));
        const y1 = Math.min(fh, Math.ceil(bottom));
        if (y0 >= y1) continue;
        const imgW = img.width | 0;
        const imgH = img.height | 0;
        const sx = clamp(Math.floor(((centre + 0.5 - left) / w) * imgW) | 0, 0, imgW - 1);
        const imgData = img.data;
        for (let y = y0; y < y1; y++) {
            const sy = clamp(Math.floor(((y + 0.5 - top) / h) * imgH) | 0, 0, imgH - 1);
            if ((imgData[(sy * imgW) + sx] >>> 24) >= ALPHA_MIN) {
                crosshair = sprite.name;
                target = sprite.target || null;
                crosshairDepth = depth;
                break;
            }
        }
    }
    return {crosshair, target};
};

const render = (frame, scene) => {
    const fw = frame.width || WIDTH;
    const view = basis(scene.player.direction, scene.fov, frame.view, fw);
    const eye = eyeOf(scene);
    const fog = clampFog(scene.fog);
    const fogColor = mixColors(scene.floor, scene.ceiling);
    const result = frame.result;
    const timings = frame.timings;
    result.crosshair = '';
    result.target = null;
    const tRay0 = timings ? now() : 0;
    const rayCached = castColumns(frame, scene, view);
    const rayMs = timings ? now() - tRay0 : 0;
    if (rayCached && frame._bgValid &&
        frame._bgEye === eye && frame._bgFog === fog &&
        frame._bgFloor === scene.floor && frame._bgCeiling === scene.ceiling &&
        frame._bgTex === scene.texture && frame._bgWallColor === scene.wallColor) {
        const t0 = timings ? now() : 0;
        frame.pixels.set(frame.bgPixels);
        frame.zbuffer.set(frame.bgZbuffer);
        frame.heights.set(frame.bgHeights);
        if (timings) {
            timings.surfacesMs = now() - t0;
            timings.raycastMs = 0;
            timings.wallTexMs = 0;
        }
    } else {
        const t0 = timings ? now() : 0;
        drawSurfaces(frame, scene, view, eye, fog, fogColor);
        const t1 = timings ? now() : 0;
        sampleWalls(frame, scene, view, eye, fog, fogColor);
        const t2 = timings ? now() : 0;
        if (timings) {
            timings.surfacesMs = t1 - t0;
            timings.raycastMs = rayMs;
            timings.wallTexMs = t2 - t1;
        }
        frame.bgPixels.set(frame.pixels);
        frame.bgZbuffer.set(frame.zbuffer);
        frame.bgHeights.set(frame.heights);
        frame._bgValid = true;
        frame._bgEye = eye;
        frame._bgFog = fog;
        frame._bgFloor = scene.floor;
        frame._bgCeiling = scene.ceiling;
        frame._bgTex = scene.texture;
        frame._bgWallColor = scene.wallColor;
    }
    const tSpr0 = timings ? now() : 0;
    drawSprites(frame, scene, view, eye, fog, fogColor);
    if (timings) timings.spritesMs = now() - tSpr0;
    result.ahead = frame.zbuffer[fw >> 1];
    return result;
};

const gridMap = (grid, flagsAt, solidBit) => {
    const hasDirect = Boolean(grid && grid.main && grid.flags && Array.isArray(grid.tiles));
    return {
        cols: grid.cols,
        rows: grid.rows,
        _main: hasDirect ? grid.main : null,
        _flags: hasDirect ? grid.flags : null,
        _tiles: hasDirect ? grid.tiles : null,
        _bit: solidBit | 0,
        solid: (col, row) => col < 0 || row < 0 || col >= grid.cols || row >= grid.rows ||
            (flagsAt(grid, col, row) & solidBit) !== 0,
        wallValue: (col, row) => {
            if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 0;
            return grid.main[(row * grid.cols) + col];
        }
    };
};

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
    pickCrosshair,
    render,
    gridMap,
    toCell,
    fromCell
};
