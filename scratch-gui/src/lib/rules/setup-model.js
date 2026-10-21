import {RULES_KEY, RULES_ROLE, RULES_VERSION} from '../collab/project-seam.js';
import {announceKitSet} from '../collab/kit-set.js';
import {schema} from './rule-blocks.js';

const LIMITS = Object.freeze({
    players: schema.limits.playerValues,
    teams: schema.limits.teams,
    boards: schema.limits.boards,
    name: 40
});

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

const normalizeSetup = (setup, variables) => {
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
    return {
        secret: ids(source.secret),
        saved: ids(source.saved),
        players,
        teams,
        boards
    };
};

const readSetup = target => {
    const mark = target && target.extensionStorage && target.extensionStorage[RULES_KEY];
    return normalizeSetup(mark, setupVariables(target));
};

const writeSetup = (vm, target, setup) => {
    const clean = normalizeSetup(setup, setupVariables(target));
    const before = target.extensionStorage[RULES_KEY];
    const mark = Object.assign({}, before, clean, {
        role: RULES_ROLE,
        v: RULES_VERSION
    });
    target.extensionStorage[RULES_KEY] = mark;
    if (vm && vm.runtime) {
        announceKitSet(vm.runtime, {scope: 'target', target, ext: RULES_KEY, before, after: mark});
        if (typeof vm.runtime.emitProjectChanged === 'function') vm.runtime.emitProjectChanged();
    }
    return mark;
};

const blankPlayer = () => ({name: '', default: 0, see: SEE[0], save: false});
const blankBoard = () => ({name: '', order: ORDER[0], keep: KEEP[0]});

export {
    LIMITS,
    SEE,
    ORDER,
    KEEP,
    blankBoard,
    blankPlayer,
    normalizeSetup,
    readSetup,
    setupVariables,
    writeSetup
};
