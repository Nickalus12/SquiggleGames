process.removeAllListeners('warning');

const {createRequire} = process.getBuiltinModule('module');
const {readFileSync} = process.getBuiltinModule('fs');
const {fileURLToPath} = process.getBuiltinModule('url');

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
const {default: TouchControls} = load('./touch-game-controls.jsx', {
    './touch-game-controls.css': styles
});

const render = el => renderToStaticMarkup(React.createElement(IntlProvider, {locale: 'en'}, el));
const paint = props => render(React.createElement(TouchControls, Object.assign({
    keys: ['space', 'e', 'shift', 'f'],
    actionLabels: {},
    onKey: () => null,
    layout: 'bottom',
    touchMode: 'thumbstick'
}, props)));
const chunk = (html, key) => {
    const matched = html.match(new RegExp(`<button[^>]*data-touch-key="${key}"[\\s\\S]*?<\\/button>`));
    return matched ? matched[0] : '';
};

const jumping = paint({hasJump: true});
const spaceJump = chunk(jumping, 'space');
ok('space with a jump script says Jump and tags Space',
    spaceJump.includes('>Jump<') && spaceJump.includes('>Space<') && spaceJump.includes('keyTag') &&
    spaceJump.includes('aria-label="Jump, Space"'),
    spaceJump);
const use = chunk(jumping, 'e');
ok('e says Use and tags E',
    use.includes('>Use<') && use.includes('>E<') && use.includes('keyTag'), use);
const dash = chunk(jumping, 'shift');
ok('shift says Dash and tags Shift',
    dash.includes('>Dash<') && dash.includes('>Shift<') && dash.includes('keyTag'), dash);
const letter = chunk(jumping, 'f');
ok('a letter with no derived word stays the key and has no tag',
    letter.includes('>F<') && letter.includes('aria-label="F key"') && !letter.includes('keyTag'), letter);

const acting = paint({hasJump: false});
const spaceAct = chunk(acting, 'space');
ok('space without a jump script says Action and tags Space',
    spaceAct.includes('>Action<') && spaceAct.includes('>Space<') && !spaceAct.includes('>Jump<'),
    spaceAct);

const custom = paint({
    hasJump: true,
    actionLabels: {space: 'Fire', e: 'Door'}
});
const fire = chunk(custom, 'space');
ok('a custom label wins and the key stays a tag',
    fire.includes('>Fire<') && fire.includes('>Space<') && !fire.includes('>Jump<'), fire);
const door = chunk(custom, 'e');
ok('a custom E label replaces Use',
    door.includes('>Door<') && door.includes('>E<') && !door.includes('>Use<'), door);

const container = readFileSync(
    fileURLToPath(new URL('../../containers/touch-game-controls.jsx', import.meta.url)),
    'utf8'
);
ok('PROJECT_LOADED is listened on the runtime',
    /vm\.runtime\.on\('PROJECT_LOADED', this\.scheduleScan\)/.test(container) &&
    /vm\.runtime\.removeListener\('PROJECT_LOADED', this\.scheduleScan\)/.test(container) &&
    !/vm\.on\('PROJECT_LOADED'/.test(container) &&
    !/vm\.off\('PROJECT_LOADED'/.test(container));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
