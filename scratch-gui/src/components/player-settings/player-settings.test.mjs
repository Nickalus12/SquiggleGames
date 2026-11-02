process.removeAllListeners('warning');

import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {EventEmitter} from 'node:events';
import {
    DEFAULT_MOUSE_SPEED,
    MAX_BOB_AMP,
    MAX_MOUSE_SPEED,
    MAX_PANEL_PITCH,
    MAX_PITCH,
    MAX_PLAYER_FOV,
    MIN_MOUSE_SPEED,
    MIN_PANEL_PITCH,
    MIN_PITCH,
    MIN_PLAYER_FOV,
    PLAYER_SETTINGS_KEY,
    QUALITY_MODES,
    clampPanelPitch,
    clampPitch,
    createHeadBob,
    fogForDrawDistance,
    horizonForPitch,
    normalizePlayerSettings,
    readPlayerSettings,
    resetPlayerSettings,
    resolvePlayerSettings,
    stepHeadBob,
    triggerLandingBob,
    updatePlayerSettings,
    writePlayerSettings
} from '../../lib/world/player-settings.js';
import {
    GAMEPAD_LOOK_INNER,
    GAMEPAD_MOVE_INNER,
    TOUCH_LOOK_SLOP,
    createTouchLookState,
    endTouchLook,
    gamepadLookDelta,
    gamepadMoveKeys,
    gamepadMoveVector,
    gamepadRadialStick,
    isRightHalfTouch,
    moveTouchLook,
    startTouchLook,
    syncGamepadKeys
} from '../../lib/touch-keys.js';

const require = createRequire(import.meta.url);
const {transformSync} = require('@babel/core');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {IntlProvider} = require('react-intl');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${
        !cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''
    }`);
};

const makeStorage = () => {
    const map = new Map();
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, val) => map.set(key, String(val)),
        removeItem: key => map.delete(key),
        keys: () => Array.from(map.keys())
    };
};

const load = (name, stubs) => {
    const file = fileURLToPath(new URL(name, import.meta.url));
    const {code} = transformSync(readFileSync(file, 'utf8'), {
        babelrc: false,
        configFile: false,
        filename: file,
        presets: [
            [require.resolve('@babel/preset-env'), {targets: {node: 'current'}, ignoreBrowserslistConfig: true}],
            require.resolve('@babel/preset-react')
        ]
    });
    const module = {exports: {}};
    const local = id => (Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : require(id));
    new Function('require', 'module', 'exports', code)(local, module, module.exports);
    return module.exports;
};

const styles = new Proxy({}, {
    get: (unused, key) => (typeof key === 'string' && key !== '__esModule' ? key : undefined)
});

let liveView = null;
let gameSettings = {render3d: 'auto'};

const {default: PlayerSettings} = load('./player-settings.jsx', {
    '../../lib/game-settings.js': {readGameSettings: () => gameSettings},
    '../../lib/world/view3d.js': {peekView3d: () => liveView},
    '../../lib/world/player-settings.js': {
        DRAW_DISTANCES: ['near', 'normal', 'far'],
        MAX_HEAD_BOB: 100,
        MAX_MOUSE_SPEED,
        MAX_PLAYER_FOV,
        MIN_HEAD_BOB: 0,
        MIN_MOUSE_SPEED,
        MIN_PLAYER_FOV,
        PLAYER_SETTINGS_CHANGED: 'SQUIGGLE_PLAYER_3D_SETTINGS_CHANGED',
        QUALITY_MODES,
        readPlayerSettings,
        resetPlayerSettings,
        updatePlayerSettings
    },
    './player-settings.css': styles
});

const render = el => renderToStaticMarkup(React.createElement(IntlProvider, {locale: 'en'}, el));

const storage = makeStorage();
const defaults = readPlayerSettings(storage);
ok('defaults have mouse speed 10, invert off, look up and down on, head bob 100, project fov/quality, normal distance',
    defaults.mouseSpeed === DEFAULT_MOUSE_SPEED &&
    defaults.mouseSpeed === 10 &&
    defaults.invertLook === false &&
    defaults.lookUpDown === true &&
    defaults.headBob === 100 &&
    defaults.fov === null &&
    defaults.quality === null &&
    defaults.drawDistance === 'normal',
    defaults);

const clamped = normalizePlayerSettings({
    mouseSpeed: 999,
    invertLook: 1,
    lookUpDown: false,
    headBob: -20,
    fov: 180,
    quality: 'fast',
    drawDistance: 'near'
});
ok('normalizePlayerSettings clamps mouse speed 4..30, headBob 0..100, fov 75..106, quality modes',
    clamped.mouseSpeed === 30 &&
    normalizePlayerSettings({mouseSpeed: 1}).mouseSpeed === 4 &&
    normalizePlayerSettings({fov: 60}).fov === 75 &&
    clamped.invertLook === true &&
    clamped.lookUpDown === false &&
    clamped.headBob === 0 &&
    clamped.fov === 106 &&
    clamped.quality === 'fast' &&
    normalizePlayerSettings({quality: '2x'}).quality === '2x' &&
    normalizePlayerSettings({quality: 'invalid'}).quality === null &&
    clamped.drawDistance === 'near',
    clamped);

const runtime = new EventEmitter();
writePlayerSettings({mouseSpeed: 18, fov: 90, quality: 'fast', drawDistance: 'far'}, runtime, storage);
ok('settings persist under one localStorage key',
    storage.keys().length === 1 && storage.keys()[0] === PLAYER_SETTINGS_KEY);
const reloaded = readPlayerSettings(storage);
ok('saved settings reload from localStorage',
    reloaded.mouseSpeed === 18 && reloaded.fov === 90 &&
    reloaded.quality === 'fast' && reloaded.drawDistance === 'far');

const resolvedOpen = resolvePlayerSettings(reloaded, {fov: 66, fog: 40, quality: 'crisp'}, true);
ok('unlocked player settings override project fov, quality, and fog',
    resolvedOpen.fov === 90 && resolvedOpen.quality === 'fast' && resolvedOpen.fog === 0);
const resolvedLocked = resolvePlayerSettings(reloaded, {fov: 66, fog: 40, quality: 'crisp'}, false);
ok('maker lock restores project fov, fog, quality and disables player pitch/bob overrides',
    resolvedLocked.fov === 66 && resolvedLocked.fog === 40 && resolvedLocked.quality === 'crisp' &&
    resolvedLocked.lookUpDown === false && resolvedLocked.headBob === 0 && resolvedLocked.locked === true);

ok('draw distance maps near > normal > far in fog',
    fogForDrawDistance('near') > fogForDrawDistance('normal') &&
    fogForDrawDistance('normal') > fogForDrawDistance('far'));

resetPlayerSettings(runtime, storage);
ok('reset clears localStorage key and restores defaults',
    storage.keys().length === 0 && readPlayerSettings(storage).fov === null);

runtime.targets = [{
    isOriginal: true,
    blocks: {_blocks: {b1: {opcode: 'squiggle3d_showView'}}}
}];
const closedMarkup = render(React.createElement(PlayerSettings, {vm: {runtime}, storage}));
ok('a 3D project renders the gear button in the player chrome',
    closedMarkup.includes('data-testid="player-settings-gear"') &&
    closedMarkup.includes('aria-label="3D settings"') &&
    !closedMarkup.includes('data-testid="player-settings-panel"'));

liveView = {
    isOn: () => true,
    settings: () => ({fov: 75, fog: 20, eye: 50}),
    usePlayerSettings: () => true,
    setPlayerSettings: next => {
        liveView.last = next;
    }
};
const openMarkup = render(React.createElement(PlayerSettings, {vm: {runtime}, storage, defaultOpen: true}));
ok('opening the gear renders all 7 player controls with sentence case labels and only Auto/Crisp/Fast rungs',
    openMarkup.includes('>Mouse speed<') &&
    openMarkup.includes('>Invert look<') &&
    openMarkup.includes('>Look up and down<') &&
    openMarkup.includes('>Head bob<') &&
    openMarkup.includes('>Field of view<') &&
    openMarkup.includes('>Picture quality<') &&
    openMarkup.includes('>Draw distance<') &&
    openMarkup.includes('>Auto<') &&
    openMarkup.includes('>Crisp<') &&
    openMarkup.includes('>Fast<') &&
    !openMarkup.includes('>Fastest<') &&
    !openMarkup.includes('>Sharpest<'));

liveView.usePlayerSettings = () => false;
const lockedMarkup = render(React.createElement(PlayerSettings, {vm: {runtime}, storage, defaultOpen: true}));
ok('when the maker locks 3D settings the panel shows the lock banner',
    lockedMarkup.includes('data-testid="player-settings-locked"'));

ok('clampPitch hard-clamps to -89..+89 and clampPanelPitch clamps to -35..+35 degrees',
    clampPitch(0) === 0 &&
    clampPitch(95) === MAX_PITCH &&
    clampPitch(-95) === MIN_PITCH &&
    MAX_PITCH === 89 &&
    MIN_PITCH === -89 &&
    clampPanelPitch(60) === MAX_PANEL_PITCH &&
    clampPanelPitch(-60) === MIN_PANEL_PITCH &&
    MAX_PANEL_PITCH === 35 &&
    MIN_PANEL_PITCH === -35 &&
    clampPitch('bad') === 0);

const centerHorizon = horizonForPitch(0, 180, 180);
const upHorizon = horizonForPitch(30, 180, 180);
const downHorizon = horizonForPitch(-30, 180, 180);
ok('horizonForPitch keeps 0 deg at height / 2 and shifts for +/- pitch within 1..height-1',
    centerHorizon === 90 &&
    upHorizon > 90 &&
    downHorizon < 90 &&
    horizonForPitch(45, 180, 180) <= 179 &&
    horizonForPitch(-45, 180, 180) >= 1);

const bob = createHeadBob();
stepHeadBob(bob, {dx: 0.1, dy: 0, dt: 1 / 30, headBob: 100, visible: true});
ok('head bob stays 0 below 8 units/s threshold', bob.amplitude === 0 && bob.totalY === 0);

for (let i = 0; i < 15; i++) {
    stepHeadBob(bob, {dx: 2, dy: 0, dt: 1 / 30, direction: 0, headBob: 100, visible: true});
}
ok('head bob at 60 units/s reaches 2.4 px amplitude, swayX = cos(phase)*amp*0.5, and 1.5 deg strafe roll',
    bob.amplitude > 2.0 && bob.amplitude <= 2.5 && bob.phase > 0 &&
    Math.abs(bob.swayX - (Math.cos(bob.phase) * bob.amplitude * 0.5)) < 1e-6 &&
    Math.abs(bob.roll - 1.5) < 1e-6,
    bob);

const fastBob = createHeadBob();
for (let i = 0; i < 15; i++) {
    stepHeadBob(fastBob, {dx: 8, dy: 0, dt: 1 / 30, headBob: 100, visible: true});
}
ok('head bob caps amplitude at 4 px and cycles faster at higher speed',
    fastBob.amplitude <= MAX_BOB_AMP && fastBob.phase > bob.phase,
    {fast: fastBob, walk: bob});

const halfBob = createHeadBob();
for (let i = 0; i < 15; i++) {
    stepHeadBob(halfBob, {dx: 2, dy: 0, dt: 1 / 30, headBob: 50, visible: true});
}
ok('player headBob slider scales amplitude proportionally',
    Math.abs(halfBob.amplitude - (bob.amplitude * 0.5)) < 0.15,
    {half: halfBob.amplitude, full: bob.amplitude});

stepHeadBob(bob, {dx: 0, dy: 0, dt: 1 / 30, headBob: 100, visible: true});
ok('head bob sets amplitude, swayX, and landingY to 0 on the same call when speed < 8',
    bob.amplitude === 0 && bob.swayX === 0 && bob.landingY === 0 && bob.totalY === 0);

stepHeadBob(bob, {dx: 2, dy: 0, dt: 1 / 30, headBob: 100, visible: false});
ok('no head bob while the 3D view is hidden', bob.amplitude === 0 && bob.totalY === 0);

const landBob = createHeadBob();
stepHeadBob(landBob, {dx: 0, dy: 0, dt: 1 / 30, elevation: 40, headBob: 100, visible: true});
stepHeadBob(landBob, {dx: 0, dy: 0, dt: 1 / 30, elevation: 0, headBob: 100, visible: true});
const dipAfterLand = landBob.landingY;
for (let i = 0; i < 15; i++) {
    stepHeadBob(landBob, {dx: 0, dy: 0, dt: 1 / 30, elevation: 0, headBob: 100, visible: true});
}
triggerLandingBob(landBob, 4, 0);
ok('landing from elevation dips the view and decays back to 0',
    dipAfterLand > 0 && landBob.landingY === 0);

const deadStick = gamepadRadialStick(0.15, 0.15, GAMEPAD_LOOK_INNER);
const smallStick = gamepadRadialStick(0.5, 0, GAMEPAD_LOOK_INNER, 0.97, 2);
const fullStick = gamepadRadialStick(1, 0, GAMEPAD_LOOK_INNER, 0.97, 2);
ok('gamepad radial deadzone zeros inside inner radius and curves look response to 1 at outer radius',
    deadStick.magnitude === 0 &&
    smallStick.magnitude > 0 &&
    smallStick.magnitude < 0.5 &&
    fullStick.magnitude === 1);

const padLook = gamepadLookDelta(1, -1, 0.05, {mouseSpeed: 10, invertLook: false, lookUpDown: true});
const padLookFastMouse = gamepadLookDelta(1, -1, 0.05, {mouseSpeed: 30, invertLook: false, lookUpDown: true});
const padLookInverted = gamepadLookDelta(0, -1, 0.05, {mouseSpeed: 10, invertLook: true, lookUpDown: true});
const padLookNoPitch = gamepadLookDelta(0, -1, 0.05, {mouseSpeed: 10, invertLook: false, lookUpDown: false});
ok('gamepad right stick uses 200 deg/s directly without scaling by mouseSpeed',
    padLook.yawDelta > 0 &&
    padLook.yawDelta === padLookFastMouse.yawDelta &&
    padLook.pitchDelta > 0 &&
    padLookInverted.pitchDelta < 0 &&
    padLookNoPitch.pitchDelta === 0);

const backVec = gamepadMoveVector(0, 1);
const diagVec = gamepadMoveVector(1, -1);
const moveKeys = gamepadMoveKeys(
    {axes: [-0.30, -0.30], buttons: [{pressed: true}]},
    ['w', 'a', 's', 'd', 'space']
);
ok('gamepad move stick drives rescaled vector (forward 1.0, strafe 1.0, back 0.8, diagonal <= 1.0)',
    Math.abs(backVec.back - 0.8) < 1e-6 &&
    Math.abs(diagVec.magnitude - 1) < 1e-6 &&
    moveKeys.includes('w') && moveKeys.includes('a') && moveKeys.includes('space') &&
    gamepadRadialStick(0.1, 0.1, GAMEPAD_MOVE_INNER).magnitude === 0,
    {backVec, diagVec, moveKeys});

const events = [];
const held = syncGamepadKeys((name, down) => events.push(`${name}:${down}`), new Set(), ['w', 'd']);
syncGamepadKeys((name, down) => events.push(`${name}:${down}`), held, ['w']);
ok('syncGamepadKeys emits only key state transitions',
    events.join(',') === 'w:true,d:true,d:false');

const stageRect = {left: 0, top: 0, width: 640, height: 360};
const touchState = createTouchLookState();
ok('left-half touch is ignored so touch controls keep working on the left half',
    isRightHalfTouch(120, stageRect) === false &&
    startTouchLook(touchState, 1, 120, 180, stageRect) === false);
ok('right-half touch starts touch look',
    isRightHalfTouch(480, stageRect) === true &&
    startTouchLook(touchState, 1, 480, 180, stageRect) === true);
const beforeSlop = moveTouchLook(touchState, 1, 480 + TOUCH_LOOK_SLOP, 180);
const atSeventhPx = moveTouchLook(touchState, 1, 480 + TOUCH_LOOK_SLOP + 1, 180, {mouseSpeed: 30});
const afterSlop = moveTouchLook(touchState, 1, 480 + TOUCH_LOOK_SLOP + 21, 160, {mouseSpeed: 4});
endTouchLook(touchState, 1);
ok('touch look adds 0 yaw on first 6 CSS px and uses 0.30 deg/CSS px directly on the 7th px',
    beforeSlop.active === false &&
    beforeSlop.yawDelta === 0 &&
    atSeventhPx.active === true &&
    Math.abs(atSeventhPx.yawDelta - 0.30) < 1e-6 &&
    Math.abs(afterSlop.yawDelta - (20 * 0.30)) < 1e-6 &&
    afterSlop.pitchDelta > 0 &&
    touchState.pointerId === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
