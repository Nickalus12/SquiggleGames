import {FLAGS, cellAt, flagsAt, inside} from './tilemap.js';

const OPEN_MS = 400;
const HOLD_MS = 3000;
const MAX_DOORS = 16;
const PASS_OPEN = 0.8;
const DOOR_PREFIX = 'door:';

const states = new WeakMap();

const cellKey = (col, row) => `${col},${row}`;

const doorKey = (col, row) => `${DOOR_PREFIX}${col}:${row}`;

const parseDoorKey = key => {
    if (typeof key !== 'string' || !key.startsWith(DOOR_PREFIX)) return null;
    const parts = key.slice(DOOR_PREFIX.length).split(':');
    if (parts.length !== 2) return null;
    const col = Number(parts[0]);
    const row = Number(parts[1]);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
    return {col, row};
};

const ensureMap = grid => {
    if (!grid) return null;
    if (!grid._doors) grid._doors = new Map();
    if (typeof grid._doorRev !== 'number') grid._doorRev = 0;
    return grid._doors;
};

const bumpRev = grid => {
    if (!grid) return;
    grid._doorRev = (grid._doorRev || 0) + 1;
};

const isDoorCell = (grid, col, row) => Boolean(
    grid && inside(grid, col, row) && (flagsAt(grid, col, row) & FLAGS.door) !== 0
);

const findDoorCell = (grid, x, y, asCell) => {
    if (!grid) return null;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
    if (asCell) {
        const col = Math.floor(nx);
        const row = Math.floor(ny);
        return isDoorCell(grid, col, row) ? {col, row} : null;
    }
    const worldCell = cellAt(grid, nx, ny);
    if (isDoorCell(grid, worldCell.col, worldCell.row)) return worldCell;
    if (Number.isInteger(nx) && Number.isInteger(ny) && isDoorCell(grid, nx, ny)) {
        return {col: nx, row: ny};
    }
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let i = 0; i < dirs.length; i++) {
        const c = worldCell.col + dirs[i][0];
        const r = worldCell.row + dirs[i][1];
        if (isDoorCell(grid, c, r)) return {col: c, row: r};
    }
    return null;
};

const boxCellSpan = (grid, box, margin) => {
    const pad = Number(margin) || 0;
    const ts = grid.tileSize || 16;
    const px = box.x - grid.origin[0];
    const py = grid.origin[1] - box.y;
    const halfW = (Math.max(1, Number(box.w) || 1) / 2) + pad;
    const halfH = (Math.max(1, Number(box.h) || 1) / 2) + pad;
    const eps = 1e-7;
    const c0 = Math.max(0, Math.floor(((px - halfW) / ts) + eps));
    const c1 = Math.min(grid.cols - 1, Math.ceil(((px + halfW) / ts) - eps) - 1);
    const r0 = Math.max(0, Math.floor(((py - halfH) / ts) + eps));
    const r1 = Math.min(grid.rows - 1, Math.ceil(((py + halfH) / ts) - eps) - 1);
    return {c0, c1, r0, r1};
};

const boxBlocksDoor = (grid, col, row, blockers) => {
    if (!grid || !Array.isArray(blockers) || !blockers.length) return false;
    for (let i = 0; i < blockers.length; i++) {
        const box = blockers[i];
        if (!box) continue;
        const span = boxCellSpan(grid, box, 0);
        if (col >= span.c0 && col <= span.c1 && row >= span.r0 && row <= span.r1) return true;
    }
    return false;
};

const touchingDoor = (grid, box) => {
    if (!grid || !box) return null;
    const margin = Math.max(2, (grid.tileSize || 16) * 0.15);
    const span = boxCellSpan(grid, box, margin);
    for (let row = span.r0; row <= span.r1; row++) {
        for (let col = span.c0; col <= span.c1; col++) {
            if (isDoorCell(grid, col, row)) return {col, row};
        }
    }
    return null;
};

const evictClosedDoor = doors => {
    for (const [key, entry] of doors.entries()) {
        if (entry.open === 0 && entry.target === 0) {
            doors.delete(key);
            return true;
        }
    }
    return false;
};

const openDoorAt = (grid, x, y, options) => {
    const opts = options || {};
    const cell = findDoorCell(grid, x, y, opts.cell);
    if (!cell) return false;
    const doors = ensureMap(grid);
    const key = cellKey(cell.col, cell.row);
    let entry = doors.get(key);
    if (!entry) {
        if (doors.size >= MAX_DOORS && !evictClosedDoor(doors)) return false;
        entry = {
            col: cell.col,
            row: cell.row,
            open: 0,
            target: 0,
            hold: 0,
            holdMs: HOLD_MS
        };
        doors.set(key, entry);
    }
    const holdMs = typeof opts.holdMs === 'number' && Number.isFinite(opts.holdMs) ?
        Math.max(0, opts.holdMs) : HOLD_MS;
    const changed = entry.target !== 1 || entry.holdMs !== holdMs || entry.hold < holdMs;
    entry.target = 1;
    entry.holdMs = holdMs;
    entry.hold = holdMs;
    if (changed) bumpRev(grid);
    return true;
};

const closeDoorAt = (grid, x, y, options) => {
    const opts = options || {};
    const cell = findDoorCell(grid, x, y, opts.cell);
    if (!cell) return false;
    const doors = ensureMap(grid);
    const key = cellKey(cell.col, cell.row);
    const entry = doors.get(key);
    if (!entry) return true;
    if (boxBlocksDoor(grid, cell.col, cell.row, opts.blockers)) {
        entry.target = 1;
        entry.hold = Math.min(entry.hold || entry.holdMs, 200);
        return false;
    }
    const changed = entry.target !== 0 || entry.hold !== 0;
    entry.target = 0;
    entry.hold = 0;
    if (changed) bumpRev(grid);
    return true;
};

const doorOpenAt = (grid, col, row) => {
    if (!grid || !grid._doors || grid._doors.size === 0) return 0;
    const entry = grid._doors.get(cellKey(col, row));
    return entry ? entry.open : 0;
};

const isDoorOpenAt = (grid, x, y, options) => {
    const cell = findDoorCell(grid, x, y, options && options.cell);
    if (!cell) return false;
    return doorOpenAt(grid, cell.col, cell.row) >= PASS_OPEN;
};

const stepDoors = (grid, dtMs, blockers) => {
    const dt = Number(dtMs);
    if (!grid || !grid._doors || grid._doors.size === 0 || !Number.isFinite(dt) || dt <= 0) return false;
    let changed = false;
    for (const entry of grid._doors.values()) {
        const blocked = boxBlocksDoor(grid, entry.col, entry.row, blockers);
        let rem = dt;
        if (entry.target === 1) {
            if (entry.open < 1) {
                const needed = (1 - entry.open) * OPEN_MS;
                if (rem < needed) {
                    entry.open = Math.min(1, entry.open + (rem / OPEN_MS));
                    rem = 0;
                } else {
                    entry.open = 1;
                    entry.hold = entry.holdMs;
                    rem -= needed;
                }
                changed = true;
            }
            if (entry.open >= 1 && rem > 0) {
                if (blocked) {
                    entry.hold = Math.max(entry.hold, 200);
                } else if (entry.holdMs > 0) {
                    if (rem < entry.hold) {
                        entry.hold -= rem;
                    } else {
                        const over = rem - entry.hold;
                        entry.hold = 0;
                        entry.target = 0;
                        if (over > 0) {
                            entry.open = Math.max(0, 1 - (over / OPEN_MS));
                            changed = true;
                        }
                    }
                }
            }
        } else if (entry.open > 0) {
            if (blocked) {
                entry.target = 1;
                entry.hold = entry.holdMs;
                entry.open = Math.min(1, entry.open + (rem / OPEN_MS));
                changed = true;
            } else {
                entry.open = Math.max(0, entry.open - (rem / OPEN_MS));
                changed = true;
            }
        }
    }
    if (changed) bumpRev(grid);
    return changed;
};

const encodeDoorValues = grid => {
    const out = {};
    if (!grid || !grid._doors || grid._doors.size === 0) return out;
    let count = 0;
    for (const entry of grid._doors.values()) {
        if (count >= MAX_DOORS) break;
        out[doorKey(entry.col, entry.row)] = entry.target === 1 ? 1 : 0;
        count++;
    }
    return out;
};

const applyDoorValues = (grid, values, blockers) => {
    if (!grid || !values || typeof values !== 'object') return 0;
    const keys = Object.keys(values);
    let count = 0;
    let applied = 0;
    for (let i = 0; i < keys.length && count < MAX_DOORS; i++) {
        const parsed = parseDoorKey(keys[i]);
        if (!parsed) continue;
        count++;
        if (!isDoorCell(grid, parsed.col, parsed.row)) continue;
        const wantOpen = Number(values[keys[i]]) === 1;
        const existing = grid._doors && grid._doors.get(cellKey(parsed.col, parsed.row));
        const curTarget = existing ? existing.target : 0;
        if (wantOpen && curTarget !== 1) {
            if (openDoorAt(grid, parsed.col, parsed.row, {cell: true})) applied++;
        } else if (!wantOpen && curTarget !== 0) {
            if (closeDoorAt(grid, parsed.col, parsed.row, {cell: true, blockers})) applied++;
        }
    }
    return applied;
};

const netFor = (runtime, explicitNet) => {
    if (explicitNet) return explicitNet;
    if (runtime && runtime.squiggleNet) return runtime.squiggleNet;
    if (typeof window !== 'undefined' && window.SquiggleNet) return window.SquiggleNet;
    return null;
};

const broadcastDoor = (net, col, row, targetOpen) => {
    if (!net) return;
    const key = doorKey(col, row);
    const val = targetOpen ? 1 : 0;
    if (net.gameState && typeof net.gameState.setGameValue === 'function' && net.isHost) {
        net.gameState.setGameValue(key, val);
        return;
    }
    if (typeof net.sendSharedVar === 'function') {
        net.sendSharedVar(key, val);
    }
};

const readNetDoorValues = net => {
    if (!net) return null;
    if (net.gameState && net.gameState.game && net.gameState.game.values) {
        return net.gameState.game.values;
    }
    if (net.sharedVars && typeof net.sharedVars === 'object') {
        return net.sharedVars;
    }
    return null;
};

const createDoors = (runtime, world, options) => {
    const opts = options || {};
    const collectBlockers = () => {
        if (!runtime || !Array.isArray(runtime.targets)) return [];
        const boxes = [];
        for (let i = 0; i < runtime.targets.length; i++) {
            const target = runtime.targets[i];
            if (!target || target.isStage || target.visible === false) continue;
            boxes.push(world.box(target));
        }
        return boxes;
    };

    const step = dtMs => {
        const grid = world.current();
        if (!grid) return false;
        const blockers = collectBlockers();
        const net = netFor(runtime, opts.net);
        const remote = readNetDoorValues(net);
        if (remote) applyDoorValues(grid, remote, blockers);
        const ms = typeof dtMs === 'number' ? dtMs : (runtime && runtime.currentStepTime) || (1000 / 30);
        return stepDoors(grid, ms, blockers);
    };

    const onAfterExecute = () => {
        if (!world || !world.isAttached()) step();
    };

    if (runtime && typeof runtime.on === 'function') {
        runtime.on('AFTER_EXECUTE', onAfterExecute);
    }

    return {
        open (x, y, openOpts) {
            const grid = world.current();
            if (!grid) return false;
            const cell = findDoorCell(grid, x, y, openOpts && openOpts.cell);
            if (!cell) return false;
            const ok = openDoorAt(grid, cell.col, cell.row, Object.assign({}, openOpts, {cell: true}));
            if (ok) broadcastDoor(netFor(runtime, opts.net), cell.col, cell.row, true);
            return ok;
        },
        close (x, y, closeOpts) {
            const grid = world.current();
            if (!grid) return false;
            const cell = findDoorCell(grid, x, y, closeOpts && closeOpts.cell);
            if (!cell) return false;
            const blockers = (closeOpts && closeOpts.blockers) || collectBlockers();
            const ok = closeDoorAt(grid, cell.col, cell.row, Object.assign({}, closeOpts, {cell: true, blockers}));
            if (ok) broadcastDoor(netFor(runtime, opts.net), cell.col, cell.row, false);
            return ok;
        },
        isOpen (x, y, checkOpts) {
            const grid = world.current();
            if (!grid) return false;
            return isDoorOpenAt(grid, x, y, checkOpts);
        },
        openFraction (col, row) {
            const grid = world.current();
            return doorOpenAt(grid, col, row);
        },
        touching (target) {
            const grid = world.current();
            if (!grid || !target || target.isStage) return false;
            return touchingDoor(grid, world.box(target)) !== null;
        },
        step,
        values () {
            return encodeDoorValues(world.current());
        },
        applyValues (values) {
            const grid = world.current();
            if (!grid) return 0;
            return applyDoorValues(grid, values, collectBlockers());
        }
    };
};

const getDoors = (runtime, world, options) => {
    if (!runtime) return null;
    if (!states.has(runtime)) states.set(runtime, createDoors(runtime, world, options));
    return states.get(runtime);
};

const peekDoors = runtime => (runtime && states.get(runtime)) || null;

export {
    OPEN_MS,
    HOLD_MS,
    MAX_DOORS,
    PASS_OPEN,
    DOOR_PREFIX,
    doorKey,
    isDoorCell,
    findDoorCell,
    boxBlocksDoor,
    touchingDoor,
    openDoorAt,
    closeDoorAt,
    doorOpenAt,
    isDoorOpenAt,
    stepDoors,
    encodeDoorValues,
    applyDoorValues,
    createDoors,
    getDoors,
    peekDoors
};
