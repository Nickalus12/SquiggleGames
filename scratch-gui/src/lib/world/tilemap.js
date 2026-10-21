const FORMAT = 1;
const MAX_SIZE = 128;
const MAX_TEXTURES = 48;
const MAX_LEVELS = 32;
const TILE_SIZES = Object.freeze([16, 32]);
const DEFAULT_ORIGIN = Object.freeze([-240, 180]);
const LAYERS = Object.freeze(['back', 'main', 'front']);
const GRIDS = Object.freeze(['back', 'main', 'front', 'flags']);

const FLAGS = Object.freeze({
    solid: 1,
    oneway: 2,
    hazard: 4,
    goal: 8
});
const FLAG_MASK = 15;

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

const decodeRow = (row, cells, start, length, max) => {
    if (!Array.isArray(row)) return false;
    let at = 0;
    for (let i = 0; i + 1 < row.length && at < length; i += 2) {
        const value = int(row[i], 0);
        const count = int(row[i + 1], 0);
        if (count <= 0) continue;
        const v = value >= 0 && value <= max ? value : 0;
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

const decodeGrid = (rowsData, cols, rows, max) => {
    const cells = new Uint8Array(cols * rows);
    if (!Array.isArray(rowsData)) return cells;
    for (let r = 0; r < rows; r++) decodeRow(rowsData[r], cells, r * cols, cols, max);
    return cells;
};

const normalizeTiles = tiles => {
    if (!Array.isArray(tiles)) return [];
    return tiles.slice(0, MAX_TEXTURES).map(tile => ({
        name: text(tile && tile.name, ''),
        flags: clampInt(tile && tile.flags, 0, FLAG_MASK, 0) & FLAG_MASK
    }));
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
        const max = name === 'flags' ? FLAG_MASK : MAX_TEXTURES;
        grid[name] = decodeGrid(layers[name], cols, rows, max);
    });
    return grid;
};

const encodeLevel = grid => {
    const layers = {};
    GRIDS.forEach(name => {
        layers[name] = encodeGrid(grid[name], grid.cols, grid.rows);
    });
    return {
        id: grid.id,
        name: grid.name,
        cols: grid.cols,
        rows: grid.rows,
        tileSize: grid.tileSize,
        origin: grid.origin.slice(),
        tileset: grid.tileset,
        tiles: grid.tiles.map(tile => ({name: tile.name, flags: tile.flags})),
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
    return copy;
};

const inside = (grid, col, row) => col >= 0 && row >= 0 && col < grid.cols && row < grid.rows;

const indexOf = (grid, col, row) => (inside(grid, col, row) ? (row * grid.cols) + col : -1);

const getCell = (grid, layer, col, row) => {
    const i = indexOf(grid, col, row);
    return i === -1 ? 0 : grid[layer][i];
};

const setCell = (grid, layer, col, row, value) => {
    const i = indexOf(grid, col, row);
    if (i === -1 || GRIDS.indexOf(layer) === -1) return false;
    const max = layer === 'flags' ? FLAG_MASK : MAX_TEXTURES;
    const v = clampInt(value, 0, max, 0);
    if (grid[layer][i] === v) return false;
    grid[layer][i] = v;
    return true;
};

const flagsAt = (grid, col, row) => {
    const i = indexOf(grid, col, row);
    if (i === -1) return 0;
    const tile = grid.main[i];
    const tileFlags = tile > 0 && grid.tiles[tile - 1] ? grid.tiles[tile - 1].flags : 0;
    return grid.flags[i] | tileFlags;
};

const flagBit = name => FLAGS[String(name).toLowerCase()] || 0;

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

const addTexture = (grid, name, flags) => {
    const existing = tileIndex(grid, name);
    if (existing > 0) return existing;
    if (grid.tiles.length >= MAX_TEXTURES) return 0;
    grid.tiles.push({name: text(name, `tile${grid.tiles.length + 1}`), flags: clampInt(flags, 0, FLAG_MASK, 0)});
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
    TILE_SIZES,
    DEFAULT_ORIGIN,
    LAYERS,
    GRIDS,
    FLAGS,
    FLAG_MASK,
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
