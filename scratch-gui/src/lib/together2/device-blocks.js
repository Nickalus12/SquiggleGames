import {applyTick, createGameState, playerName, playerValue, teamName} from './game-state.js';
import {gameServerReady} from '../rules/flags.js';
import {MENU_METHODS, menuItems, rulesMark} from '../rules/rule-blocks.js';

const PLAYERS_MENU = 'gamePlayers';
const PARTS_MENU = 'placeParts';
const TOP_PLACES = 10;
const THREAD_CHANGED = '_squiggleChangedValues';

const netOf = () => (typeof window === 'undefined' ? null : window.SquiggleNet);

const str = value => (value === null || typeof value === 'undefined' ? '' : String(value));

const mySlot = net => (net && Number.isInteger(net.slot) && net.slot > 0 ? net.slot : 0);

const slotOf = (value, net) => {
    const text = str(value).trim()
        .toLowerCase();
    if (text === 'me') return mySlot(net);
    const n = Number(text);
    return Number.isInteger(n) && n > 0 ? n : 0;
};

const playerArg = () => ({type: 'string', menu: PLAYERS_MENU, defaultValue: 'me'});

const hat = (opcode, text, args) => {
    const block = {opcode, blockType: 'event', text, isEdgeActivated: false, shouldRestartExistingThreads: false};
    if (args) block.arguments = args;
    return block;
};

const reporter = (opcode, text, args) => {
    const block = {opcode, blockType: 'reporter', text, disableMonitor: true};
    if (args) block.arguments = args;
    return block;
};

const CARDS = {
    together: () => [
        hat('whenGameValueChanges', 'when game value [NAME] changes',
            {NAME: {type: 'string', menu: 'gameValues', defaultValue: ''}}),
        reporter('playerValueOf', '[NAME] of [PLAYER]',
            {NAME: {type: 'string', menu: 'playerValues', defaultValue: ''}, PLAYER: playerArg()}),
        reporter('nameOfPlayer', 'name of [PLAYER]', {PLAYER: playerArg()})
    ],
    squigglescores: () => [
        hat('whenTheRoundStarts', 'when the round starts'),
        hat('whenTheRoundEnds', 'when the round ends'),
        reporter('boardPlace', '[BOARD] place [N] [PART]', {
            BOARD: {type: 'string', menu: 'boards', defaultValue: ''},
            N: {type: 'number', defaultValue: 1},
            PART: {type: 'string', menu: PARTS_MENU, defaultValue: 'name'}
        }),
        reporter('myPlace', 'my place on [BOARD]', {BOARD: {type: 'string', menu: 'boards', defaultValue: ''}})
    ],
    squiggleteams: () => [
        reporter('teamOfPlayer', 'team of [PLAYER]', {PLAYER: playerArg()}),
        reporter('countOnTeam', 'players on team [TEAM]', {TEAM: {type: 'string', menu: 'teams', defaultValue: ''}})
    ],
    squigglearena: () => [
        {opcode: 'fire', blockType: 'command', text: 'fire'},
        hat('whenIGetHit', 'when I get hit'),
        reporter('whoHitMeLast', 'who hit me last')
    ]
};

const deviceBlocks = card => {
    const hidden = !gameServerReady();
    return (CARDS[card] ? CARDS[card]() : []).map(block => Object.assign(block, {hideFromPalette: hidden}));
};

const deviceOpcodes = card => (CARDS[card] ? CARDS[card]().map(block => block.opcode) : []);

const usedMenus = card => {
    const names = new Set();
    (CARDS[card] ? CARDS[card]() : []).forEach(block => {
        Object.keys(block.arguments || {}).forEach(key => {
            if (block.arguments[key].menu) names.add(block.arguments[key].menu);
        });
    });
    return names;
};

const deviceMenus = card => {
    const menus = {};
    usedMenus(card).forEach(name => {
        if (name === PLAYERS_MENU) {
            menus[name] = {acceptReporters: true, items: [{text: 'me', value: 'me'}, {text: 'nobody', value: '0'}]};
        } else if (name === PARTS_MENU) {
            menus[name] = {
                acceptReporters: false,
                items: [{text: 'name', value: 'name'}, {text: 'score', value: 'score'}]
            };
        } else {
            menus[name] = {acceptReporters: true, items: MENU_METHODS[name]};
        }
    });
    return menus;
};

const beforeTick = state => ({values: Object.assign({}, state.values), round: state.round, running: state.running});

const changedValues = (before, state) => {
    const names = new Set();
    Object.keys(before.values).forEach(name => {
        if (state.values[name] !== before.values[name]) names.add(name);
    });
    Object.keys(state.values).forEach(name => {
        if (state.values[name] !== before.values[name]) names.add(name);
    });
    return names;
};

const startAll = (runtime, opcode, tag) => {
    const threads = runtime.startHats(opcode) || [];
    if (tag) threads.forEach(thread => Object.assign(thread, tag));
    return threads;
};

const fireDeviceHats = (runtime, card, before, state, result) => {
    if (!runtime || typeof runtime.startHats !== 'function' || !result || !result.applied) return;
    if (card === 'together') {
        const changed = changedValues(before, state);
        if (changed.size) startAll(runtime, 'together_whenGameValueChanges', {[THREAD_CHANGED]: changed});
    } else if (card === 'squigglescores') {
        const rose = state.round > before.round;
        if (before.running && (rose || !state.running)) startAll(runtime, 'squigglescores_whenTheRoundEnds');
        if (rose) startAll(runtime, 'squigglescores_whenTheRoundStarts');
    } else if (card === 'squigglearena') {
        result.events.forEach(event => {
            if (Number.isInteger(event.hit)) startAll(runtime, 'squigglearena_whenIGetHit');
        });
    }
};

const boardOf = (state, name) => state.boards.find(board => str(board.n) === name) || null;

const installDeviceMethods = (extension, card, gameOf) => {
    usedMenus(card).forEach(name => {
        if (MENU_METHODS[name] && typeof extension[MENU_METHODS[name]] !== 'function') {
            extension[MENU_METHODS[name]] = () => menuItems(extension.runtime, name);
        }
    });
    const teams = () => {
        const mark = rulesMark(extension.runtime);
        return mark && mark.teams;
    };
    const methods = {
        whenGameValueChanges (args, util) {
            const changed = util && util.thread && util.thread[THREAD_CHANGED];
            return !!changed && changed.has(str(args.NAME));
        },
        playerValueOf (args) {
            const slot = slotOf(args.PLAYER, netOf());
            return slot ? playerValue(gameOf(), slot, str(args.NAME)) : '';
        },
        nameOfPlayer (args) {
            const slot = slotOf(args.PLAYER, netOf());
            return slot ? playerName(gameOf(), slot) : '';
        },
        whenTheRoundStarts () {
            return true;
        },
        whenTheRoundEnds () {
            return true;
        },
        boardPlace (args) {
            const score = str(args.PART) === 'score';
            const board = boardOf(gameOf(), str(args.BOARD));
            const n = Math.floor(Number(args.N));
            const top = board && Array.isArray(board.top) ? board.top : [];
            const row = n >= 1 && n <= TOP_PLACES ? top[n - 1] : null;
            if (!Array.isArray(row)) return score ? 0 : '';
            if (score) return Number.isFinite(Number(row[1])) ? Number(row[1]) : 0;
            return playerName(gameOf(), row[0]);
        },
        myPlace (args) {
            if (!mySlot(netOf())) return 0;
            const place = Number(gameOf().places[str(args.BOARD)]);
            return Number.isInteger(place) && place > 0 ? place : 0;
        },
        teamOfPlayer (args) {
            const slot = slotOf(args.PLAYER, netOf());
            return slot ? teamName(gameOf(), slot, teams()) : '';
        },
        countOnTeam (args) {
            const name = str(args.TEAM);
            if (!name) return 0;
            const state = gameOf();
            const list = teams();
            return Object.keys(state.teams).filter(slot => teamName(state, slot, list) === name).length;
        },
        fire () {
            const net = netOf();
            if (!net || !net.inGame || typeof net.sendInput !== 'function') return;
            net.sendInput({g: {action: 'fire'}});
        },
        whenIGetHit () {
            return true;
        },
        whoHitMeLast () {
            const hit = gameOf().lastHit;
            return Number.isInteger(hit) && hit > 0 ? hit : 0;
        }
    };
    deviceOpcodes(card).forEach(opcode => {
        extension[opcode] = methods[opcode];
    });
    return extension;
};

const createDeviceFeed = (runtime, card) => {
    let game = createGameState();
    let slot = 0;
    let unsubs = [];
    const onTick = tick => {
        const net = netOf();
        const now = mySlot(net);
        if (now !== slot) {
            game = createGameState(game.tickSeconds);
            slot = now;
        }
        const hz = net && net.tickHz;
        if (Number.isFinite(hz) && hz > 0) game.tickSeconds = 1 / hz;
        const before = beforeTick(game);
        fireDeviceHats(runtime, card, before, game, applyTick(game, tick));
    };
    const onEnded = () => {
        game = createGameState(game.tickSeconds);
    };
    const bind = () => {
        const net = netOf();
        if (unsubs.length || !net || typeof net.onTick !== 'function') return;
        unsubs.push(net.onTick(onTick));
        if (typeof net.on === 'function') unsubs.push(net.on('game-ended', onEnded));
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('SquiggleNetReady', bind);
    }
    bind();
    return {
        get game () {
            return game;
        },
        bind,
        dispose () {
            if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
                window.removeEventListener('SquiggleNetReady', bind);
            }
            unsubs.forEach(off => off());
            unsubs = [];
            game = createGameState(game.tickSeconds);
        }
    };
};

export {
    PLAYERS_MENU,
    THREAD_CHANGED,
    TOP_PLACES,
    beforeTick,
    createDeviceFeed,
    deviceBlocks,
    deviceMenus,
    deviceOpcodes,
    fireDeviceHats,
    installDeviceMethods,
    slotOf
};
