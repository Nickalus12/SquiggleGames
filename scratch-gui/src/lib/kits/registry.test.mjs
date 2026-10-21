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
ok('reserved kits carry no extension, so nothing is stubbed', builtinKits().length === 0);
ok('no world kit until a kit says so', worldKitIds().length === 0);
ok('entries are frozen', Object.isFrozen(getKit('squiggleworld')));
ok('unknown ids read as null', getKit('sqworld') === null && !isKit('sqworld'));

section('layers');
ok('kit layers are the three sq- groups', JSON.stringify(KIT_LAYERS) === '["sq-tiles-back","sq-tiles-front","sq-hud"]');
ok('layer order is the design order', LAYER_ORDER.join(',') ===
    'background,video,sq-tiles-back,pen,sprite,sq-tiles-front,sq-hud');

section('registering a kit');
class WorldBlocks {
    getInfo () {
        return {id: 'squiggleworld', name: 'World', blocks: []};
    }
}
const world = registerKit({
    id: 'squiggleworld',
    layers: ['sq-tiles-back', 'sq-tiles-front', 'sq-tiles-back'],
    provides: ['world', 'camera'],
    extension: WorldBlocks
});
ok('a kit registration keeps the reserved name and color', world.name === 'World' && world.color === '#8cc63f');
ok('layers are deduplicated', JSON.stringify(world.layers) === '["sq-tiles-back","sq-tiles-front"]');
ok('provides world makes it a world kit', JSON.stringify(worldKitIds()) === '["squiggleworld"]');
ok('builtinKits lists kits with an extension', builtinKits().length === 1 && builtinKits()[0].extension === WorldBlocks);
ok('still reserved after registration', getKit('squiggleworld').reserved === true);
throws('a second extension for the same id throws', () => registerKit({id: 'squiggleworld', extension: WorldBlocks}),
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
ok('adds each kit with an extension once', JSON.stringify(installBuiltinKits(manager)) === '["squiggleworld"]' &&
    added[0][1] === WorldBlocks);
ok('a second call adds nothing', installBuiltinKits(manager).length === 0 && added.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
