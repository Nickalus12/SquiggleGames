import {FLAGS, flagsAt} from './tilemap.js';
import {browserCanvas, browserImageLoader, costumeFor} from './textures.js';
import {chainHook} from './world.js';
import {DEFAULT_EYE, DEFAULT_FOV, HEIGHT, WIDTH, clampEye, clampFog, clampFov, createFrame, facingIndex, gridMap,
    parseColor, pixel, render} from './raycast.js';

const PROJECT_LOADED = 'PROJECT_LOADED';
const PROJECT_STOP_ALL = 'PROJECT_STOP_ALL';
const LAYER = 'sq-tiles-back';
const RESOLUTION = 0.5;
const TEXTURE_SIZE = 64;
const SPRITE_MAX = 64;
const SAMPLES = 240;
const VIEW_NAME = /^(.*)-([1-8])$/;
const LOOKS = Object.freeze({picture: 1, views: 2, nothing: 0});
const TURN_PER_PIXEL = 0.25;
const MIN_ELEVATION = -100;
const MAX_ELEVATION = 1000;
const DEFAULT_FLOOR = pixel(0x5b, 0x4b, 0x3d);
const DEFAULT_CEILING = pixel(0x8f, 0xb4, 0xd6);
const WALL_COLOR = pixel(0x9a, 0x9d, 0xa8);
const FREE_GRID = Object.freeze({origin: [0, 0], tileSize: 32});
const FREE_MAP = Object.freeze({solid: () => false, wallValue: () => 0});

const states = new WeakMap();

const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const mix = (h, value) => Math.imul(h ^ (Math.round(value * 1024) | 0), 16777619) >>> 0;

const imageSize = (image, costume) => {
    const w = image.naturalWidth || image.width || (costume.size ? costume.size[0] : 0);
    const h = image.naturalHeight || image.height || (costume.size ? costume.size[1] : 0);
    return [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
};

const createPixelCache = ({loadImage, createCanvas, onLoad}) => {
    let kinds = {wall: new WeakMap(), sprite: new WeakMap()};
    let loaded = 0;

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
        const entries = kinds[kind];
        const entry = entries.get(costume);
        if (entry && entry.assetId === costume.assetId) return entry.texture;
        const pending = {assetId: costume.assetId, texture: null};
        entries.set(costume, pending);
        Promise.resolve(loadImage(costume))
            .then(image => {
                if (!image || entries.get(costume) !== pending) return;
                pending.texture = decode(image, costume, kind);
                loaded++;
                onLoad();
            })
            .catch(() => null);
        return null;
    };

    return {
        get,
        clear () {
            kinds = {wall: new WeakMap(), sprite: new WeakMap()};
            loaded = 0;
        },
        loaded: () => loaded
    };
};

const viewSet = (target, current, match) => {
    const costumes = target.getCostumes();
    const base = match[1].toLowerCase();
    const views = [];
    for (let i = 1; i <= 8; i++) {
        const wanted = `${base}-${i}`;
        views.push(costumes.find(costume => String(costume.name).toLowerCase() === wanted) || current);
    }
    return {count: costumes.length, views};
};

const facingCostume = (target, viewer, cache) => {
    const costumes = target.getCostumes();
    const current = costumes[target.currentCostume];
    if (!current) return null;
    let set = cache ? cache.get(current) : null;
    if (!set || set.count !== costumes.length) {
        const match = VIEW_NAME.exec(current.name);
        set = match ? viewSet(target, current, match) : {count: costumes.length, views: null};
        if (cache) cache.set(current, set);
    }
    if (!set.views) return current;
    return set.views[facingIndex(target.direction, {x: viewer.x - target.x, y: viewer.y - target.y})];
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
    const cameraOwner = {kit: 'squiggle3d'};
    const serials = new WeakMap();
    const fresh = () => ({
        on: false,
        viewer: null,
        fov: DEFAULT_FOV,
        fog: 0,
        eye: DEFAULT_EYE,
        floor: DEFAULT_FLOOR,
        ceiling: DEFAULT_CEILING,
        looks: new WeakMap(),
        elevations: new WeakMap(),
        ghosted: new WeakSet(),
        views: new WeakMap(),
        mouseTurn: false,
        turn: 0,
        rendered: -1,
        uploaded: -1,
        uploads: 0,
        release: null,
        crosshair: '',
        target: null,
        samples: []
    });
    let state = fresh();
    const gpu = {drawable: null, skin: null, image: null};
    const link = {seam: null, disposers: [], effect: null, input: null};
    const cache = {grid: false, revision: -1, loads: -1, tileset: '', count: -1, textures: [], serial: 0};

    const pixels = createPixelCache({
        loadImage: opts.loadImage || browserImageLoader,
        createCanvas: opts.createCanvas || browserCanvas,
        onLoad: () => {
            state.rendered = -1;
        }
    });

    const scene = {
        map: FREE_MAP,
        player: {u: 0, v: 0, direction: 90},
        fov: DEFAULT_FOV,
        fog: 0,
        eye: DEFAULT_EYE,
        floor: DEFAULT_FLOOR,
        ceiling: DEFAULT_CEILING,
        wallColor: () => WALL_COLOR,
        texture: value => cache.textures[value] || null,
        sprites: [],
        spriteCount: 0
    };

    const grid = () => (world && world.current() ? world.current() : null);

    const revision = () => (world && typeof world.revision === 'function' ? world.revision() : 0);

    const serialOf = level => {
        if (!level) return 0;
        if (!serials.has(level)) serials.set(level, ++cache.serial);
        return serials.get(level);
    };

    const tilesetCount = level => {
        const owner = level && level.tileset ? runtime.getSpriteTargetByName(level.tileset) : null;
        const holder = owner || runtime.getTargetForStage();
        return holder ? holder.getCostumes().length : 0;
    };

    const prepareLevel = level => {
        const tileset = level ? level.tileset : '';
        const count = tilesetCount(level);
        if (level === cache.grid && revision() === cache.revision && pixels.loaded() === cache.loads &&
            tileset === cache.tileset && count === cache.count) return;
        if (level !== cache.grid) scene.map = level ? gridMap(level, flagsAt, FLAGS.solid) : FREE_MAP;
        cache.grid = level;
        cache.revision = revision();
        cache.loads = pixels.loaded();
        cache.tileset = tileset;
        cache.count = count;
        cache.textures.length = 0;
        if (!level) return;
        for (let value = 1; value <= level.tiles.length; value++) {
            cache.textures[value] = pixels.get(costumeFor(runtime, level, value), 'wall');
        }
    };

    const ownerOf = target => (!target.isOriginal && target.sprite ? target.sprite.clones[0] : null);

    const lookOf = target => {
        if (state.looks.has(target)) return state.looks.get(target);
        const owner = ownerOf(target);
        return owner && state.looks.has(owner) ? state.looks.get(owner) : LOOKS.nothing;
    };

    const elevationOf = target => {
        if (state.elevations.has(target)) return state.elevations.get(target);
        const owner = ownerOf(target);
        return owner && state.elevations.has(owner) ? state.elevations.get(owner) : 0;
    };

    const shows = target => !target.isStage && target !== state.viewer && target.visible !== false &&
        lookOf(target) !== LOOKS.nothing;

    const viewerAlive = () => !!state.viewer && runtime.targets.indexOf(state.viewer) !== -1;

    const frameHash = () => {
        const viewer = state.viewer;
        let h = 2166136261;
        h = mix(h, viewer.x);
        h = mix(h, viewer.y);
        h = mix(h, viewer.direction);
        h = mix(h, state.fov);
        h = mix(h, state.fog);
        h = mix(h, state.eye);
        h = mix(h, state.floor);
        h = mix(h, state.ceiling);
        h = mix(h, serialOf(grid()));
        h = mix(h, revision());
        h = mix(h, pixels.loaded());
        for (const target of runtime.targets) {
            if (!shows(target)) continue;
            h = mix(h, target.x);
            h = mix(h, target.y);
            h = mix(h, target.direction);
            h = mix(h, target.currentCostume);
            h = mix(h, target.size);
            h = mix(h, lookOf(target));
            h = mix(h, elevationOf(target));
        }
        return h;
    };

    const collect = space => {
        const viewer = state.viewer;
        const pool = scene.sprites;
        let n = 0;
        for (const target of runtime.targets) {
            if (!shows(target)) continue;
            const costumes = target.getCostumes();
            const costume = lookOf(target) === LOOKS.views ? facingCostume(target, viewer, state.views) :
                costumes[target.currentCostume];
            const image = pixels.get(costume, 'sprite');
            if (!image) continue;
            let entry = pool[n];
            if (!entry) {
                entry = {name: '', target: null, u: 0, v: 0, image: null, height: 1, elevation: 0};
                pool[n] = entry;
            }
            const tall = costume.size ? costume.size[1] : image.height;
            entry.name = target.getName();
            entry.target = target;
            entry.u = (target.x - space.origin[0]) / space.tileSize;
            entry.v = (space.origin[1] - target.y) / space.tileSize;
            entry.image = image;
            entry.height = Math.max(0.05, Math.min(8, (tall * (num(target.size, 100) / 100)) / space.tileSize));
            entry.elevation = elevationOf(target) / 100;
            n++;
        }
        for (let i = n; i < scene.spriteCount; i++) {
            pool[i].image = null;
            pool[i].target = null;
        }
        scene.spriteCount = n;
    };

    const draw = hash => {
        const started = now();
        const level = grid();
        const space = level || FREE_GRID;
        const viewer = state.viewer;
        prepareLevel(level);
        scene.player.u = (viewer.x - space.origin[0]) / space.tileSize;
        scene.player.v = (space.origin[1] - viewer.y) / space.tileSize;
        scene.player.direction = viewer.direction;
        scene.fov = state.fov;
        scene.fog = state.fog;
        scene.eye = state.eye;
        scene.floor = state.floor;
        scene.ceiling = state.ceiling;
        collect(space);
        const result = render(frame, scene);
        state.crosshair = result.crosshair;
        state.target = result.target;
        state.rendered = hash;
        state.samples.push(now() - started);
        if (state.samples.length > SAMPLES) state.samples.shift();
    };

    const present = () => {
        const renderer = runtime.renderer;
        if (!renderer) return;
        if (!gpu.image) gpu.image = toBitmap(frame.pixels, WIDTH, HEIGHT);
        if (gpu.skin === null) {
            gpu.skin = renderer.createBitmapSkin(gpu.image, RESOLUTION);
            gpu.drawable = renderer.createDrawable(LAYER);
            renderer.updateDrawableSkinId(gpu.drawable, gpu.skin);
            renderer.updateDrawablePosition(gpu.drawable, [0, 0]);
            renderer.updateDrawableDirectionScale(gpu.drawable, 90, [100, 100]);
        } else {
            renderer.updateBitmapSkin(gpu.skin, gpu.image, RESOLUTION);
        }
        renderer.updateDrawableVisible(gpu.drawable, true);
        state.uploaded = state.rendered;
        state.uploads++;
    };

    const refresh = () => {
        const hash = frameHash();
        if (hash !== state.rendered) draw(hash);
        if (state.uploaded !== state.rendered) present();
    };

    const shouldGhost = target => !target.isStage && !(world && world.isPinned(target));

    const pushGhost = (target, value) => {
        const renderer = runtime.renderer;
        if (renderer && typeof target.drawableID === 'number') {
            renderer.updateDrawableEffect(target.drawableID, 'ghost', value);
        }
    };

    const syncGhosts = () => {
        for (const target of runtime.targets) {
            const want = shouldGhost(target);
            const has = state.ghosted.has(target);
            if (want && !has) {
                state.ghosted.add(target);
                pushGhost(target, 100);
            } else if (!want && has) {
                state.ghosted.delete(target);
                pushGhost(target, target.effects ? target.effects.ghost || 0 : 0);
            }
        }
    };

    const unghostAll = () => {
        for (const target of runtime.targets) {
            if (state.ghosted.has(target)) pushGhost(target, target.effects ? target.effects.ghost || 0 : 0);
        }
        state.ghosted = new WeakSet();
    };

    const ghosting = drawableID => {
        if (!state.on) return false;
        const target = runtime.getTargetByDrawableId(drawableID);
        return !!target && shouldGhost(target);
    };

    const hookProperties = (forward, drawableID, properties) => {
        if (properties && 'ghost' in properties && ghosting(drawableID)) {
            return forward(drawableID, Object.assign({}, properties, {ghost: 100}));
        }
        return forward(drawableID, properties);
    };

    const wrapEffect = renderer => {
        const original = renderer.updateDrawableEffect;
        const wrapped = (drawableID, effect, value) => {
            const forced = effect === 'ghost' && ghosting(drawableID) ? 100 : value;
            return original.call(renderer, drawableID, effect, forced);
        };
        renderer.updateDrawableEffect = wrapped;
        return () => {
            if (renderer.updateDrawableEffect === wrapped) renderer.updateDrawableEffect = original;
        };
    };

    const pointerDocument = canvas => opts.document || canvas.ownerDocument ||
        (typeof document === 'undefined' ? null : document);

    const locked = input => input.doc && input.doc.pointerLockElement === input.canvas;

    const attachInput = () => {
        if (link.input) return;
        const renderer = runtime.renderer;
        const canvas = opts.canvas || (renderer ? renderer.canvas : null);
        if (!canvas || typeof canvas.addEventListener !== 'function') return;
        const doc = pointerDocument(canvas);
        if (!doc || typeof doc.addEventListener !== 'function') return;
        const input = {canvas, doc};
        input.onClick = () => {
            if (state.on && state.mouseTurn && !locked(input) && typeof canvas.requestPointerLock === 'function') {
                canvas.requestPointerLock();
            }
        };
        input.onMove = event => {
            if (locked(input)) state.turn += num(event.movementX, 0);
        };
        canvas.addEventListener('click', input.onClick);
        doc.addEventListener('mousemove', input.onMove);
        link.input = input;
    };

    const detachInput = () => {
        const input = link.input;
        if (!input) return;
        input.canvas.removeEventListener('click', input.onClick);
        input.doc.removeEventListener('mousemove', input.onMove);
        if (locked(input) && typeof input.doc.exitPointerLock === 'function') input.doc.exitPointerLock();
        link.input = null;
        state.turn = 0;
    };

    const hideDrawable = () => {
        const renderer = runtime.renderer;
        if (renderer && gpu.drawable !== null) renderer.updateDrawableVisible(gpu.drawable, false);
    };

    const hideView = () => {
        detachInput();
        if (!state.on) return;
        state.on = false;
        if (state.release) state.release();
        state.release = null;
        if (world) world.setTilesHidden(false);
        unghostAll();
        hideDrawable();
    };

    const showView = viewer => {
        if (!viewer || viewer.isStage) return;
        state.viewer = viewer;
        if (!state.on) {
            state.on = true;
            state.release = world ? world.holdCamera(cameraOwner) : null;
            if (world) world.setTilesHidden(true);
            state.rendered = -1;
            state.uploaded = -1;
        }
        if (state.mouseTurn) attachInput();
        syncGhosts();
        refresh();
    };

    const onBefore = () => {
        if (!state.on || !state.turn) return;
        const turn = state.turn;
        state.turn = 0;
        if (viewerAlive()) state.viewer.setDirection(state.viewer.direction + (turn * TURN_PER_PIXEL));
    };

    const onAfter = () => {
        if (!state.on) return;
        if (!viewerAlive()) {
            hideView();
            return;
        }
        syncGhosts();
        refresh();
    };

    const destroy = () => {
        const renderer = runtime.renderer;
        if (renderer && gpu.drawable !== null) renderer.destroyDrawable(gpu.drawable, LAYER);
        if (renderer && gpu.skin !== null) renderer.destroySkin(gpu.skin);
        gpu.drawable = null;
        gpu.skin = null;
    };

    const reset = () => {
        hideView();
        destroy();
        state = fresh();
        scene.spriteCount = 0;
        cache.grid = false;
        pixels.clear();
    };

    const detach = () => {
        link.disposers.splice(0).reverse()
            .forEach(dispose => dispose());
        link.seam = null;
    };

    runtime.on(PROJECT_STOP_ALL, hideView);
    runtime.on(PROJECT_LOADED, reset);

    const view = {
        runtime,
        frame,
        attach (seam) {
            if (!seam || link.seam === seam) return view;
            detach();
            link.seam = seam;
            link.disposers.push(
                seam.onBeforeExecute(onBefore),
                seam.onAfterExecute(onAfter),
                chainHook(seam, 'drawableProperties', hookProperties),
                world.addDrawables(() => gpu.drawable)
            );
            if (runtime.renderer) link.disposers.push(wrapEffect(runtime.renderer));
            return view;
        },
        detach,
        isAttached: () => !!link.seam,
        isOn: () => state.on,
        viewer: () => state.viewer,
        show: showView,
        hide: hideView,
        settings: () => ({fov: state.fov, fog: state.fog, eye: state.eye}),
        setSetting (name, value) {
            if (name === 'fov') state.fov = clampFov(value);
            else if (name === 'fog') state.fog = clampFog(value);
            else if (name === 'eye') state.eye = clampEye(value);
        },
        colors: () => ({floor: state.floor, ceiling: state.ceiling}),
        setSurfaceColor (surface, color) {
            if (surface === 'floor') state.floor = parseColor(color, state.floor);
            else if (surface === 'ceiling') state.ceiling = parseColor(color, state.ceiling);
        },
        setLook (target, look) {
            if (!target || target.isStage || !(look in LOOKS)) return;
            state.looks.set(target, LOOKS[look]);
        },
        lookOf,
        setElevation (target, percent) {
            if (!target || target.isStage) return;
            state.elevations.set(target, Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, num(percent, 0))));
        },
        elevationOf,
        mouseTurn: () => state.mouseTurn,
        setMouseTurn (on) {
            state.mouseTurn = !!on;
            if (state.mouseTurn && state.on) attachInput();
            if (!state.mouseTurn) detachInput();
        },
        crosshair () {
            if (!state.on || !viewerAlive()) return '';
            const hash = frameHash();
            if (hash !== state.rendered) draw(hash);
            return state.crosshair;
        },
        step: onAfter,
        stats () {
            const sorted = state.samples.slice().sort((a, b) => a - b);
            return {
                frames: sorted.length,
                uploads: state.uploads,
                medianMs: percentile(sorted, 0.5),
                p95Ms: percentile(sorted, 0.95),
                maxMs: sorted.length ? sorted[sorted.length - 1] : 0
            };
        },
        reset,
        dispose () {
            reset();
            detach();
            runtime.removeListener(PROJECT_STOP_ALL, hideView);
            runtime.removeListener(PROJECT_LOADED, reset);
            states.delete(runtime);
        }
    };
    return view;
};

const getView3d = (runtime, world, options) => {
    if (!runtime) return null;
    if (!states.has(runtime)) states.set(runtime, createView3d(runtime, world, options));
    return states.get(runtime);
};

export {
    LAYER,
    LOOKS,
    RESOLUTION,
    TEXTURE_SIZE,
    TURN_PER_PIXEL,
    facingCostume,
    createPixelCache,
    createView3d,
    getView3d
};
