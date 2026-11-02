import log from '../log.js';
import {FLAGS, flagsAt} from './tilemap.js';
import {browserCanvas, browserImageLoader, costumeByName, costumeFor, defaultSkyTexture} from './textures.js';
import {chainHook} from './world.js';
import {createScalePolicy, textureFilterFor} from './render-scale.js';
import {
    DEFAULT_MOUSE_SPEED,
    MIN_BOB_SPEED,
    PLAYER_SETTINGS_CHANGED,
    PLAYER_SETTINGS_KEY,
    TOOL_SWAY_X,
    TOOL_SWAY_Y,
    TOOL_YAW_LAG_MAX,
    TOOL_YAW_LAG_TAU,
    clampPanelPitch,
    clampPitch,
    createHeadBob,
    fogForDrawDistance,
    hasStoredPlayerSettings,
    horizonForPitch,
    normalizePlayerSettings,
    readPlayerSettings,
    stepHeadBob,
    triggerLandingBob
} from './player-settings.js';
import {readGameSettings} from '../game-settings.js';
import {
    createTouchLookState,
    endTouchLook,
    gamepadLookDelta,
    gamepadMoveKeys,
    gamepadMoveVector,
    keyboardData,
    moveTouchLook,
    startTouchLook,
    syncGamepadKeys
} from '../touch-keys.js';
import {DEFAULT_EYE, DEFAULT_FOV, DEFAULT_SPRITE_STEP, HEIGHT, MAX_LIGHTS, MAX_STEPS, WIDTH,
    clampEye, clampFalloff, clampFog, clampFov,
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
const DEFAULT_SOUND_RANGE = 640;
const MIN_SOUND_RANGE = 1;
const MAX_SOUND_RANGE = 8192;
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
    const readRawPlayerPatch = storage => {
        try {
            const store = storage || (typeof window !== 'undefined' && window.localStorage) || null;
            if (!store || typeof store.getItem !== 'function') return null;
            const raw = store.getItem(PLAYER_SETTINGS_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    };
    const normalizeViewPlayerSettings = (input, prev) => {
        const src = input && typeof input === 'object' ? input : {};
        const base = prev && typeof prev === 'object' ? Object.assign({}, prev, src) : Object.assign({}, src);
        if (base.quality === '2.0x') base.quality = '2x';
        const norm = normalizePlayerSettings(base);
        let filterVal = prev && typeof prev.textureFilter === 'boolean' ? prev.textureFilter : false;
        if (typeof src.textureFilter === 'boolean') filterVal = src.textureFilter;
        else if (typeof src.bilinear === 'boolean') filterVal = src.bilinear;
        norm.textureFilter = Boolean(filterVal);
        return norm;
    };
    const readViewPlayerSettings = storage => normalizeViewPlayerSettings(
        readRawPlayerPatch(storage),
        readPlayerSettings(storage)
    );
    const initialPlayer = readViewPlayerSettings(playerStore);
    const policy = createScalePolicy();
    const configure = (mode, textureFilter) => policy.configure({
        mode,
        dpr: pixelRatio(),
        width: stageW(),
        height: stageH(),
        textureFilter
    });
    const firstScale = () => (fixedScale === null ?
        configure((initialPlayer && initialPlayer.quality) || quality(), initialPlayer && initialPlayer.textureFilter) :
        fixedScale);
    const defaultScale = firstScale();
    let frame = createFrame(Math.round(stageW() * defaultScale), Math.round(stageH() * defaultScale));
    frame.horizon = frame.height / 2;
    const cameraOwner = {kit: 'squiggle3d'};
    const serials = new WeakMap();
    const fresh = () => ({
        on: false,
        viewer: null,
        fov: DEFAULT_FOV,
        fog: 0,
        eye: DEFAULT_EYE,
        lightFalloff: 0,
        pitch: 0,
        floor: DEFAULT_FLOOR,
        ceiling: DEFAULT_CEILING,
        floorTexture: 'color',
        ceilingTexture: 'color',
        floorTextures: null,
        textureFilter: null,
        looks: new WeakMap(),
        elevations: new WeakMap(),
        glows: new WeakMap(),
        ghosted: new WeakSet(),
        views: new WeakMap(),
        mouseTurn: false,
        turn: 0,
        pitchDelta: 0,
        fromPose: null,
        toPose: null,
        pose: null,
        stepAt: 0,
        gamepadAt: 0,
        gamepadKeys: new Set(),
        touchLook: createTouchLookState(),
        rendered: -1,
        sightsHash: -1,
        uploaded: -1,
        uploads: 0,
        release: null,
        crosshair: '',
        target: null,
        samples: [],
        drawMs: 0,
        drew: false,
        pendingWork: -1,
        pendingDraw: 0,
        lastWorkMs: -1,
        manual: fixedScale !== null,
        scale: defaultScale,
        usePlayerSettings: true,
        playerSettings: readViewPlayerSettings(playerStore),
        hasPlayerOverride: hasStoredPlayerSettings(playerStore),
        bob: createHeadBob(),
        bobAt: 0,
        bobFramed: false,
        stepDx: 0,
        stepDy: 0,
        stepDt: 1 / 30,
        stepSpeed: 0,
        toolSway: false,
        yawLag: 0,
        footsteps: true,
        footstepPlays: 0,
        stepTriggered: false,
        lastHatStep: 0,
        soundRange: DEFAULT_SOUND_RANGE,
        sounds: new WeakMap(),
        soundManaged: new WeakSet(),
        gamepadMove: {x: 0, y: 0, forward: 0, back: 0, strafe: 0, magnitude: 0, active: false}
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
    const effectiveTextureFilter = () => {
        if (state.textureFilter !== null) return Boolean(state.textureFilter);
        const ps = state.playerSettings;
        if (state.usePlayerSettings && ps && typeof ps.textureFilter === 'boolean') {
            return ps.textureFilter;
        }
        return false;
    };
    const textureFilterOn = () => textureFilterFor(
        state.manual ? 'manual' : policy.mode,
        state.scale,
        effectiveTextureFilter()
    );
    const effectivePitch = () => clampPitch(state.pitch);
    const effectiveBobY = () => {
        if (!state.on || !state.bob) return 0;
        if (state.usePlayerSettings && state.playerSettings && state.playerSettings.headBob === 0) return 0;
        return Number(state.bob.totalY) || 0;
    };
    const effectiveBobX = () => {
        if (!state.on || !state.bob) return 0;
        if (state.usePlayerSettings && state.playerSettings && state.playerSettings.headBob === 0) return 0;
        return Number(state.bob.swayX) || 0;
    };
    const effectiveRoll = () => {
        if (!state.on || !state.bob) return 0;
        if (state.usePlayerSettings && state.playerSettings && state.playerSettings.headBob === 0) return 0;
        return Number(state.bob.roll) || 0;
    };
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
        bilinear: false,
        textureFilter: false,
        spriteStep: DEFAULT_SPRITE_STEP,
        rayCap: MAX_STEPS,
        swayX: 0,
        roll: 0,
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
    const spriteStepOn = () => (state.manual && policy.mode !== 'fast' ? DEFAULT_SPRITE_STEP : policy.spriteStep);
    const rayCapOn = () => (state.manual && policy.mode !== 'fast' ? MAX_STEPS : policy.rayCap);

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

    const mouseTurnScale = () => (
        num(state.playerSettings && state.playerSettings.mouseSpeed, DEFAULT_MOUSE_SPEED) / 100
    );

    const lookOpts = () => {
        if (!state.usePlayerSettings || !state.playerSettings) {
            return {mouseSpeed: DEFAULT_MOUSE_SPEED, invertLook: false, lookUpDown: true};
        }
        return {
            mouseSpeed: state.playerSettings.mouseSpeed,
            invertLook: state.playerSettings.invertLook,
            lookUpDown: state.playerSettings.lookUpDown
        };
    };

    const playFootstepTap = () => {
        if (!state.footsteps) return false;
        state.footstepPlays++;
        try {
            const engine = runtime && runtime.audioEngine;
            const ctx = engine && engine.audioContext;
            if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') {
                return true;
            }
            const t0 = Number(ctx.currentTime) || 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(95, t0);
            if (typeof osc.frequency.exponentialRampToValueAtTime === 'function') {
                osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.045);
            }
            gain.gain.setValueAtTime(0.05, t0);
            if (typeof gain.gain.exponentialRampToValueAtTime === 'function') {
                gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.045);
            }
            osc.connect(gain);
            gain.connect(engine.inputNode || ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 0.05);
        } catch (e) {
            void e;
        }
        return true;
    };

    const advanceBob = (dt, dx, dy, direction, strafeOverride) => {
        const headBob = state.usePlayerSettings && state.playerSettings ? state.playerSettings.headBob : 100;
        const prevSteps = state.bob.steps || 0;
        stepHeadBob(state.bob, {
            dx,
            dy,
            dt,
            direction,
            strafe: strafeOverride,
            elevation: elevationOf(state.viewer),
            visible: state.on,
            headBob
        });
        if (state.toolSway && state.yawLag !== 0) {
            state.yawLag *= Math.exp(-Math.max(1 / 240, Number(dt) || (1 / 60)) / TOOL_YAW_LAG_TAU);
            if (Math.abs(state.yawLag) < 1e-3) state.yawLag = 0;
        } else if (!state.toolSway) {
            state.yawLag = 0;
        }
        if (state.bob.stepped || (state.bob.steps || 0) > prevSteps) {
            state.stepTriggered = true;
            playFootstepTap();
        }
        return state.bob;
    };

    const computeSoundFor = target => {
        const baseVolume = Math.max(0, Math.min(100, num(target && target.volume, 100)));
        const equalGain = Math.cos(Math.PI / 4);
        if (!target || target.isStage || !state.on || !viewerAlive() || target === state.viewer ||
            lookOf(target) === LOOKS.nothing) {
            return {
                pan: 0,
                volume: baseVolume,
                gain: 1,
                leftGain: equalGain,
                rightGain: equalGain,
                distance: 0,
                angle: 0,
                inViewerCell: true
            };
        }
        const viewer = poseOf() || state.viewer;
        const space = grid() || FREE_GRID;
        const tileSize = Math.max(1, num(space.tileSize, 32));
        const originX = Array.isArray(space.origin) ? num(space.origin[0], 0) : 0;
        const originY = Array.isArray(space.origin) ? num(space.origin[1], 0) : 0;
        const vx = num(viewer.x, 0);
        const vy = num(viewer.y, 0);
        const tx = num(target.x, 0);
        const ty = num(target.y, 0);
        const dx = tx - vx;
        const dy = ty - vy;
        const dist = Math.hypot(dx, dy);
        const vCol = Math.floor((vx - originX) / tileSize);
        const vRow = Math.floor((originY - vy) / tileSize);
        const tCol = Math.floor((tx - originX) / tileSize);
        const tRow = Math.floor((originY - ty) / tileSize);
        const sameCell = (vCol === tCol && vRow === tRow) || dist < (tileSize * 0.5);
        if (sameCell) {
            return {
                pan: 0,
                volume: baseVolume,
                gain: 1,
                leftGain: equalGain,
                rightGain: equalGain,
                distance: dist,
                angle: 0,
                inViewerCell: true
            };
        }
        const range = Math.max(MIN_SOUND_RANGE, num(state.soundRange, DEFAULT_SOUND_RANGE));
        const bearing = Math.atan2(dx, dy) * 180 / Math.PI;
        const relDeg = wrapAngle(bearing - num(viewer.direction, 90));
        const pan = Math.max(-100, Math.min(100, Math.round(Math.sin(relDeg * Math.PI / 180) * 100)));
        if (dist >= range) {
            return {
                pan,
                volume: 0,
                gain: 0,
                leftGain: 0,
                rightGain: 0,
                distance: dist,
                angle: relDeg,
                inViewerCell: false
            };
        }
        const gain = Math.max(0, 1 - (dist / range));
        const volume = Math.round(baseVolume * gain);
        const p = (pan + 100) / 200;
        const leftGain = Math.cos((p * Math.PI) / 2) * gain;
        const rightGain = Math.sin((p * Math.PI) / 2) * gain;
        return {
            pan,
            volume,
            gain,
            leftGain,
            rightGain,
            distance: dist,
            angle: relDeg,
            inViewerCell: false
        };
    };

    const syncSpatialAudio = () => {
        if (!runtime || !Array.isArray(runtime.targets)) return;
        for (const target of runtime.targets) {
            if (!target || target.isStage) continue;
            if (state.on && viewerAlive() && target !== state.viewer && lookOf(target) !== LOOKS.nothing) {
                const spatial = computeSoundFor(target);
                state.sounds.set(target, spatial);
                state.soundManaged.add(target);
                target.soundEffects = Object.assign({}, target.soundEffects, {
                    pan: spatial.pan,
                    volume: spatial.volume
                });
                if (target.soundBank && typeof target.soundBank.setEffects === 'function') {
                    target.soundBank.setEffects(target);
                }
            } else if (state.soundManaged.has(target)) {
                state.soundManaged.delete(target);
                state.sounds.delete(target);
                if (target.soundEffects) {
                    delete target.soundEffects.pan;
                    delete target.soundEffects.volume;
                }
                if (target.soundBank && typeof target.soundBank.setEffects === 'function') {
                    target.soundBank.setEffects(target);
                }
            }
        }
    };

    const toolSwayOffsets = () => {
        if (!state.on || !state.toolSway) {
            return {x: 0, y: 0, yawLag: 0, roll: 0};
        }
        const x = Math.max(-TOOL_SWAY_X, Math.min(TOOL_SWAY_X, num(state.bob && state.bob.toolX, 0)));
        const y = Math.max(-TOOL_SWAY_Y, Math.min(TOOL_SWAY_Y, num(state.bob && state.bob.toolY, 0)));
        const yawLag = Math.max(-TOOL_YAW_LAG_MAX, Math.min(TOOL_YAW_LAG_MAX, num(state.yawLag, 0)));
        const roll = effectiveRoll();
        return {x, y, yawLag, roll};
    };

    const syncPinnedTools = () => {
        const renderer = runtime && runtime.renderer;
        if (!renderer || !world || typeof world.isPinned !== 'function' || !Array.isArray(runtime.targets)) return;
        const offsets = toolSwayOffsets();
        for (const target of runtime.targets) {
            if (!target || target.isStage || !world.isPinned(target)) continue;
            if (typeof target.drawableID !== 'number') continue;
            if (typeof renderer.updateDrawablePosition === 'function') {
                renderer.updateDrawablePosition(target.drawableID, [
                    num(target.x, 0) + offsets.x,
                    num(target.y, 0) + offsets.y
                ]);
            }
            if (typeof renderer.updateDrawableDirectionScale === 'function') {
                const s = num(target.size, 100);
                renderer.updateDrawableDirectionScale(
                    target.drawableID,
                    num(target.direction, 90) + offsets.yawLag,
                    [s, s]
                );
            }
        }
    };

    const getGamepads = opts.getGamepads ||
        (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ?
            () => navigator.getGamepads() :
            null);
    let gamepadKnown = Boolean(opts.getGamepads);
    if (!gamepadKnown && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('gamepadconnected', () => {
            gamepadKnown = true;
        });
    }

    const postScratchKey = (name, isDown) => {
        const kb = runtime && runtime.ioDevices && runtime.ioDevices.keyboard;
        const data = keyboardData(name, isDown);
        if (kb && data && typeof kb.postData === 'function') {
            kb.postData(data);
        }
    };

    const releaseGamepadKeys = () => {
        if (state.gamepadKeys && state.gamepadKeys.size > 0) {
            syncGamepadKeys(postScratchKey, state.gamepadKeys, []);
        }
    };

    const pollGamepad = dtSec => {
        if (!gamepadKnown || !getGamepads || !state.on) return false;
        let list = null;
        try {
            list = getGamepads();
        } catch (e) {
            return false;
        }
        if (!list) return false;
        let pad = null;
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].connected !== false) {
                pad = list[i];
                break;
            }
        }
        if (!pad) {
            releaseGamepadKeys();
            if (!opts.getGamepads) gamepadKnown = false;
            return false;
        }
        const nextKeys = gamepadMoveKeys(pad, runtime.targets);
        state.gamepadMove = nextKeys.vector || gamepadMoveVector(pad);
        syncGamepadKeys(postScratchKey, state.gamepadKeys, nextKeys);
        if (!state.mouseTurn) return false;
        const axes = Array.isArray(pad.axes) ? pad.axes : [];
        const look = gamepadLookDelta(axes[2], axes[3], dtSec, lookOpts());
        if (!look.active) return false;
        state.turn += look.yawDelta / TURN_PER_PIXEL;
        if (state.toolSway && look.yawDelta) {
            state.yawLag = Math.max(-TOOL_YAW_LAG_MAX, Math.min(TOOL_YAW_LAG_MAX, state.yawLag - look.yawDelta));
        }
        state.pitchDelta += look.pitchDelta;
        return true;
    };

    const applyTurn = () => {
        let changed = false;
        if (state.pitchDelta) {
            const pDelta = state.pitchDelta;
            state.pitchDelta = 0;
            const currentLook = lookOpts();
            if (currentLook.lookUpDown !== false) {
                const nextPitch = clampPanelPitch(state.pitch + pDelta);
                if (nextPitch !== state.pitch) {
                    state.pitch = nextPitch;
                    changed = true;
                }
            }
        }
        if (!state.turn) return changed;
        const turn = state.turn;
        state.turn = 0;
        if (!viewerAlive()) return changed;
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
        frame.horizon = frame.height / 2;
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
        state.lastWorkMs = work;
        sampleTick(work, state.pendingDraw);
    };

    const setQuality = mode => {
        state.manual = false;
        applyScale(configure(mode, effectiveTextureFilter()));
    };

    const frameHash = () => {
        ensureFrame();
        const viewer = poseOf();
        const fovVal = effectiveFov();
        const halfFovRad = (fovVal * Math.PI / 180) * 0.5;
        const focal = (frame.width / 2) / Math.max(1e-5, Math.tan(halfFovRad));
        const bobY = effectiveBobY();
        const swayX = effectiveBobX();
        const roll = effectiveRoll();
        frame.horizon = horizonForPitch(effectivePitch(), frame.height, focal, bobY);
        frame.swayX = swayX;
        frame.roll = roll;
        let h = 2166136261;
        h = mix(h, frame.width);
        h = mix(h, frame.height);
        h = mix(h, frame.horizon);
        h = mix(h, swayX);
        h = mix(h, roll);
        h = mix(h, viewer.x);
        h = mix(h, viewer.y);
        h = mix(h, viewer.direction);
        h = mix(h, fovVal);
        h = mix(h, effectiveFog());
        h = mix(h, state.eye);
        h = mix(h, state.lightFalloff);
        h = mix(h, effectivePitch());
        h = mix(h, state.floor);
        h = mix(h, state.ceiling);
        h = mixStr(h, state.floorTexture);
        h = mixStr(h, state.ceilingTexture);
        h = mix(h, floorTexturesOn() ? 1 : 0);
        if (textureFilterOn()) h = mix(h, 1);
        h = mix(h, spriteStepOn());
        h = mix(h, rayCapOn());
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
        scene.bilinear = textureFilterOn();
        scene.textureFilter = scene.bilinear;
        scene.spriteStep = spriteStepOn();
        scene.rayCap = rayCapOn();
        const halfFovRad = (scene.fov * Math.PI / 180) * 0.5;
        const focal = (frame.width / 2) / Math.max(1e-5, Math.tan(halfFovRad));
        const horizon = horizonForPitch(effectivePitch(), frame.height, focal, effectiveBobY());
        const swayX = effectiveBobX();
        const roll = effectiveRoll();
        frame.horizon = horizon;
        frame.swayX = swayX;
        frame.roll = roll;
        scene.horizon = horizon;
        scene.swayX = swayX;
        scene.roll = roll;
        collect(space);
        syncSpatialAudio();
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
            renderer.updateDrawablePosition(gpu.drawable, [effectiveBobX(), 0]);
            renderer.updateDrawableDirectionScale(
                gpu.drawable,
                90 + (state.toolSway ? effectiveRoll() : 0),
                [100, 100]
            );
        } else {
            renderer.updateBitmapSkin(gpu.skin, gpu.image, state.scale);
            renderer.updateDrawablePosition(gpu.drawable, [effectiveBobX(), 0]);
            renderer.updateDrawableDirectionScale(
                gpu.drawable,
                90 + (state.toolSway ? effectiveRoll() : 0),
                [100, 100]
            );
        }
        renderer.updateDrawableVisible(gpu.drawable, true);
        syncPinnedTools();
        runtime._squiggle3dPose = poseOf();
        state.uploaded = state.rendered;
        state.uploads++;
    };

    const refresh = () => {
        const hash = frameHash();
        if (hash !== state.rendered) draw(hash);
        if (state.uploaded !== state.rendered) present();
    };

    const stepFramePose = progressOverride => {
        if (!state.on || !link.seam || !viewerAlive()) return false;
        flushPending();
        const frameStart = now();
        state.drawMs = 0;
        state.drew = false;
        if (gamepadKnown) {
            const at = now();
            const dtSec = state.gamepadAt > 0 ?
                Math.min(0.1, Math.max(1 / 240, (at - state.gamepadAt) / 1000)) :
                1 / 60;
            state.gamepadAt = at;
            pollGamepad(dtSec);
        }
        const bobMoving = state.stepSpeed >= MIN_BOB_SPEED;
        const moving = Boolean(
            typeof progressOverride === 'number' ||
            state.turn ||
            state.pitchDelta ||
            poseMoving() ||
            bobMoving
        );
        const beforeUploads = state.uploads;
        if (moving) {
            if (bobMoving && pacing.running && typeof progressOverride !== 'number') {
                const bobNow = now();
                const bobDt = state.bobAt > 0 ?
                    Math.min(0.1, Math.max(1 / 240, (bobNow - state.bobAt) / 1000)) :
                    (frameMs() / 1000);
                state.bobAt = bobNow;
                const scaleDt = state.stepDt > 0 ? (bobDt / state.stepDt) : 1;
                const strafe = state.gamepadMove && state.gamepadMove.active ? state.gamepadMove.strafe : null;
                advanceBob(
                    bobDt,
                    state.stepDx * scaleDt,
                    state.stepDy * scaleDt,
                    poseOf().direction,
                    strafe
                );
                state.bobFramed = true;
            }
            applyTurn();
            advancePose(typeof progressOverride === 'number' ? progressOverride : progressNow());
            refresh();
        } else {
            state.bobAt = now();
        }
        if (!state.manual && opts.adaptive !== false) {
            state.pendingWork = now() - frameStart;
            state.pendingDraw = state.drawMs;
        }
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
            policy.paced(gap > Math.max(LATE_FRAME_MS, pacing.shortest * 1.75), state.lastWorkMs);
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

    const hookPosition = (forward, drawableID, position) => {
        if (!state.on || !state.toolSway || !world || typeof world.isPinned !== 'function') {
            return forward(drawableID, position);
        }
        const target = runtime.getTargetByDrawableId(drawableID);
        if (target && world.isPinned(target) && Array.isArray(position)) {
            const offsets = toolSwayOffsets();
            return forward(drawableID, [position[0] + offsets.x, position[1] + offsets.y]);
        }
        return forward(drawableID, position);
    };

    const hookDirectionScale = (forward, drawableID, direction, scale) => {
        if (!state.on || !state.toolSway || !world || typeof world.isPinned !== 'function') {
            return forward(drawableID, direction, scale);
        }
        const target = runtime.getTargetByDrawableId(drawableID);
        if (target && world.isPinned(target)) {
            const offsets = toolSwayOffsets();
            return forward(drawableID, num(direction, 90) + offsets.yawLag, scale);
        }
        return forward(drawableID, direction, scale);
    };

    const pointerDocument = canvas => opts.document || canvas.ownerDocument ||
        (typeof document === 'undefined' ? null : document);

    const locked = input => input.doc && input.doc.pointerLockElement === input.canvas;

    const canvasRect = canvas => {
        if (canvas && typeof canvas.getBoundingClientRect === 'function') {
            const rect = canvas.getBoundingClientRect();
            if (rect && rect.width > 0) return rect;
        }
        return {left: 0, top: 0, width: stageW(), height: stageH()};
    };

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
                const isWebdriver = typeof navigator !== 'undefined' && Boolean(navigator.webdriver);
                if (isWebdriver || input.rawLockFailed) {
                    Promise.resolve(canvas.requestPointerLock()).catch(() => {});
                    return;
                }
                Promise.resolve(canvas.requestPointerLock({unadjustedMovement: true})).catch(err => {
                    if (err && err.name === 'NotSupportedError') {
                        input.rawLockFailed = true;
                        Promise.resolve(canvas.requestPointerLock()).catch(() => {});
                    }
                });
            }
        };
        input.onMove = event => {
            if (!locked(input)) return;
            const dpr = pixelRatio();
            const scale = mouseTurnScale();
            const mx = num(event.movementX, 0) * dpr;
            const my = num(event.movementY, 0) * dpr;
            const yawDelta = mx * scale;
            state.turn += yawDelta / TURN_PER_PIXEL;
            if (state.toolSway && yawDelta !== 0) {
                state.yawLag = Math.max(-TOOL_YAW_LAG_MAX, Math.min(TOOL_YAW_LAG_MAX, state.yawLag - yawDelta));
            }
            if (my !== 0) {
                const currentLook = lookOpts();
                if (currentLook.lookUpDown !== false) {
                    const sign = currentLook.invertLook ? 1 : -1;
                    state.pitchDelta += sign * my * scale;
                }
            }
        };
        input.onPointerDown = event => {
            if (!state.on || !state.mouseTurn || !event || event.pointerType !== 'touch') return;
            startTouchLook(state.touchLook, event.pointerId, event.clientX, event.clientY, canvasRect(canvas));
        };
        input.onPointerMove = event => {
            if (!state.on || !state.mouseTurn || !event || event.pointerType !== 'touch') return;
            const delta = moveTouchLook(state.touchLook, event.pointerId, event.clientX, event.clientY, lookOpts());
            if (!delta.active) return;
            if (delta.yawDelta) {
                state.turn += delta.yawDelta / TURN_PER_PIXEL;
                if (state.toolSway) {
                    state.yawLag = Math.max(
                        -TOOL_YAW_LAG_MAX,
                        Math.min(TOOL_YAW_LAG_MAX, state.yawLag - delta.yawDelta)
                    );
                }
            }
            if (delta.pitchDelta) state.pitchDelta += delta.pitchDelta;
        };
        input.onPointerUp = event => {
            if (!event || event.pointerType !== 'touch') return;
            endTouchLook(state.touchLook, event.pointerId);
        };
        canvas.addEventListener('mousedown', input.onClick);
        canvas.addEventListener('click', input.onClick);
        canvas.addEventListener('pointerdown', input.onPointerDown);
        doc.addEventListener('mousemove', input.onMove);
        doc.addEventListener('pointermove', input.onPointerMove);
        doc.addEventListener('pointerup', input.onPointerUp);
        doc.addEventListener('pointercancel', input.onPointerUp);
        link.input = input;
    };

    const detachInput = () => {
        const input = link.input;
        if (!input) return;
        input.canvas.removeEventListener('mousedown', input.onClick);
        input.canvas.removeEventListener('click', input.onClick);
        input.canvas.removeEventListener('pointerdown', input.onPointerDown);
        input.doc.removeEventListener('mousemove', input.onMove);
        input.doc.removeEventListener('pointermove', input.onPointerMove);
        input.doc.removeEventListener('pointerup', input.onPointerUp);
        input.doc.removeEventListener('pointercancel', input.onPointerUp);
        if (locked(input) && typeof input.doc.exitPointerLock === 'function') input.doc.exitPointerLock();
        endTouchLook(state.touchLook);
        releaseGamepadKeys();
        link.input = null;
        state.turn = 0;
        state.pitchDelta = 0;
    };

    const hideDrawable = () => {
        const renderer = runtime.renderer;
        if (renderer && gpu.drawable !== null) renderer.updateDrawableVisible(gpu.drawable, false);
    };

    const hideView = () => {
        detachInput();
        releaseGamepadKeys();
        if (!state.on) return;
        state.on = false;
        state.yawLag = 0;
        state.stepSpeed = 0;
        state.stepTriggered = false;
        stepHeadBob(state.bob, {visible: false});
        syncPinnedTools();
        syncSpatialAudio();
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
        state.stepTriggered = false;
        if (!state.on) return;
        if (!pacing.running) startPacing();
        state.drawMs = 0;
        state.drew = false;
        if (!pacing.framed) pollGamepad(stepMs() / 1000);
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
        const stepDx = next.x - prev.x;
        const stepDy = next.y - prev.y;
        const vmDt = stepMs() / 1000;
        const stepDist = Math.hypot(stepDx, stepDy);
        const stepSpeed = stepDist / Math.max(1e-4, vmDt);
        const turnDelta = angleDelta(prev.direction, next.direction);
        if (state.toolSway && Math.abs(turnDelta) > POSE_EPSILON) {
            state.yawLag = Math.max(-TOOL_YAW_LAG_MAX, Math.min(TOOL_YAW_LAG_MAX, state.yawLag - turnDelta));
        }
        state.stepDx = stepDx;
        state.stepDy = stepDy;
        state.stepDt = vmDt;
        state.stepSpeed = stepSpeed;
        const strafe = state.gamepadMove && state.gamepadMove.active ? state.gamepadMove.strafe : null;
        if (stepSpeed < MIN_BOB_SPEED || !state.bobFramed) {
            advanceBob(vmDt, stepDx, stepDy, next.direction, strafe);
        }
        state.bobFramed = false;
        state.fromPose = {x: prev.x, y: prev.y, direction: prev.direction};
        state.toPose = next;
        state.stepAt = at;
        syncGhosts();
        syncSpatialAudio();
        syncPinnedTools();
        if (framed) {
            advancePose(0);
            refresh();
            state.drawMs = 0;
            state.drew = false;
        } else {
            stepFramePose(1);
        }
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
        state.scale = fixedScale === null ? configure(effectiveQuality(), effectiveTextureFilter()) : fixedScale;
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
        if (next && (typeof next.textureFilter !== 'undefined' || typeof next.bilinear !== 'undefined')) {
            state.textureFilter = null;
        }
        state.playerSettings = normalizeViewPlayerSettings(next, state.playerSettings);
        state.hasPlayerOverride = true;
        policy.setTextureFilter(effectiveTextureFilter());
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
                chainHook(seam, 'drawablePosition', hookPosition),
                chainHook(seam, 'drawableDirectionScale', hookDirectionScale),
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
            floorTextures: policy.floorTextures,
            textureFilter: textureFilterOn(),
            spriteStep: policy.spriteStep,
            rayCap: policy.rayCap
        }),
        setSetting (name, value) {
            if (name === 'fov') state.fov = clampFov(value);
            else if (name === 'fog') state.fog = clampFog(value);
            else if (name === 'eye') state.eye = clampEye(value);
            else if (name === 'falloff' || name === 'lightFalloff') state.lightFalloff = clampFalloff(value);
            else if (name === 'pitch') state.pitch = clampPitch(value);
            else if (name === 'textureFilter' || name === 'bilinear') {
                state.textureFilter = value === null || typeof value === 'undefined' ? null : Boolean(value);
                policy.setTextureFilter(effectiveTextureFilter());
            }
        },
        lightFalloff: () => state.lightFalloff,
        setLightFalloff (value) {
            state.lightFalloff = clampFalloff(value);
        },
        pitch: () => effectivePitch(),
        setPitch (value) {
            state.pitch = clampPitch(value);
            if (state.on && viewerAlive()) refresh();
        },
        addPitch (delta) {
            if (state.usePlayerSettings && state.playerSettings && state.playerSettings.lookUpDown === false) {
                return state.pitch;
            }
            state.pitch = clampPanelPitch(state.pitch + (Number(delta) || 0));
            return state.pitch;
        },
        headBob: () => Object.assign({}, state.bob),
        swayX: () => effectiveBobX(),
        roll: () => effectiveRoll(),
        stepBob (dx, dy, dt, elevation, direction, strafe) {
            const headBob = state.usePlayerSettings && state.playerSettings ? state.playerSettings.headBob : 100;
            const prevSteps = state.bob.steps || 0;
            const res = stepHeadBob(state.bob, {
                dx,
                dy,
                dt,
                elevation,
                direction: typeof direction === 'number' ? direction : (state.viewer ? state.viewer.direction : 90),
                strafe,
                visible: state.on,
                headBob
            });
            if (res.stepped || (res.steps || 0) > prevSteps) {
                state.stepTriggered = true;
                playFootstepTap();
            }
            return res;
        },
        triggerLanding (impact) {
            const headBob = state.usePlayerSettings && state.playerSettings ? state.playerSettings.headBob : 100;
            return triggerLandingBob(state.bob, impact, headBob);
        },
        toolSway: () => state.toolSway,
        setToolSway (on) {
            state.toolSway = !!on;
            if (!state.toolSway) state.yawLag = 0;
            syncPinnedTools();
            if (state.on && viewerAlive()) refresh();
        },
        toolSwayOffsets,
        footsteps: () => state.footsteps,
        setFootsteps (on) {
            state.footsteps = !!on;
        },
        footstepPlays: () => state.footstepPlays,
        stepFired (target) {
            const checkTarget = target || state.viewer;
            if (!state.on || !checkTarget || checkTarget.isStage || checkTarget !== state.viewer) return false;
            return Boolean(state.stepTriggered);
        },
        soundRange: () => state.soundRange,
        setSoundRange (range) {
            const n = Number(range);
            state.soundRange = Number.isFinite(n) ?
                Math.max(MIN_SOUND_RANGE, Math.min(MAX_SOUND_RANGE, n)) :
                DEFAULT_SOUND_RANGE;
            syncSpatialAudio();
        },
        soundFor (target) {
            if (!target) return computeSoundFor(null);
            return computeSoundFor(target);
        },
        gamepadMove: () => Object.assign({}, state.gamepadMove),
        usePlayerSettings: () => state.usePlayerSettings,
        setUsePlayerSettings (on) {
            state.usePlayerSettings = !!on;
            policy.setTextureFilter(effectiveTextureFilter());
            if (fixedScale === null) setQuality(effectiveQuality());
            if (state.on && viewerAlive()) refresh();
        },
        playerSettings: () => Object.assign({}, state.playerSettings),
        setPlayerSettings (patch) {
            if (patch && (typeof patch.textureFilter !== 'undefined' || typeof patch.bilinear !== 'undefined')) {
                state.textureFilter = null;
            }
            state.playerSettings = normalizeViewPlayerSettings(patch, state.playerSettings);
            state.hasPlayerOverride = true;
            policy.setTextureFilter(effectiveTextureFilter());
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
        textureFilter: textureFilterOn,
        setTextureFilter (on) {
            state.textureFilter = on === null || typeof on === 'undefined' ? null : Boolean(on);
            policy.setTextureFilter(effectiveTextureFilter());
            if (state.on && viewerAlive()) refresh();
        },
        bilinear: textureFilterOn,
        setBilinear (on) {
            state.textureFilter = on === null || typeof on === 'undefined' ? null : Boolean(on);
            policy.setTextureFilter(effectiveTextureFilter());
            if (state.on && viewerAlive()) refresh();
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
    peekView3d,
    stepPose,
    wrapAngle
};
