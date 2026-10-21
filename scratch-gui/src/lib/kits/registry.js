const TOGETHER_ID = 'together';

const LAYER_ORDER = Object.freeze([
    'background',
    'video',
    'sq-tiles-back',
    'pen',
    'sprite',
    'sq-tiles-front',
    'sq-hud'
]);

const KIT_LAYERS = Object.freeze(LAYER_ORDER.filter(name => name.startsWith('sq-')));

const RESERVED = Object.freeze([
    {id: 'squiggleworld', name: 'World', color: '#8cc63f'},
    {id: 'squigglescenes', name: 'Scenes', color: '#5b6ee1'},
    {id: 'squiggleanimate', name: 'Animate', color: '#16b3c7'},
    {id: 'squiggletools', name: 'Game Tools', color: '#b07a4f'},
    {id: 'squiggle3d', name: '3D', color: '#5f7690'},
    {id: 'squigglescores', name: 'Scores and Rounds', color: '#f25f5c', togetherRequired: true},
    {id: 'squiggleteams', name: 'Teams and Items', color: '#2a9d8f', togetherRequired: true},
    {id: 'squigglearena', name: 'Arena', color: '#b8336a', togetherRequired: true}
]);

const ID_PATTERN = /^[a-z][a-z0-9]*$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const WORD_PATTERN = /^[a-z][a-z0-9-]*$/;

const kits = new Map();

const fail = message => {
    throw new Error(`registerKit: ${message}`);
};

const wordList = (value, label, allowed) => {
    if (typeof value === 'undefined') return Object.freeze([]);
    if (!Array.isArray(value)) fail(`${label} must be an array`);
    const seen = new Set();
    for (const word of value) {
        if (typeof word !== 'string' || !WORD_PATTERN.test(word)) fail(`bad ${label} entry ${String(word)}`);
        if (allowed && allowed.indexOf(word) === -1) fail(`unknown layer ${word}, use one of ${allowed.join(', ')}`);
        seen.add(word);
    }
    return Object.freeze(Array.from(seen));
};

const pick = (spec, key, previous, fallback) => {
    if (Object.prototype.hasOwnProperty.call(spec, key) && typeof spec[key] !== 'undefined') return spec[key];
    if (previous) return previous[key];
    return fallback;
};

const registerKit = spec => {
    if (!spec || typeof spec !== 'object') fail('needs a kit object');
    const id = spec.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) fail(`bad kit id ${String(id)}`);
    if (id === TOGETHER_ID) fail('together is the Together extension, not a kit');
    const previous = kits.get(id) || null;
    if (previous && previous.extension && spec.extension) fail(`${id} already has an extension`);

    const name = pick(spec, 'name', previous, '');
    if (typeof name !== 'string' || !name.trim()) fail(`${id} needs a name`);
    const color = pick(spec, 'color', previous, '');
    if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) fail(`${id} needs a #rrggbb color`);
    const togetherRequired = !!pick(spec, 'togetherRequired', previous, false);
    if (previous && previous.reserved && togetherRequired !== previous.togetherRequired) {
        fail(`${id} is reserved with togetherRequired ${previous.togetherRequired}`);
    }
    const extension = pick(spec, 'extension', previous, null);
    if (extension !== null && typeof extension !== 'function') fail(`${id} extension must be a class`);

    const entry = Object.freeze({
        id,
        name: name.trim(),
        color: color.toLowerCase(),
        togetherRequired,
        layers: spec.layers ? wordList(spec.layers, 'layers', KIT_LAYERS) : (previous ? previous.layers : wordList()),
        provides: spec.provides ? wordList(spec.provides, 'provides') : (previous ? previous.provides : wordList()),
        extension,
        reserved: previous ? previous.reserved : false
    });
    kits.set(id, entry);
    return entry;
};

RESERVED.forEach(spec => {
    const entry = registerKit(spec);
    kits.set(entry.id, Object.freeze(Object.assign({}, entry, {reserved: true})));
});

const getKit = id => kits.get(id) || null;

const isKit = id => kits.has(id);

const listKits = () => Array.from(kits.values());

const requiresTogether = id => {
    const kit = kits.get(id);
    return !!(kit && kit.togetherRequired);
};

const worldKitIds = () => listKits()
    .filter(kit => kit.provides.indexOf('world') !== -1)
    .map(kit => kit.id);

const builtinKits = () => listKits().filter(kit => kit.extension);

export {
    TOGETHER_ID,
    LAYER_ORDER,
    KIT_LAYERS,
    registerKit,
    getKit,
    isKit,
    listKits,
    requiresTogether,
    worldKitIds,
    builtinKits
};
