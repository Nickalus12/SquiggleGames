import {FLAGS, flagsAt} from './tilemap.js';

const EPS = 1e-7;
const GROUND = 0.01;

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

const blocks = (grid, col, row, mask) => (flagsAt(grid, col, row) & mask) !== 0;

const columnBlocked = (grid, col, rows, mask) => {
    for (let row = rows[0]; row <= rows[1]; row++) {
        if (blocks(grid, col, row, mask)) return true;
    }
    return false;
};

const rowBlocked = (grid, row, cols, mask) => {
    for (let col = cols[0]; col <= cols[1]; col++) {
        if (blocks(grid, col, row, mask)) return true;
    }
    return false;
};

const sweep = (grid, edge, delta, count, blocked) => {
    const ts = grid.tileSize;
    if (delta > 0) {
        const first = Math.max(0, Math.ceil((edge / ts) - EPS));
        const last = Math.min(count - 1, Math.ceil(((edge + delta) / ts) - EPS) - 1);
        for (let i = first; i <= last; i++) {
            if (blocked(i)) return {moved: (i * ts) - edge, hit: true};
        }
        return {moved: delta, hit: false};
    }
    const first = Math.min(count - 1, Math.floor((edge / ts) + EPS) - 1);
    const last = Math.max(0, Math.floor(((edge + delta) / ts) + EPS));
    for (let i = first; i >= last; i--) {
        if (blocked(i)) return {moved: ((i + 1) * ts) - edge, hit: true};
    }
    return {moved: delta, hit: false};
};

const moveBy = (grid, box, axis, delta) => {
    const result = {x: box.x, y: box.y, hit: null};
    const d = Number(delta);
    if (!grid || !Number.isFinite(d) || d === 0) return result;
    const p = toPixels(grid, box);
    if (axis === 'x') {
        const rows = span(grid, p.top, p.bottom, grid.rows);
        const blocked = col => columnBlocked(grid, col, rows, FLAGS.solid);
        const edge = d > 0 ? p.right : p.left;
        const step = sweep(grid, edge, d, grid.cols, blocked);
        result.x = box.x + step.moved;
        if (step.hit) result.hit = d > 0 ? 'right' : 'left';
        return result;
    }
    const down = d < 0;
    const cols = span(grid, p.left, p.right, grid.cols);
    const mask = down ? FLAGS.solid | FLAGS.oneway : FLAGS.solid;
    const blocked = row => rowBlocked(grid, row, cols, mask);
    const edge = down ? p.bottom : p.top;
    const step = sweep(grid, edge, -d, grid.rows, blocked);
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
    let gx = (x - grid.origin[0]) / ts;
    let gy = (grid.origin[1] - y) / ts;
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
        if (outside || (flagsAt(grid, col, row) & FLAGS.solid)) {
            gx += ux * distance;
            gy += vy * distance;
            const along = side === 0 ? gy - Math.floor(gy) : gx - Math.floor(gx);
            return {distance: distance * ts, col, row, side, along, outside};
        }
    }
    return null;
};

export {
    moveBy,
    overlapFlags,
    onGround,
    castRay,
    toPixels
};
