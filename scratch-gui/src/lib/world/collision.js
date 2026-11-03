import {FLAGS, flagsAt, floorHeightAt} from './tilemap.js';
import {PASS_OPEN, doorOpenAt} from './doors.js';

const EPS = 1e-7;
const GROUND = 0.01;
const STEP_FREE = 0.25;
const STEP_JUMP = 0.5;
const EYE_OFFSET = 0.15;

const gridHasFloorHeights = grid => {
    const bytes = grid && grid.floorHeights;
    if (!bytes) return false;
    const ver = bytes._version | 0;
    if (bytes._colNzVer === ver) return Boolean(bytes._colNz);
    let nz = false;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] !== 0 && bytes[i] !== 120) {
            nz = true;
            break;
        }
    }
    bytes._colNzVer = ver;
    bytes._colNz = nz;
    return nz;
};

const hasWalkableFloorElevation = (grid, col, row) => {
    if (!grid || !grid.floorHeights || col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
    const i = (row * grid.cols) + col;
    const raw = grid.floorHeights[i];
    if (raw === 0 || raw === 120) return false;
    if (grid.heights && grid.heights[i] > 0) return false;
    if ((grid.flags[i] & (FLAGS.solid | FLAGS.seethrough | FLAGS.door)) !== 0) return false;
    return true;
};

const toPixels = (grid, box) => {
    const px = box.x - grid.origin[0];
    const py = grid.origin[1] - box.y;
    return {
        left: px - (box.w / 2),
        right: px + (box.w / 2),
        top: py - (box.h / 2),
        bottom: py + (box.h / 2)
    };
};

const span = (grid, low, high, count) => {
    const ts = grid.tileSize;
    const first = Math.max(0, Math.floor((low / ts) + EPS));
    const last = Math.min(count - 1, Math.ceil((high / ts) - EPS) - 1);
    return [first, last];
};

const effectiveFlags = (grid, col, row) => {
    let f = flagsAt(grid, col, row);
    if (hasWalkableFloorElevation(grid, col, row)) {
        f &= ~FLAGS.solid;
    }
    if (f & FLAGS.seethrough) f |= FLAGS.solid;
    if (f & FLAGS.door) {
        if (doorOpenAt(grid, col, row) >= PASS_OPEN) f &= ~FLAGS.solid;
        else f |= FLAGS.solid;
    }
    return f;
};

const blocks = (grid, col, row, mask, low, high, stepState) => {
    if ((mask & FLAGS.solid) && stepState) {
        const targetZ = floorHeightAt(grid, col, row);
        const riseFromStep = targetZ - stepState.refZ;
        if (riseFromStep > STEP_FREE + 1e-6) {
            if (!stepState.jumping || (targetZ - stepState.baseZ) > STEP_JUMP + 1e-6) {
                return true;
            }
        }
    }
    const f = effectiveFlags(grid, col, row);
    if ((f & mask) === 0) return false;
    if ((f & FLAGS.door) && (mask & FLAGS.solid) && typeof low === 'number' && typeof high === 'number') {
        const open = doorOpenAt(grid, col, row);
        if (open > 0) {
            const ts = grid.tileSize;
            const cellStart = (f & FLAGS.door) ? 0 : 0;
            const gapEnd = open * ts;
            if (low >= cellStart && high <= gapEnd) return false;
        }
    }
    return true;
};

const columnBlocked = (grid, col, rows, mask, top, bottom, stepState) => {
    const ts = grid.tileSize;
    if (stepState) {
        const adjCol = stepState.dir > 0 ? col - 1 : col + 1;
        if (adjCol >= 0 && adjCol < grid.cols) {
            for (let row = rows[0]; row <= rows[1]; row++) {
                const adjZ = floorHeightAt(grid, adjCol, row);
                if (adjZ >= stepState.baseZ && (adjZ - stepState.refZ) <= STEP_FREE + 1e-6 && adjZ > stepState.refZ) {
                    stepState.refZ = adjZ;
                }
            }
        }
    }
    for (let row = rows[0]; row <= rows[1]; row++) {
        const relLow = typeof top === 'number' ? Math.max(0, top - (row * ts)) : null;
        const relHigh = typeof bottom === 'number' ? Math.min(ts, bottom - (row * ts)) : null;
        if (blocks(grid, col, row, mask, relLow, relHigh, stepState)) return true;
    }
    if (stepState) {
        for (let row = rows[0]; row <= rows[1]; row++) {
            const tz = floorHeightAt(grid, col, row);
            if (tz >= stepState.baseZ && (tz - stepState.refZ) <= STEP_FREE + 1e-6 && tz > stepState.refZ) {
                stepState.refZ = tz;
            }
        }
    }
    return false;
};

const rowBlocked = (grid, row, cols, mask, left, right, stepState) => {
    const ts = grid.tileSize;
    if (stepState) {
        const adjRow = stepState.dir > 0 ? row - 1 : row + 1;
        if (adjRow >= 0 && adjRow < grid.rows) {
            for (let col = cols[0]; col <= cols[1]; col++) {
                const adjZ = floorHeightAt(grid, col, adjRow);
                if (adjZ >= stepState.baseZ && (adjZ - stepState.refZ) <= STEP_FREE + 1e-6 && adjZ > stepState.refZ) {
                    stepState.refZ = adjZ;
                }
            }
        }
    }
    for (let col = cols[0]; col <= cols[1]; col++) {
        const relLow = typeof left === 'number' ? Math.max(0, left - (col * ts)) : null;
        const relHigh = typeof right === 'number' ? Math.min(ts, right - (col * ts)) : null;
        if (blocks(grid, col, row, mask, relLow, relHigh, stepState)) return true;
    }
    if (stepState) {
        for (let col = cols[0]; col <= cols[1]; col++) {
            const tz = floorHeightAt(grid, col, row);
            if (tz >= stepState.baseZ && (tz - stepState.refZ) <= STEP_FREE + 1e-6 && tz > stepState.refZ) {
                stepState.refZ = tz;
            }
        }
    }
    return false;
};

const sweep = (grid, edge, delta, count, blocked, pad = 0) => {
    const ts = grid.tileSize;
    if (delta > 0) {
        const first = Math.max(0, Math.ceil((edge / ts) - EPS));
        const last = Math.min(count - 1, Math.ceil(((edge + delta + pad) / ts) - EPS) - 1);
        for (let i = first; i <= last; i++) {
            if (blocked(i)) return {moved: Math.max(0, (i * ts) - pad - edge), hit: true};
        }
        return {moved: delta, hit: false};
    }
    const first = Math.min(count - 1, Math.floor((edge / ts) + EPS) - 1);
    const last = Math.max(0, Math.floor(((edge + delta - pad) / ts) + EPS));
    for (let i = first; i >= last; i--) {
        if (blocked(i)) return {moved: Math.min(0, ((i + 1) * ts) + pad - edge), hit: true};
    }
    return {moved: delta, hit: false};
};

const moveBy = (grid, box, axis, delta, options) => {
    const result = {x: box.x, y: box.y, hit: null};
    const d = Number(delta);
    if (!grid || !Number.isFinite(d) || d === 0) return result;
    const p = toPixels(grid, box);
    const ts = grid.tileSize;
    const half = (axis === 'x' ? box.w : box.h) / 2;
    const useEye = Boolean((options && (options.eye || typeof options.eyeOffset === 'number')) ||
        box.eye || half < (2 * EYE_OFFSET * ts));
    const eyeFrac = options && typeof options.eyeOffset === 'number' ?
        Math.max(0, options.eyeOffset) :
        (useEye ? EYE_OFFSET : 0);
    const eyePad = eyeFrac * ts;
    const hasFh = gridHasFloorHeights(grid);
    let stepState = null;
    if (hasFh) {
        const cCol = Math.max(0, Math.min(grid.cols - 1, Math.floor((box.x - grid.origin[0]) / ts)));
        const cRow = Math.max(0, Math.min(grid.rows - 1, Math.floor((grid.origin[1] - box.y) / ts)));
        const cellZ = floorHeightAt(grid, cCol, cRow);
        const optZ = options && typeof options.z === 'number' && Number.isFinite(options.z) ?
            options.z :
            (typeof box.z === 'number' && Number.isFinite(box.z) ? box.z : cellZ);
        const baseZ = Math.max(cellZ, optZ);
        const jumping = Boolean((options && options.jumping) || box.jumping);
        stepState = {
            baseZ,
            refZ: baseZ,
            jumping,
            dir: axis === 'x' ? (d > 0 ? 1 : -1) : (d < 0 ? 1 : -1)
        };
    }
    if (axis === 'x') {
        const rows = span(grid, p.top, p.bottom, grid.rows);
        const blocked = col => columnBlocked(grid, col, rows, FLAGS.solid, p.top, p.bottom, stepState);
        const edge = d > 0 ? p.right : p.left;
        const step = sweep(grid, edge, d, grid.cols, blocked, eyePad);
        result.x = box.x + step.moved;
        if (step.hit) result.hit = d > 0 ? 'right' : 'left';
        return result;
    }
    const down = d < 0;
    const cols = span(grid, p.left, p.right, grid.cols);
    const mask = down ? FLAGS.solid | FLAGS.oneway : FLAGS.solid;
    const blocked = row => rowBlocked(grid, row, cols, mask, p.left, p.right, stepState);
    const edge = down ? p.bottom : p.top;
    const step = sweep(grid, edge, -d, grid.rows, blocked, eyePad);
    result.y = box.y - step.moved;
    if (step.hit) result.hit = down ? 'bottom' : 'top';
    return result;
};

const overlapFlags = (grid, box) => {
    if (!grid) return 0;
    const p = toPixels(grid, box);
    const cols = span(grid, p.left, p.right, grid.cols);
    const rows = span(grid, p.top, p.bottom, grid.rows);
    let flags = 0;
    for (let row = rows[0]; row <= rows[1]; row++) {
        for (let col = cols[0]; col <= cols[1]; col++) flags |= flagsAt(grid, col, row);
    }
    return flags;
};

const onGround = (grid, box) => {
    if (!grid) return false;
    const p = toPixels(grid, box);
    const ts = grid.tileSize;
    const row = Math.round(p.bottom / ts);
    if (Math.abs((row * ts) - p.bottom) > GROUND || row < 0 || row >= grid.rows) return false;
    return rowBlocked(grid, row, span(grid, p.left, p.right, grid.cols), FLAGS.solid | FLAGS.oneway);
};

const castRay = (grid, x, y, dx, dy, maxDistance) => {
    const ts = grid.tileSize;
    const len = Math.sqrt((dx * dx) + (dy * dy));
    if (!len) return null;
    const ux = dx / len;
    const uy = dy / len;
    const gx = (x - grid.origin[0]) / ts;
    const gy = (grid.origin[1] - y) / ts;
    const vy = -uy;
    let col = Math.floor(gx);
    let row = Math.floor(gy);
    const stepX = ux > 0 ? 1 : -1;
    const stepY = vy > 0 ? 1 : -1;
    const deltaX = ux === 0 ? Infinity : Math.abs(1 / ux);
    const deltaY = vy === 0 ? Infinity : Math.abs(1 / vy);
    let sideX = ux === 0 ? Infinity : (ux > 0 ? (col + 1 - gx) : (gx - col)) * deltaX;
    let sideY = vy === 0 ? Infinity : (vy > 0 ? (row + 1 - gy) : (gy - row)) * deltaY;
    const limit = maxDistance / ts;
    let distance = 0;
    let side = 0;
    for (let i = 0; i < 4 * (grid.cols + grid.rows + 2); i++) {
        if (sideX < sideY) {
            distance = sideX;
            sideX += deltaX;
            col += stepX;
            side = 0;
        } else {
            distance = sideY;
            sideY += deltaY;
            row += stepY;
            side = 1;
        }
        if (distance > limit) return null;
        const outside = col < 0 || row < 0 || col >= grid.cols || row >= grid.rows;
        const f = outside ? FLAGS.solid : effectiveFlags(grid, col, row);
        if (outside || (f & FLAGS.solid)) {
            const hitX = gx + (ux * distance);
            const hitY = gy + (vy * distance);
            const along = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);
            if (!outside && (f & FLAGS.door) && along < doorOpenAt(grid, col, row)) {
                continue;
            }
            return {distance: distance * ts, col, row, side, along, outside};
        }
    }
    return null;
};

export {
    EYE_OFFSET,
    moveBy,
    overlapFlags,
    onGround,
    castRay,
    toPixels
};
