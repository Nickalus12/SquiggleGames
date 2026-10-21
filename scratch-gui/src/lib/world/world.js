import {FLAGS, MAX_LEVELS, addTexture, cellAt, cloneGrid, createGrid, flagsAt, levelRect, setCell,
    toRulesLevel} from './tilemap.js';
import {moveBy, onGround, overlapFlags} from './collision.js';
import {STAGE_WIDTH, createCamera, toWorld} from './camera.js';
import {createTileRenderer} from './render.js';
import {createTextureCache, browserCanvas, browserImageLoader} from './textures.js';
import {SCENES_KEY, WORLD_KEY, readLevels, readScenes, removeLevel, writeLevel} from './storage.js';
import {preserveExtensionStorage} from '../collab/project-seam.js';

const PROJECT_LOADED = 'PROJECT_LOADED';
const PROJECT_START = 'PROJECT_START';
const PROJECT_STOP_ALL = 'PROJECT_STOP_ALL';

const IDENTITY_VIEW = Object.freeze({x: 0, y: 0, zoom: 1});
const BACKDROP_MODES = Object.freeze(['scrolls', 'fixed', 'parallax']);

const states = new WeakMap();

const createEmitter = () => {
    const listeners = new Map();
    return {
        on (name, fn) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(fn);
            return () => listeners.get(name).delete(fn);
        },
        emit (name, payload) {
            const set = listeners.get(name);
            if (set) Array.from(set).forEach(fn => fn(payload));
        }
    };
};

const chainHook = (seam, name, fn) => {
    const prior = seam.hooks ? seam.hooks[name] || null : null;
    return seam.hook(name, (next, ...args) => {
        const forward = (...rest) => (prior ? prior(next, ...rest) : next(...rest));
        return fn(forward, ...args);
    });
};

const sameView = (a, b) => a && b && a.x === b.x && a.y === b.y && a.zoom === b.zoom;

const createWorldState = (runtime, options) => {
    const opts = options || {};
    const emitter = createEmitter();
    const camera = createCamera({random: opts.random});
    const state = {
        runtime,
        seam: null,
        saved: [],
        currentId: '',
        play: null,
        tiles: null,
        textures: null,
        view: IDENTITY_VIEW,
        applied: null,
        pinned: new Set(),
        backdrop: {mode: 'scrolls', speed: 50},
        echo: null,
        echoSkin: null,
        hitboxes: new WeakMap(),
        hits: new WeakMap(),
        disposers: [],
        createCanvas: opts.createCanvas || browserCanvas,
        loadImage: opts.loadImage || browserImageLoader
    };

    const find = key => {
        const lower = String(key).trim()
            .toLowerCase();
        return state.saved.find(grid => grid.id.toLowerCase() === lower) ||
            state.saved.find(grid => grid.name.toLowerCase() === lower) || null;
    };

    const savedCurrent = () => find(state.currentId);

    const showPlay = () => {
        if (state.tiles) {
            state.tiles.setGrid(state.play);
            state.tiles.markAll();
        }
        state.applied = null;
        emitter.emit('level', state.play);
    };

    const resetPlay = () => {
        const saved = savedCurrent();
        state.play = saved ? cloneGrid(saved) : null;
        showPlay();
    };

    const loadFromStorage = () => {
        state.saved = readLevels(runtime);
        const keep = savedCurrent();
        state.currentId = keep ? keep.id : (state.saved[0] ? state.saved[0].id : '');
        camera.reset();
        state.pinned.clear();
        state.backdrop = {mode: 'scrolls', speed: 50};
        resetPlay();
        emitter.emit('levels', state.saved);
    };

    const followPosition = () => {
        const id = camera.state.follow;
        if (!id) return null;
        const target = typeof id === 'object' ? id : runtime.getSpriteTargetByName(id);
        if (!target || runtime.targets.indexOf(target) === -1) return null;
        return {x: target.x, y: target.y};
    };

    const currentView = progress => (camera.isActive() ? camera.view(progress) : IDENTITY_VIEW);

    const parallaxShift = view => {
        const speed = Math.max(0, Math.min(100, state.backdrop.speed)) / 100;
        const raw = -view.x * speed * view.zoom;
        return (((raw % STAGE_WIDTH) + STAGE_WIDTH + (STAGE_WIDTH / 2)) % STAGE_WIDTH) - (STAGE_WIDTH / 2);
    };

    const backdropPosition = view => {
        if (state.backdrop.mode === 'fixed') return [view.x, view.y];
        return [view.x + (parallaxShift(view) / view.zoom), view.y];
    };

    const stageDrawable = () => {
        const stage = runtime.getTargetForStage && runtime.getTargetForStage();
        return stage && typeof stage.drawableID === 'number' ? stage.drawableID : null;
    };

    const pinnedTarget = drawableID => {
        for (const target of state.pinned) {
            if (target.drawableID === drawableID) return target;
        }
        return null;
    };

    const renderedScale = target => {
        if (typeof target._getRenderedDirectionAndScale === 'function') return target._getRenderedDirectionAndScale();
        return {direction: target.direction, scale: [target.size, target.size]};
    };

    const hideEcho = () => {
        if (state.echo !== null && runtime.renderer) runtime.renderer.updateDrawableVisible(state.echo, false);
    };

    const destroyEcho = () => {
        if (state.echo !== null && runtime.renderer) runtime.renderer.destroyDrawable(state.echo, 'background');
        state.echo = null;
        state.echoSkin = null;
    };

    const stageSkin = () => {
        const stage = runtime.getTargetForStage && runtime.getTargetForStage();
        const costume = stage && stage.getCostumes()[stage.currentCostume];
        return costume && typeof costume.skinId === 'number' ? costume.skinId : null;
    };

    const updateEcho = (view, moved) => {
        const renderer = runtime.renderer;
        const skin = stageSkin();
        if (!renderer || view === IDENTITY_VIEW || state.backdrop.mode !== 'parallax' || skin === null) {
            hideEcho();
            return;
        }
        if (state.echo === null) {
            state.echo = renderer.createDrawable('background');
            moved = true;
        }
        if (skin !== state.echoSkin) {
            state.echoSkin = skin;
            renderer.updateDrawableSkinId(state.echo, skin);
        }
        if (!moved) return;
        const shift = parallaxShift(view);
        const other = shift < 0 ? shift + STAGE_WIDTH : shift - STAGE_WIDTH;
        renderer.updateDrawablePosition(state.echo, [view.x + (other / view.zoom), view.y]);
        renderer.updateDrawableDirectionScale(state.echo, 90, [100 / view.zoom, 100 / view.zoom]);
        renderer.updateDrawableVisible(state.echo, true);
    };

    const applyScreenSpace = view => {
        const renderer = runtime.renderer;
        const moved = !sameView(view, state.applied);
        updateEcho(view, moved);
        if (!renderer || !moved) return;
        state.applied = view;
        state.view = view;
        for (const target of Array.from(state.pinned)) {
            if (runtime.targets.indexOf(target) === -1 || typeof target.drawableID !== 'number') {
                state.pinned.delete(target);
                continue;
            }
            const rendered = renderedScale(target);
            renderer.updateDrawablePosition(target.drawableID, [target.x, target.y]);
            renderer.updateDrawableDirectionScale(target.drawableID, rendered.direction, rendered.scale);
        }
        const stageId = stageDrawable();
        if (stageId !== null && state.backdrop.mode !== 'scrolls') {
            renderer.updateDrawablePosition(stageId, [0, 0]);
            renderer.updateDrawableDirectionScale(stageId, 90, [100, 100]);
        }
    };

    const hookPosition = (forward, drawableID, position) => {
        const view = state.view;
        if (view !== IDENTITY_VIEW && position) {
            if (state.pinned.size && pinnedTarget(drawableID)) {
                const p = toWorld(view, position[0], position[1]);
                return forward(drawableID, [p.x, p.y]);
            }
            if (state.backdrop.mode !== 'scrolls' && drawableID === stageDrawable()) {
                return forward(drawableID, backdropPosition(view));
            }
        }
        return forward(drawableID, position);
    };

    const hookScale = (forward, drawableID, direction, scale) => {
        const view = state.view;
        if (view !== IDENTITY_VIEW && scale && ((state.pinned.size && pinnedTarget(drawableID)) ||
            (state.backdrop.mode !== 'scrolls' && drawableID === stageDrawable()))) {
            return forward(drawableID, direction, [scale[0] / view.zoom, scale[1] / view.zoom]);
        }
        return forward(drawableID, direction, scale);
    };

    const afterStep = () => {
        if (camera.isActive()) {
            const dt = (runtime.currentStepTime || (1000 / 30)) / 1000;
            camera.step(dt, followPosition());
        }
        if (state.tiles) state.tiles.update(currentView(1));
    };

    const ensureTiles = () => {
        if (state.tiles || !runtime.renderer) return state.tiles;
        state.textures = createTextureCache({
            runtime,
            loadImage: state.loadImage,
            onLoad: () => state.tiles && state.tiles.markAll()
        });
        state.tiles = createTileRenderer({
            renderer: runtime.renderer,
            createCanvas: state.createCanvas,
            textureFor: (grid, value) => state.textures.get(grid, value)
        });
        state.tiles.setGrid(state.play);
        return state.tiles;
    };

    const world = {
        runtime,
        camera,
        events: emitter,
        FLAGS,
        attach (seam) {
            if (!seam || state.seam === seam) return world;
            world.detach();
            state.seam = seam;
            ensureTiles();
            state.disposers.push(
                seam.setCamera(progress => {
                    const view = currentView(progress);
                    state.view = view;
                    applyScreenSpace(view);
                    return camera.isActive() ? view : null;
                }),
                chainHook(seam, 'drawablePosition', hookPosition),
                chainHook(seam, 'drawableDirectionScale', hookScale),
                seam.onAfterExecute(afterStep)
            );
            return world;
        },
        detach () {
            state.disposers.splice(0).reverse()
                .forEach(dispose => dispose());
            destroyEcho();
            state.seam = null;
        },
        isAttached: () => !!state.seam,
        reload: loadFromStorage,
        resetPlay,
        levels: () => state.saved,
        level: key => find(key),
        current: () => state.play,
        currentId: () => (state.play ? state.play.id : ''),
        useLevel (key) {
            const grid = find(key);
            if (!grid) return false;
            if (state.currentId === grid.id && state.play) return true;
            state.currentId = grid.id;
            resetPlay();
            if (camera.state.keepInside) camera.setBounds(levelRect(grid));
            return true;
        },
        clearLevel () {
            state.currentId = '';
            resetPlay();
        },
        createLevel (spec) {
            if (state.saved.length >= MAX_LEVELS) return null;
            const base = String((spec && spec.name) || `Level ${state.saved.length + 1}`).trim();
            let id = base.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') || 'level';
            while (find(id)) id = `${id}-${state.saved.length + 1}`;
            const grid = createGrid(Object.assign({}, spec, {id, name: base}));
            state.saved.push(grid);
            writeLevel(runtime, grid);
            emitter.emit('levels', state.saved);
            return grid;
        },
        deleteLevel (key) {
            const grid = find(key);
            if (!grid) return false;
            state.saved = state.saved.filter(level => level !== grid);
            removeLevel(runtime, grid.id);
            if (state.currentId === grid.id) {
                state.currentId = state.saved[0] ? state.saved[0].id : '';
                resetPlay();
            }
            emitter.emit('levels', state.saved);
            return true;
        },
        saveLevel (grid) {
            writeLevel(runtime, grid);
        },
        addTile (key, name, flags) {
            const grid = find(key);
            if (!grid) return 0;
            const value = addTexture(grid, name, flags);
            if (value && state.play && state.play.id === grid.id) {
                state.play.tiles = grid.tiles.map(tile => Object.assign({}, tile));
                if (state.tiles) state.tiles.markAll();
            }
            if (value) writeLevel(runtime, grid);
            return value;
        },
        paintCells (key, layer, cells, origin) {
            const grid = find(key);
            if (!grid) return [];
            const changed = [];
            const live = state.play && state.play.id === grid.id ? state.play : null;
            for (const cell of cells) {
                if (setCell(grid, layer, cell.col, cell.row, cell.value)) {
                    changed.push({col: cell.col, row: cell.row, value: cell.value});
                }
                if (live && setCell(live, layer, cell.col, cell.row, cell.value) && state.tiles) {
                    state.tiles.markCell(cell.col, cell.row, layer);
                }
            }
            if (changed.length) {
                writeLevel(runtime, grid);
                emitter.emit('cells', {level: grid.id, layer, cells: changed, origin: origin || 'local'});
            }
            return changed;
        },
        setTileAt (x, y, value, layer) {
            const grid = state.play;
            if (!grid) return false;
            const cell = cellAt(grid, x, y);
            const name = layer || 'main';
            if (!setCell(grid, name, cell.col, cell.row, value)) return false;
            if (state.tiles) state.tiles.markCell(cell.col, cell.row, name);
            return true;
        },
        addPlayTile (name) {
            const grid = state.play;
            if (!grid) return 0;
            const value = addTexture(grid, name, 0);
            if (value && state.tiles) state.tiles.markAll();
            return value;
        },
        solidAt (x, y) {
            const grid = state.play;
            if (!grid) return false;
            const cell = cellAt(grid, x, y);
            return (flagsAt(grid, cell.col, cell.row) & FLAGS.solid) !== 0;
        },
        flagsAt (x, y) {
            const grid = state.play;
            if (!grid) return 0;
            const cell = cellAt(grid, x, y);
            return flagsAt(grid, cell.col, cell.row);
        },
        setHitbox (target, w, h) {
            const width = Math.max(0, Number(w) || 0);
            const height = Math.max(0, Number(h) || 0);
            if (width && height) state.hitboxes.set(target, {w: width, h: height});
            else state.hitboxes.delete(target);
        },
        box (target) {
            const own = state.hitboxes.get(target) || (target.sprite && target.sprite.clones[0] &&
                state.hitboxes.get(target.sprite.clones[0])) || null;
            if (own) return {x: target.x, y: target.y, w: own.w, h: own.h};
            const renderer = runtime.renderer;
            let size = [0, 0];
            if (renderer && typeof target.drawableID === 'number') {
                size = renderer.getCurrentSkinSize(target.drawableID);
            }
            const scale = target.size / 100;
            return {x: target.x, y: target.y, w: Math.max(1, size[0] * scale), h: Math.max(1, size[1] * scale)};
        },
        move (target, axis, delta) {
            const grid = state.play;
            const hits = state.hits.get(target) || {left: false, right: false, top: false, bottom: false};
            if (axis === 'x') hits.left = hits.right = false;
            else hits.top = hits.bottom = false;
            state.hits.set(target, hits);
            if (!grid) {
                if (axis === 'x') target.setXY(target.x + delta, target.y);
                else target.setXY(target.x, target.y + delta);
                return null;
            }
            const result = moveBy(grid, world.box(target), axis, delta);
            if (result.hit) hits[result.hit] = true;
            target.setXY(result.x, result.y);
            return result.hit;
        },
        hit (target, side) {
            const hits = state.hits.get(target);
            if (!hits) return false;
            if (side === 'any') return hits.left || hits.right || hits.top || hits.bottom;
            return !!hits[side];
        },
        touching (target, flag) {
            return !!state.play && (overlapFlags(state.play, world.box(target)) & flag) !== 0;
        },
        onGround (target) {
            return !!state.play && onGround(state.play, world.box(target));
        },
        pin (target, on) {
            if (target.isStage) return;
            if (on) state.pinned.add(target);
            else state.pinned.delete(target);
            state.applied = null;
            const renderer = runtime.renderer;
            if (!on && renderer && typeof target.drawableID === 'number') {
                const rendered = renderedScale(target);
                renderer.updateDrawablePosition(target.drawableID, [target.x, target.y]);
                renderer.updateDrawableDirectionScale(target.drawableID, rendered.direction, rendered.scale);
            }
        },
        isPinned: target => state.pinned.has(target),
        setBackdrop (mode, speed) {
            const next = BACKDROP_MODES.indexOf(mode) === -1 ? 'scrolls' : mode;
            const was = state.backdrop.mode;
            state.backdrop = {mode: next, speed: Number.isFinite(Number(speed)) ? Number(speed) : 50};
            state.applied = null;
            const renderer = runtime.renderer;
            const stageId = stageDrawable();
            if (renderer && stageId !== null && next === 'scrolls' && was !== 'scrolls') {
                renderer.updateDrawablePosition(stageId, [0, 0]);
                renderer.updateDrawableDirectionScale(stageId, 90, [100, 100]);
            }
        },
        backdrop: () => Object.assign({}, state.backdrop),
        view: () => state.view,
        cameraInfo: () => camera.info(),
        keepCameraInside (on) {
            camera.setBounds(state.play ? levelRect(state.play) : null);
            camera.keepInside(on);
        },
        rulesLevels (withSolid) {
            return state.saved.map(grid => toRulesLevel(grid, withSolid));
        },
        scenes: () => readScenes(runtime).scenes.map(scene => scene.name),
        tiles: () => state.tiles,
        step: afterStep
    };

    preserveExtensionStorage(WORLD_KEY);
    preserveExtensionStorage(SCENES_KEY);
    runtime.on(PROJECT_LOADED, loadFromStorage);
    runtime.on(PROJECT_START, resetPlay);
    runtime.on(PROJECT_STOP_ALL, resetPlay);
    loadFromStorage();
    return world;
};

const getWorld = (runtime, options) => {
    if (!runtime) return null;
    if (!states.has(runtime)) states.set(runtime, createWorldState(runtime, options));
    return states.get(runtime);
};

const peekWorld = runtime => (runtime && states.get(runtime)) || null;

const seamFor = runtime => {
    if (typeof window === 'undefined') return null;
    const seam = window.SquiggleWorld;
    return seam && seam.runtime === runtime ? seam : null;
};

const attachWhenReady = world => {
    const seam = seamFor(world.runtime);
    if (seam) {
        world.attach(seam);
        return;
    }
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const onReady = () => {
        const ready = seamFor(world.runtime);
        if (!ready) return;
        window.removeEventListener('SquiggleWorldReady', onReady);
        world.attach(ready);
    };
    window.addEventListener('SquiggleWorldReady', onReady);
};

const extendSeam = seam => {
    if (!seam || seam.levels) return seam;
    const runtime = seam.runtime;
    const live = () => peekWorld(runtime);
    Object.assign(seam, {
        scale: () => seam.getView().zoom,
        camera: () => (live() ? live().cameraInfo() : null),
        levels: () => (live() ? live().levels() : readLevels(runtime)).map(grid => ({
            id: grid.id,
            name: grid.name,
            cols: grid.cols,
            rows: grid.rows,
            tileSize: grid.tileSize,
            origin: grid.origin.slice()
        })),
        currentLevel: () => (live() ? live().currentId() : ''),
        scenes: () => readScenes(runtime).scenes.map(scene => scene.name),
        solidAt: (x, y) => (live() ? live().solidAt(x, y) : false),
        rulesLevels: withSolid => (live() ? live().rulesLevels(withSolid) :
            readLevels(runtime).map(grid => toRulesLevel(grid, withSolid)))
    });
    return seam;
};

const installWorldApi = () => {
    if (typeof window === 'undefined') return;
    if (window.SquiggleWorld) extendSeam(window.SquiggleWorld);
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('SquiggleWorldReady', () => extendSeam(window.SquiggleWorld));
    }
};

export {
    IDENTITY_VIEW,
    BACKDROP_MODES,
    chainHook,
    getWorld,
    peekWorld,
    attachWhenReady,
    extendSeam,
    installWorldApi
};
