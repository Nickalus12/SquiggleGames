import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../..');
const nodeRequire = createRequire(import.meta.url);
const babel = nodeRequire('@babel/core');

const BABEL_OPTIONS = {
    babelrc: false,
    configFile: false,
    presets: [
        [nodeRequire.resolve('@babel/preset-env'), {targets: {node: 'current'}, modules: 'commonjs'}],
        nodeRequire.resolve('@babel/preset-react')
    ]
};

const cache = new Map();

const resolveLocal = (from, spec) => {
    const base = path.resolve(path.dirname(from), spec);
    const tries = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')];
    const found = tries.find(file => fs.existsSync(file) && fs.statSync(file).isFile());
    if (!found) throw new Error(`cannot resolve ${spec} from ${from}`);
    return found;
};

const load = file => {
    if (cache.has(file)) return cache.get(file).exports;
    const module = {exports: {}};
    cache.set(file, module);
    const {code} = babel.transformSync(fs.readFileSync(file, 'utf8'), {...BABEL_OPTIONS, filename: file});
    const localRequire = spec => {
        if (/\.(svg|png)$/.test(spec)) return path.relative(src, resolveLocal(file, spec));
        if (spec.startsWith('.')) return load(resolveLocal(file, spec));
        return nodeRequire(spec);
    };
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
    return module.exports;
};

const cards = load(path.join(here, 'index.jsx'));
const tags = load(path.join(src, 'lib/libraries/tw-extension-tags.js'));
const registry = load(path.join(src, 'lib/kits/registry.js'));
const helpers = load(path.join(src, 'components/extension-library/extension-cards.js'));

const library = cards.default;
const galleryCards = [cards.galleryLoading, cards.galleryMore, cards.galleryError];
const pills = tags.default;
const {TAG_IDS, isSquiggleItem} = tags;
const {squiggleFirst, tagChipsFor, isTogetherRequired, MAX_TAG_CHIPS} = helpers;

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${typeof detail === 'undefined' ? '' : ` : ${JSON.stringify(detail)}`}`);
    }
};
const section = name => console.log(`\n${name}`);

const textOf = node => {
    if (typeof node === 'string') return node;
    if (node && node.props && typeof node.props.defaultMessage === 'string') return node.props.defaultMessage;
    return '';
};

const EXPANSIONS = ['squigglescores', 'squiggleteams', 'squigglearena'];
const KITS = ['squiggleworld', 'squigglescenes', 'squiggleanimate', 'squiggletools', 'squiggle3d'];
const byId = new Map(library.map(card => [card.extensionId, card]));

section('ids');
const ids = library.map(card => card.extensionId);
ok('every card has an extensionId', ids.every(id => typeof id === 'string' && id.length > 0));
ok('card ids are unique', new Set(ids).size === ids.length, ids.filter((id, i) => ids.indexOf(id) !== i));
ok('every reserved kit id has a card', registry.listKits().every(kit => byId.has(kit.id)),
    registry.listKits().filter(kit => !byId.has(kit.id)).map(kit => kit.id));
ok('the Together card is present', byId.has(registry.TOGETHER_ID));

section('togetherRequired');
const required = library.filter(card => card.togetherRequired).map(card => card.extensionId);
ok('exactly the three expansions carry togetherRequired', JSON.stringify(required.slice().sort()) ===
    JSON.stringify(EXPANSIONS.slice().sort()), required);
ok('every togetherRequired card is a registry id with togetherRequired',
    required.every(id => registry.isKit(id) && registry.getKit(id).togetherRequired === true), required);
ok('every registry kit that requires Together has a togetherRequired card', registry.listKits()
    .filter(kit => kit.togetherRequired)
    .every(kit => byId.get(kit.id) && byId.get(kit.id).togetherRequired === true));
ok('the five kits and Together carry no badge', KITS.concat(registry.TOGETHER_ID)
    .every(id => byId.get(id) && !byId.get(id).togetherRequired));
ok('isTogetherRequired falls back to the registry', isTogetherRequired({extensionId: 'squigglearena'}) &&
    !isTogetherRequired({extensionId: 'squiggleworld'}) && !isTogetherRequired({extensionId: 'pen'}));

section('names and lines');
EXPANSIONS.concat(KITS).forEach(id => {
    const card = byId.get(id);
    ok(`${id} title matches the registry name`, textOf(card.name) === registry.getKit(id).name,
        [textOf(card.name), registry.getKit(id).name]);
    const line = textOf(card.description);
    ok(`${id} has one kid-words line`, line.length > 0 && line.length <= 80 && !/[\n—]/.test(line), line);
});
ok('no em dash in any Squiggle card text', library.filter(isSquiggleItem)
    .every(card => !/—/.test(textOf(card.name) + textOf(card.description))));

section('sorting');
const firstClassic = library.findIndex(card => !isSquiggleItem(card));
const lastSquiggle = library.map(isSquiggleItem).lastIndexOf(true);
ok('Squiggle cards come before every classic card', firstClassic === -1 || lastSquiggle < firstClassic,
    {firstClassic, lastSquiggle});
ok('Together is the first card', library[0].extensionId === registry.TOGETHER_ID);
const shuffled = library.slice().reverse();
const sorted = squiggleFirst(shuffled);
ok('squiggleFirst puts every Squiggle card first', sorted.map(isSquiggleItem).lastIndexOf(true) <
    sorted.findIndex(card => !isSquiggleItem(card)));
ok('squiggleFirst keeps order inside each group', JSON.stringify(sorted.filter(isSquiggleItem)
    .map(card => card.extensionId)) === JSON.stringify(shuffled.filter(isSquiggleItem).map(card => card.extensionId)));
ok('squiggleFirst keeps separators and strings out of the Squiggle group', !isSquiggleItem('---'));

section('tags');
library.concat(galleryCards).forEach(card => {
    const bad = (card.tags || []).filter(tag => TAG_IDS.indexOf(tag) === -1);
    ok(`${card.extensionId} tags are in the tag table`, Array.isArray(card.tags) && card.tags.length > 0 &&
        bad.length === 0, bad);
});
ok('every card has at most three tags', library.every(card => card.tags.length <= MAX_TAG_CHIPS));
const pillTags = pills.map(pill => pill.tag);
ok('pills are Multiplayer, Game World, FX and UI, Classic in order',
    JSON.stringify(pills.map(pill => pill.intlLabel.defaultMessage)) ===
    JSON.stringify(['Multiplayer', 'Game World', 'FX and UI', 'Classic']));
const reachable = new Set();
pills.forEach(pill => (pill.matches || [pill.tag]).forEach(tag => reachable.add(tag)));
ok('every pill tag is in the tag table', pillTags.every(tag => TAG_IDS.indexOf(tag) !== -1));
ok('every tag in the table is reachable from a pill', TAG_IDS.every(tag => reachable.has(tag)),
    TAG_IDS.filter(tag => !reachable.has(tag)));
ok('every pill has a sq.* message id', pills.every(pill => /^sq\./.test(pill.intlLabel.id)));

section('tag chips');
const chips = tagChipsFor(['multiplayer', 'world', 'fx', 'ui', 'classic', 'nope']);
ok('chips stop at three', chips.length === 3, chips.map(chip => chip.tag));
ok('classic and unknown tags make no chip', tagChipsFor(['classic', 'nope']).length === 0);
ok('chips carry a label', chips.every(chip => chip.label && chip.label.defaultMessage));

section('art');
const svgSize = file => {
    const text = fs.readFileSync(path.join(src, file), 'utf8');
    const match = text.match(/<svg[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/);
    return {text, size: match ? `${match[1]}x${match[2]}` : null};
};
EXPANSIONS.concat(KITS, registry.TOGETHER_ID).forEach(id => {
    const art = svgSize(byId.get(id).iconURL);
    ok(`${id} card art is 192x120 with no baked text`, art.size === '192x120' && !/<text/.test(art.text), art.size);
});
ok('together-small.svg is 40x40', svgSize(byId.get(registry.TOGETHER_ID).insetIconURL).size === '40x40');
const badge = svgSize('components/library-item/together-room.svg');
ok('the Together Room badge is 20x20', badge.size === '20x20');
ok('the badge is labelled Together Room', /aria-label="Together Room"/.test(badge.text));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
