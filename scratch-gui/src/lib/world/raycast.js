import {defaultSkyTexture} from './textures.js';

const WIDTH = 240;
const HEIGHT = 180;
const DEFAULT_FOV = 66;
const MIN_FOV = 20;
const MAX_FOV = 140;
const DEFAULT_EYE = 50;
const MIN_EYE = 5;
const MAX_EYE = 95;
const MAX_STEPS = 512;
const MAX_LIGHTS = 16;
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

const clampFalloff = falloff => {
    const n = Number(falloff);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, 0, 100);
};

const lightFalloffFactor = (falloff, dist) => {
    if (!(falloff > 0) || !(dist > 0)) return 1;
    return 1 / (1 + (dist * falloff * 0.01));
};

const horizonOf = (frame, scene) => {
    const h = frame.height || HEIGHT;
    if (scene && typeof scene.horizon === 'number' && Number.isFinite(scene.horizon)) return scene.horizon;
    if (typeof frame.horizon === 'number' && Number.isFinite(frame.horizon)) return frame.horizon;
    return h / 2;
};

const createLightBuffer = (cols, rows) => {
    const c = Math.max(1, cols | 0);
    const r = Math.max(1, rows | 0);
    const size = c * r;
    const level = new Uint16Array(size);
    level.fill(256);
    return {
        cols: c,
        rows: r,
        level,
        glowR: new Uint8Array(size),
        glowG: new Uint8Array(size),
        glowB: new Uint8Array(size),
        active: false,
        version: 0,
        _lightHash: -1,
        _lightCount: -1,
        _prevU: new Float64Array(MAX_LIGHTS),
        _prevV: new Float64Array(MAX_LIGHTS),
        _prevR: new Float64Array(MAX_LIGHTS),
        _prevC: new Uint32Array(MAX_LIGHTS)
    };
};

const hashBytes = bytes => {
    if (!bytes) return 0;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
    }
    return h >>> 0;
};

const updateLightBuffer = (buf, map, lights) => {
    if (!buf) return false;
    const cols = buf.cols | 0;
    const rows = buf.rows | 0;
    const mapLight = map && map._light && map._light.length === (cols * rows) ? map._light : null;
    const hasMapLight = Boolean(mapLight && (map._hasLight || mapLight.some(v => v !== 100)));
    const raw = Array.isArray(lights) ? lights : [];
    let count = 0;
    for (let i = 0; i < raw.length && count < MAX_LIGHTS; i++) {
        const item = raw[i];
        if (!item || !(item.radius > 0)) continue;
        count++;
    }
    if (!hasMapLight && count === 0) {
        if (buf._lightCount === 0 && !buf.active) return false;
        buf.level.fill(256);
        buf.glowR.fill(0);
        buf.glowG.fill(0);
        buf.glowB.fill(0);
        buf.active = false;
        buf._lightCount = 0;
        buf._lightHash = 0;
        buf.version++;
        return true;
    }
    const mapHash = hasMapLight ? hashBytes(mapLight) : 0;
    let same = count === buf._lightCount && mapHash === buf._lightHash;
    let slot = 0;
    for (let i = 0; i < raw.length && slot < MAX_LIGHTS; i++) {
        const item = raw[i];
        if (!item || !(item.radius > 0)) continue;
        const u = Number(item.u) || 0;
        const v = Number(item.v) || 0;
        const r = Number(item.radius) || 0;
        const c = (item.color >>> 0);
        if (same && (u !== buf._prevU[slot] || v !== buf._prevV[slot] ||
            r !== buf._prevR[slot] || c !== buf._prevC[slot])) {
            same = false;
        }
        buf._prevU[slot] = u;
        buf._prevV[slot] = v;
        buf._prevR[slot] = r;
        buf._prevC[slot] = c;
        slot++;
    }
    if (same) return false;
    buf._lightCount = count;
    buf._lightHash = mapHash;
    const {level, glowR, glowG, glowB} = buf;
    const size = cols * rows;
    if (mapLight) {
        for (let i = 0; i < size; i++) {
            level[i] = (((mapLight[i] * 256) / 100) + 0.5) | 0;
        }
    } else {
        level.fill(256);
    }
    glowR.fill(0);
    glowG.fill(0);
    glowB.fill(0);
    for (let i = 0; i < count; i++) {
        const lu = buf._prevU[i];
        const lv = buf._prevV[i];
        const lightRad = buf._prevR[i];
        const col = buf._prevC[i];
        const lr = col & 255;
        const lg = (col >>> 8) & 255;
        const lb = (col >>> 16) & 255;
        const lum = Math.max(lr, lg, lb);
        const c0 = Math.max(0, Math.floor(lu - lightRad) | 0);
        const c1 = Math.min(cols - 1, Math.floor(lu + lightRad) | 0);
        const r0 = Math.max(0, Math.floor(lv - lightRad) | 0);
        const r1 = Math.min(rows - 1, Math.floor(lv + lightRad) | 0);
        const invRad = 1 / lightRad;
        for (let row = r0; row <= r1; row++) {
            const dv = (row + 0.5) - lv;
            const rowOff = row * cols;
            for (let c = c0; c <= c1; c++) {
                const du = (c + 0.5) - lu;
                const dist = Math.hypot(du, dv);
                if (dist >= lightRad) continue;
                const atten = 1 - (dist * invRad);
                const idx = rowOff + c;
                const nextLvl = level[idx] + ((atten * lum) | 0);
                level[idx] = nextLvl > 320 ? 320 : nextLvl;
                const gr = glowR[idx] + ((atten * lr * 0.45) | 0);
                const gg = glowG[idx] + ((atten * lg * 0.45) | 0);
                const gb = glowB[idx] + ((atten * lb * 0.45) | 0);
                glowR[idx] = gr > 255 ? 255 : gr;
                glowG[idx] = gg > 255 ? 255 : gg;
                glowB[idx] = gb > 255 ? 255 : gb;
            }
        }
    }
    buf.active = true;
    buf.version++;
    return true;
};

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
        horizon: h / 2,
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
        colCol: new Int32Array(w),
        colRow: new Int32Array(w),
        colDist: new Float64Array(w),
        colWallX: new Float64Array(w),
        colRx: new Float64Array(w),
        colRy: new Float64Array(w),
        skyTx: new Int32Array(w),
        lightBuffer: null,
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
        _surfHorizon: NaN,
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
        _bgWallColor: null,
        _bgHorizon: NaN,
        _bgFalloff: NaN,
        _bgFloorMode: '',
        _bgCeilingMode: '',
        _bgFloorTex: null,
        _bgCeilTex: null,
        _bgFloorTextures: true,
        _bgLightVersion: -1
    };
};

const eyeOf = scene => clampEye(typeof scene.eye === 'number' ? scene.eye : DEFAULT_EYE) / 100;

const drawSurfaces = (frame, scene, view, eye, fog, fogColor, lightBuf) => {
    const {pixels, rowColors, skyTx} = frame;
    const w = frame.width || WIDTH;
    const h = frame.height || HEIGHT;
    const half = horizonOf(frame, scene);
    const allowTex = scene.floorTextures !== false;
    const map = scene.map || null;
    const cols = map && map.cols ? (map.cols | 0) : 0;
    const rows = map && map.rows ? (map.rows | 0) : 0;
    const floorGrid = allowTex && map && map._hasFloor ? map._floor : null;
    const ceilGrid = allowTex && map && map._hasCeiling ? map._ceiling : null;
    const getTex = scene.texture || null;
    const floorMode = scene.floorMode || 'color';
    const ceilMode = scene.ceilingMode || 'color';
    const globalFloorTex = allowTex && floorMode !== 'color' ? (scene.floorTex || null) : null;
    const isSky = ceilMode === 'sky';
    const globalCeilTex = !isSky && allowTex && ceilMode !== 'color' ? (scene.ceilingTex || null) : null;
    const falloff = clampFalloff(scene.lightFalloff);
    const hasLightBuf = Boolean(lightBuf && lightBuf.active && cols > 0 && rows > 0);
    const lightLevel = hasLightBuf ? lightBuf.level : null;
    const glowR = hasLightBuf ? lightBuf.glowR : null;
    const glowG = hasLightBuf ? lightBuf.glowG : null;
    const glowB = hasLightBuf ? lightBuf.glowB : null;

    if (!floorGrid && !ceilGrid && !globalFloorTex && !globalCeilTex && !isSky && !hasLightBuf && falloff <= 0) {
        if (frame._surfCeiling !== scene.ceiling || frame._surfFloor !== scene.floor ||
            frame._surfFog !== fog || frame._surfEye !== eye ||
            frame._surfFocal !== view.focal || frame._surfHorizon !== half) {
            frame._surfCeiling = scene.ceiling;
            frame._surfFloor = scene.floor;
            frame._surfFog = fog;
            frame._surfEye = eye;
            frame._surfFocal = view.focal;
            frame._surfHorizon = half;
            for (let y = 0; y < h; y++) {
                let color;
                if (fog <= 0) {
                    color = y < half ? scene.ceiling : scene.floor;
                } else if (y < half) {
                    const dist = ((1 - eye) * view.focal) / Math.max(0.25, (half - y) - 0.5);
                    color = tint(scene.ceiling, 1, fogFactor(fog, dist), fogColor);
                } else {
                    const dist = (eye * view.focal) / Math.max(0.25, (y + 0.5) - half);
                    color = tint(scene.floor, 1, fogFactor(fog, dist), fogColor);
                }
                rowColors[y] = color;
            }
        }
        for (let y = 0, rowStart = 0; y < h; y++, rowStart += w) {
            pixels.fill(rowColors[y], rowStart, rowStart + w);
        }
        return;
    }

    frame._surfHorizon = NaN;
    const pu = scene.player ? scene.player.u : 0;
    const pv = scene.player ? scene.player.v : 0;
    const {dir: vDir, plane} = view;
    const rx0 = vDir.x - plane.x;
    const ry0 = vDir.y - plane.y;
    const rx1 = vDir.x + plane.x;
    const ry1 = vDir.y + plane.y;
    const invW = 1 / w;

    let skyTex = null;
    let skyData = null;
    let skyW = 0;
    let skyH = 0;
    if (isSky) {
        skyTex = scene.skyTex || defaultSkyTexture();
        skyData = skyTex.data;
        skyW = skyTex.width | 0;
        skyH = skyTex.height | 0;
        const dirDeg = scene.player ? Number(scene.player.direction) || 0 : 0;
        const yawOffset = (((dirDeg % 360) + 360) % 360) / 360;
        const fovTurn = clampFov(scene.fov) / 360;
        for (let x = 0; x < w; x++) {
            const u = yawOffset + (((x / w) - 0.5) * fovTurn);
            const wrapped = u - Math.floor(u);
            skyTx[x] = ((wrapped * skyW) | 0) % skyW;
        }
    }

    const skyEnd = Math.max(0, Math.min(h, Math.floor(half)));
    if (isSky && skyData) {
        const denomH = Math.max(1, half);
        for (let y = 0; y < skyEnd; y++) {
            let ty = Math.floor((y / denomH) * skyH) | 0;
            if (ty < 0) ty = 0;
            else if (ty >= skyH) ty = skyH - 1;
            const skyRow = ty * skyW;
            const rowStart = y * w;
            for (let x = 0; x < w; x++) {
                pixels[rowStart + x] = (skyData[skyRow + skyTx[x]] | OPAQUE) >>> 0;
            }
        }
    }

    const startY = isSky ? skyEnd : 0;
    for (let y = startY; y < h; y++) {
        const isCeil = y < half;
        const denom = isCeil ? ((half - y) - 0.5) : ((y + 0.5) - half);
        const rowStart = y * w;
        const baseColor = isCeil ? scene.ceiling : scene.floor;
        if (denom <= 0.25) {
            pixels.fill(fog > 0 ? fogColor : baseColor, rowStart, rowStart + w);
            continue;
        }
        const dist = ((isCeil ? (1 - eye) : eye) * view.focal) / denom;
        const f = fogFactor(fog, dist);
        const kFall = lightFalloffFactor(falloff, dist);
        const surfGrid = isCeil ? ceilGrid : floorGrid;
        const surfGlobalTex = isCeil ? globalCeilTex : globalFloorTex;
        if (!surfGrid && !surfGlobalTex && !hasLightBuf) {
            const flat = (f <= 0 && kFall >= 0.999) ? baseColor : tint(baseColor, kFall, f, fogColor);
            pixels.fill(flat, rowStart, rowStart + w);
            continue;
        }
        if (f >= 0.999) {
            pixels.fill(fogColor, rowStart, rowStart + w);
            continue;
        }
        const stepU = (dist * (rx1 - rx0)) * invW;
        const stepV = (dist * (ry1 - ry0)) * invW;
        const u0 = pu + (dist * rx0) + (0.5 * stepU);
        const v0 = pv + (dist * ry0) + (0.5 * stepV);
        let fu = Math.floor(u0 * 65536) | 0;
        let fv = Math.floor(v0 * 65536) | 0;
        const dfu = Math.round(stepU * 65536) | 0;
        const dfv = Math.round(stepV * 65536) | 0;

        const baseKeep = ((kFall * (1 - f) * 256) + 0.5) | 0;
        const oneMinusF256 = (((1 - f) * 256) + 0.5) | 0;
        const fogR = ((fogColor & 255) * f) | 0;
        const fogG = (((fogColor >>> 8) & 255) * f) | 0;
        const fogB = (((fogColor >>> 16) & 255) * f) | 0;

        let prevCol = -999999;
        let prevRow = -999999;
        let cellTexData = surfGlobalTex ? surfGlobalTex.data : null;
        let cellTexW = surfGlobalTex ? (surfGlobalTex.width | 0) : 0;
        let cellTexH = surfGlobalTex ? (surfGlobalTex.height | 0) : 0;
        let cellTex64 = cellTexW === 64 && cellTexH === 64;
        let cellKeep = baseKeep;
        let cellAddR = fogR;
        let cellAddG = fogG;
        let cellAddB = fogB;
        let cellFlatColor = 0;
        let prevC = -1;
        let prevOut = 0;

        if (!surfGrid && !hasLightBuf && cellTexData) {
            if (cellKeep >= 255 && f <= 0) {
                if (cellTex64) {
                    for (let x = 0; x < w; x++, fu = (fu + dfu) | 0, fv = (fv + dfv) | 0) {
                        const tIdx = ((fv >>> 4) & 0xfc0) | ((fu >>> 10) & 63);
                        pixels[rowStart + x] = (cellTexData[tIdx] | OPAQUE) >>> 0;
                    }
                } else {
                    for (let x = 0; x < w; x++, fu = (fu + dfu) | 0, fv = (fv + dfv) | 0) {
                        const tx = ((fu & 0xffff) * cellTexW) >>> 16;
                        const ty = ((fv & 0xffff) * cellTexH) >>> 16;
                        pixels[rowStart + x] = (cellTexData[(ty * cellTexW) + tx] | OPAQUE) >>> 0;
                    }
                }
            } else if (cellTex64) {
                for (let x = 0; x < w; x++, fu = (fu + dfu) | 0, fv = (fv + dfv) | 0) {
                    const tIdx = ((fv >>> 4) & 0xfc0) | ((fu >>> 10) & 63);
                    const c = cellTexData[tIdx];
                    if (c !== prevC) {
                        prevC = c;
                        const r = ((((c & 255) * cellKeep) >> 8) + fogR) & 255;
                        const g = (((((c >>> 8) & 255) * cellKeep) >> 8) + fogG) & 255;
                        const b = (((((c >>> 16) & 255) * cellKeep) >> 8) + fogB) & 255;
                        prevOut = (OPAQUE | (b << 16) | (g << 8) | r) >>> 0;
                    }
                    pixels[rowStart + x] = prevOut;
                }
            } else {
                for (let x = 0; x < w; x++, fu = (fu + dfu) | 0, fv = (fv + dfv) | 0) {
                    const tx = ((fu & 0xffff) * cellTexW) >>> 16;
                    const ty = ((fv & 0xffff) * cellTexH) >>> 16;
                    const c = cellTexData[(ty * cellTexW) + tx];
                    if (c !== prevC) {
                        prevC = c;
                        const r = ((((c & 255) * cellKeep) >> 8) + fogR) & 255;
                        const g = (((((c >>> 8) & 255) * cellKeep) >> 8) + fogG) & 255;
                        const b = (((((c >>> 16) & 255) * cellKeep) >> 8) + fogB) & 255;
                        prevOut = (OPAQUE | (b << 16) | (g << 8) | r) >>> 0;
                    }
                    pixels[rowStart + x] = prevOut;
                }
            }
            continue;
        }

        const baseR = baseColor & 255;
        const baseG = (baseColor >>> 8) & 255;
        const baseB = (baseColor >>> 16) & 255;

        for (let x = 0; x < w; x++, fu = (fu + dfu) | 0, fv = (fv + dfv) | 0) {
            const col = fu >> 16;
            const row = fv >> 16;
            if (col !== prevCol || row !== prevRow) {
                prevCol = col;
                prevRow = row;
                prevC = -1;
                const inBounds = col >= 0 && row >= 0 && col < cols && row < rows;
                const cellIdx = inBounds ? ((row * cols) + col) : -1;
                let tex = surfGlobalTex;
                if (surfGrid && cellIdx >= 0) {
                    const val = surfGrid[cellIdx];
                    if (val > 0 && getTex) tex = getTex(val) || surfGlobalTex;
                }
                if (tex) {
                    cellTexData = tex.data;
                    cellTexW = tex.width | 0;
                    cellTexH = tex.height | 0;
                    cellTex64 = cellTexW === 64 && cellTexH === 64;
                } else {
                    cellTexData = null;
                }
                if (hasLightBuf && cellIdx >= 0) {
                    cellKeep = (baseKeep * lightLevel[cellIdx]) >> 8;
                    cellAddR = fogR + ((glowR[cellIdx] * oneMinusF256) >> 8);
                    cellAddG = fogG + ((glowG[cellIdx] * oneMinusF256) >> 8);
                    cellAddB = fogB + ((glowB[cellIdx] * oneMinusF256) >> 8);
                } else {
                    cellKeep = baseKeep;
                    cellAddR = fogR;
                    cellAddG = fogG;
                    cellAddB = fogB;
                }
                if (!cellTexData) {
                    let r = ((baseR * cellKeep) >> 8) + cellAddR;
                    let g = ((baseG * cellKeep) >> 8) + cellAddG;
                    let b = ((baseB * cellKeep) >> 8) + cellAddB;
                    if (r > 255) r = 255;
                    if (g > 255) g = 255;
                    if (b > 255) b = 255;
                    cellFlatColor = (OPAQUE | (b << 16) | (g << 8) | r) >>> 0;
                }
            }
            if (!cellTexData) {
                pixels[rowStart + x] = cellFlatColor;
                continue;
            }
            const tIdx = cellTex64 ?
                (((fv >>> 4) & 0xfc0) | ((fu >>> 10) & 63)) :
                (((((fv & 0xffff) * cellTexH) >>> 16) * cellTexW) + ((((fu & 0xffff) * cellTexW) >>> 16)));
            const c = cellTexData[tIdx];
            if (c !== prevC) {
                prevC = c;
                let r = (((c & 255) * cellKeep) >> 8) + cellAddR;
                let g = ((((c >>> 8) & 255) * cellKeep) >> 8) + cellAddG;
                let b = ((((c >>> 16) & 255) * cellKeep) >> 8) + cellAddB;
                if (r > 255) r = 255;
                if (g > 255) g = 255;
                if (b > 255) b = 255;
                prevOut = (OPAQUE | (b << 16) | (g << 8) | r) >>> 0;
            }
            pixels[rowStart + x] = prevOut;
        }
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
    const {colOk, colSide, colVal, colCol, colRow, colDist, colWallX, colRx, colRy, hit} = frame;
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
        colCol[x] = h.col;
        colRow[x] = h.row;
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

const sampleWalls = (frame, scene, view, eye, fog, fogColor, lightBuf) => {
    const {pixels, zbuffer, heights, colOk, colSide, colVal, colCol, colRow, colDist, colWallX, colRx, colRy} = frame;
    const {focal} = view;
    const w = frame.width || WIDTH;
    const h = frame.height || HEIGHT;
    const half = horizonOf(frame, scene);
    const getTex = scene.texture;
    const getWallColor = scene.wallColor;
    const falloff = clampFalloff(scene.lightFalloff);
    const map = scene.map || null;
    const cols = map && map.cols ? (map.cols | 0) : 0;
    const rows = map && map.rows ? (map.rows | 0) : 0;
    const hasLightBuf = Boolean(lightBuf && lightBuf.active && cols > 0 && rows > 0);
    const lightLevel = hasLightBuf ? lightBuf.level : null;
    const glowR = hasLightBuf ? lightBuf.glowR : null;
    const glowG = hasLightBuf ? lightBuf.glowG : null;
    const glowB = hasLightBuf ? lightBuf.glowB : null;

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
        let k = (side === 1 ? SIDE_SHADE : 1) * lightFalloffFactor(falloff, dist);
        const f = fogFactor(fog, dist);
        let addR = 0;
        let addG = 0;
        let addB = 0;
        if (hasLightBuf) {
            const rx = colRx[x];
            const ry = colRy[x];
            const adjCol = side === 0 ? (colCol[x] + (rx > 0 ? -1 : 1)) : colCol[x];
            const adjRow = side === 1 ? (colRow[x] + (ry > 0 ? -1 : 1)) : colRow[x];
            if (adjCol >= 0 && adjRow >= 0 && adjCol < cols && adjRow < rows) {
                const lIdx = (adjRow * cols) + adjCol;
                k *= lightLevel[lIdx] / 256;
                const oneMinusF = 1 - f;
                addR = glowR[lIdx] * oneMinusF;
                addG = glowG[lIdx] * oneMinusF;
                addB = glowB[lIdx] * oneMinusF;
            }
        }
        if (!tex) {
            const base = getWallColor ? getWallColor(val) : pixel(160, 160, 170);
            const keep = k * (1 - f);
            const r = Math.min(255, ((base & 255) * keep) + ((fogColor & 255) * f) + addR);
            const g = Math.min(255, (((base >>> 8) & 255) * keep) + (((fogColor >>> 8) & 255) * f) + addG);
            const b = Math.min(255, (((base >>> 16) & 255) * keep) + (((fogColor >>> 16) & 255) * f) + addB);
            const flat = pixel(r, g, b);
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
        const plain = k === 1 && f === 0 && addR === 0 && addG === 0 && addB === 0;
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
            const fogR = ((fogColor & 255) * f) + addR;
            const fogG = (((fogColor >>> 8) & 255) * f) + addG;
            const fogB = (((fogColor >>> 16) & 255) * f) + addB;
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
                    let r = (((c & 255) * keep) + fogR) | 0;
                    let g = ((((c >>> 8) & 255) * keep) + fogG) | 0;
                    let b = ((((c >>> 16) & 255) * keep) + fogB) | 0;
                    if (r > 255) r = 255;
                    if (g > 255) g = 255;
                    if (b > 255) b = 255;
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

const drawSprites = (frame, scene, view, eye, fog, fogColor, lightBuf) => {
    const {pixels, zbuffer, placed, result, syRow} = frame;
    const {dir, plane, focal} = view;
    const fw = frame.width || WIDTH;
    const fh = frame.height || HEIGHT;
    const det = (plane.x * dir.y) - (dir.x * plane.y);
    const inv = 1 / det;
    const half = horizonOf(frame, scene);
    const centre = fw >> 1;
    const falloff = clampFalloff(scene.lightFalloff);
    const map = scene.map || null;
    const cols = map && map.cols ? (map.cols | 0) : 0;
    const rows = map && map.rows ? (map.rows | 0) : 0;
    const hasLightBuf = Boolean(lightBuf && lightBuf.active && cols > 0 && rows > 0);
    const lightLevel = hasLightBuf ? lightBuf.level : null;
    const glowR = hasLightBuf ? lightBuf.glowR : null;
    const glowG = hasLightBuf ? lightBuf.glowG : null;
    const glowB = hasLightBuf ? lightBuf.glowB : null;
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
            let sy = Math.floor((((y + 0.5) - top) / h) * imgH) | 0;
            if (sy < 0) sy = 0;
            else if (sy > imgHMax) sy = imgHMax;
            syRow[y] = sy * imgW;
        }
        const f = fogFactor(fog, depth);
        let k = sprite.glow ? 1 : lightFalloffFactor(falloff, depth);
        let addR = 0;
        let addG = 0;
        let addB = 0;
        if (hasLightBuf && !sprite.glow) {
            const sc = Math.floor(sprite.u) | 0;
            const sr = Math.floor(sprite.v) | 0;
            if (sc >= 0 && sr >= 0 && sc < cols && sr < rows) {
                const lIdx = (sr * cols) + sc;
                k *= lightLevel[lIdx] / 256;
                const oneMinusF = 1 - f;
                addR = glowR[lIdx] * oneMinusF;
                addG = glowG[lIdx] * oneMinusF;
                addB = glowB[lIdx] * oneMinusF;
            }
        }
        const plain = f === 0 && k === 1 && addR === 0 && addG === 0 && addB === 0;
        const keep = k * (1 - f);
        const fogR = ((fogColor & 255) * f) + addR;
        const fogG = (((fogColor >>> 8) & 255) * f) + addG;
        const fogB = (((fogColor >>> 16) & 255) * f) + addB;
        for (let x = x0; x < x1; x++) {
            if (depth >= zbuffer[x]) continue;
            let sx = Math.floor((((x + 0.5) - left) / w) * imgW) | 0;
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
                        let r = (((c & 255) * keep) + fogR) | 0;
                        let g = ((((c >>> 8) & 255) * keep) + fogG) | 0;
                        let b = ((((c >>> 16) & 255) * keep) + fogB) | 0;
                        if (r > 255) r = 255;
                        if (g > 255) g = 255;
                        if (b > 255) b = 255;
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
    const half = horizonOf(frame, scene);
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
        const sx = clamp(Math.floor((((centre + 0.5) - left) / w) * imgW) | 0, 0, imgW - 1);
        const imgData = img.data;
        for (let y = y0; y < y1; y++) {
            const sy = clamp(Math.floor((((y + 0.5) - top) / h) * imgH) | 0, 0, imgH - 1);
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
    const falloff = clampFalloff(scene.lightFalloff);
    const horizon = horizonOf(frame, scene);
    const fogColor = mixColors(scene.floor, scene.ceiling);
    const floorMode = scene.floorMode || 'color';
    const ceilingMode = scene.ceilingMode || 'color';
    const floorTex = scene.floorTex || null;
    const ceilTex = scene.ceilingTex || null;
    const floorTextures = scene.floorTextures !== false;
    const map = scene.map || null;
    const cols = map && map.cols ? (map.cols | 0) : 0;
    const rows = map && map.rows ? (map.rows | 0) : 0;
    let lightBuf = frame.lightBuffer;
    if (cols > 0 && rows > 0) {
        if (!lightBuf || lightBuf.cols !== cols || lightBuf.rows !== rows) {
            lightBuf = createLightBuffer(cols, rows);
            frame.lightBuffer = lightBuf;
        }
        updateLightBuffer(lightBuf, map, scene.lights);
    } else {
        lightBuf = null;
    }
    const lightVersion = lightBuf ? lightBuf.version : -1;
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
        frame._bgTex === scene.texture && frame._bgWallColor === scene.wallColor &&
        frame._bgHorizon === horizon && frame._bgFalloff === falloff &&
        frame._bgFloorMode === floorMode && frame._bgCeilingMode === ceilingMode &&
        frame._bgFloorTex === floorTex && frame._bgCeilTex === ceilTex &&
        frame._bgFloorTextures === floorTextures && frame._bgLightVersion === lightVersion) {
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
        drawSurfaces(frame, scene, view, eye, fog, fogColor, lightBuf);
        const t1 = timings ? now() : 0;
        sampleWalls(frame, scene, view, eye, fog, fogColor, lightBuf);
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
        frame._bgHorizon = horizon;
        frame._bgFalloff = falloff;
        frame._bgFloorMode = floorMode;
        frame._bgCeilingMode = ceilingMode;
        frame._bgFloorTex = floorTex;
        frame._bgCeilTex = ceilTex;
        frame._bgFloorTextures = floorTextures;
        frame._bgLightVersion = lightVersion;
    }
    const tSpr0 = timings ? now() : 0;
    drawSprites(frame, scene, view, eye, fog, fogColor, lightBuf);
    if (timings) timings.spritesMs = now() - tSpr0;
    result.ahead = frame.zbuffer[fw >> 1];
    return result;
};

const gridMap = (grid, flagsAt, solidBit) => {
    const hasDirect = Boolean(grid && grid.main && grid.flags && Array.isArray(grid.tiles));
    const floor = hasDirect && grid.floor ? grid.floor : null;
    const ceiling = hasDirect && grid.ceiling ? grid.ceiling : null;
    const light = hasDirect && grid.light ? grid.light : null;
    const hasFloor = Boolean(floor && floor.some(v => v > 0));
    const hasCeiling = Boolean(ceiling && ceiling.some(v => v > 0));
    const hasLight = Boolean(light && light.some(v => v !== 100));
    return {
        cols: grid.cols,
        rows: grid.rows,
        _main: hasDirect ? grid.main : null,
        _floor: floor,
        _ceiling: ceiling,
        _light: light,
        _hasFloor: hasFloor,
        _hasCeiling: hasCeiling,
        _hasLight: hasLight,
        _flags: hasDirect ? grid.flags : null,
        _tiles: hasDirect ? grid.tiles : null,
        _bit: solidBit | 0,
        solid: (col, row) => col < 0 || row < 0 || col >= grid.cols || row >= grid.rows ||
            (flagsAt(grid, col, row) & solidBit) !== 0,
        wallValue: (col, row) => {
            if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 0;
            return grid.main[(row * grid.cols) + col];
        },
        floorValue: (col, row) => {
            if (!floor || col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 0;
            return floor[(row * grid.cols) + col];
        },
        ceilingValue: (col, row) => {
            if (!ceiling || col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 0;
            return ceiling[(row * grid.cols) + col];
        },
        lightValue: (col, row) => {
            if (!light || col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 100;
            return light[(row * grid.cols) + col];
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
    MAX_LIGHTS,
    FACINGS,
    pixel,
    shade,
    tint,
    mixColors,
    parseColor,
    clampFov,
    clampEye,
    clampFog,
    clampFalloff,
    lightFalloffFactor,
    horizonOf,
    createLightBuffer,
    updateLightBuffer,
    fogEnd,
    fogFactor,
    wrapDegrees,
    basis,
    castRay,
    facingIndex,
    createFrame,
    drawSurfaces,
    pickCrosshair,
    render,
    gridMap,
    toCell,
    fromCell
};
