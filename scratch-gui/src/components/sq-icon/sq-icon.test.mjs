process.removeAllListeners('warning');

import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const {ASSETS, SOURCES, buildOutputs, parseSvg, run} = await import('./build-icons.mjs');
const {ICONS, GRID, STROKE} = await import('./icons.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

const svgDir = join(here, 'svg');
const sourceFiles = ['lucide', 'squiggle'].flatMap(folder => readdirSync(join(svgDir, folder))
    .filter(name => name.endsWith('.svg'))
    .map(name => `${folder}/${name.slice(0, -4)}`));

ok('the grid is 24 with a 2px stroke', GRID === 24 && STROKE === 2);
ok('generated files match their sources', run(true).length === 0, run(true));
const registryNames = Object.keys(ICONS).sort();
const sourceNames = Object.keys(SOURCES).sort();
ok('the registry has one entry per source name', registryNames.join() === sourceNames.join());
ok('every mapped source exists', Object.values(SOURCES).every(rel => sourceFiles.includes(rel)),
    Object.values(SOURCES).filter(rel => !sourceFiles.includes(rel)));
ok('every vendored svg is used', sourceFiles.every(rel => Object.values(SOURCES).includes(rel)),
    sourceFiles.filter(rel => !Object.values(SOURCES).includes(rel)));
ok('the Lucide licence sits next to the icons', existsSync(join(svgDir, 'lucide/LICENSE')) &&
    readFileSync(join(svgDir, 'lucide/LICENSE'), 'utf8').startsWith('ISC License'));
const notice = readFileSync(join(svgDir, 'NOTICE'), 'utf8');
ok('the notice names the source and licence', /lucide-static 1\.56\.0/.test(notice) && /ISC/.test(notice));

const ruleFailures = [];
for (const rel of sourceFiles) {
    const text = readFileSync(join(svgDir, `${rel}.svg`), 'utf8');
    const {root: attrs, shapes} = parseSvg(text, rel);
    const wrong = [];
    if (attrs.viewBox !== '0 0 24 24') wrong.push('viewBox');
    if (attrs['stroke-width'] !== '2') wrong.push('stroke-width');
    const round = attrs['stroke-linecap'] === 'round' && attrs['stroke-linejoin'] === 'round';
    if (!round) wrong.push('terminals');
    if (attrs.fill !== 'none') wrong.push('fill');
    if (shapes.some(shape => shape.extra.length)) wrong.push('shape styling');
    if (/<!--/.test(text)) wrong.push('comment');
    if (wrong.length) ruleFailures.push(`${rel}: ${wrong.join(', ')}`);
}
ok('every source is a 24px outline on 2px round strokes with no comments', ruleFailures.length === 0, ruleFailures);

const walk = d => {
    const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)/g);
    const points = [];
    let x = 0;
    let y = 0;
    let cmd = null;
    const counts = {m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0};
    let i = 0;
    while (i < tokens.length) {
        if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
        const lower = cmd.toLowerCase();
        const rel = cmd === lower;
        const args = tokens.slice(i, i + counts[lower]).map(Number);
        i += counts[lower];
        if (lower === 'z') continue;
        if (lower === 'h') x = rel ? x + args[0] : args[0];
        else if (lower === 'v') y = rel ? y + args[0] : args[0];
        else {
            const [ex, ey] = args.slice(-2);
            x = rel ? x + ex : ex;
            y = rel ? y + ey : ey;
        }
        points.push([x, y]);
        if (lower === 'm') cmd = rel ? 'l' : 'L';
    }
    return points;
};

const outside = [];
for (const rel of sourceFiles.filter(name => name.startsWith('squiggle/'))) {
    const {shapes} = parseSvg(readFileSync(join(svgDir, `${rel}.svg`), 'utf8'), rel);
    for (const shape of shapes) {
        const pts = shape.tag === 'path' ? walk(shape.attrs.d) : [];
        for (const [px, py] of pts) {
            if (px < 1 || px > 23 || py < 1 || py > 23) outside.push(`${rel} ${px},${py}`);
        }
    }
}
ok('Squiggle marks keep to the 1px safe area', outside.length === 0, outside);

const {outputs} = buildOutputs();
ok('every shell asset names a real icon', ASSETS.every(asset => ICONS[asset.icon]));
const outputFiles = Object.keys(outputs);
ok('every shell asset is generated', ASSETS.every(asset => outputFiles.some(file => file.endsWith(asset.file))));
const recoloured = ASSETS.filter(a => /full-stage|large-stage|small-stage|show|hide/.test(a.file));
ok('recoloured assets keep the recolour key', recoloured.every(a => outputs[join(root, a.file)].includes('#855CD6')));
const filled = Object.keys(ICONS).filter(name => ICONS[name].some(([, attrs]) => 'fill' in attrs));
ok('no icon carries a fill', filled.length === 0, filled);

const srcFiles = [];
const collect = dir => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'addons' && entry.name !== 'sq-icon') collect(full);
        } else if (/\.(jsx?|mjs)$/.test(entry.name) && !entry.name.endsWith('.test.mjs')) srcFiles.push(full);
    }
};
collect(join(root, 'src'));

const used = new Set();
for (const file of srcFiles) {
    const text = readFileSync(file, 'utf8');
    if (!/sq-icon/.test(text)) continue;
    for (const [, name] of text.matchAll(/sqIconDataUri\('([A-Za-z]+)'/g)) used.add(name);
    for (const [tag] of text.matchAll(/<SqIcon\b[\s\S]*?\/>/g)) {
        const nameAttr = tag.match(/name=(?:"([A-Za-z]+)"|\{([^}]*)\})/);
        if (!nameAttr) continue;
        if (nameAttr[1]) used.add(nameAttr[1]);
        else for (const [, quoted] of nameAttr[2].matchAll(/[?:]\s*'([A-Za-z]+)'/g)) used.add(quoted);
    }
    const table = text.match(/const TAB_ICONS = \{([\s\S]*?)\};/);
    if (table) for (const [, quoted] of table[1].matchAll(/'([A-Za-z]+)'/g)) used.add(quoted);
}
const missing = [...used].filter(name => !ICONS[name]);
ok('the scan finds the icons the shell uses', used.size >= 15, [...used]);
ok('every icon name used in src exists', missing.length === 0, missing);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
