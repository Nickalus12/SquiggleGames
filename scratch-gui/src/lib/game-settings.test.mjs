process.removeAllListeners('warning');

const {
    STAGE_PRESETS,
    presetFor,
    clampFramerate,
    squiggleSettingsText,
    storeGameSettings,
    readGameSettings,
    updateGameSettings,
    normalizeSquiggleSettings,
    SETTINGS_NOTE,
    CONFIG_MAGIC
} = await import('./game-settings.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

ok('three presets, normal first', STAGE_PRESETS.length === 3 && STAGE_PRESETS[0].id === 'normal');
ok('480x360 is normal', presetFor(480, 360) === 'normal');
ok('640x360 is wide', presetFor(640, 360) === 'wide');
ok('360x640 is tall', presetFor(360, 640) === 'tall');
ok('anything else is custom', presetFor(500, 500) === 'custom');

ok('framerate rounds and clamps low', clampFramerate('3') === 10);
ok('framerate clamps high', clampFramerate(9999) === 250);
ok('framerate keeps a sane value', clampFramerate('45.4') === 45);
ok('framerate refuses junk', clampFramerate('abc') === null);

const twText = `Configuration for https://turbowarp.org/\nYou can move, resize, and minimize this comment, but don't edit it by hand. This comment can be deleted to remove the stored settings.\n{"framerate":60}${CONFIG_MAGIC}`;
const out = squiggleSettingsText(twText);
ok('the note loses the TurboWarp header', !out.includes('turbowarp.org') && out.startsWith(SETTINGS_NOTE));
ok('the note keeps the settings line exactly', out.endsWith(`{"framerate":60}${CONFIG_MAGIC}`));
ok('text without the marker is untouched', squiggleSettingsText('hello\nthere') === 'hello\nthere');

const comment = {text: twText};
const calls = [];
const vm = {
    storeProjectOptions: () => calls.push('store'),
    runtime: {findProjectOptionsComment: () => comment}
};
ok('storeGameSettings stores then rewrites the note', storeGameSettings(vm) === true && calls.length === 1 && comment.text.startsWith(SETTINGS_NOTE));
ok('storeGameSettings is safe without a vm', storeGameSettings(null) === false && storeGameSettings({}) === false);

const defaults = readGameSettings(vm);
ok('default touchMode is thumbstick and hud is enabled',
    defaults.touchMode === 'thumbstick' && defaults.hud.enabled === true && defaults.hud.scores === true);
const updated = updateGameSettings(vm, {
    touchMode: 'dpad',
    actionLabels: {Space: '  Jump ', e: 'Use'},
    hud: {teams: false}
});
ok('updateGameSettings normalizes and persists into _twconfig_',
    updated.touchMode === 'dpad' &&
    updated.actionLabels.space === 'Jump' &&
    updated.hud.teams === false &&
    updated.hud.scores === true &&
    comment.text.includes('"touchMode":"dpad"'));
const reloaded = readGameSettings({runtime: {findProjectOptionsComment: () => comment}});
ok('readGameSettings round-trips custom controls and HUD from _twconfig_',
    reloaded.touchMode === 'dpad' &&
    reloaded.actionLabels.e === 'Use' &&
    reloaded.hud.teams === false);
ok('normalizeSquiggleSettings handles invalid input safely',
    normalizeSquiggleSettings({touchMode: 'invalid'}).touchMode === 'thumbstick');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
