import {FLAGS, flagsAt} from './tilemap.js';
import {browserCanvas, browserImageLoader, costumeFor} from './textures.js';
import {DEFAULT_FOV, HEIGHT, WIDTH, clampFov, createFrame, distanceAhead, facingIndex, gridMap, moveAhead, parseColor,
    pixel, render, toCell, wrapDegrees} from './raycast.js';

const AFTER_EXECUTE = 'AFTER_EXECUTE';
const BEFORE_EXECUTE = 'BEFORE_EXECUTE';
const PROJECT_LOADED = 'PROJECT_LOADED';
const PROJECT_STOP_ALL = 'PROJECT_STOP_ALL';
const HUD_LAYER = 'sq-hud';
const RESOLUTION = 0.5;
const TEXTURE_SIZE = 64;
const SPRITE_MAX = 64;
const SAMPLES = 240;
const FACING_NAME = /^(.*)-([0-7])$/;
const DEFAULT_FLOOR = pixel(0x5b, 0x4b, 0x3d);
const DEFAULT_CEILING = pixel(0x8f, 0xb4, 0xd6);
const WALL_COLOR = pixel(0x9a, 0x9d, 0xa8);
const FREE_GRID = Object.freeze({origin: [0, 0], tileSize: 32});
const FREE_MAP = Object.freeze({solid: () => false, wallValue: () => 0});
const IDENTITY = Object.freeze({x: 0, y: 0, zoom: 1});

const states = new WeakMap();

const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const imageSize = (image, costume) => {
    const w = image.naturalWidth || image.width || (costume.size ? costume.size[0] : 0);
    const h = image.naturalHeight || image.height || (costume.size ? costume.size[1] : 0);
    return [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
};

const createPixelCache = ({loadImage, createCanvas, onLoad}) => {
    const entries = new Map();

    const decode = (image, costume, kind) => {
        const [w, h] = imageSize(image, costume);
        let width = TEXTURE_SIZE;
        let height = TEXTURE_SIZE;
        if (kind === 'sprite') {
            const k = Math.min(1, SPRITE_MAX / Math.max(w, h));
            width = Math.max(1, Math.round(w * k));
            height = Math.max(1, Math.round(h * k));
        }
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height).data;
        return {width, height, data: new Uint32Array(data.buffer, data.byteOffset, width * height)};
    };

    const get = (costume, kind) => {
        if (!costume || !costume.asset) return null;
        const key = `${kind}:${costume.assetId}:${costume.dataFormat}`;
        const entry = entries.get(key);
        if (entry) return entry.texture;
        const pending = {texture: null};
        entries.set(key, pending);
        Promise.resolve(loadImage(costume))
            .then(image => {
                if (!image) return;
                pending.texture = decode(image, costume, kind);
                onLoad(key);
            })
            .catch(() => {
                entries.delete(key);
            });
        return null;
    };

    return {get, clear: () => entries.clear(), size: () => entries.size};
};

const facingCostume = (target, viewer) => {
    const costumes = target.getCostumes();
    const current = costumes[target.currentCostume];
    const match = current && FACING_NAME.exec(current.name);
    if (!match) return current || null;
    const index = facingIndex(target.direction, {x: viewer.x - target.x, y: viewer.y - target.y});
    const wanted = `${match[1]}-${index}`.toLowerCase();
    return costumes.find(costume => String(costume.name).toLowerCase() === wanted) || current;
};

const percentile = (sorted, p) => (
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
);

const createView3d = (runtime, world, options) => {
    const opts = options || {};
    const now = opts.now || (() => (typeof performance === 'undefined' ? Date.now() : performance.now()));
    const toBitmap = opts.toBitmap ||
        ((pixels, width, height) => new ImageData(new Uint8ClampedArray(pixels.buffer), width, height));
    const frame = createFrame();
    const state = {
        on: false,
        player: {x: 0, y: 0, direction: 90},
        fov: DEFAULT_FOV,
        floor: DEFAULT_FLOOR,
        ceiling: DEFAULT_CEILING,
        billboards: new Set(),
        drawable: null,
        skin: null,
        image: null,
        step: 0,
        cacheKey: '',
        crosshair: '',
        samples: []
    };

    const pixels = createPixelCache({
        loadImage: opts.loadImage || browserImageLoader,
        createCanvas: opts.createCanvas || browserCanvas,
        onLoad: () => {
            state.cacheKey = '';
        }
    });

    const grid = () => (world && world.current() ? world.current() : null);

    const isBillboard = target => state.billboards.has(target) ||
        (!target.isOriginal && !!target.sprite && state.billboards.has(target.sprite.clones[0]));

    const billboards = level => {
        const out = [];
        const viewer = state.player;
        for (const target of runtime.targets) {
            if (target.isStage || target.visible === false || !isBillboard(target)) continue;
            const costume = facingCostume(target, viewer);
            const image = pixels.get(costume, 'sprite');
            if (!image) continue;
            const cell = toCell(level, target.x, target.y);
            const tall = costume.size ? costume.size[1] : image.height;
            const height = Math.max(0.05, Math.min(8, (tall * (num(target.size, 100) / 100)) / level.tileSize));
            out.push({name: target.getName(), u: cell.u, v: cell.v, image, height});
        }
        return out;
    };

    const scene = () => {
        const level = grid();
        const space = level || FREE_GRID;
        const cell = toCell(space, state.player.x, state.player.y);
        const textures = new Map();
        return {
            map: level ? gridMap(level, flagsAt, FLAGS.solid) : FREE_MAP,
            player: {u: cell.u, v: cell.v, direction: state.player.direction},
            fov: state.fov,
            floor: state.floor,
            ceiling: state.ceiling,
            wallColor: () => WALL_COLOR,
            texture: value => {
                if (!level || !value) return null;
                if (!textures.has(value)) textures.set(value, pixels.get(costumeFor(runtime, level, value), 'wall'));
                return textures.get(value);
            },
            sprites: billboards(space)
        };
    };

    const draw = () => {
        const started = now();
        const result = render(frame, scene());
        state.samples.push(now() - started);
        if (state.samples.length > SAMPLES) state.samples.shift();
        state.crosshair = result.crosshair;
        state.cacheKey = `${state.step}:${state.player.x}:${state.player.y}:${state.player.direction}:${state.fov}`;
        return result;
    };

    const hide = () => {
        const renderer = runtime.renderer;
        if (renderer && state.drawable !== null) renderer.updateDrawableVisible(state.drawable, false);
    };

    const present = () => {
        const renderer = runtime.renderer;
        if (!renderer) return;
        if (!state.image) state.image = toBitmap(frame.pixels, WIDTH, HEIGHT);
        if (state.skin === null) {
            state.skin = renderer.createBitmapSkin(state.image, RESOLUTION);
            state.drawable = renderer.createDrawable(HUD_LAYER);
            renderer.updateDrawableSkinId(state.drawable, state.skin);
        } else {
            renderer.updateBitmapSkin(state.skin, state.image, RESOLUTION);
        }
        const camera = world && world.camera;
        const view = camera && camera.isActive() ? camera.view(1) : IDENTITY;
        renderer.updateDrawablePosition(state.drawable, [view.x, view.y]);
        renderer.updateDrawableDirectionScale(state.drawable, 90, [100 / view.zoom, 100 / view.zoom]);
        renderer.updateDrawableVisible(state.drawable, true);
    };

    const destroy = () => {
        const renderer = runtime.renderer;
        if (renderer && state.drawable !== null) renderer.destroyDrawable(state.drawable, HUD_LAYER);
        if (renderer && state.skin !== null) renderer.destroySkin(state.skin);
        state.drawable = null;
        state.skin = null;
    };

    const onBefore = () => {
        state.step++;
    };

    const onAfter = () => {
        if (!state.on) return;
        draw();
        present();
    };

    const stop = () => {
        state.on = false;
        hide();
    };

    const reset = () => {
        stop();
        destroy();
        state.billboards.clear();
        state.player = {x: 0, y: 0, direction: 90};
        state.fov = DEFAULT_FOV;
        state.floor = DEFAULT_FLOOR;
        state.ceiling = DEFAULT_CEILING;
        state.samples = [];
        state.cacheKey = '';
        pixels.clear();
    };

    const cells = steps => num(steps, 0) / (grid() || FREE_GRID).tileSize;

    runtime.on(BEFORE_EXECUTE, onBefore);
    runtime.on(AFTER_EXECUTE, onAfter);
    runtime.on(PROJECT_STOP_ALL, stop);
    runtime.on(PROJECT_LOADED, reset);

    return {
        frame,
        isOn: () => state.on,
        setOn (on) {
            state.on = !!on;
            if (state.on) {
                draw();
                present();
            } else {
                hide();
            }
        },
        player: () => Object.assign({}, state.player),
        setPlayer (x, y, direction) {
            state.player = {
                x: num(x, state.player.x),
                y: num(y, state.player.y),
                direction: wrapDegrees(num(direction, state.player.direction))
            };
        },
        move (steps) {
            const space = grid() || FREE_GRID;
            const map = grid() ? gridMap(space, flagsAt, FLAGS.solid) : FREE_MAP;
            const cell = toCell(space, state.player.x, state.player.y);
            const moved = moveAhead(map, {u: cell.u, v: cell.v, direction: state.player.direction}, cells(steps));
            state.player = {
                x: space.origin[0] + (moved.u * space.tileSize),
                y: space.origin[1] - (moved.v * space.tileSize),
                direction: state.player.direction
            };
            return moved.hit;
        },
        turn (degrees) {
            state.player.direction = wrapDegrees(state.player.direction + num(degrees, 0));
        },
        fov: () => state.fov,
        setFov (fov) {
            state.fov = clampFov(fov);
        },
        setColors (floor, ceiling) {
            state.floor = parseColor(floor, state.floor);
            state.ceiling = parseColor(ceiling, state.ceiling);
        },
        setBillboard (target, on) {
            if (!target || target.isStage) return;
            if (on) state.billboards.add(target);
            else state.billboards.delete(target);
        },
        isBillboard,
        distanceAhead () {
            const level = grid();
            if (!level) return Infinity;
            const cell = toCell(level, state.player.x, state.player.y);
            const map = gridMap(level, flagsAt, FLAGS.solid);
            return distanceAhead(map, {u: cell.u, v: cell.v, direction: state.player.direction}) * level.tileSize;
        },
        crosshair () {
            const key = `${state.step}:${state.player.x}:${state.player.y}:${state.player.direction}:${state.fov}`;
            if (key !== state.cacheKey) draw();
            return state.crosshair;
        },
        draw,
        stats () {
            const sorted = state.samples.slice().sort((a, b) => a - b);
            return {
                frames: sorted.length,
                medianMs: percentile(sorted, 0.5),
                p95Ms: percentile(sorted, 0.95),
                maxMs: sorted.length ? sorted[sorted.length - 1] : 0
            };
        },
        reset,
        dispose () {
            reset();
            runtime.removeListener(BEFORE_EXECUTE, onBefore);
            runtime.removeListener(AFTER_EXECUTE, onAfter);
            runtime.removeListener(PROJECT_STOP_ALL, stop);
            runtime.removeListener(PROJECT_LOADED, reset);
            states.delete(runtime);
        }
    };
};

const getView3d = (runtime, world, options) => {
    if (!runtime) return null;
    if (!states.has(runtime)) states.set(runtime, createView3d(runtime, world, options));
    return states.get(runtime);
};

export {
    HUD_LAYER,
    RESOLUTION,
    TEXTURE_SIZE,
    facingCostume,
    createPixelCache,
    createView3d,
    getView3d
};
