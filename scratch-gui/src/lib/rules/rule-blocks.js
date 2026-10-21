import schema from './rules-schema.json';
import {RULES_COLORS} from '../themes/tokens.js';
import {RULES_KEY, isRulesTarget} from '../collab/project-seam.js';

const BLOCK_TYPES = Object.freeze({
    hat: 'event',
    command: 'command',
    loop: 'conditional',
    reporter: 'reporter',
    boolean: 'Boolean'
});

const MENU_METHODS = Object.freeze({
    gameValues: 'ruleMenuGameValues',
    playerValues: 'ruleMenuPlayerValues',
    timers: 'ruleMenuTimers',
    teams: 'ruleMenuTeams',
    boards: 'ruleMenuBoards',
    sendTo: 'ruleMenuSendTo'
});

const EMPTY_MENU = Object.freeze([{text: 'none yet', value: ''}]);
const OPEN_RULES_FUNC = 'openGameRules';
const OPEN_SETUP_FUNC = 'openGameSetup';

const specsOf = card => (schema.cards[card] || []).filter(spec => spec && typeof spec === 'object');

const ruleOpcodes = card => specsOf(card).map(spec => spec.opcode);

const ruleOpcodeSet = () => {
    const set = new Set();
    Object.keys(schema.cards).forEach(card => {
        ruleOpcodes(card).forEach(opcode => set.add(`${card}_${opcode}`));
    });
    return set;
};

const ruleCards = () => Object.keys(schema.cards);

const toArgument = arg => {
    const out = {type: arg.type === 'number' ? 'number' : 'string', defaultValue: arg.default};
    if (arg.menu) out.menu = arg.menu;
    return out;
};

const toBlock = spec => {
    const block = {
        opcode: spec.opcode,
        blockType: BLOCK_TYPES[spec.type],
        text: spec.text,
        color1: RULES_COLORS.color1,
        color2: RULES_COLORS.color2,
        color3: RULES_COLORS.color3
    };
    if (spec.type === 'hat') {
        block.isEdgeActivated = false;
        block.shouldRestartExistingThreads = false;
    }
    if (spec.type === 'loop') block.branchCount = 1;
    if (spec.type === 'reporter' || spec.type === 'boolean') block.disableMonitor = true;
    if (spec.args) {
        block.arguments = {};
        Object.keys(spec.args).forEach(key => {
            block.arguments[key] = toArgument(spec.args[key]);
        });
    }
    return block;
};

const ruleBlocks = card => (schema.cards[card] || []).map(spec => (spec === '---' ? '---' : toBlock(spec)));

const usedMenus = card => {
    const names = new Set();
    specsOf(card).forEach(spec => {
        Object.keys(spec.args || {}).forEach(key => {
            if (spec.args[key].menu) names.add(spec.args[key].menu);
        });
    });
    return names;
};

const ruleMenus = card => {
    const menus = {};
    usedMenus(card).forEach(name => {
        menus[name] = {acceptReporters: true, items: MENU_METHODS[name]};
    });
    return menus;
};

const openRulesButton = text => ({
    blockType: 'button',
    text: text || 'Open Game Rules',
    func: OPEN_RULES_FUNC
});

const setupButton = text => ({
    blockType: 'button',
    text: text || 'Game setup',
    func: OPEN_SETUP_FUNC
});

const findRulesTarget = runtime => (runtime && runtime.targets ?
    runtime.targets.find(target => target.isOriginal && isRulesTarget(target)) || null :
    null);

const rulesMark = runtime => {
    const target = findRulesTarget(runtime);
    return target ? target.extensionStorage[RULES_KEY] : null;
};

const asMenu = names => {
    const unique = Array.from(new Set(names.filter(name => typeof name === 'string' && name)));
    return unique.length ? unique.map(name => ({text: name, value: name})) : EMPTY_MENU.slice();
};

const namesOf = list => (Array.isArray(list) ? list.map(item => (
    item && typeof item === 'object' ? item.name : item
)) : []);

const timerNames = target => {
    if (!target || !target.blocks || !target.blocks._blocks) return [];
    const names = [];
    const all = target.blocks._blocks;
    Object.keys(all).forEach(id => {
        const block = all[id];
        if (!block || !/_menu_timers$/.test(block.opcode)) return;
        const field = block.fields && block.fields.timers;
        if (field && field.value) names.push(String(field.value));
    });
    return names;
};

const menuItems = (runtime, name) => {
    const target = findRulesTarget(runtime);
    const mark = target ? target.extensionStorage[RULES_KEY] : null;
    switch (name) {
    case 'gameValues':
        return asMenu(target ? Object.keys(target.variables)
            .map(id => target.variables[id])
            .filter(variable => variable.type === '')
            .map(variable => variable.name) : []);
    case 'playerValues':
        return asMenu(namesOf(mark && mark.players));
    case 'timers':
        return asMenu(['timer'].concat(timerNames(target)));
    case 'teams':
        return asMenu(namesOf(mark && mark.teams));
    case 'boards':
        return asMenu(namesOf(mark && mark.boards));
    case 'sendTo':
        return asMenu(schema.menus.sendTo.items);
    default:
        return EMPTY_MENU.slice();
    }
};

const noop = () => {};

const installRuleMethods = (extension, card) => {
    usedMenus(card).forEach(name => {
        extension[MENU_METHODS[name]] = () => menuItems(extension.runtime, name);
    });
    ruleOpcodes(card).forEach(opcode => {
        if (typeof extension[opcode] !== 'function') extension[opcode] = noop;
    });
    return extension;
};

export {
    schema,
    OPEN_RULES_FUNC,
    OPEN_SETUP_FUNC,
    MENU_METHODS,
    ruleCards,
    ruleOpcodes,
    ruleOpcodeSet,
    ruleBlocks,
    ruleMenus,
    openRulesButton,
    setupButton,
    installRuleMethods,
    findRulesTarget,
    rulesMark,
    menuItems
};
