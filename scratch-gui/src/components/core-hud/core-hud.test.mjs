process.removeAllListeners('warning');

const {createRequire} = process.getBuiltinModule('module');
const {readFileSync} = process.getBuiltinModule('fs');
const {fileURLToPath} = process.getBuiltinModule('url');
const {EventEmitter} = process.getBuiltinModule('events');

const loadPkg = createRequire(import.meta.url);
const {transformSync} = loadPkg('@babel/core');
const React = loadPkg('react');
const {renderToStaticMarkup} = loadPkg('react-dom/server');
const {IntlProvider} = loadPkg('react-intl');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    const extra = !cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : '';
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra}`);
};

const load = (name, stubs) => {
    const file = fileURLToPath(new URL(name, import.meta.url));
    const presets = [
        [loadPkg.resolve('@babel/preset-env'), {targets: {node: 'current'}, ignoreBrowserslistConfig: true}],
        loadPkg.resolve('@babel/preset-react')
    ];
    const {code} = transformSync(readFileSync(file, 'utf8'), {
        babelrc: false,
        configFile: false,
        filename: file,
        presets
    });
    const mod = {exports: {}};
    const local = id => (Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : loadPkg(id));
    new Function('require', 'module', 'exports', code)(local, mod, mod.exports);
    return mod.exports;
};

const styles = new Proxy({}, {
    get: (unused, key) => (typeof key === 'string' && key !== '__esModule' ? key : null)
});
const face = load('./hud-face.jsx', {});
let fixture = null;
let extracts = 0;
const state = {
    extractHudState: () => {
        extracts++;
        return JSON.parse(JSON.stringify(fixture));
    }
};
const {default: CoreHud} = load('./core-hud.jsx', {
    '../../lib/core-hud-state.js': state,
    './hud-face.jsx': face,
    './core-hud.css': styles
});

const vitals = over => Object.assign({
    hp: 100,
    maxHp: 100,
    hpLabel: 'HP',
    hpKind: 'health',
    shield: 50,
    maxShield: 100,
    shieldKind: 'armor',
    ammo: 40,
    ammoKinds: [],
    weapon: {slot: 3, slots: 3},
    items: [{id: 'gold_key', label: 'Gold key', tone: 'gold', count: 1, owned: true}],
    mood: 'great'
}, over);

const hudOf = (v, bar) => ({
    enabled: true,
    sections: {},
    hasHudContent: true,
    timer: null,
    teams: [{name: 'Red', score: 0, tone: 'red'}, {name: 'Blue', score: 0, tone: 'blue'}],
    vitals: v,
    leaderboard: {boardName: 'Frags', rows: [{rank: 1, slot: 1, name: 'You', score: 2, isMe: true}]},
    statusPill: '',
    bar: Object.assign({layout: 'band', frags: {label: 'Frags', value: 2, place: 1}, foldsBoard: true}, bar),
    replaces: {bar: !!v, timer: false}
});

const render = el => renderToStaticMarkup(React.createElement(IntlProvider, {locale: 'en'}, el));
const band = (v, bar, hurt) => {
    const hud = hudOf(v, bar);
    return render(React.createElement(CoreHud.StatusBand, {vitals: hud.vitals, bar: hud.bar, hurt: !!hurt}));
};

const full = band(vitals());
ok('the band names itself for screen readers', full.indexOf('aria-label="Player status"') !== -1);
ok('the band shows health, armor and ammo with sentence case labels',
    full.indexOf('>Health<') !== -1 && full.indexOf('>Armor<') !== -1 && full.indexOf('>Ammo<') !== -1 &&
    full.indexOf('>100<') !== -1 && full.indexOf('>50<') !== -1 && full.indexOf('>40<') !== -1);
ok('slots run ammo, health, weapon, face, armor, keys, frags',
    ['ammo', 'health', 'weapon', 'face', 'armor', 'items', 'frags']
        .map(slot => full.indexOf(`data-slot="${slot}"`))
        .every((at, i, all) => at !== -1 && (i === 0 || at > all[i - 1])), full);
ok('the current weapon keycap is lit and announced',
    /class="keycap keycapOn">3</.test(full) && full.indexOf('Weapon 3 of 3') !== -1);
ok('a found key says so', full.indexOf('Gold key, found') !== -1 && full.indexOf('itemOwned') !== -1);
ok('full health shows a great face', full.indexOf('data-mood="great"') !== -1 &&
    full.indexOf('Squiggle is feeling great') !== -1);
ok('frags sit in the band', full.indexOf('data-slot="frags"') !== -1 && full.indexOf('>Frags<') !== -1);

ok('a hit swaps the face to ouch', band(vitals(), {}, true).indexOf('data-mood="ouch"') !== -1);
ok('knocked out stays knocked out through a hit', band(vitals({hp: 0, mood: 'out'}), {}, true)
    .indexOf('data-mood="out"') !== -1);
const low = band(vitals({hp: 12, mood: 'low'}));
ok('low health turns the number to the danger tone', /slotHealth toneDanger/.test(low));
const shield = band(vitals({shieldKind: 'shield'}));
ok('a shield game says Shield, not Armor', shield.indexOf('>Shield<') !== -1 && shield.indexOf('>Armor<') === -1);
const missing = band(vitals({items: [{id: 'red_key', label: 'Red key', tone: 'red', count: 0, owned: false}]}));
ok('a key still to find is dimmed and says so', missing.indexOf('Red key, not found yet') !== -1 &&
    missing.indexOf('itemOwned') === -1);

const compact = band(vitals({shield: null, ammo: null, weapon: null, items: [], hpKind: 'lives', hp: 3}),
    {layout: 'compact', frags: null, foldsBoard: false});
ok('the compact bar has no face and says Lives', compact.indexOf('data-slot="face"') === -1 &&
    compact.indexOf('>Lives<') !== -1 && compact.indexOf('bandCompact') !== -1);
ok('nothing renders without vitals', band(null, {}) === '');

const target = name => ({
    isOriginal: true,
    visible: true,
    getName: () => name,
    setVisible (on) {
        this.visible = on;
    }
});
const status = target('StatusHUD');
const timerSprite = target('TimerHUD');
const hero = target('Trooper');
const runtime = new EventEmitter();
runtime.targets = [status, timerSprite, hero];
const vm = {runtime};

fixture = hudOf(vitals());
const hud = new CoreHud({vm});
hud.setState = patch => Object.assign(hud.state, typeof patch === 'function' ? patch(hud.state) : patch);
hud.componentDidMount();
ok('a shown status band hides the game\'s own StatusHUD sprite', status.visible === false);
ok('no timer means TimerHUD and other sprites stay visible', timerSprite.visible === true && hero.visible === true);
ok('the board folds into the band in solo play', !render(hud.render()).includes('core-hud-leaderboard') &&
    render(hud.render()).includes('core-hud-band'));

const before = extracts;
for (let i = 0; i < 30; i++) runtime.emit('AFTER_EXECUTE');
ok('thirty ticks inside 100 ms read the game at most once', extracts - before <= 1, extracts - before);

fixture = hudOf(vitals({hp: 70, mood: 'good'}));
hud.handleForceRefresh();
ok('losing health flashes the hurt face', hud.state.hurt === true && hud.state.hud.vitals.hp === 70);
await new Promise(resolve => setTimeout(resolve, 700));
ok('the hurt flash clears on its own', hud.state.hurt === false);

fixture = hudOf(vitals({hp: 90, mood: 'great'}));
hud.handleForceRefresh();
ok('healing does not flash', hud.state.hurt === false);

const same = hud.state.hud;
hud.handleForceRefresh();
ok('an unchanged game does not set state', hud.state.hud === same);

fixture = Object.assign(hudOf(null), {bar: null});
hud.handleForceRefresh();
ok('when the band goes away the game\'s own StatusHUD comes back', status.visible === true);

fixture = Object.assign(hudOf(vitals()), {replaces: {bar: false, timer: false}});
hud.handleForceRefresh();
ok('a band that keeps the game\'s own HUD leaves StatusHUD alone', status.visible === true);

fixture = hudOf(vitals());
hud.handleForceRefresh();
hud.componentWillUnmount();
ok('unmounting gives the sprite back and stops listening',
    status.visible === true && runtime.listenerCount('AFTER_EXECUTE') === 0);

const shy = target('StatusHUD');
shy.visible = false;
runtime.targets = [shy];
const hud2 = new CoreHud({vm});
hud2.setState = patch => Object.assign(hud2.state, patch);
hud2.componentDidMount();
hud2.componentWillUnmount();
ok('a sprite the game hid itself stays hidden after unmount', shy.visible === false);

const cssSource = readFileSync(fileURLToPath(new URL('./core-hud.css', import.meta.url)), 'utf8');
const fontSizes = [...cssSource.matchAll(/font-size:\s*([^;]+);/g)].map(m => m[1].trim());
const sub14 = fontSizes.filter(val => {
    const px = [...val.matchAll(/(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
    return px.some(n => n < 14);
});
ok('every HUD font-size rule stays 14px or larger', sub14.length === 0, sub14);
ok('face porthole locks a 1:1 aspect ratio so it stays round on phones',
    /\.faceSlot\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/.test(cssSource));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
