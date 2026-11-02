export const STAGE_PRESETS = [
    {id: 'normal', width: 480, height: 360},
    {id: 'wide', width: 640, height: 360},
    {id: 'tall', width: 360, height: 640}
];

export const presetFor = (width, height) => {
    const hit = STAGE_PRESETS.find(p => p.width === width && p.height === height);
    return hit ? hit.id : 'custom';
};

export const MIN_FPS = 10;
export const MAX_FPS = 250;

export const clampFramerate = value => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return null;
    return Math.min(MAX_FPS, Math.max(MIN_FPS, n));
};

export const CONFIG_MAGIC = ' // _twconfig_';

export const TOUCH_MODES = ['thumbstick', 'dpad'];

export const HUD_SECTIONS = ['scores', 'teams', 'timer', 'health'];

export const OWN_HUD_MODES = ['auto', 'replace', 'keep'];

export const RENDER_3D_MODES = ['auto', 'crisp', 'fast'];

export const DEFAULT_SQUIGGLE_SETTINGS = Object.freeze({
    touchMode: 'thumbstick',
    actionLabels: Object.freeze({}),
    ownHud: 'auto',
    render3d: 'auto',
    hud: Object.freeze({
        enabled: true,
        scores: true,
        teams: true,
        timer: true,
        health: true
    })
});

export const normalizeSquiggleSettings = raw => {
    const src = raw && typeof raw === 'object' ? raw : {};
    const touchMode = TOUCH_MODES.indexOf(src.touchMode) === -1 ? 'thumbstick' : src.touchMode;
    const actionLabels = {};
    if (src.actionLabels && typeof src.actionLabels === 'object') {
        Object.keys(src.actionLabels).forEach(key => {
            const k = String(key).trim()
                .toLowerCase();
            const val = String(src.actionLabels[key] || '').trim()
                .slice(0, 16);
            if (k && val) actionLabels[k] = val;
        });
    }
    const rawHud = src.hud && typeof src.hud === 'object' ? src.hud : {};
    const hud = {
        enabled: rawHud.enabled !== false,
        scores: rawHud.scores !== false,
        teams: rawHud.teams !== false,
        timer: rawHud.timer !== false,
        health: rawHud.health !== false
    };
    const ownHud = OWN_HUD_MODES.indexOf(src.ownHud) !== -1 ? src.ownHud : 'auto';
    const render3d = RENDER_3D_MODES.indexOf(src.render3d) !== -1 ? src.render3d : 'auto';
    return {touchMode, actionLabels, hud, ownHud, render3d};
};

export const hasCustomSquiggleSettings = settings => {
    const norm = normalizeSquiggleSettings(settings);
    if (norm.touchMode !== 'thumbstick') return true;
    if (Object.keys(norm.actionLabels).length > 0) return true;
    if (norm.ownHud !== 'auto' || norm.render3d !== 'auto') return true;
    return !norm.hud.enabled || !norm.hud.scores || !norm.hud.teams || !norm.hud.timer || !norm.hud.health;
};

export const SETTINGS_NOTE = [
    'Settings for this Squiggle game',
    'The editor keeps them here so the game plays the same for everyone.',
    'You can move or shrink this note. Deleting it puts the settings back to normal.'
].join('\n');

const mergeMagicLine = (magic, extra) => {
    if (typeof extra === 'undefined' || extra === null) return magic;
    const rawJson = magic.slice(0, magic.length - CONFIG_MAGIC.length);
    try {
        const parsed = JSON.parse(rawJson);
        if (!parsed || typeof parsed !== 'object') return magic;
        if (hasCustomSquiggleSettings(extra)) {
            parsed.squiggle = normalizeSquiggleSettings(extra);
        } else {
            delete parsed.squiggle;
        }
        return `${JSON.stringify(parsed)}${CONFIG_MAGIC}`;
    } catch (e) {
        return magic;
    }
};

export const squiggleSettingsText = (text, extra) => {
    const lines = String(text).split('\n');
    const magic = lines.find(line => line.endsWith(CONFIG_MAGIC));
    if (!magic) return text;
    return `${SETTINGS_NOTE}\n${mergeMagicLine(magic, extra)}`;
};

const findOptionsComment = runtime => {
    if (!runtime) return null;
    const hasStageLookup = typeof runtime.getTargetForStage === 'function';
    const stage = hasStageLookup ? runtime.getTargetForStage() : null;
    if (hasStageLookup && !(stage && stage.comments)) return null;
    if (typeof runtime.findProjectOptionsComment === 'function') {
        return runtime.findProjectOptionsComment();
    }
    const comments = stage && stage.comments ? Object.values(stage.comments) : [];
    return comments.find(c => c && typeof c.text === 'string' && c.text.includes(CONFIG_MAGIC)) || null;
};

export const readGameSettings = vm => {
    const runtime = vm && (vm.runtime || vm);
    if (!runtime) return normalizeSquiggleSettings(null);
    const comment = findOptionsComment(runtime);
    if (comment && typeof comment.text === 'string') {
        const magic = comment.text.split('\n').find(line => line.endsWith(CONFIG_MAGIC));
        if (magic) {
            try {
                const parsed = JSON.parse(magic.slice(0, magic.length - CONFIG_MAGIC.length));
                if (parsed && parsed.squiggle) {
                    const norm = normalizeSquiggleSettings(parsed.squiggle);
                    runtime._squiggleSettings = norm;
                    return norm;
                }
            } catch (e) {
                return normalizeSquiggleSettings(runtime._squiggleSettings);
            }
        }
    }
    return normalizeSquiggleSettings(runtime._squiggleSettings);
};

export const storeGameSettings = vm => {
    if (!vm || typeof vm.storeProjectOptions !== 'function') return false;
    vm.storeProjectOptions();
    const runtime = vm.runtime;
    const comment = findOptionsComment(runtime);
    const extra = runtime && runtime._squiggleSettings ? runtime._squiggleSettings : null;
    if (comment && typeof comment.text === 'string') {
        comment.text = squiggleSettingsText(comment.text, extra);
    }
    return true;
};

export const updateGameSettings = (vm, patch) => {
    const runtime = vm && (vm.runtime || vm);
    if (!runtime) return normalizeSquiggleSettings(null);
    const current = readGameSettings(vm);
    const next = normalizeSquiggleSettings({
        touchMode: patch && typeof patch.touchMode !== 'undefined' ? patch.touchMode : current.touchMode,
        actionLabels: patch && patch.actionLabels ? patch.actionLabels : current.actionLabels,
        hud: patch && patch.hud ? Object.assign({}, current.hud, patch.hud) : current.hud,
        ownHud: patch && typeof patch.ownHud !== 'undefined' ? patch.ownHud : current.ownHud,
        render3d: patch && typeof patch.render3d !== 'undefined' ? patch.render3d : current.render3d
    });
    runtime._squiggleSettings = next;
    if (vm && typeof vm.storeProjectOptions === 'function') {
        storeGameSettings(vm);
    }
    if (typeof runtime.emit === 'function') {
        runtime.emit('SQUIGGLE_SETTINGS_CHANGED', next);
    }
    return next;
};
