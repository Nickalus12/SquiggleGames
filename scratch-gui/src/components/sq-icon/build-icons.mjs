import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SVG_DIR = join(ROOT, 'src/components/sq-icon/svg');
const REGISTRY_FILE = join(ROOT, 'src/components/sq-icon/icons.js');

const GRID = 24;
const STROKE = 2;
const SHAPES = ['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'];
const SHAPE_ATTRS = {
    path: ['d'],
    circle: ['cx', 'cy', 'r'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polyline: ['points'],
    polygon: ['points'],
    ellipse: ['cx', 'cy', 'rx', 'ry']
};

const SOURCES = {
    advanced: 'lucide/zap',
    addons: 'lucide/puzzle',
    animate: 'lucide/wind',
    arrowLeft: 'lucide/arrow-left',
    art: 'lucide/brush',
    auto: 'lucide/sun-moon',
    blocks: 'lucide/blocks',
    chat: 'lucide/message-square',
    check: 'lucide/check',
    chevronDown: 'lucide/chevron-down',
    chevronRight: 'lucide/chevron-right',
    close: 'lucide/x',
    code: 'lucide/code-xml',
    columns: 'lucide/columns-2',
    crosshair: 'lucide/crosshair',
    cube: 'lucide/box',
    day: 'lucide/sun',
    dices: 'lucide/dices',
    edit: 'lucide/pencil',
    eye: 'lucide/eye',
    eyeOff: 'lucide/eye-off',
    file: 'lucide/file-text',
    flag: 'lucide/flag',
    focus: 'lucide/scan',
    gamepad: 'lucide/gamepad-2',
    help: 'lucide/circle-help',
    history: 'lucide/history',
    imagePlus: 'lucide/image-plus',
    language: 'lucide/globe',
    maximize: 'lucide/maximize',
    menu: 'lucide/menu',
    minimize: 'lucide/minimize',
    moveHorizontal: 'lucide/move-horizontal',
    moveVertical: 'lucide/move-vertical',
    night: 'lucide/moon',
    panelLeft: 'lucide/panel-left',
    panelRight: 'lucide/panel-right',
    plus: 'lucide/plus',
    room: 'lucide/users',
    rules: 'lucide/shield-check',
    scenes: 'lucide/clapperboard',
    search: 'lucide/search',
    settings: 'lucide/sliders-horizontal',
    sounds: 'lucide/volume-2',
    sprites: 'squiggle/sprite',
    stage: 'lucide/monitor',
    sync: 'lucide/refresh-cw',
    tools: 'lucide/wrench',
    trash: 'lucide/trash-2',
    trophy: 'lucide/trophy',
    upload: 'lucide/upload',
    world: 'lucide/map'
};

const WHITE = '#FFFFFF';
const INK = '#575E75';
const RECOLOR = '#855CD6';

const ASSETS = [
    {file: 'src/components/action-menu/icon--sprite.svg', icon: 'sprites', color: WHITE, size: 20},
    {file: 'src/components/action-menu/icon--backdrop.svg', icon: 'imagePlus', color: WHITE, size: 20},
    {file: 'src/components/action-menu/icon--file-upload.svg', icon: 'upload', color: WHITE, size: 20},
    {file: 'src/components/action-menu/icon--paint.svg', icon: 'art', color: WHITE, size: 20},
    {file: 'src/components/action-menu/icon--search.svg', icon: 'search', color: WHITE, size: 20},
    {file: 'src/components/action-menu/icon--surprise.svg', icon: 'dices', color: WHITE, size: 20},
    {file: 'src/components/gui/icon--extensions.svg', icon: 'blocks', color: WHITE, size: 34},
    {file: 'src/components/stage-header/icon--fullscreen.svg', icon: 'maximize', color: INK, size: 20},
    {file: 'src/components/stage-header/icon--unfullscreen.svg', icon: 'minimize', color: INK, size: 20},
    {file: 'src/components/stage-header/icon--small-stage.svg', icon: 'panelRight', color: RECOLOR, size: 20},
    {file: 'src/components/stage-header/icon--large-stage.svg', icon: 'columns', color: RECOLOR, size: 20},
    {file: 'src/components/stage-header/icon--full-stage.svg', icon: 'panelLeft', color: RECOLOR, size: 20},
    {file: 'src/components/stage-header/icon--settings.svg', icon: 'settings', color: '#000000', size: 48},
    {file: 'src/components/sprite-info/icon--show.svg', icon: 'eye', color: RECOLOR, size: 16},
    {file: 'src/components/sprite-info/icon--hide.svg', icon: 'eyeOff', color: RECOLOR, size: 16},
    {file: 'src/components/sprite-info/icon--x.svg', icon: 'moveHorizontal', color: INK, size: 16},
    {file: 'src/components/sprite-info/icon--y.svg', icon: 'moveVertical', color: INK, size: 16},
    {file: 'src/components/delete-button/icon--delete.svg', icon: 'trash', color: WHITE, size: 20},
    {file: 'src/components/close-button/icon--close.svg', icon: 'plus', color: WHITE, size: null},
    {file: 'src/lib/assets/icon--back.svg', icon: 'arrowLeft', color: WHITE, size: 20},
    {file: 'src/lib/assets/icon--help.svg', icon: 'help', color: WHITE, size: 20}
];

const attrPattern = /([a-zA-Z][\w-]*)="([^"]*)"/g;

const parseAttrs = text => {
    const attrs = {};
    for (const [, key, value] of text.matchAll(attrPattern)) attrs[key] = value;
    return attrs;
};

const parseSvg = (source, label) => {
    const open = source.match(/<svg\b([^>]*)>/);
    if (!open) throw new Error(`${label}: no <svg> element`);
    const root = parseAttrs(open[1]);
    const shapes = [];
    const elementPattern = /<([a-z]+)\b([^>]*?)\/?>/g;
    const body = source.slice(open.index + open[0].length);
    for (const [, tag, rest] of body.matchAll(elementPattern)) {
        if (tag === 'svg') continue;
        if (!SHAPES.includes(tag)) throw new Error(`${label}: unsupported <${tag}>`);
        const all = parseAttrs(rest);
        const attrs = {};
        for (const key of SHAPE_ATTRS[tag]) {
            if (typeof all[key] !== 'undefined') attrs[key] = all[key];
        }
        const extra = Object.keys(all).filter(key => !SHAPE_ATTRS[tag].includes(key));
        shapes.push({tag, attrs, extra});
    }
    return {root, shapes};
};

const loadIcon = name => {
    const rel = SOURCES[name];
    const source = readFileSync(join(SVG_DIR, `${rel}.svg`), 'utf8');
    return parseSvg(source, rel);
};

const loadAll = () => {
    const icons = {};
    for (const name of Object.keys(SOURCES).sort()) icons[name] = loadIcon(name);
    return icons;
};

const quote = value => {
    const escaped = String(value).replace(/\\/g, '\\\\');
    return `'${escaped.replace(/'/g, '\\\'')}'`;
};

const CHUNK = 72;

const valueLiteral = (value, indent) => {
    if (String(value).length <= CHUNK) return quote(value);
    const text = String(value);
    const pieces = [];
    for (let i = 0; i < text.length; i += CHUNK) pieces.push(quote(text.slice(i, i + CHUNK)));
    const pad = ' '.repeat(indent + 4);
    return `[\n${pieces.map(piece => `${pad}${piece}`).join(',\n')}\n${' '.repeat(indent)}].join('')`;
};

const shapeLiteral = ({tag, attrs}, indent = 8) => {
    const parts = Object.keys(attrs).map(key => `${key}: ${valueLiteral(attrs[key], indent)}`);
    return `[${quote(tag)}, {${parts.join(', ')}}]`;
};

const renderRegistry = icons => {
    const lines = ['const GRID = 24;', 'const STROKE = 2;', '', 'const ICONS = {'];
    const names = Object.keys(icons);
    names.forEach((name, index) => {
        const comma = index === names.length - 1 ? '' : ',';
        const shapes = icons[name].shapes.map(shape => shapeLiteral(shape));
        const oneLine = `    ${name}: [${shapes.join(', ')}]${comma}`;
        if (oneLine.length <= 120) {
            lines.push(oneLine);
            return;
        }
        lines.push(`    ${name}: [`);
        shapes.forEach((shape, i) => {
            lines.push(`        ${shape}${i === shapes.length - 1 ? '' : ','}`);
        });
        lines.push(`    ]${comma}`);
    });
    lines.push('};', '', 'export {', '    GRID,', '    ICONS,', '    STROKE', '};', '');
    return lines.join('\n');
};

const escapeAttr = value => String(value).replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

const renderAsset = (icon, {color, size}) => {
    const sizeAttrs = size ? ` width="${size}" height="${size}"` : '';
    const body = icon.shapes.map(({tag, attrs}) => {
        const parts = Object.keys(attrs).map(key => `${key}="${escapeAttr(attrs[key])}"`);
        return `<${tag} ${parts.join(' ')}/>`;
    }).join('');
    return [
        `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttrs} viewBox="0 0 ${GRID} ${GRID}" fill="none"`,
        ` stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">`,
        body,
        '</svg>\n'
    ].join('');
};

const buildOutputs = () => {
    const icons = loadAll();
    const outputs = {[REGISTRY_FILE]: renderRegistry(icons)};
    for (const asset of ASSETS) {
        outputs[join(ROOT, asset.file)] = renderAsset(icons[asset.icon], asset);
    }
    return {icons, outputs};
};

const run = check => {
    const {outputs} = buildOutputs();
    const stale = [];
    for (const [file, content] of Object.entries(outputs)) {
        let current = null;
        try {
            current = readFileSync(file, 'utf8');
        } catch (e) {
            current = null;
        }
        if (current === content) continue;
        if (check) stale.push(file);
        else writeFileSync(file, content);
    }
    return stale;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const check = process.argv.includes('--check');
    const stale = run(check);
    if (check && stale.length) {
        console.error(`out of date, run node src/components/sq-icon/build-icons.mjs:\n${stale.join('\n')}`);
        process.exit(1);
    }
    console.log(check ? 'icons up to date' : 'icons written');
}

export {
    ASSETS,
    GRID,
    SOURCES,
    STROKE,
    buildOutputs,
    parseSvg,
    run
};
