import {MODES} from './render-scale.js';
import {DEFAULT_FOV, clampFog, clampFov} from './raycast.js';

const PLAYER_SETTINGS_KEY = 'squiggle.player3d.v1';
const PLAYER_SETTINGS_CHANGED = 'SQUIGGLE_PLAYER_3D_SETTINGS_CHANGED';

const DEFAULT_MOUSE_SPEED = 12;
const MIN_MOUSE_SPEED = 2;
const MAX_MOUSE_SPEED = 40;

const MIN_PLAYER_FOV = 70;
const MAX_PLAYER_FOV = 110;

const DEFAULT_HEAD_BOB = 100;
const MIN_HEAD_BOB = 0;
const MAX_HEAD_BOB = 100;

const MIN_PITCH = -45;
const MAX_PITCH = 45;

const MIN_BOB_SPEED = 8;
const BOB_AMP_PER_SPEED = 0.04;
const MAX_BOB_AMP = 4;
const STEP_DISTANCE = 24;
const MIN_STEP_PERIOD = 0.28;
const MAX_STEP_PERIOD = 0.60;
const LANDING_MAX_OFFSET = 4;

const QUALITY_MODES = MODES;
const DRAW_DISTANCES = Object.freeze(['near', 'normal', 'far']);
const DRAW_DISTANCE_FOG = Object.freeze({
    near: 65,
    normal: 25,
    far: 0
});

const DEFAULT_PLAYER_SETTINGS = Object.freeze({
    mouseSpeed: DEFAULT_MOUSE_SPEED,
    invertLook: false,
    lookUpDown: true,
    headBob: DEFAULT_HEAD_BOB,
    fov: null,
    quality: null,
    drawDistance: 'normal'
});

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const clampMouseSpeed = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_MOUSE_SPEED;
    return clamp(Math.round(n), MIN_MOUSE_SPEED, MAX_MOUSE_SPEED);
};

const clampPlayerFov = value => {
    if (value === null || typeof value === 'undefined' || value === '' || value === 'default') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return clamp(Math.round(n), MIN_PLAYER_FOV, MAX_PLAYER_FOV);
};

const clampHeadBob = value => {
    if (value === false) return MIN_HEAD_BOB;
    if (value === true) return DEFAULT_HEAD_BOB;
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_HEAD_BOB;
    return clamp(Math.round(n), MIN_HEAD_BOB, MAX_HEAD_BOB);
};

const clampPitch = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, MIN_PITCH, MAX_PITCH);
};

const horizonForPitch = (pitch, height, focal, bobOffsetPx = 0) => {
    const h = Math.max(1, Number(height) || 180);
    const half = h / 2;
    const deg = clampPitch(pitch);
    const bobPx = (Number(bobOffsetPx) || 0) * (h / 360);
    if (deg === 0 && bobPx === 0) return half;
    const f = Number(focal) > 0 ? Number(focal) : half;
    const shift = deg === 0 ? 0 : Math.tan(deg * Math.PI / 180) * (f * 0.5);
    return clamp(half + shift + bobPx, 1, h - 1);
};

const createHeadBob = () => ({
    phase: 0,
    amplitude: 0,
    offsetY: 0,
    swayX: 0,
    landingY: 0,
    totalY: 0,
    lastElevation: 0,
    movingTicks: 0
});

const triggerLandingBob = (bobState, impact = LANDING_MAX_OFFSET, headBob = DEFAULT_HEAD_BOB) => {
    const state = bobState || createHeadBob();
    const scale = clampHeadBob(headBob) / 100;
    const raw = Math.max(0, Number(impact) || 0);
    const kick = clamp(raw, 0, LANDING_MAX_OFFSET) * scale;
    state.landingY = Math.max(state.landingY || 0, kick);
    state.totalY = (state.offsetY || 0) - state.landingY;
    return state;
};

const stepHeadBob = (bobState, opts = {}) => {
    const state = bobState || createHeadBob();
    const visible = opts.visible !== false;
    const scale = clampHeadBob(typeof opts.headBob === 'undefined' ? DEFAULT_HEAD_BOB : opts.headBob) / 100;
    if (!visible || scale <= 0) {
        state.phase = 0;
        state.amplitude = 0;
        state.offsetY = 0;
        state.swayX = 0;
        state.landingY = 0;
        state.totalY = 0;
        state.movingTicks = 0;
        state.lastElevation = Math.max(0, Number(opts.elevation) || 0);
        return state;
    }
    const dt = clamp(Number(opts.dt) || (1 / 30), 1 / 240, 0.25);
    const dx = Number(opts.dx) || 0;
    const dy = Number(opts.dy) || 0;
    const dist = Math.hypot(dx, dy);
    const speed = dist / dt;
    const elevation = Math.max(0, Number(opts.elevation) || 0);
    if (state.lastElevation > 0 && elevation <= 0) {
        const drop = Math.min(LANDING_MAX_OFFSET, Math.max(1.5, state.lastElevation * 0.08));
        state.landingY = Math.max(state.landingY || 0, drop * scale);
    }
    state.lastElevation = elevation;
    if (state.landingY > 0) {
        state.landingY *= Math.exp(-dt / 0.06);
        if (state.landingY < 0.02) state.landingY = 0;
    }
    if (speed >= MIN_BOB_SPEED) {
        state.movingTicks = (state.movingTicks || 0) + 1;
        if (opts.sustainedOnly && state.movingTicks < 2) {
            state.totalY = state.offsetY - state.landingY;
            return state;
        }
        const rawAmp = Math.min(MAX_BOB_AMP, speed * BOB_AMP_PER_SPEED) * scale;
        const blend = Math.min(1, dt / 0.08);
        state.amplitude += (rawAmp - state.amplitude) * blend;
        const stepPeriod = clamp(STEP_DISTANCE / speed, MIN_STEP_PERIOD, MAX_STEP_PERIOD);
        const cyclePeriod = stepPeriod * 2;
        state.phase = (state.phase + ((dt / cyclePeriod) * Math.PI * 2)) % (Math.PI * 4);
        state.offsetY = Math.sin(state.phase) * state.amplitude;
        state.swayX = Math.cos(state.phase * 0.5) * state.amplitude * 0.5;
    } else {
        state.movingTicks = 0;
        state.amplitude *= Math.exp(-dt / 0.05);
        if (state.amplitude < 0.02) {
            state.amplitude = 0;
            state.phase = 0;
            state.offsetY = 0;
            state.swayX = 0;
        } else {
            state.offsetY = Math.sin(state.phase) * state.amplitude;
            state.swayX = Math.cos(state.phase * 0.5) * state.amplitude * 0.5;
        }
    }
    state.totalY = state.offsetY - state.landingY;
    return state;
};

const normalizeQuality = value => {
    if (value === null || typeof value === 'undefined' || value === '' || value === 'default') return null;
    const s = String(value).toLowerCase();
    return QUALITY_MODES.indexOf(s) === -1 ? null : s;
};

const normalizeDrawDistance = value => {
    const s = String(value || '').toLowerCase();
    return DRAW_DISTANCES.indexOf(s) === -1 ? 'normal' : s;
};

const fogForDrawDistance = (drawDistance, projectFog) => {
    const mode = normalizeDrawDistance(drawDistance);
    if (typeof projectFog === 'number' && Number.isFinite(projectFog)) {
        const base = clampFog(projectFog);
        if (mode === 'near') return Math.max(base, DRAW_DISTANCE_FOG.near);
        if (mode === 'far') return 0;
        return base;
    }
    return DRAW_DISTANCE_FOG[mode];
};

const normalizePlayerSettings = raw => {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        mouseSpeed: clampMouseSpeed(src.mouseSpeed),
        invertLook: Boolean(src.invertLook),
        lookUpDown: src.lookUpDown !== false,
        headBob: clampHeadBob(src.headBob),
        fov: clampPlayerFov(src.fov),
        quality: normalizeQuality(src.quality),
        drawDistance: normalizeDrawDistance(src.drawDistance)
    };
};

const resolvePlayerSettings = (playerSettings, projectDefaults, usePlayerSettings = true) => {
    const norm = normalizePlayerSettings(playerSettings);
    const proj = projectDefaults && typeof projectDefaults === 'object' ? projectDefaults : {};
    const projectFov = clampFov(typeof proj.fov === 'number' ? proj.fov : DEFAULT_FOV);
    const projectFog = clampFog(typeof proj.fog === 'number' ? proj.fog : 0);
    const projectQuality = normalizeQuality(proj.quality) || 'auto';
    if (!usePlayerSettings) {
        return {
            mouseSpeed: norm.mouseSpeed,
            invertLook: norm.invertLook,
            lookUpDown: false,
            headBob: 0,
            fov: projectFov,
            fog: projectFog,
            quality: projectQuality,
            drawDistance: 'normal',
            locked: true
        };
    }
    return {
        mouseSpeed: norm.mouseSpeed,
        invertLook: norm.invertLook,
        lookUpDown: norm.lookUpDown,
        headBob: norm.headBob,
        fov: norm.fov === null ? projectFov : clampFov(norm.fov),
        fog: fogForDrawDistance(norm.drawDistance, projectFog),
        quality: norm.quality === null ? projectQuality : norm.quality,
        drawDistance: norm.drawDistance,
        locked: false
    };
};

const defaultStorage = storage => {
    if (storage) return storage;
    try {
        if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
        if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {
        return null;
    }
    return null;
};

const hasStoredPlayerSettings = storage => {
    const store = defaultStorage(storage);
    if (!store || typeof store.getItem !== 'function') return false;
    try {
        return Boolean(store.getItem(PLAYER_SETTINGS_KEY));
    } catch (e) {
        return false;
    }
};

const readPlayerSettings = storage => {
    const store = defaultStorage(storage);
    if (!store || typeof store.getItem !== 'function') return normalizePlayerSettings(null);
    try {
        const raw = store.getItem(PLAYER_SETTINGS_KEY);
        if (!raw) return normalizePlayerSettings(null);
        return normalizePlayerSettings(JSON.parse(raw));
    } catch (e) {
        return normalizePlayerSettings(null);
    }
};

const writePlayerSettings = (settings, runtime, storage) => {
    const norm = normalizePlayerSettings(settings);
    const store = defaultStorage(storage);
    if (store && typeof store.setItem === 'function') {
        try {
            store.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(norm));
        } catch (e) {
            void e;
        }
    }
    const rt = runtime && (runtime.runtime || runtime);
    if (rt && typeof rt.emit === 'function') {
        rt.emit(PLAYER_SETTINGS_CHANGED, norm);
    }
    return norm;
};

const updatePlayerSettings = (patch, runtime, storage) => {
    const current = readPlayerSettings(storage);
    const next = Object.assign({}, current, patch && typeof patch === 'object' ? patch : {});
    return writePlayerSettings(next, runtime, storage);
};

const resetPlayerSettings = (runtime, storage) => {
    const store = defaultStorage(storage);
    if (store && typeof store.removeItem === 'function') {
        try {
            store.removeItem(PLAYER_SETTINGS_KEY);
        } catch (e) {
            void e;
        }
    }
    const norm = normalizePlayerSettings(null);
    const rt = runtime && (runtime.runtime || runtime);
    if (rt && typeof rt.emit === 'function') {
        rt.emit(PLAYER_SETTINGS_CHANGED, norm);
    }
    return norm;
};

export {
    BOB_AMP_PER_SPEED,
    DEFAULT_HEAD_BOB,
    DEFAULT_MOUSE_SPEED,
    DEFAULT_PLAYER_SETTINGS,
    DRAW_DISTANCES,
    DRAW_DISTANCE_FOG,
    LANDING_MAX_OFFSET,
    MAX_BOB_AMP,
    MAX_HEAD_BOB,
    MAX_MOUSE_SPEED,
    MAX_PITCH,
    MAX_PLAYER_FOV,
    MAX_STEP_PERIOD,
    MIN_BOB_SPEED,
    MIN_HEAD_BOB,
    MIN_MOUSE_SPEED,
    MIN_PITCH,
    MIN_PLAYER_FOV,
    MIN_STEP_PERIOD,
    PLAYER_SETTINGS_CHANGED,
    PLAYER_SETTINGS_KEY,
    QUALITY_MODES,
    STEP_DISTANCE,
    clampHeadBob,
    clampMouseSpeed,
    clampPitch,
    clampPlayerFov,
    createHeadBob,
    fogForDrawDistance,
    hasStoredPlayerSettings,
    horizonForPitch,
    normalizeDrawDistance,
    normalizePlayerSettings,
    normalizeQuality,
    readPlayerSettings,
    resetPlayerSettings,
    resolvePlayerSettings,
    stepHeadBob,
    triggerLandingBob,
    updatePlayerSettings,
    writePlayerSettings
};
