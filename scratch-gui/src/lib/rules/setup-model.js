import {RULES_KEY, RULES_ROLE, RULES_VERSION} from '../collab/project-seam.js';
import {announceKitSet} from '../collab/kit-set.js';
import {schema} from './rule-blocks.js';
import {OPCODE_SET, markOpcodeSet} from './package.js';

const LIMITS = Object.freeze({
    players: schema.limits.playerValues,
    teams: schema.limits.teams,
    boards: schema.limits.boards,
    name: schema.limits.nameLength
});

const PLAYER_ROLE = 'player';

const SEE = Object.freeze(['all', 'self']);
const ORDER = Object.freeze(['high', 'low']);
const KEEP = Object.freeze(['best', 'last']);

const cleanName = value => String(value === null || typeof value === 'undefined' ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.name);

const pick = (value, allowed) => (allowed.includes(value) ? value : allowed[0]);

const startValue = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = cleanName(value);
    if (text === '') return 0;
    const number = Number(text);
    return Number.isFinite(number) ? number : text;
};

const uniqueBy = (items, keyOf, max) => {
    const seen = new Set();
    const out = [];
    items.forEach(item => {
        const key = keyOf(item);
        if (!key || seen.has(key.toLowerCase()) || out.length >= max) return;
        seen.add(key.toLowerCase());
        out.push(item);
    });
    return out;
};

const listOf = value => (Array.isArray(value) ? value : []);

const setupVariables = target => {
    if (!target || !target.variables) return [];
    return Object.keys(target.variables)
        .map(id => target.variables[id])
        .filter(variable => variable && (variable.type === '' || variable.type === 'list'))
        .map(variable => ({
            id: variable.id,
            name: variable.name,
            kind: variable.type === 'list' ? 'list' : 'variable'
        }))
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)));
};

const fromMark = mark => {
    if (!mark || typeof mark !== 'object') return mark;
    const out = Object.assign({}, mark);
    if (Array.isArray(mark.playerValues)) {
        out.players = mark.playerValues.map(value => value && {
            name: value.n,
            default: value.d,
            see: value.see,
            save: value.save
        });
    }
    if (Array.isArray(mark.boards)) {
        out.boards = mark.boards.map(board => board && Object.assign({}, board, {
            name: typeof board.n === 'undefined' ? board.name : board.n
        }));
    }
    return out;
};

const toMark = clean => ({
    secret: clean.secret,
    saved: clean.saved,
    playerValues: clean.players.map(player => ({
        n: player.name,
        d: player.default,
        see: player.see,
        save: player.save
    })),
    teams: clean.teams,
    boards: clean.boards.map(board => ({
        n: board.name,
        order: board.order,
        keep: board.keep
    }))
});

const storageOf = target => (target && target.extensionStorage && target.extensionStorage[RULES_KEY]) || null;

const isPlayerSprite = target => {
    const mark = storageOf(target);
    return !!(mark && mark.role === PLAYER_ROLE);
};

const playerSprites = runtime => ((runtime && runtime.targets) || [])
    .filter(t => t.isOriginal && !t.isStage)
    .filter(t => {
        const mark = storageOf(t);
        return !mark || mark.role !== RULES_ROLE;
    });

const playerSpriteNames = runtime => playerSprites(runtime).map(t => t.getName());

const normalizeSetup = (setup, variables, sprites) => {
    const source = setup || {};
    const known = variables ? new Set(variables.map(variable => variable.id)) : null;
    const ids = list => Array.from(new Set(listOf(list).filter(id => typeof id === 'string' && id)))
        .filter(id => !known || known.has(id));
    const players = uniqueBy(listOf(source.players).map(player => ({
        name: cleanName(player && player.name),
        default: startValue(player && player.default),
        see: pick(player && player.see, SEE),
        save: !!(player && player.save)
    })), player => player.name, LIMITS.players);
    const teams = uniqueBy(listOf(source.teams).map(cleanName), team => team, LIMITS.teams);
    const boards = uniqueBy(listOf(source.boards).map(board => ({
        name: cleanName(board && board.name),
        order: pick(board && board.order, ORDER),
        keep: pick(board && board.keep, KEEP)
    })), board => board.name, LIMITS.boards);
    const player = typeof source.player === 'string' ? source.player : '';
    return {
        secret: ids(source.secret),
        saved: ids(source.saved),
        players,
        teams,
        boards,
        player: !sprites || sprites.includes(player) ? player : ''
    };
};

const readSetup = (target, runtime) => {
    const marked = playerSprites(runtime).find(isPlayerSprite);
    const setup = Object.assign({}, fromMark(storageOf(target)), {player: marked ? marked.getName() : ''});
    return normalizeSetup(setup, setupVariables(target), runtime ? playerSpriteNames(runtime) : null);
};

const markPlayerSprite = (runtime, name) => {
    playerSprites(runtime).forEach(sprite => {
        const chosen = sprite.getName() === name;
        if (chosen === isPlayerSprite(sprite)) return;
        const before = storageOf(sprite);
        const after = chosen ? {role: PLAYER_ROLE, v: RULES_VERSION} : null;
        if (after) sprite.extensionStorage[RULES_KEY] = after;
        else delete sprite.extensionStorage[RULES_KEY];
        announceKitSet(runtime, {scope: 'target', target: sprite, ext: RULES_KEY, before, after});
    });
};

const writeSetup = (vm, target, setup) => {
    const runtime = vm && vm.runtime;
    const clean = normalizeSetup(setup, setupVariables(target), runtime ? playerSpriteNames(runtime) : null);
    const before = target.extensionStorage[RULES_KEY];
    const mark = Object.assign({}, before, toMark(clean), {
        role: RULES_ROLE,
        v: RULES_VERSION,
        opcodeSet: Math.max(markOpcodeSet(before), OPCODE_SET)
    });
    delete mark.players;
    target.extensionStorage[RULES_KEY] = mark;
    if (runtime) {
        announceKitSet(runtime, {scope: 'target', target, ext: RULES_KEY, before, after: mark});
        markPlayerSprite(runtime, clean.player);
        if (typeof runtime.emitProjectChanged === 'function') runtime.emitProjectChanged();
    }
    return mark;
};

const blankPlayer = () => ({name: '', default: 0, see: SEE[0], save: false});
const blankBoard = () => ({name: '', order: ORDER[0], keep: KEEP[0]});

export {
    LIMITS,
    PLAYER_ROLE,
    SEE,
    ORDER,
    KEEP,
    blankBoard,
    blankPlayer,
    fromMark,
    normalizeSetup,
    playerSpriteNames,
    readSetup,
    setupVariables,
    writeSetup
};
