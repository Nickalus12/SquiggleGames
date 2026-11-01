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

export const SETTINGS_NOTE = [
    'Settings for this Squiggle game',
    'The editor keeps them here so the game plays the same for everyone.',
    'You can move or shrink this note. Deleting it puts the settings back to normal.'
].join('\n');

export const squiggleSettingsText = text => {
    const lines = String(text).split('\n');
    const magic = lines.find(line => line.endsWith(CONFIG_MAGIC));
    if (!magic) return text;
    return `${SETTINGS_NOTE}\n${magic}`;
};

export const storeGameSettings = vm => {
    if (!vm || typeof vm.storeProjectOptions !== 'function') return false;
    vm.storeProjectOptions();
    const runtime = vm.runtime;
    const comment = runtime && typeof runtime.findProjectOptionsComment === 'function' ?
        runtime.findProjectOptionsComment() :
        null;
    if (comment && typeof comment.text === 'string') comment.text = squiggleSettingsText(comment.text);
    return true;
};
