import {KIT_COLORS} from '../../../themes/tokens.js';
import {LIMITS, createGameData, topText} from './store.js';
import {createContext} from './context.js';

const ID = 'gamedata';
const COLORS = KIT_COLORS[ID];
const RECHECK_MS = 30 * 1000;
const NO_LIST = 'my list';

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<rect width="40" height="40" rx="8" fill="${COLORS.color1}"/>` +
    `<path d="M12 10h13l4 4v16H12z" fill="#fff"/>` +
    `<rect x="16" y="10" width="8" height="6" fill="${COLORS.color3}"/>` +
    `<rect x="15" y="21" width="11" height="6" rx="1" fill="${COLORS.color1}"/></svg>`;
const ICON_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON)}`;

const str = value => (value === null || typeof value === 'undefined' ? '' : String(value));

const sameContext = (a, b) => !!a && !!b && a.projectId === b.projectId && a.signedIn === b.signedIn;

const listNames = runtime => {
    const names = new Set();
    const targets = [runtime.getEditingTarget && runtime.getEditingTarget(), runtime.getTargetForStage &&
        runtime.getTargetForStage()];
    targets.filter(Boolean).forEach(target => {
        Object.keys(target.variables || {}).forEach(id => {
            const variable = target.variables[id];
            if (variable && variable.type === 'list') names.add(variable.name);
        });
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
};

const makeGameDataBlocks = ({store, resolve, notifyParent = () => {}, now = Date.now}) => {
    class GameDataBlocks {
        constructor (runtime) {
            this.runtime = runtime;
            this._context = null;
            this._checkedAt = -Infinity;
            this._told = false;
            this._offReady = store.onReady(() => {
                const hats = this.runtime && this.runtime.startHats;
                if (typeof hats === 'function') this.runtime.startHats(`${ID}_whenReady`);
            });
            this._onLoaded = () => this.refresh(true);
            this._onStart = () => this.refresh(false);
            if (runtime && typeof runtime.on === 'function') {
                runtime.on('PROJECT_LOADED', this._onLoaded);
                runtime.on('PROJECT_START', this._onStart);
            }
            this.refresh(true);
        }

        refresh (force) {
            const at = now();
            if (!force && (at - this._checkedAt < RECHECK_MS || (this._context && this._context.signedIn &&
                this._context.projectId))) return Promise.resolve(this._context);
            this._checkedAt = at;
            return Promise.resolve(resolve())
                .then(next => {
                    if (!force && sameContext(next, this._context)) return this._context;
                    this._context = next;
                    return store.load(next).then(() => next);
                })
                .catch(() => this._context);
        }

        dispose () {
            if (this._offReady) this._offReady();
            if (this.runtime && typeof this.runtime.off === 'function') {
                this.runtime.off('PROJECT_LOADED', this._onLoaded);
                this.runtime.off('PROJECT_START', this._onStart);
            }
        }

        used () {
            if (this._told) return;
            this._told = true;
            notifyParent();
        }

        getInfo () {
            return {
                id: ID,
                name: 'Game data',
                color1: COLORS.color1,
                color2: COLORS.color2,
                color3: COLORS.color3,
                menuIconURI: ICON_URI,
                blocks: [
                    {
                        blockType: 'label',
                        text: `Up to ${LIMITS.keys} saves per player, ${LIMITS.bytes} letters in all`
                    },
                    {
                        opcode: 'save',
                        blockType: 'command',
                        text: 'save [NAME] as [VALUE]',
                        arguments: {
                            NAME: {type: 'string', defaultValue: 'level'},
                            VALUE: {type: 'string', defaultValue: '10'}
                        }
                    },
                    {
                        opcode: 'saved',
                        blockType: 'reporter',
                        text: 'saved [NAME]',
                        arguments: {NAME: {type: 'string', defaultValue: 'level'}}
                    },
                    {
                        opcode: 'forget',
                        blockType: 'command',
                        text: 'forget [NAME]',
                        arguments: {NAME: {type: 'string', defaultValue: 'level'}}
                    },
                    {
                        opcode: 'whenReady',
                        blockType: 'event',
                        text: 'when saves are ready',
                        isEdgeActivated: false,
                        shouldRestartExistingThreads: false
                    },
                    {
                        opcode: 'isReady',
                        blockType: 'Boolean',
                        text: 'saves ready?'
                    },
                    {
                        opcode: 'isSignedIn',
                        blockType: 'Boolean',
                        text: 'signed in?'
                    },
                    '---',
                    {
                        blockType: 'label',
                        text: 'Top 10 boards'
                    },
                    {
                        opcode: 'postScore',
                        blockType: 'command',
                        text: 'post score [SCORE] to [BOARD] [ORDER]',
                        arguments: {
                            SCORE: {type: 'number', defaultValue: 100},
                            BOARD: {type: 'string', defaultValue: 'Ninjas'},
                            ORDER: {type: 'string', menu: 'order', defaultValue: 'max'}
                        }
                    },
                    {
                        opcode: 'myBest',
                        blockType: 'reporter',
                        text: 'my best on [BOARD]',
                        arguments: {BOARD: {type: 'string', defaultValue: 'Ninjas'}}
                    },
                    {
                        opcode: 'top',
                        blockType: 'reporter',
                        text: 'top [N] on [BOARD]',
                        arguments: {
                            N: {type: 'number', defaultValue: 10},
                            BOARD: {type: 'string', defaultValue: 'Ninjas'}
                        }
                    },
                    {
                        opcode: 'topIntoList',
                        blockType: 'command',
                        text: 'put top [N] on [BOARD] in list [LIST]',
                        arguments: {
                            N: {type: 'number', defaultValue: 10},
                            BOARD: {type: 'string', defaultValue: 'Ninjas'},
                            LIST: {type: 'string', menu: 'lists', defaultValue: NO_LIST}
                        }
                    }
                ],
                menus: {
                    order: {
                        acceptReporters: false,
                        items: [{text: 'highest wins', value: 'max'}, {text: 'lowest wins', value: 'min'}]
                    },
                    lists: {acceptReporters: true, items: 'listMenu'}
                }
            };
        }

        listMenu () {
            const names = listNames(this.runtime);
            return names.length ? names : [NO_LIST];
        }

        save (args) {
            this.used();
            store.set(args.NAME, args.VALUE);
        }

        saved (args) {
            this.used();
            return store.get(args.NAME);
        }

        forget (args) {
            this.used();
            store.forget(args.NAME);
        }

        whenReady () {
            return true;
        }

        isReady () {
            return store.ready;
        }

        isSignedIn () {
            return store.signedIn;
        }

        postScore (args) {
            this.used();
            return store.post(args.BOARD, args.SCORE, str(args.ORDER) === 'min' ? 'min' : 'max').then(() => null);
        }

        myBest (args) {
            this.used();
            return store.best(args.BOARD);
        }

        top (args) {
            this.used();
            return store.top(args.BOARD, args.N).then(topText);
        }

        topIntoList (args, util) {
            this.used();
            const target = util && util.target;
            const list = target && typeof target.lookupVariableByNameAndType === 'function' ?
                target.lookupVariableByNameAndType(str(args.LIST), 'list') : null;
            if (!list) return null;
            return store.top(args.BOARD, args.N).then(rows => {
                list.value = rows.map(row => topText([row]));
                list._monitorUpToDate = false;
            });
        }
    }
    return GameDataBlocks;
};

const browserStorage = () => {
    try {
        return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    } catch (e) {
        return null;
    }
};

const browserSession = () => {
    try {
        return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
    } catch (e) {
        return null;
    }
};

const apiBase = () => (typeof location !== 'undefined' && location.port === '8601' ?
    `http://${location.hostname}:4455` : '');

const fetchIn = (...args) => (typeof fetch === 'function' ? fetch(...args) : Promise.reject(new Error('no fetch')));

const gameData = createGameData({fetchImpl: fetchIn, storage: browserStorage(), base: apiBase()});

const resolveContext = createContext({
    where: typeof location === 'undefined' ? null : {pathname: location.pathname, search: location.search},
    session: browserSession(),
    fetchImpl: fetchIn,
    base: apiBase()
});

const tellParent = () => {
    try {
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
            window.parent.postMessage({type: 'squiggle-game-data', used: true}, location.origin);
        }
    } catch (e) {
        return null;
    }
    return null;
};

export {
    ID as GAME_DATA_ID,
    gameData,
    listNames,
    makeGameDataBlocks
};

export default makeGameDataBlocks({store: gameData, resolve: resolveContext, notifyParent: tellParent});
