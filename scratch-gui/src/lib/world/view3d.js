import log from '../log.js';
import {FLAGS, flagsAt} from './tilemap.js';
import {browserCanvas, browserImageLoader, costumeByName, costumeFor, defaultSkyTexture} from './textures.js';
import {chainHook} from './world.js';
import {createScalePolicy} from './render-scale.js';
import {
    PLAYER_SETTINGS_CHANGED,
    fogForDrawDistance,
    hasStoredPlayerSettings,
    normalizePlayerSettings,
    readPlayerSettings
} from './player-settings.js';
import {readGameSettings} from '../game-settings.js';
import {DEFAULT_EYE, DEFAULT_FOV, HEIGHT, MAX_LIGHTS, WIDTH, clampEye, clampFalloff, clampFog, clampFov,
    createFrame, facingIndex, gridMap, parseColor, pickCrosshair, pixel, render} from './raycast.js';

const PROJECT_LOADED = 'PROJECT_LOADED';
const PROJECT_STOP_ALL = 'PROJECT_STOP_ALL';
const SETTINGS_CHANGED = 'SQUIGGLE_SETTINGS_CHANGED';
const LAYER = 'sq-tiles-back';
const RESOLUTION = 0.5;
const TEXTURE_SIZE = 64;
const SPRITE_MAX = 64;
const SAMPLES = 240;
const MIN_REFRESH_MS = 6.9;
const LATE_FRAME_MS = 25;
const VIEW_NAME = /^(.*)-([1-8])$/;
const LOOKS = Object.freeze({picture: 1, views: 2, nothing: 0});
const TURN_PER_PIXEL = 0.25;
const MAX_STEP_DISTANCE = 64;
const MAX_TURN_SNAP = 45;
const POSE_EPSILON = 1e-3;
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

const clamp01 = value => Math.min(1, Math.max(0, num(value, 1)));

const mix = (h, value) => Math.imul(h ^ (Math.round(value * 1024) | 0), 16777619) >>> 0;

const mixStr = (h, text) => {
    const s = String(text || '');
    let out = mix(h, s.length);
    for (let i = 0; i < s.length; i++) out = mix(out, s.charCodeAt(i));
    return out;
};

const wrapAngle = angle => {
    let a = ((((angle + 180) % 360) + 360) % 360) - 180;
    if (a === -180) a = 180;
    return a;
};

const angleDelta = (from, to) => wrapAngle(to - from);

const stepPose = (fromPose, toPose, progress, turn = 0) => {
    const yaw = num(turn, 0) * TURN_PER_PIXEL;
    const tx = num(toPose && toPose.x, 0);
    const ty = num(toPose && toPose.y, 0);
    const td = wrapAngle(num(toPose && toPose.direction, 90) + yaw);
    if (!fromPose) {
        return {x: tx, y: ty, direction: td};
    }
    const t = clamp01(progress);
    const fx = num(fromPose.x, tx);
    const fy = num(fromPose.y, ty);
    const fd = wrapAngle(num(fromPose.direction, td) + yaw);
    const dx = tx - fx;
    const dy = ty - fy;
    const dist = Math.hypot(dx, dy);
    const x = dist > POSE_EPSILON && dist <= MAX_STEP_DISTANCE ? fx + (dx * t) : tx;
    const y = dist > POSE_EPSILON && dist <= MAX_STEP_DISTANCE ? fy + (dy * t) : ty;
    const dd = angleDelta(fd, td);
    const direction = Math.abs(dd) > POSE_EPSILON && Math.abs(dd) <= MAX_TURN_SNAP ?
        wrapAngle(fd + (dd * t)) :
        td;
    return {x, y, direction};
};

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
            .catch(error => log.warn('squiggle3d texture did not load', error));
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
    return set.views[facingIndex(target.direction, viewer.x - target.x, viewer.y - target.y)];
};

const percentile = (sorted, p) => (
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
);

const createView3d = (runtime, world, options) => {
    const opts = options || {};
    const now = opts.now || (() => (typeof performance === 'undefined' ? Date.now() : performance.now()));
    const toBitmap = opts.toBitmap ||
        ((pixels, width, height) => new ImageData(new Uint8ClampedArray(pixels.buffer), width, height));
    const fixedScale = Number.isFinite(Number(opts.resolution)) ?
        Math.max(0.25, Math.min(2, Number(opts.resolution))) :
        null;
    const stageW = () => Math.max(120, Number(runtime && runtime.stageWidth) || (WIDTH / RESOLUTION));
    const stageH = () => Math.max(90, Number(runtime && runtime.stageHeight) || (HEIGHT / RESOLUTION));
    const pixelRatio = () => {
        if (Number.isFinite(Number(opts.devicePixelRatio))) return Number(opts.devicePixelRatio);
        const ratio = typeof window === 'undefined' ? 0 : Number(window.devicePixelRatio);
        return ratio > 0 ? ratio : 1;
    };
    const frameMs = () => {
        const loop = runtime && runtime.frameLoop;
        if (!loop) return 1000 / 30;
        const fps = Number(loop.framerate);
        return fps > 0 ? 1000 / fps : 1000 / 60;
    };
    const quality = () => {
        try {
            return readGameSettings(runtime).render3d;
        } catch (e) {
            return 'auto';
        }
    };
    const playerStore = opts.storage || null;
    const initialPlayer = readPlayerSettings(playerStore);
    const policy = createScalePolicy();
    const configure = mode => policy.configure({mode, dpr: pixelRatio(), width: stageW(), height: stageH()});
    const firstScale = () => (fixedScale === null ?
        configure((initialPlayer && initialPlayer.quality) || quality()) :
        fixedScale);
    const defaultScale = firstScale();
    let frame = createFrame(Math.round(stageW() * defaultScale), Math.round(stageH() * defaultScale));
    const cameraOwner = {kit: 'squiggle3d'};
    const serials = new WeakMap();
    const fresh = () => ({
        on: false,
        viewer: null,
        fov: DEFAULT_FOV,
        fog: 0,
        eye: DEFAULT_EYE,
        lightFalloff: 0,
        floor: DEFAULT_FLOOR,
        ceiling: DEFAULT_CEILING,
        floorTexture: 'color',
        ceilingTexture: 'color',
        floorTextures: null,
        looks: new WeakMap(),
        elevations: new WeakMap(),
        glows: new WeakMap(),
        ghosted: new WeakSet(),
        views: new WeakMap(),
        mouseTurn: false,
        turn: 0,
        fromPose: null,
        toPose: null,
        pose: null,
        stepAt: 0,
        rendered: -1,
        sightsHash: -1,
        uploaded: -1,
        uploads: 0,
        release: null,
        crosshair: '',
        target: null,
        samples: [],
        tickStart: 0,
        drawMs: 0,
        drew: false,
        pendingWork: -1,
        pendingDraw: 0,
        manual: fixedScale !== null,
        scale: defaultScale,
        usePlayerSettings: true,
        playerSettings: readPlayerSettings(playerStore),
        hasPlayerOverride: hasStoredPlayerSettings(playerStore)
    });
    let state = fresh();
    const effectiveFov = () => (
        state.usePlayerSettings && state.playerSettings && state.playerSettings.fov !== null ?
            clampFov(state.playerSettings.fov) :
            state.fov
    );
    const effectiveFog = () => (
        state.usePlayerSettings && state.playerSettings && state.playerSettings.drawDistance !== 'normal' ?
            fogForDrawDistance(state.playerSettings.drawDistance, state.fog) :
            state.fog
    );
    const effectiveQuality = () => (
        state.usePlayerSettings && state.playerSettings && state.playerSettings.quality ?
            state.playerSettings.quality :
            quality()
    );
    const gpu = {drawable: null, skin: null, image: null, scale: defaultScale};
    const link = {seam: null, disposers: [], effect: null, input: null};
    const cache = {
        grid: false,
        revision: -1,
        loads: -1,
        tileset: '',
        count: -1,
        textures: [],
        named: Object.create(null),
        serial: 0,
        wallKey: 0,
        holder: null
    };

    const pixels = createPixelCache({
        loadImage: opts.loadImage || browserImageLoader,
        createCanvas: opts.createCanvas || browserCanvas,
        onLoad: () => {
            state.rendered = -1;
            state.sightsHash = -1;
        }
    });

    const scene = {
        map: FREE_MAP,
        player: {u: 0, v: 0, direction: 90},
        fov: DEFAULT_FOV,
        fog: 0,
        eye: DEFAULT_EYE,
        lightFalloff: 0,
        floor: DEFAULT_FLOOR,
        ceiling: DEFAULT_CEILING,
        floorMode: 'color',
        ceilingMode: 'color',
        floorTex: null,
        ceilingTex: null,
        skyTex: defaultSkyTexture(),
        floorTextures: true,
        wallColor: () => WALL_COLOR,
        texture: value => cache.textures[value] || null,
        wallKey: 0,
        sprites: [],
        spriteCount: 0,
        lights: []
    };

    const grid = () => (world && world.current() ? world.current() : null);

    const revision = () => (world && typeof world.revision === 'function' ? world.revision() : 0);

    const serialOf = level => {
        if (!level) return 0;
        if (!serials.has(level)) serials.set(level, ++cache.serial);
        return serials.get(level);
    };

    const tilesetCount = level => {
        const tileset = level ? level.tileset : '';
        if (level === cache.grid && tileset === cache.tileset && cache.holder) {
            return cache.holder.getCostumes().length;
        }
        const owner = tileset ? runtime.getSpriteTargetByName(tileset) : null;
        const holder = owner || runtime.getTargetForStage();
        cache.holder = holder || null;
        return holder ? holder.getCostumes().length : 0;
    };

    const prepareLevel = level => {
        const tileset = level ? level.tileset : '';
        const count = tilesetCount(level);
        if (level === cache.grid && revision() === cache.revision && pixels.loaded() === cache.loads &&
            tileset === cache.tileset && count === cache.count) return;
        if (level !== cache.grid || revision() !== cache.revision) {
            scene.map = level ? gridMap(level, flagsAt, FLAGS.solid) : FREE_MAP;
        }
        cache.grid = level;
        cache.revision = revision();
        cache.loads = pixels.loaded();
        cache.tileset = tileset;
        cache.count = count;
        cache.textures.length = 0;
        cache.named = Object.create(null);
        scene.wallKey = ++cache.wallKey;
        if (!level) return;
        for (let value = 1; value <= level.tiles.length; value++) {
            cache.textures[value] = pixels.get(costumeFor(runtime, level, value), 'wall');
        }
    };

    const textureByName = (level, name) => {
        if (!name || name === 'color' || name === 'sky') return null;
        const key = String(name);
        if (key in cache.named) return cache.named[key];
        const costume = costumeByName(runtime, level, key);
        const tex = costume ? pixels.get(costume, 'wall') : null;
        if (tex) cache.named[key] = tex;
        return tex;
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

    const glowOf = target => {
        if (!target) return null;
        if (state.glows.has(target)) return state.glows.get(target);
        const owner = ownerOf(target);
        return owner && state.glows.has(owner) ? state.glows.get(owner) : null;
    };

    const floorTexturesOn = () => (state.floorTextures === null ? policy.floorTextures : Boolean(state.floorTextures));

    const shows = target => !target.isStage && target !== state.viewer && target.visible !== false &&
        lookOf(target) !== LOOKS.nothing;

    const viewerAlive = () => !!state.viewer && runtime.targets.indexOf(state.viewer) !== -1;

    const requestFrame = opts.requestFrame ||
        (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
    const pacing = {running: false, last: 0, shortest: Infinity, framed: false};

    const interpolating = () => Boolean(
        runtime && (runtime.interpolationEnabled || (runtime.frameLoop && runtime.frameLoop._interpolationAnimation))
    );

    const stepMs = () => {
        const current = Number(runtime && runtime.currentStepTime);
        return current > 0 ? current : frameMs();
    };

    const poseSnapshot = target => ({
        x: num(target && target.x, 0),
        y: num(target && target.y, 0),
        direction: wrapAngle(num(target && target.direction, 90))
    });

    const poseOf = () => (state.pose && (pacing.last > 0 || interpolating()) ? state.pose : state.viewer);

    const poseMoving = () => {
        if (!viewerAlive() || !state.pose || !state.toPose) return false;
        const dx = state.toPose.x - state.pose.x;
        const dy = state.toPose.y - state.pose.y;
        const dd = angleDelta(state.pose.direction, state.toPose.direction);
        return Math.hypot(dx, dy) > POSE_EPSILON || Math.abs(dd) > POSE_EPSILON;
    };

    const progressNow = () => {
        if (state.stepAt <= 0) return 1;
        return clamp01((now() - state.stepAt) / stepMs());
    };

    const advancePose = progress => {
        if (!viewerAlive()) return;
        if (!state.toPose) {
            const snap = poseSnapshot(state.viewer);
            state.fromPose = snap;
            state.toPose = Object.assign({}, snap);
        }
        state.pose = stepPose(state.fromPose, state.toPose, progress, state.turn);
        runtime._squiggle3dPose = state.pose;
    };

    const applyTurn = () => {
        if (!state.turn) return false;
        const turn = state.turn;
        state.turn = 0;
        if (!viewerAlive()) return false;
        const delta = turn * TURN_PER_PIXEL;
        const redraw = runtime.redrawRequested;
        state.viewer.setDirection(state.viewer.direction + delta);
        runtime.redrawRequested = redraw;
        if (state.fromPose) state.fromPose.direction = wrapAngle(state.fromPose.direction + delta);
        if (state.toPose) state.toPose.direction = wrapAngle(state.toPose.direction + delta);
        return true;
    };

    const ensureFrame = () => {
        const wantW = Math.max(60, Math.round(stageW() * state.scale));
        const wantH = Math.max(45, Math.round(stageH() * state.scale));
        if (frame.width === wantW && frame.height === wantH) return false;
        frame = createFrame(wantW, wantH);
        gpu.image = null;
        state.rendered = -1;
        state.uploaded = -1;
        return true;
    };

    const applyScale = next => {
        if (next === state.scale) return;
        state.scale = next;
        ensureFrame();
    };

    const frameBudget = () => Math.min(frameMs(), 1000 / 60);

    const sampleTick = (tickMs, renderMs) => {
        const next = policy.sample(tickMs, renderMs, frameBudget());
        if (next !== null) applyScale(next);
    };

    const flushPending = () => {
        if (state.pendingWork < 0) return;
        const work = state.pendingWork;
        state.pendingWork = -1;
        sampleTick(work, state.pendingDraw);
    };

    const setQuality = mode => {
        state.manual = false;
        applyScale(configure(mode));
    };

    const frameHash = () => {
        ensureFrame();
        const viewer = poseOf();
        let h = 2166136261;
        h = mix(h, frame.width);
        h = mix(h, frame.height);
        h = mix(h, frame.horizon);
        h = mix(h, viewer.x);
        h = mix(h, viewer.y);
        h = mix(h, viewer.direction);
        h = mix(h, effectiveFov());
        h = mix(h, effectiveFog());
        h = mix(h, state.eye);
        h = mix(h, state.lightFalloff);
        h = mix(h, state.floor);
        h = mix(h, state.ceiling);
        h = mixStr(h, state.floorTexture);
        h = mixStr(h, state.ceilingTexture);
        h = mix(h, floorTexturesOn() ? 1 : 0);
        h = mix(h, serialOf(grid()));
        h = mix(h, revision());
        h = mix(h, pixels.loaded());
        for (const target of runtime.targets) {
            if (target.isStage || target.visible === false) continue;
            const glow = glowOf(target);
            if (glow && glow.radius > 0) {
                h = mix(h, target.x);
                h = mix(h, target.y);
                h = mix(h, glow.color);
                h = mix(h, glow.radius);
            }
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
        const viewer = poseOf();
        const pool = scene.sprites;
        const lights = scene.lights;
        let n = 0;
        let lightCount = 0;
        for (const target of runtime.targets) {
            if (target.isStage || target.visible === false) continue;
            const u = (target.x - space.origin[0]) / space.tileSize;
            const v = (space.origin[1] - target.y) / space.tileSize;
            const glow = glowOf(target);
            if (glow && glow.radius > 0 && lightCount < MAX_LIGHTS) {
                const rawR = glow.radius;
                const tileR = Math.min(16, Math.max(0.5, rawR > 16 ? rawR / space.tileSize : rawR));
                let lEntry = lights[lightCount];
                if (!lEntry) {
                    lEntry = {u: 0, v: 0, color: 0, radius: 0};
                    lights[lightCount] = lEntry;
                }
                lEntry.u = u;
                lEntry.v = v;
                lEntry.color = glow.color;
                lEntry.radius = tileR;
                lightCount++;
            }
            if (!shows(target)) continue;
            const costumes = target.getCostumes();
            const costume = lookOf(target) === LOOKS.views ? facingCostume(target, viewer, state.views) :
                costumes[target.currentCostume];
            const image = pixels.get(costume, 'sprite');
            if (!image) continue;
            let entry = pool[n];
            if (!entry) {
                entry = {name: '', target: null, u: 0, v: 0, image: null, height: 1, elevation: 0, glow: false};
                pool[n] = entry;
            }
            const tall = costume.size ? costume.size[1] : image.height;
            entry.name = target.getName();
            entry.target = target;
            entry.u = u;
            entry.v = v;
            entry.image = image;
            entry.height = Math.max(0.05, Math.min(8, (tall * (num(target.size, 100) / 100)) / space.tileSize));
            entry.elevation = elevationOf(target) / 100;
            entry.glow = Boolean(glow && glow.radius > 0);
            n++;
        }
        for (let i = n; i < scene.spriteCount; i++) {
            pool[i].image = null;
            pool[i].target = null;
            pool[i].glow = false;
        }
        scene.spriteCount = n;
        lights.length = lightCount;
    };

    const prepareScene = () => {
        const level = grid();
        const space = level || FREE_GRID;
        const viewer = poseOf();
        prepareLevel(level);
        scene.player.u = (viewer.x - space.origin[0]) / space.tileSize;
        scene.player.v = (space.origin[1] - viewer.y) / space.tileSize;
        scene.player.direction = viewer.direction;
        scene.fov = effectiveFov();
        scene.fog = effectiveFog();
        scene.eye = state.eye;
        scene.lightFalloff = state.lightFalloff;
        scene.floor = state.floor;
        scene.ceiling = state.ceiling;
        scene.floorMode = state.floorTexture || 'color';
        scene.ceilingMode = state.ceilingTexture || 'color';
        scene.floorTex = textureByName(level, scene.floorMode);
        scene.ceilingTex = textureByName(level, scene.ceilingMode);
        scene.floorTextures = floorTexturesOn();
        collect(space);
    };

    const draw = hash => {
        const started = now();
        prepareScene();
        const result = render(frame, scene);
        state.crosshair = result.crosshair;
        state.target = result.target;
        state.rendered = hash;
        state.sightsHash = hash;
        const elapsed = now() - started;
        state.samples.push(elapsed);
        if (state.samples.length > SAMPLES) state.samples.shift();
        state.drawMs += elapsed;
        state.drew = true;
    };

    const sights = hash => {
        prepareScene();
        const hit = pickCrosshair(frame, scene);
        state.crosshair = hit.crosshair;
        state.target = hit.target;
        state.sightsHash = hash;
        return state.crosshair;
    };

    const present = () => {
        const renderer = runtime.renderer;
        if (!renderer) return;
        if (!gpu.image || gpu.scale !== state.scale) {
            gpu.image = toBitmap(frame.pixels, frame.width, frame.height);
            gpu.scale = state.scale;
        }
        if (gpu.skin === null) {
            gpu.skin = renderer.createBitmapSkin(gpu.image, state.scale);
            gpu.drawable = renderer.createDrawable(LAYER);
            renderer.updateDrawableSkinId(gpu.drawable, gpu.skin);
            renderer.updateDrawablePosition(gpu.drawable, [0, 0]);
            renderer.updateDrawableDirectionScale(gpu.drawable, 90, [100, 100]);
        } else {
            renderer.updateBitmapSkin(gpu.skin, gpu.image, state.scale);
        }
        renderer.updateDrawableVisible(gpu.drawable, true);
        runtime._squiggle3dPose = poseOf();
        state.uploaded = state.rendered;
        state.uploads++;
    };

    const refresh = () => {
        const hash = frameHash();
        if (hash !== state.rendered) draw(hash);
        if (state.uploaded !== state.rendered) present();
    };

    const stepFramePose = () => {
        if (!state.on || !link.seam || !viewerAlive()) return false;
        if (!state.turn && !poseMoving()) return false;
        flushPending();
        applyTurn();
        advancePose(progressNow());
        const beforeUploads = state.uploads;
        refresh();
        state.drawMs = 0;
        state.drew = false;
        return state.uploads !== beforeUploads;
    };

    const paceFrame = () => {
        if (!pacing.running) return;
        if (!state.on || !link.seam || (state.manual && !state.mouseTurn)) {
            pacing.running = false;
            return;
        }
        const at = now();
        if (pacing.last > 0 && !state.manual && opts.adaptive !== false) {
            const gap = at - pacing.last;
            pacing.shortest = Math.max(MIN_REFRESH_MS, Math.min(pacing.shortest, gap));
            policy.paced(gap > Math.max(LATE_FRAME_MS, pacing.shortest * 1.75));
        }
        pacing.last = at;
        pacing.framed = true;
        if (stepFramePose() && !interpolating() && runtime.renderer && typeof runtime.renderer.draw === 'function') {
            runtime.renderer.draw();
        }
        requestFrame(paceFrame);
    };

    const startPacing = () => {
        if (pacing.running || !requestFrame) return;
        if ((state.manual || opts.adaptive === false) && !state.mouseTurn) return;
        pacing.running = true;
        pacing.last = 0;
        pacing.framed = false;
        requestFrame(paceFrame);
    };

    const timeDraws = () => {
        const renderer = runtime.renderer;
        if (!renderer || typeof renderer.draw !== 'function') return () => {};
        const original = renderer.draw;
        const timed = (...args) => {
            if (interpolating()) {
                pacing.framed = true;
                stepFramePose();
            }
            if (state.pendingWork < 0) return original.apply(renderer, args);
            const started = now();
            const result = original.apply(renderer, args);
            state.pendingWork += now() - started;
            flushPending();
            return result;
        };
        renderer.draw = timed;
        return () => {
            if (renderer.draw === timed) renderer.draw = original;
        };
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

    const hookEffect = (forward, drawableID, effect, value) =>
        forward(drawableID, effect, effect === 'ghost' && ghosting(drawableID) ? 100 : value);

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
                Promise.resolve(canvas.requestPointerLock()).catch(() => {});
            }
        };
        input.onMove = event => {
            if (locked(input)) state.turn += num(event.movementX, 0);
        };
        canvas.addEventListener('mousedown', input.onClick);
        canvas.addEventListener('click', input.onClick);
        doc.addEventListener('mousemove', input.onMove);
        link.input = input;
    };

    const detachInput = () => {
        const input = link.input;
        if (!input) return;
        input.canvas.removeEventListener('mousedown', input.onClick);
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
        const snap = poseSnapshot(viewer);
        state.fromPose = snap;
        state.toPose = Object.assign({}, snap);
        state.pose = Object.assign({}, snap);
        state.stepAt = now();
        runtime._squiggle3dPose = state.pose;
        if (!state.on) {
            state.on = true;
            state.release = world ? world.holdCamera(cameraOwner) : null;
            if (world) world.setTilesHidden(true);
            state.rendered = -1;
            state.sightsHash = -1;
            state.uploaded = -1;
        }
        if (state.mouseTurn) attachInput();
        syncGhosts();
        refresh();
    };

    const onBefore = () => {
        flushPending();
        if (!state.on) return;
        if (!pacing.running) startPacing();
        state.tickStart = now();
        state.drawMs = 0;
        state.drew = false;
        applyTurn();
    };

    const onAfter = () => {
        if (!state.on) return;
        if (!viewerAlive()) {
            hideView();
            return;
        }
        applyTurn();
        const at = now();
        const recent = state.stepAt > 0 && (at - state.stepAt) <= (stepMs() * 2);
        const framed = (pacing.framed && recent) || interpolating();
        pacing.framed = false;
        const next = poseSnapshot(state.viewer);
        const prev = state.toPose || next;
        state.fromPose = {x: prev.x, y: prev.y, direction: prev.direction};
        state.toPose = next;
        state.stepAt = at;
        advancePose(framed ? 0 : 1);
        syncGhosts();
        refresh();
        if (state.drew && state.tickStart > 0 && !state.manual && opts.adaptive !== false) {
            state.pendingWork = now() - state.tickStart;
            state.pendingDraw = state.drawMs;
        }
        state.drawMs = 0;
        state.drew = false;
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
        state.scale = fixedScale === null ? configure(effectiveQuality()) : fixedScale;
        scene.spriteCount = 0;
        scene.lights.length = 0;
        cache.grid = false;
        cache.named = Object.create(null);
        pixels.clear();
    };

    const detach = () => {
        link.disposers.splice(0).reverse()
            .forEach(dispose => dispose());
        link.seam = null;
    };

    const onSettings = settings => {
        if (fixedScale !== null || !settings) return;
        if (state.usePlayerSettings && state.playerSettings && state.playerSettings.quality) {
            setQuality(state.playerSettings.quality);
            return;
        }
        setQuality(settings.render3d);
    };

    const onPlayerSettings = next => {
        state.playerSettings = normalizePlayerSettings(next);
        state.hasPlayerOverride = true;
        if (fixedScale === null) setQuality(effectiveQuality());
        if (state.on && viewerAlive()) refresh();
    };

    runtime.on(PROJECT_STOP_ALL, hideView);
    runtime.on(PROJECT_LOADED, reset);
    runtime.on(SETTINGS_CHANGED, onSettings);
    runtime.on(PLAYER_SETTINGS_CHANGED, onPlayerSettings);

    const view = {
        runtime,
        get frame () {
            return frame;
        },
        attach (seam) {
            if (!seam || link.seam === seam) return view;
            detach();
            link.seam = seam;
            link.disposers.push(
                seam.onBeforeExecute(onBefore),
                seam.onAfterExecute(onAfter),
                timeDraws(),
                chainHook(seam, 'drawableProperties', hookProperties),
                chainHook(seam, 'drawableEffect', hookEffect),
                world.addDrawables(() => gpu.drawable)
            );
            return view;
        },
        detach,
        isAttached: () => !!link.seam,
        isOn: () => state.on,
        viewer: () => state.viewer,
        show: showView,
        hide: hideView,
        settings: () => ({fov: state.fov, fog: state.fog, eye: state.eye}),
        effectiveSettings: () => ({
            fov: effectiveFov(),
            fog: effectiveFog(),
            eye: state.eye,
            quality: state.manual ? 'manual' : policy.mode,
            floorTextures: policy.floorTextures
        }),
        setSetting (name, value) {
            if (name === 'fov') state.fov = clampFov(value);
            else if (name === 'fog') state.fog = clampFog(value);
            else if (name === 'eye') state.eye = clampEye(value);
            else if (name === 'falloff' || name === 'lightFalloff') state.lightFalloff = clampFalloff(value);
        },
        lightFalloff: () => state.lightFalloff,
        setLightFalloff (value) {
            state.lightFalloff = clampFalloff(value);
        },
        usePlayerSettings: () => state.usePlayerSettings,
        setUsePlayerSettings (on) {
            state.usePlayerSettings = !!on;
            if (fixedScale === null) setQuality(effectiveQuality());
            if (state.on && viewerAlive()) refresh();
        },
        playerSettings: () => Object.assign({}, state.playerSettings),
        setPlayerSettings (patch) {
            state.playerSettings = normalizePlayerSettings(Object.assign({}, state.playerSettings, patch || {}));
            state.hasPlayerOverride = true;
            if (fixedScale === null) setQuality(effectiveQuality());
            if (state.on && viewerAlive()) refresh();
        },
        colors: () => ({floor: state.floor, ceiling: state.ceiling}),
        setSurfaceColor (surface, color) {
            if (surface === 'floor') state.floor = parseColor(color, state.floor);
            else if (surface === 'ceiling') state.ceiling = parseColor(color, state.ceiling);
        },
        surfaceTextures: () => ({floor: state.floorTexture, ceiling: state.ceilingTexture}),
        setSurfaceTexture (surface, texture) {
            const val = String(texture || '').trim() || 'color';
            if (surface === 'floor') state.floorTexture = val;
            else if (surface === 'ceiling') state.ceilingTexture = val;
        },
        floorTextures: floorTexturesOn,
        setFloorTextures (on) {
            state.floorTextures = on === null || typeof on === 'undefined' ? null : Boolean(on);
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
        setGlow (target, color, radius) {
            if (!target || target.isStage) return;
            const r = num(radius, 0);
            if (r <= 0) {
                state.glows.delete(target);
                return;
            }
            const c = parseColor(color, pixel(0x22, 0xd3, 0xee));
            state.glows.set(target, {color: c, radius: r});
        },
        glowOf,
        mouseTurn: () => state.mouseTurn,
        setMouseTurn (on) {
            state.mouseTurn = !!on;
            if (state.mouseTurn && state.on) {
                attachInput();
                if (!pacing.running) startPacing();
            }
            if (!state.mouseTurn) detachInput();
        },
        pose: () => poseOf(),
        scale: () => state.scale,
        quality: () => (state.manual ? 'manual' : policy.mode),
        setScale (nextScale) {
            state.manual = true;
            applyScale(Math.max(0.25, Math.min(2, num(nextScale, state.scale))));
        },
        setQuality,
        crosshair () {
            if (!state.on || !viewerAlive()) return '';
            const hash = frameHash();
            if (hash === state.rendered || hash === state.sightsHash) return state.crosshair;
            return sights(hash);
        },
        step: onAfter,
        stats () {
            const sorted = state.samples.slice().sort((a, b) => a - b);
            return {
                frames: sorted.length,
                uploads: state.uploads,
                medianMs: percentile(sorted, 0.5),
                p95Ms: percentile(sorted, 0.95),
                maxMs: sorted.length ? sorted[sorted.length - 1] : 0,
                scale: state.scale,
                quality: state.manual ? 'manual' : policy.mode,
                steps: policy.steps
            };
        },
        reset,
        dispose () {
            reset();
            detach();
            runtime.removeListener(PROJECT_STOP_ALL, hideView);
            runtime.removeListener(PROJECT_LOADED, reset);
            runtime.removeListener(SETTINGS_CHANGED, onSettings);
            runtime.removeListener(PLAYER_SETTINGS_CHANGED, onPlayerSettings);
            states.delete(runtime);
        }
    };
    runtime._squiggle3d = view;
    return view;
};

const getView3d = (runtime, world, options) => {
    if (!runtime) return null;
    if (!states.has(runtime)) states.set(runtime, createView3d(runtime, world, options));
    return states.get(runtime);
};

const peekView3d = runtime => (runtime && states.get(runtime)) || null;

export {
    LAYER,
    LOOKS,
    RESOLUTION,
    TEXTURE_SIZE,
    TURN_PER_PIXEL,
    angleDelta,
    facingCostume,
    createPixelCache,
    createView3d,
    getView3d,
<<<<<<< HEAD
    stepPose,
    wrapAngle
||||||| parent of c8b2ecc (edit-3d-player: add player 3D settings store, panel, quality rungs, and lock block)
    getView3d
=======
    peekView3d
>>>>>>> c8b2ecc (edit-3d-player: add player 3D settings store, panel, quality rungs, and lock block)
};
