process.removeAllListeners('warning');

import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {EventEmitter} from 'node:events';
import {
    PLAYER_SETTINGS_KEY,
    fogForDrawDistance,
    normalizePlayerSettings,
    readPlayerSettings,
    resetPlayerSettings,
    resolvePlayerSettings,
    updatePlayerSettings,
    writePlayerSettings
} from '../../lib/world/player-settings.js';

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
        MAX_MOUSE_SPEED: 40,
        MAX_PLAYER_FOV: 110,
        MIN_HEAD_BOB: 0,
        MIN_MOUSE_SPEED: 2,
        MIN_PLAYER_FOV: 70,
        PLAYER_SETTINGS_CHANGED: 'SQUIGGLE_PLAYER_3D_SETTINGS_CHANGED',
        QUALITY_MODES: ['auto', 'crisp', 'fast', 'fastest', 'sharpest'],
        readPlayerSettings,
        resetPlayerSettings,
        updatePlayerSettings
    },
    './player-settings.css': styles
});

const render = el => renderToStaticMarkup(React.createElement(IntlProvider, {locale: 'en'}, el));

const storage = makeStorage();
const defaults = readPlayerSettings(storage);
ok('defaults have mouse speed 12, invert off, look up and down on, head bob 100, project fov/quality, normal distance',
    defaults.mouseSpeed === 12 &&
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
    quality: 'sharpest',
    drawDistance: 'near'
});
ok('normalizePlayerSettings clamps mouse speed 2..40, headBob 0..100, fov 70..110',
    clamped.mouseSpeed === 40 &&
    clamped.invertLook === true &&
    clamped.lookUpDown === false &&
    clamped.headBob === 0 &&
    clamped.fov === 110 &&
    clamped.quality === 'sharpest' &&
    clamped.drawDistance === 'near',
    clamped);

const runtime = new EventEmitter();
writePlayerSettings({mouseSpeed: 18, fov: 90, quality: 'fastest', drawDistance: 'far'}, runtime, storage);
ok('settings persist under one localStorage key',
    storage.keys().length === 1 && storage.keys()[0] === PLAYER_SETTINGS_KEY);
const reloaded = readPlayerSettings(storage);
ok('saved settings reload from localStorage',
    reloaded.mouseSpeed === 18 && reloaded.fov === 90 &&
    reloaded.quality === 'fastest' && reloaded.drawDistance === 'far');

const resolvedOpen = resolvePlayerSettings(reloaded, {fov: 66, fog: 40, quality: 'crisp'}, true);
ok('unlocked player settings override project fov, quality, and fog',
    resolvedOpen.fov === 90 && resolvedOpen.quality === 'fastest' && resolvedOpen.fog === 0);
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
ok('opening the gear renders all 7 player controls with sentence case labels',
    openMarkup.includes('>Mouse speed<') &&
    openMarkup.includes('>Invert look<') &&
    openMarkup.includes('>Look up and down<') &&
    openMarkup.includes('>Head bob<') &&
    openMarkup.includes('>Field of view<') &&
    openMarkup.includes('>Picture quality<') &&
    openMarkup.includes('>Draw distance<') &&
    openMarkup.includes('>Fastest<') &&
    openMarkup.includes('>Sharpest<'));

liveView.usePlayerSettings = () => false;
const lockedMarkup = render(React.createElement(PlayerSettings, {vm: {runtime}, storage, defaultOpen: true}));
ok('when the maker locks 3D settings the panel shows the lock banner',
    lockedMarkup.includes('data-testid="player-settings-locked"'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
