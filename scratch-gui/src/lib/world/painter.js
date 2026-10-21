import {FLAGS, cellAt, cellCenter, getCell, inside} from './tilemap.js';

const BOXED = Object.freeze(['rect', 'bounds']);

const TOOLS = Object.freeze(['paint', 'erase', 'fill', 'rect', 'pick', 'flag', 'spawn', 'bounds']);
const PAINT_LAYERS = Object.freeze(['back', 'main', 'front']);
const FLAG_NAMES = Object.freeze(Object.keys(FLAGS));
const ORIGIN = 'painter';
const MAX_UNDO = 100;
const STAGE_W = 480;
const STAGE_H = 360;
const MIN_VIEW_ZOOM = 0.25;
const MAX_VIEW_ZOOM = 8;

const keyOf = (col, row) => `${row}:${col}`;

const toStage = (rect, clientX, clientY) => ({
    x: (((clientX - rect.left) / rect.width) * STAGE_W) - (STAGE_W / 2),
    y: (STAGE_H / 2) - (((clientY - rect.top) / rect.height) * STAGE_H)
});

const toWorld = (view, point) => {
    const v = view || {x: 0, y: 0, zoom: 1};
    const zoom = v.zoom || 1;
    return {x: (point.x / zoom) + v.x, y: (point.y / zoom) + v.y};
};

const cellFromClient = (grid, view, rect, clientX, clientY) => {
    if (!grid || !rect || !rect.width || !rect.height) return null;
    const at = toWorld(view, toStage(rect, clientX, clientY));
    const cell = cellAt(grid, at.x, at.y);
    return inside(grid, cell.col, cell.row) ? cell : null;
};

const cellToClient = (grid, view, rect, col, row) => {
    const v = view || {x: 0, y: 0, zoom: 1};
    const zoom = v.zoom || 1;
    const size = grid.tileSize * zoom;
    const left = ((grid.origin[0] + (col * grid.tileSize) - v.x) * zoom) + (STAGE_W / 2);
    const top = (STAGE_H / 2) - ((grid.origin[1] - (row * grid.tileSize) - v.y) * zoom);
    const sx = rect.width / STAGE_W;
    const sy = rect.height / STAGE_H;
    return {left: left * sx, top: top * sy, width: size * sx, height: size * sy};
};

const clampZoom = zoom => Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, Number(zoom) || 1));

const zoomAround = (view, point, zoom) => {
    const at = toWorld(view, point);
    const next = clampZoom(zoom);
    return {x: at.x - (point.x / next), y: at.y - (point.y / next), zoom: next};
};

const panBy = (view, dx, dy) => ({x: view.x - (dx / view.zoom), y: view.y - (dy / view.zoom), zoom: view.zoom});

const midpoint = pair => ({x: (pair.a.x + pair.b.x) / 2, y: (pair.a.y + pair.b.y) / 2});

const spread = pair => Math.hypot(pair.a.x - pair.b.x, pair.a.y - pair.b.y);

const pinchView = (start, from, to) => {
    const before = spread(from);
    const zoom = clampZoom(start.zoom * (before > 0 ? spread(to) / before : 1));
    const anchor = toWorld(start, midpoint(from));
    const mid = midpoint(to);
    return {x: anchor.x - (mid.x / zoom), y: anchor.y - (mid.y / zoom), zoom};
};

const revealCell = (grid, view, col, row) => {
    const halfW = STAGE_W / 2 / view.zoom;
    const halfH = STAGE_H / 2 / view.zoom;
    const left = grid.origin[0] + (col * grid.tileSize);
    const top = grid.origin[1] - (row * grid.tileSize);
    let x = view.x;
    let y = view.y;
    if (left < x - halfW) x = left + halfW;
    else if (left + grid.tileSize > x + halfW) x = left + grid.tileSize - halfW;
    if (top > y + halfH) y = top - halfH;
    else if (top - grid.tileSize < y - halfH) y = top - grid.tileSize + halfH;
    return x === view.x && y === view.y ? view : {x, y, zoom: view.zoom};
};

const line = (from, to) => {
    const cells = [];
    let col = from.col;
    let row = from.row;
    const dc = Math.abs(to.col - col);
    const dr = -Math.abs(to.row - row);
    const sc = col < to.col ? 1 : -1;
    const sr = row < to.row ? 1 : -1;
    let err = dc + dr;
    for (;;) {
        cells.push({col, row});
        if (col === to.col && row === to.row) return cells;
        const e2 = 2 * err;
        if (e2 >= dr) {
            err += dr;
            col += sc;
        }
        if (e2 <= dc) {
            err += dc;
            row += sr;
        }
    }
};

const floodCells = (grid, layer, col, row) => {
    if (!inside(grid, col, row)) return [];
    const from = getCell(grid, layer, col, row);
    const seen = new Uint8Array(grid.cols * grid.rows);
    const out = [];
    const stack = [col, row];
    while (stack.length) {
        const r = stack.pop();
        const c = stack.pop();
        if (!inside(grid, c, r)) continue;
        const i = (r * grid.cols) + c;
        if (seen[i] || grid[layer][i] !== from) continue;
        seen[i] = 1;
        out.push({col: c, row: r});
        stack.push(c + 1, r, c - 1, r, c, r + 1, c, r - 1);
    }
    return out;
};

const rectCells = (grid, a, b) => {
    const out = [];
    const c0 = Math.max(0, Math.min(a.col, b.col));
    const c1 = Math.min(grid.cols - 1, Math.max(a.col, b.col));
    const r0 = Math.max(0, Math.min(a.row, b.row));
    const r1 = Math.min(grid.rows - 1, Math.max(a.row, b.row));
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) out.push({col: c, row: r});
    }
    return out;
};

const createPainter = options => {
    const world = options.world;
    const onChange = options.onChange || (() => {});
    const undoStack = [];
    const redoStack = [];
    let stroke = null;

    const grid = () => world.level(world.currentId());

    const record = (entry, layer, cells) => {
        const target = world.level(entry.level);
        for (const cell of cells) {
            const key = keyOf(cell.col, cell.row);
            if (!entry.before.has(key)) entry.before.set(key, getCell(target, layer, cell.col, cell.row));
            entry.after.set(key, cell.value);
        }
    };

    const write = (entry, cells) => {
        const target = world.level(entry.level);
        if (!target) return [];
        const fresh = cells.filter(cell => inside(target, cell.col, cell.row) &&
            getCell(target, entry.layer, cell.col, cell.row) !== cell.value);
        if (!fresh.length) return [];
        record(entry, entry.layer, fresh);
        return world.paintCells(entry.level, entry.layer, fresh, ORIGIN);
    };

    const push = entry => {
        if (!entry || !entry.after.size) return false;
        undoStack.push(entry);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack.length = 0;
        onChange();
        return true;
    };

    const valueFor = (tool, settings, current) => {
        if (tool === 'erase') return 0;
        if (tool === 'flag') {
            const bit = FLAGS[settings.flag] || FLAGS.solid;
            return settings.flagOn ? (current | bit) : (current & ~bit);
        }
        return settings.tile;
    };

    const layerFor = (tool, settings) => (tool === 'flag' ? 'flags' : settings.layer);

    const begin = (tool, settings, cell) => {
        const target = grid();
        if (!target || !cell || TOOLS.indexOf(tool) === -1) return null;
        const layer = layerFor(tool, settings);
        if (tool === 'pick') {
            return {tool, value: getCell(target, settings.layer, cell.col, cell.row)};
        }
        const entry = {level: target.id, layer, before: new Map(), after: new Map()};
        const opts = Object.assign({}, settings);
        if (tool === 'flag') {
            const bit = FLAGS[settings.flag] || FLAGS.solid;
            opts.flagOn = (getCell(target, 'flags', cell.col, cell.row) & bit) === 0;
        }
        const paintAt = cells => write(entry, cells.map(c => ({
            col: c.col,
            row: c.row,
            value: valueFor(tool, opts, getCell(target, layer, c.col, c.row))
        })));
        if (tool === 'fill') {
            paintAt(floodCells(target, layer, cell.col, cell.row));
            push(entry);
            return {tool, done: true};
        }
        stroke = {tool, entry, start: cell, last: cell, paintAt};
        if (tool === 'paint' || tool === 'erase' || tool === 'flag') paintAt([cell]);
        return {tool};
    };

    const move = cell => {
        if (!stroke || !cell) return;
        if (BOXED.indexOf(stroke.tool) !== -1) {
            stroke.last = cell;
            return;
        }
        if (stroke.tool === 'spawn') return;
        stroke.paintAt(line(stroke.last, cell));
        stroke.last = cell;
    };

    const end = cell => {
        if (!stroke) return null;
        const done = stroke;
        stroke = null;
        const target = world.level(done.entry.level);
        if (done.tool === 'rect' && target) done.paintAt(rectCells(target, done.start, cell || done.last));
        if (done.tool === 'bounds') {
            if (!target) return null;
            const a = done.start;
            const b = cell || done.last;
            const left = target.origin[0] + (Math.min(a.col, b.col) * target.tileSize);
            const top = target.origin[1] - (Math.min(a.row, b.row) * target.tileSize);
            return {
                tool: 'bounds',
                bounds: {
                    left,
                    right: target.origin[0] + ((Math.max(a.col, b.col) + 1) * target.tileSize),
                    top,
                    bottom: target.origin[1] - ((Math.max(a.row, b.row) + 1) * target.tileSize)
                }
            };
        }
        if (done.tool === 'spawn') {
            const at = cell || done.last;
            return target ? {tool: 'spawn', point: cellCenter(target, at.col, at.row)} : null;
        }
        push(done.entry);
        return {tool: done.tool};
    };

    const cancel = () => {
        if (!stroke) return;
        const done = stroke;
        stroke = null;
        if (done.entry.after.size) push(done.entry);
    };

    const replay = (entry, which) => {
        const cells = Array.from(entry[which].entries()).map(([key, value]) => {
            const parts = key.split(':');
            return {row: Number(parts[0]), col: Number(parts[1]), value};
        });
        if (world.level(entry.level)) world.paintCells(entry.level, entry.layer, cells, ORIGIN);
    };

    const discard = () => {
        if (!stroke) return false;
        const done = stroke;
        stroke = null;
        if (done.entry.after.size) {
            replay(done.entry, 'before');
            onChange();
        }
        return true;
    };

    const undo = () => {
        cancel();
        const entry = undoStack.pop();
        if (!entry) return false;
        replay(entry, 'before');
        redoStack.push(entry);
        onChange();
        return true;
    };

    const redo = () => {
        cancel();
        const entry = redoStack.pop();
        if (!entry) return false;
        replay(entry, 'after');
        undoStack.push(entry);
        onChange();
        return true;
    };

    const clear = () => {
        stroke = null;
        undoStack.length = 0;
        redoStack.length = 0;
        onChange();
    };

    return {
        begin,
        move,
        end,
        cancel,
        discard,
        undo,
        redo,
        clear,
        grid,
        stroking: () => !!stroke,
        preview: () => (stroke && BOXED.indexOf(stroke.tool) !== -1 ?
            {tool: stroke.tool, start: stroke.start, last: stroke.last} : null),
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0
    };
};

export {
    TOOLS,
    PAINT_LAYERS,
    FLAG_NAMES,
    ORIGIN,
    MAX_UNDO,
    toStage,
    toWorld,
    cellFromClient,
    cellToClient,
    clampZoom,
    zoomAround,
    panBy,
    pinchView,
    revealCell,
    line,
    floodCells,
    rectCells,
    createPainter
};
