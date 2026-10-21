import {FLAG_MASK, GRIDS, LAYERS, MAX_SIZE, MAX_TEXTURES} from './tilemap.js';

const PATCH_TYPE = 'tilemap-patch';
const DELAY = 50;
const MAX_RUNS = 2048;
const MAX_AUTHOR = 64;
const MAX_NAME = 100;

const int = (value, lo, hi) => {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    return value >= lo && value <= hi ? value : null;
};

const compareStamp = (a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return a[2] - b[2];
};

const cellKey = (layer, col, row) => `${layer}:${row}:${col}`;

const encodeSegments = cells => {
    const sorted = cells.slice().sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const segments = [];
    let segment = null;
    let lastRow = -1;
    let lastCol = -2;
    for (const cell of sorted) {
        if (!segment || cell.row !== lastRow || cell.col !== lastCol + 1) {
            segment = [cell.row, cell.col];
            segments.push(segment);
        }
        const n = segment.length;
        if (n > 2 && segment[n - 2] === cell.value) {
            segment[n - 1]++;
        } else {
            segment.push(cell.value, 1);
        }
        lastRow = cell.row;
        lastCol = cell.col;
    }
    return segments;
};

const runCount = segments => segments.reduce((sum, segment) => sum + ((segment.length - 2) / 2), 0);

const decodeSegments = (segments, maxValue) => {
    if (!Array.isArray(segments) || segments.length > MAX_SIZE * MAX_SIZE) return null;
    const cells = [];
    for (const segment of segments) {
        if (!Array.isArray(segment) || segment.length < 4 || segment.length % 2 !== 0) return null;
        const row = int(segment[0], 0, MAX_SIZE - 1);
        let col = int(segment[1], 0, MAX_SIZE - 1);
        if (row === null || col === null) return null;
        for (let i = 2; i < segment.length; i += 2) {
            const value = int(segment[i], 0, maxValue);
            const count = int(segment[i + 1], 1, MAX_SIZE);
            if (value === null || count === null || col + count > MAX_SIZE) return null;
            for (let k = 0; k < count; k++) cells.push({col: col + k, row, value});
            col += count;
        }
    }
    return cells;
};

const validPalette = palette => {
    if (typeof palette === 'undefined') return [];
    if (!Array.isArray(palette) || palette.length > MAX_TEXTURES) return null;
    const out = [];
    for (const entry of palette) {
        const name = entry && typeof entry.name === 'string' ? entry.name.trim()
            .slice(0, MAX_NAME) : '';
        if (!name) return null;
        out.push({name, flags: int(entry.flags, 0, FLAG_MASK) || 0});
    }
    return out;
};

const readPatch = patch => {
    if (!patch || patch.type !== PATCH_TYPE) return null;
    if (typeof patch.level !== 'string' || !patch.level || patch.level.length > MAX_NAME) return null;
    const base = int(patch.base, 0, Number.MAX_SAFE_INTEGER);
    const seq = int(patch.seq, 0, Number.MAX_SAFE_INTEGER);
    const author = typeof patch.author === 'string' ? patch.author.slice(0, MAX_AUTHOR) : '';
    const palette = validPalette(patch.palette);
    if (base === null || seq === null || palette === null || !patch.layers || typeof patch.layers !== 'object') {
        return null;
    }
    const layers = {};
    for (const layer of Object.keys(patch.layers)) {
        if (GRIDS.indexOf(layer) === -1) return null;
        const cells = decodeSegments(patch.layers[layer], layer === 'flags' ? FLAG_MASK : palette.length);
        if (!cells) return null;
        layers[layer] = cells;
    }
    return {level: patch.level, base, seq, author, palette, layers};
};

const buildPatches = (grid, cells, author, nextSeq) => {
    const palette = [];
    const toPalette = new Map();
    const byLayer = {};
    for (const cell of cells) {
        let value = cell.value;
        if (LAYERS.indexOf(cell.layer) !== -1 && value > 0) {
            const tile = grid.tiles[value - 1];
            if (!tile) continue;
            if (!toPalette.has(value)) {
                palette.push({name: tile.name, flags: tile.flags || 0});
                toPalette.set(value, palette.length);
            }
            value = toPalette.get(value);
        }
        if (!byLayer[cell.layer]) byLayer[cell.layer] = [];
        byLayer[cell.layer].push({col: cell.col, row: cell.row, value});
    }
    const parts = [];
    let current = null;
    let runs = 0;
    for (const layer of GRIDS) {
        if (!byLayer[layer]) continue;
        for (const segment of encodeSegments(byLayer[layer])) {
            const size = runCount([segment]);
            if (!current || runs + size > MAX_RUNS) {
                current = {};
                parts.push(current);
                runs = 0;
            }
            if (!current[layer]) current[layer] = [];
            current[layer].push(segment);
            runs += size;
        }
    }
    return parts.map(layers => ({
        type: PATCH_TYPE,
        level: grid.id,
        base: 0,
        author,
        seq: nextSeq(),
        palette,
        layers
    }));
};

const createTilemapSync = options => {
    const world = options.world;
    const send = options.send;
    const author = String(options.author || 'local').slice(0, MAX_AUTHOR);
    const delay = typeof options.delay === 'number' ? options.delay : DELAY;
    const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = options.clearTimer || (id => clearTimeout(id));
    const pending = new Map();
    const stamps = new Map();
    const stats = {sent: 0, applied: 0, skipped: 0, rejected: 0};
    let seq = 0;
    let timer = null;
    let disposed = false;

    const stampsOf = level => {
        if (!stamps.has(level)) stamps.set(level, new Map());
        return stamps.get(level);
    };

    const setVersion = (grid, v) => {
        if (grid.v === v) return;
        grid.v = v;
        world.saveLevel(grid);
    };

    const nextSeq = () => seq++;

    const flush = () => {
        if (timer !== null) {
            clearTimer(timer);
            timer = null;
        }
        let sent = 0;
        for (const [level, cells] of Array.from(pending.entries())) {
            pending.delete(level);
            const grid = world.level(level);
            if (!grid) continue;
            const known = stampsOf(grid.id);
            const patches = buildPatches(grid, Array.from(cells.values()), author, nextSeq);
            for (const patch of patches) {
                patch.base = grid.v || 0;
                setVersion(grid, patch.base + 1);
                const stamp = [patch.base, author, patch.seq];
                for (const layer of Object.keys(patch.layers)) {
                    for (const cell of decodeSegments(patch.layers[layer], Number.MAX_SAFE_INTEGER)) {
                        known.set(cellKey(layer, cell.col, cell.row), stamp);
                    }
                }
                send(patch);
                sent++;
            }
        }
        stats.sent += sent;
        return sent;
    };

    const onCells = event => {
        if (disposed || !event || event.origin === 'remote') return;
        if (!pending.has(event.level)) pending.set(event.level, new Map());
        const cells = pending.get(event.level);
        for (const cell of event.cells) {
            cells.set(cellKey(event.layer, cell.col, cell.row),
                {layer: event.layer, col: cell.col, row: cell.row, value: cell.value});
        }
        if (timer === null) timer = setTimer(flush, delay);
    };

    const unsubscribe = world.events.on('cells', onCells);

    const apply = raw => {
        const patch = readPatch(raw);
        if (!patch) {
            stats.rejected++;
            return {ok: false, reason: 'invalid'};
        }
        const grid = world.level(patch.level);
        if (!grid) return {ok: false, reason: 'unknown-level'};
        const priorV = grid.v || 0;
        const local = patch.palette.map(entry => world.addTile(grid.id, entry.name, entry.flags));
        const mine = pending.get(grid.id);
        const known = stampsOf(grid.id);
        const stamp = [patch.base, patch.author, patch.seq];
        let changed = 0;
        for (const layer of Object.keys(patch.layers)) {
            const writes = [];
            for (const cell of patch.layers[layer]) {
                const key = cellKey(layer, cell.col, cell.row);
                const existing = known.get(key);
                if ((mine && mine.has(key)) || (existing && compareStamp(stamp, existing) < 0)) {
                    stats.skipped++;
                    continue;
                }
                let value = cell.value;
                if (layer !== 'flags' && value > 0) {
                    value = local[value - 1];
                    if (!value) continue;
                }
                known.set(key, stamp);
                writes.push({col: cell.col, row: cell.row, value});
            }
            if (writes.length) changed += world.paintCells(grid.id, layer, writes, 'remote').length;
        }
        const fresh = world.level(patch.level) || grid;
        setVersion(fresh, Math.max(fresh.v || 0, patch.base + 1));
        stats.applied++;
        return {ok: true, changed, gap: patch.base > priorV, v: fresh.v};
    };

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        unsubscribe();
        if (timer !== null) clearTimer(timer);
        timer = null;
        pending.clear();
        stamps.clear();
    };

    return {
        author,
        apply,
        flush,
        dispose,
        pendingCells: () => Array.from(pending.values()).reduce((sum, cells) => sum + cells.size, 0),
        stats: () => Object.assign({}, stats),
        forget: level => stamps.delete(level)
    };
};

export {
    PATCH_TYPE,
    DELAY,
    MAX_RUNS,
    compareStamp,
    encodeSegments,
    decodeSegments,
    readPatch,
    createTilemapSync
};
