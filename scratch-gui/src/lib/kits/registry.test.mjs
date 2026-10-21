process.removeAllListeners('warning');

const registry = await import('./registry.js');
const {default: installBuiltinKits} = await import('./builtin.js');
const {
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
} = registry;

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
const skip = (label, reason) => console.log(`  SKIP  ${label} : ${reason}`);
const throws = (label, fn, pattern) => {
    let error = null;
    try {
        fn();
    } catch (e) {
        error = e;
    }
    ok(label, error && pattern.test(error.message), error && error.message);
};

section('reserved ids');
const FINAL = ['squiggleworld', 'squigglescenes', 'squiggleanimate', 'squiggletools', 'squiggle3d',
    'squigglescores', 'squiggleteams', 'squigglearena'];
ok('the eight final ids are reserved in order', JSON.stringify(listKits().map(kit => kit.id)) === JSON.stringify(FINAL),
    listKits().map(kit => kit.id));
ok('together stays the Together id and is not a kit', TOGETHER_ID === 'together' && !isKit('together'));
ok('expansions require Together', ['squigglescores', 'squiggleteams', 'squigglearena'].every(requiresTogether));
ok('kits do not require Together',
    ['squiggleworld', 'squigglescenes', 'squiggleanimate', 'squiggletools', 'squiggle3d'].every(id => !requiresTogether(id)));
ok('every reserved kit has a name and a #rrggbb color',
    listKits().every(kit => kit.name && /^#[0-9a-f]{6}$/.test(kit.color)));
ok('design colors for world, scenes, animate, tools',
    getKit('squiggleworld').color === '#8cc63f' && getKit('squigglescenes').color === '#5b6ee1' &&
    getKit('squiggleanimate').color === '#16b3c7' && getKit('squiggletools').color === '#b07a4f');
const before = builtinKits().map(kit => kit.id);
const worldBefore = worldKitIds();
ok('reserved kits without an extension are not builtin', listKits().every(kit => kit.extension || !before.includes(kit.id)));
ok('builtin kits all carry an extension class', builtinKits().every(kit => typeof kit.extension === 'function'));
ok('entries are frozen', Object.isFrozen(getKit('squiggleworld')));
ok('unknown ids read as null', getKit('sqworld') === null && !isKit('sqworld'));

section('layers');
ok('kit layers are the three sq- groups', JSON.stringify(KIT_LAYERS) === '["sq-tiles-back","sq-tiles-front","sq-hud"]');
ok('layer order is the design order', LAYER_ORDER.join(',') ===
    'background,video,sq-tiles-back,pen,sprite,sq-tiles-front,sq-hud');

section('registering a kit');
class KitBlocks {
    getInfo () {
        return {id: 'kit', name: 'Kit', blocks: []};
    }
}
const subject = listKits().find(kit => kit.reserved && !kit.extension) || null;
const taken = subject ? subject.id : builtinKits()[0].id;
if (subject) {
    const registered = registerKit({
        id: subject.id,
        layers: ['sq-tiles-back', 'sq-tiles-front', 'sq-tiles-back'],
        provides: ['world', 'camera'],
        extension: KitBlocks
    });
    ok(`a kit registration keeps the reserved name and color (${subject.id})`,
        registered.name === subject.name && registered.color === subject.color);
    ok('layers are deduplicated', JSON.stringify(registered.layers) === '["sq-tiles-back","sq-tiles-front"]');
    ok('provides world makes it a world kit', worldKitIds().includes(subject.id) &&
        worldKitIds().length === worldBefore.length + 1);
    ok('builtinKits lists kits with an extension', builtinKits().length === before.length + 1 &&
        builtinKits().some(kit => kit.id === subject.id && kit.extension === KitBlocks));
    ok('still reserved after registration', getKit(subject.id).reserved === true);
} else {
    skip('registering a reserved kit', 'every reserved kit already has a builtin extension');
}
throws('a second extension for the same id throws', () => registerKit({id: taken, extension: KitBlocks}),
    /already has an extension/);
throws('flipping togetherRequired on a reserved expansion throws',
    () => registerKit({id: 'squigglescores', togetherRequired: false}), /reserved with togetherRequired true/);
throws('flipping togetherRequired on a reserved kit throws',
    () => registerKit({id: 'squiggle3d', togetherRequired: true}), /reserved with togetherRequired false/);
throws('together cannot be registered', () => registerKit({id: 'together', name: 'T', color: '#123456'}), /not a kit/);
throws('ids are lowercase letters and digits', () => registerKit({id: 'Squiggle-X', name: 'X', color: '#123456'}),
    /bad kit id/);
throws('a new kit needs a name', () => registerKit({id: 'squigglenew', color: '#123456'}), /needs a name/);
throws('a new kit needs a color', () => registerKit({id: 'squigglenew', name: 'New'}), /#rrggbb color/);
throws('layers must be kit layers', () => registerKit({id: 'squigglenew', name: 'New', color: '#123456', layers: ['sprite']}),
    /unknown layer sprite/);
throws('the extension must be a class', () => registerKit({id: 'squigglenew', name: 'New', color: '#123456', extension: {}}),
    /must be a class/);
const custom = registerKit({id: 'squigglenew', name: ' New ', color: '#ABCDEF'});
ok('a new id registers unreserved, trimmed and lowercased', custom.name === 'New' && custom.color === '#abcdef' &&
    custom.reserved === false && !custom.togetherRequired);

section('installBuiltinKits');
const added = [];
const manager = {
    builtin: new Set(['together']),
    isBuiltinExtension (id) {
        return this.builtin.has(id);
    },
    addBuiltinExtension (id, extension) {
        this.builtin.add(id);
        added.push([id, extension]);
    }
};
const installed = installBuiltinKits(manager);
ok('adds each kit with an extension once', JSON.stringify(installed) === JSON.stringify(builtinKits().map(kit => kit.id)) &&
    installed.includes(taken) && (!subject || added.find(([id]) => id === subject.id)[1] === KitBlocks));
ok('a second call adds nothing', installBuiltinKits(manager).length === 0 && added.length === installed.length);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
