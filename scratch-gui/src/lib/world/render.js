import {viewRect} from './camera.js';

const CHUNK = 256;
const MARGIN = 1;
const POOL = 48;
const GROUPS = Object.freeze([
    {name: 'back', layer: 'sq-tiles-back', grids: ['back', 'main']},
    {name: 'front', layer: 'sq-tiles-front', grids: ['front']}
]);

const groupFor = layer => (layer === 'front' ? GROUPS[1] : GROUPS[0]);

const createTileRenderer = options => {
    const renderer = options.renderer;
    const createCanvas = options.createCanvas;
    const textureFor = options.textureFor;
    const now = options.now || (() => Date.now());
    const chunks = new Map();
    const dirty = new Set();
    let grid = null;
    let range = '';
    let hidden = false;

    const cellsPerChunk = () => CHUNK / grid.tileSize;

    const keyOf = (group, cx, cy) => `${group.name}:${cx}:${cy}`;

    const destroyChunk = chunk => {
        if (chunk.drawable !== null) renderer.destroyDrawable(chunk.drawable, chunk.group.layer);
        if (chunk.skin !== null) renderer.destroySkin(chunk.skin);
        chunks.delete(chunk.key);
    };

    const clear = () => {
        Array.from(chunks.values()).forEach(destroyChunk);
        dirty.clear();
        range = '';
    };

    const isEmpty = (group, cx, cy) => {
        const n = cellsPerChunk();
        for (const name of group.grids) {
            const cells = grid[name];
            for (let row = cy * n; row < Math.min(grid.rows, (cy + 1) * n); row++) {
                const base = row * grid.cols;
                for (let col = cx * n; col < Math.min(grid.cols, (cx + 1) * n); col++) {
                    if (cells[base + col]) return false;
                }
            }
        }
        return true;
    };

    const paint = chunk => {
        const n = cellsPerChunk();
        const ts = grid.tileSize;
        if (!chunk.canvas) {
            chunk.canvas = createCanvas(CHUNK, CHUNK);
            chunk.ctx = chunk.canvas.getContext('2d');
            chunk.ctx.imageSmoothingEnabled = false;
        }
        const ctx = chunk.ctx;
        ctx.clearRect(0, 0, CHUNK, CHUNK);
        for (const name of chunk.group.grids) {
            const cells = grid[name];
            for (let r = 0; r < n; r++) {
                const row = (chunk.cy * n) + r;
                if (row >= grid.rows) break;
                for (let c = 0; c < n; c++) {
                    const col = (chunk.cx * n) + c;
                    if (col >= grid.cols) break;
                    const value = cells[(row * grid.cols) + col];
                    if (!value) continue;
                    const image = textureFor(grid, value);
                    if (image) ctx.drawImage(image, c * ts, r * ts, ts, ts);
                }
            }
        }
        if (chunk.skin === null) {
            chunk.skin = renderer.createBitmapSkin(chunk.canvas, 1, [0, 0]);
            chunk.drawable = renderer.createDrawable(chunk.group.layer);
            renderer.updateDrawableSkinId(chunk.drawable, chunk.skin);
            renderer.updateDrawablePosition(chunk.drawable, [
                grid.origin[0] + (chunk.cx * CHUNK),
                grid.origin[1] - (chunk.cy * CHUNK)
            ]);
        } else {
            renderer.updateBitmapSkin(chunk.skin, chunk.canvas, 1, [0, 0]);
        }
        chunk.painted = true;
    };

    const ensureChunk = (group, cx, cy) => {
        const key = keyOf(group, cx, cy);
        let chunk = chunks.get(key);
        if (!chunk) {
            chunk = {key,
                group,
                cx,
                cy,
                skin: null,
                drawable: null,
                canvas: null,
                ctx: null,
                painted: false,
                visible: false,
                stale: false,
                used: 0};
            chunks.set(key, chunk);
            dirty.add(key);
        }
        return chunk;
    };

    const setVisible = (chunk, visible) => {
        if (chunk.visible === visible || chunk.drawable === null) {
            chunk.visible = visible && chunk.drawable !== null;
            return;
        }
        chunk.visible = visible;
        renderer.updateDrawableVisible(chunk.drawable, visible);
    };

    const evict = keep => {
        const spare = Array.from(chunks.values()).filter(chunk => !keep.has(chunk.key));
        const limit = Math.max(0, POOL - keep.size);
        if (spare.length <= limit) return;
        spare.sort((a, b) => a.used - b.used);
        spare.slice(0, spare.length - limit).forEach(destroyChunk);
    };

    const update = view => {
        if (!grid || hidden) return 0;
        const rect = viewRect(view);
        const maxX = Math.ceil((grid.cols * grid.tileSize) / CHUNK) - 1;
        const maxY = Math.ceil((grid.rows * grid.tileSize) / CHUNK) - 1;
        const x0 = Math.max(0, Math.floor((rect.left - grid.origin[0]) / CHUNK) - MARGIN);
        const x1 = Math.min(maxX, Math.floor((rect.right - grid.origin[0]) / CHUNK) + MARGIN);
        const y0 = Math.max(0, Math.floor((grid.origin[1] - rect.top) / CHUNK) - MARGIN);
        const y1 = Math.min(maxY, Math.floor((grid.origin[1] - rect.bottom) / CHUNK) + MARGIN);
        const next = `${x0},${x1},${y0},${y1}`;
        if (next === range && dirty.size === 0) return 0;
        range = next;
        const keep = new Set();
        const stamp = now();
        let painted = 0;
        for (const group of GROUPS) {
            for (let cy = y0; cy <= y1; cy++) {
                for (let cx = x0; cx <= x1; cx++) {
                    const key = keyOf(group, cx, cy);
                    const existing = chunks.get(key);
                    if (!existing && isEmpty(group, cx, cy)) continue;
                    const chunk = existing || ensureChunk(group, cx, cy);
                    keep.add(key);
                    chunk.used = stamp;
                    if (dirty.has(key) || chunk.stale) {
                        dirty.delete(key);
                        chunk.stale = false;
                        paint(chunk);
                        painted++;
                    }
                    setVisible(chunk, true);
                }
            }
        }
        dirty.forEach(key => {
            const chunk = chunks.get(key);
            if (chunk) chunk.stale = true;
        });
        dirty.clear();
        chunks.forEach(chunk => {
            if (!keep.has(chunk.key)) setVisible(chunk, false);
        });
        evict(keep);
        return painted;
    };

    return {
        CHUNK,
        chunks,
        setGrid (next) {
            if (next === grid) return;
            clear();
            grid = next;
        },
        getGrid: () => grid,
        markCell (col, row, layer) {
            if (!grid) return;
            const n = cellsPerChunk();
            const key = keyOf(groupFor(layer), Math.floor(col / n), Math.floor(row / n));
            dirty.add(key);
            if (!chunks.has(key)) range = '';
        },
        markAll () {
            chunks.forEach(chunk => dirty.add(chunk.key));
            range = '';
        },
        setHidden (on) {
            hidden = !!on;
            chunks.forEach(chunk => setVisible(chunk, !hidden && chunk.visible));
            if (!hidden) range = '';
        },
        update,
        destroy () {
            clear();
            grid = null;
        }
    };
};

export {
    CHUNK,
    GROUPS,
    createTileRenderer
};
