const FORMAT = 1;
const MAX_SIZE = 128;
const MAX_TEXTURES = 48;
const MAX_LEVELS = 32;
const DEFAULT_LIGHT = 100;
const MAX_LIGHT = 100;
const TILE_SIZES = Object.freeze([16, 32]);
const DEFAULT_ORIGIN = Object.freeze([-240, 180]);
const LAYERS = Object.freeze(['back', 'main', 'front', 'floor', 'ceiling']);
const GRIDS = Object.freeze(['back', 'main', 'front', 'floor', 'ceiling', 'light', 'flags']);

const FLAGS = Object.freeze({
    solid: 1,
    oneway: 2,
    hazard: 4,
    goal: 8,
    door: 16,
    seethrough: 32
});
const FLAG_MASK = 63;
const MIN_HEIGHT = 0.25;
const MAX_HEIGHT = 4;
const DEFAULT_HEIGHT = 1;
const HEIGHT_SCALE = 60;
const HEIGHT_MAX = 240;

const maxForLayer = layer => {
    if (layer === 'flags') return FLAG_MASK;
    if (layer === 'light') return MAX_LIGHT;
    return MAX_TEXTURES;
};

const defaultForLayer = layer => (layer === 'light' ? DEFAULT_LIGHT : 0);

const int = (value, fallback) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) ? n : fallback;
};

const clampInt = (value, lo, hi, fallback) => Math.min(hi, Math.max(lo, int(value, fallback)));

const finite = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const text = (value, fallback) => {
    const s = typeof value === 'string' ? value.trim() : '';
    return s ? s.slice(0, 100) : fallback;
};

const encodeRow = (cells, start, length) => {
    const out = [];
    let value = cells[start];
    let count = 0;
    for (let i = 0; i < length; i++) {
        const v = cells[start + i];
        if (v === value) {
            count++;
        } else {
            out.push(value, count);
            value = v;
            count = 1;
        }
    }
    if (length > 0) out.push(value, count);
    return out;
};

const decodeRow = (row, cells, start, length, max, fallback) => {
    const def = typeof fallback === 'number' ? fallback : 0;
    if (!Array.isArray(row)) return false;
    let at = 0;
    for (let i = 0; i + 1 < row.length && at < length; i += 2) {
        const value = int(row[i], def);
        const count = int(row[i + 1], 0);
        if (count <= 0) continue;
        const v = value >= 0 && value <= max ? value : def;
        const end = Math.min(length, at + count);
        cells.fill(v, start + at, start + end);
        at = end;
    }
    return at === length;
};

const encodeGrid = (cells, cols, rows) => {
    const out = new Array(rows);
    for (let r = 0; r < rows; r++) out[r] = encodeRow(cells, r * cols, cols);
    return out;
};

const decodeGrid = (rowsData, cols, rows, max, fallback) => {
    const def = typeof fallback === 'number' ? fallback : 0;
    const cells = new Uint8Array(cols * rows);
    if (def) cells.fill(def);
    if (!Array.isArray(rowsData)) return cells;
    for (let r = 0; r < rows; r++) decodeRow(rowsData[r], cells, r * cols, cols, max, def);
    return cells;
};

const clampHeight = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_HEIGHT;
    return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(n * HEIGHT_SCALE) / HEIGHT_SCALE));
};

const encodeHeight = value => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (Number.isInteger(n) && n >= 15 && n <= HEIGHT_MAX) return n;
    return Math.round(clampHeight(n) * HEIGHT_SCALE);
};

const decodeHeight = byte => {
    const b = int(byte, 0);
    if (b <= 0) return DEFAULT_HEIGHT;
    return clampHeight(b / HEIGHT_SCALE);
};

const normalizeTiles = tiles => {
    if (!Array.isArray(tiles)) return [];
    return tiles.slice(0, MAX_TEXTURES).map(tile => {
        const entry = {
            name: text(tile && tile.name, ''),
            flags: clampInt(tile && tile.flags, 0, FLAG_MASK, 0) & FLAG_MASK
        };
        if (tile && typeof tile.height !== 'undefined') {
            const h = clampHeight(tile.height);
            if (h !== DEFAULT_HEIGHT) entry.height = h;
        }
        return entry;
    });
};

const createGrid = spec => {
    const source = spec || {};
    const cols = clampInt(source.cols, 1, MAX_SIZE, 30);
    const rows = clampInt(source.rows, 1, MAX_SIZE, 23);
    const tileSize = TILE_SIZES.indexOf(int(source.tileSize, 0)) === -1 ? 16 : int(source.tileSize, 16);
    const origin = Array.isArray(source.origin) ?
        [finite(source.origin[0], DEFAULT_ORIGIN[0]), finite(source.origin[1], DEFAULT_ORIGIN[1])] :
        DEFAULT_ORIGIN.slice();
    const grid = {
        id: text(source.id, 'level1'),
        name: text(source.name, text(source.id, 'level1')),
        cols,
        rows,
        tileSize,
        origin,
        tileset: text(source.tileset, ''),
        tiles: normalizeTiles(source.tiles),
        v: Math.max(0, int(source.v, 0))
    };
    const layers = source.layers || {};
    GRIDS.forEach(name => {
        grid[name] = decodeGrid(layers[name], cols, rows, maxForLayer(name), defaultForLayer(name));
    });
    grid.heights = decodeGrid(layers.heights, cols, rows, HEIGHT_MAX);
    return grid;
};

const encodeLevel = grid => {
    const layers = {};
    GRIDS.forEach(name => {
        layers[name] = encodeGrid(grid[name], grid.cols, grid.rows);
    });
    if (grid.heights && grid.heights.some(v => v !== 0)) {
        layers.heights = encodeGrid(grid.heights, grid.cols, grid.rows);
    }
    return {
        id: grid.id,
        name: grid.name,
        cols: grid.cols,
        rows: grid.rows,
        tileSize: grid.tileSize,
        origin: grid.origin.slice(),
        tileset: grid.tileset,
        tiles: grid.tiles.map(tile => {
            const entry = {name: tile.name, flags: tile.flags};
            if (tile.height && clampHeight(tile.height) !== DEFAULT_HEIGHT) {
                entry.height = clampHeight(tile.height);
            }
            return entry;
        }),
        v: grid.v,
        layers
    };
};

const cloneGrid = grid => {
    const copy = Object.assign({}, grid, {
        origin: grid.origin.slice(),
        tiles: grid.tiles.map(tile => Object.assign({}, tile))
    });
    GRIDS.forEach(name => {
        copy[name] = Uint8Array.from(grid[name]);
    });
    copy.heights = grid.heights ? Uint8Array.from(grid.heights) : new Uint8Array(grid.cols * grid.rows);
    if (copy._doors) delete copy._doors;
    if (copy._doorRev) delete copy._doorRev;
    return copy;
};

const inside = (grid, col, row) => col >= 0 && row >= 0 && col < grid.cols && row < grid.rows;

const indexOf = (grid, col, row) => (inside(grid, col, row) ? (row * grid.cols) + col : -1);

const getCell = (grid, layer, col, row) => {
    const i = indexOf(grid, col, row);
    if (i === -1) return defaultForLayer(layer);
    if (layer === 'heights') return grid.heights ? grid.heights[i] : 0;
    return grid[layer] ? grid[layer][i] : defaultForLayer(layer);
};

const setCell = (grid, layer, col, row, value) => {
    const i = indexOf(grid, col, row);
    if (i === -1) return false;
    if (layer === 'heights') {
        if (!grid.heights) grid.heights = new Uint8Array(grid.cols * grid.rows);
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > HEIGHT_MAX) return false;
        const v = n === 0 ? 0 : encodeHeight(n);
        if (grid.heights[i] === v) return false;
        grid.heights[i] = v;
        return true;
    }
    if (GRIDS.indexOf(layer) === -1) return false;
    const v = clampInt(value, 0, maxForLayer(layer), defaultForLayer(layer));
    if (grid[layer][i] === v) return false;
    grid[layer][i] = v;
    grid[layer]._version = (grid[layer]._version | 0) + 1;
    return true;
};

const flagsAt = (grid, col, row) => {
    const i = indexOf(grid, col, row);
    if (i === -1) return 0;
    const tile = grid.main[i];
    const tileFlags = tile > 0 && grid.tiles[tile - 1] ? grid.tiles[tile - 1].flags : 0;
    return grid.flags[i] | tileFlags;
};

const flagBit = name => FLAGS[String(name || '').toLowerCase()
    .replace(/[^a-z0-9]/g, '')] || 0;

const heightAt = (grid, col, row) => {
    const i = indexOf(grid, col, row);
    if (i === -1) return DEFAULT_HEIGHT;
    const raw = grid.heights ? grid.heights[i] : 0;
    if (raw > 0) return decodeHeight(raw);
    const tile = grid.main[i];
    const th = tile > 0 && grid.tiles[tile - 1] ? grid.tiles[tile - 1].height : 0;
    return th ? clampHeight(th) : DEFAULT_HEIGHT;
};

const setHeight = (grid, col, row, height) => setCell(
    grid,
    'heights',
    col,
    row,
    height === 0 || height === null || typeof height === 'undefined' ? 0 : encodeHeight(height)
);

const cellAt = (grid, x, y) => ({
    col: Math.floor((x - grid.origin[0]) / grid.tileSize),
    row: Math.floor((grid.origin[1] - y) / grid.tileSize)
});

const cellCenter = (grid, col, row) => ({
    x: grid.origin[0] + ((col + 0.5) * grid.tileSize),
    y: grid.origin[1] - ((row + 0.5) * grid.tileSize)
});

const levelRect = grid => ({
    left: grid.origin[0],
    right: grid.origin[0] + (grid.cols * grid.tileSize),
    top: grid.origin[1],
    bottom: grid.origin[1] - (grid.rows * grid.tileSize)
});

const tileIndex = (grid, value) => {
    if (typeof value === 'number' || (typeof value === 'string' && /^\s*\d+\s*$/.test(value))) {
        const n = int(value, 0);
        return n >= 0 && n <= MAX_TEXTURES ? n : 0;
    }
    const name = text(value, '');
    if (!name) return 0;
    const lower = name.toLowerCase();
    if (lower === 'empty' || lower === 'none') return 0;
    const found = grid.tiles.findIndex(tile => tile.name.toLowerCase() === lower);
    return found === -1 ? -1 : found + 1;
};

const addTexture = (grid, name, flags, height) => {
    const existing = tileIndex(grid, name);
    if (existing > 0) return existing;
    if (grid.tiles.length >= MAX_TEXTURES) return 0;
    const entry = {name: text(name, `tile${grid.tiles.length + 1}`), flags: clampInt(flags, 0, FLAG_MASK, 0)};
    if (typeof height !== 'undefined') {
        const h = clampHeight(height);
        if (h !== DEFAULT_HEIGHT) entry.height = h;
    }
    grid.tiles.push(entry);
    return grid.tiles.length;
};

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const base64 = bytes => {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const n = (a << 16) | (b << 8) | c;
        out += BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63];
        out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : '=';
        out += i + 2 < bytes.length ? BASE64[n & 63] : '=';
    }
    return out;
};

const solidBits = grid => {
    const bytes = new Uint8Array(Math.ceil((grid.cols * grid.rows) / 8));
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            if (flagsAt(grid, col, row) & FLAGS.solid) {
                const i = (row * grid.cols) + col;
                bytes[i >> 3] |= 1 << (i & 7);
            }
        }
    }
    return bytes;
};

const solidRows = grid => {
    const cells = new Uint8Array(grid.cols * grid.rows);
    for (let i = 0; i < cells.length; i++) {
        cells[i] = flagsAt(grid, i % grid.cols, Math.floor(i / grid.cols)) & FLAG_MASK;
    }
    return encodeGrid(cells, grid.cols, grid.rows);
};

const toRulesLevel = (grid, withSolid) => {
    const level = {
        id: grid.id,
        cols: grid.cols,
        rows: grid.rows,
        tile: grid.tileSize,
        origin: grid.origin.slice()
    };
    if (withSolid) level.solid = base64(solidBits(grid));
    return level;
};

export {
    FORMAT,
    MAX_SIZE,
    MAX_TEXTURES,
    MAX_LEVELS,
    DEFAULT_LIGHT,
    MAX_LIGHT,
    TILE_SIZES,
    DEFAULT_ORIGIN,
    LAYERS,
    GRIDS,
    FLAGS,
    FLAG_MASK,
    MIN_HEIGHT,
    MAX_HEIGHT,
    DEFAULT_HEIGHT,
    HEIGHT_SCALE,
    HEIGHT_MAX,
    clampHeight,
    encodeHeight,
    decodeHeight,
    encodeRow,
    decodeRow,
    encodeGrid,
    decodeGrid,
    createGrid,
    encodeLevel,
    cloneGrid,
    inside,
    indexOf,
    getCell,
    setCell,
    flagsAt,
    flagBit,
    heightAt,
    setHeight,
    cellAt,
    cellCenter,
    levelRect,
    tileIndex,
    addTexture,
    base64,
    solidBits,
    solidRows,
    toRulesLevel
};
