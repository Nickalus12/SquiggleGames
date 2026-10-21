import {registerKit} from '../../../kits/registry.js';
import {KIT_COLORS} from '../../../themes/tokens.js';

const ID = 'squiggletools';
const COLORS = KIT_COLORS[ID];
const THREAD_DATA = '_squiggleToolsData';
const RECEIVE_HAT = 'event_whenbroadcastreceived';
const DEFAULT_MESSAGE = 'message1';

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<rect width="40" height="40" rx="8" fill="${COLORS.color1}"/>` +
    `<path d="M11 29l11-11" stroke="#fff" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="25" cy="15" r="6" fill="none" stroke="#fff" stroke-width="3.5"/>` +
    `<circle cx="25" cy="15" r="2" fill="${COLORS.color3}"/></svg>`;
const ICON_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON)}`;

const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const str = value => (value === null || typeof value === 'undefined' ? '' : String(value));

const clamp = (n, min, max) => {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return Math.min(high, Math.max(low, n));
};

const wrap = (n, min, max) => {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    if (low === high) return low;
    if (Number.isInteger(n) && Number.isInteger(low) && Number.isInteger(high)) {
        const span = high - low + 1;
        return n - (Math.floor((n - low) / span) * span);
    }
    const span = high - low;
    return low + ((((n - low) % span) + span) % span);
};

const directionBetween = (fromX, fromY, toX, toY) => {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const degrees = Math.atan2(dx, dy) * 180 / Math.PI;
    return degrees <= -180 ? degrees + 360 : degrees;
};

class SquiggleToolsBlocks {
    constructor (runtime) {
        this.runtime = runtime;
    }

    getInfo () {
        return {
            id: ID,
            name: 'Game Tools',
            color1: COLORS.color1,
            color2: COLORS.color2,
            color3: COLORS.color3,
            menuIconURI: ICON_URI,
            blocks: [
                {
                    opcode: 'moveToward',
                    blockType: 'command',
                    text: 'move [N] steps toward x [X] y [Y]',
                    filter: ['sprite'],
                    arguments: {
                        N: {type: 'number', defaultValue: 10},
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                {
                    opcode: 'distanceTo',
                    blockType: 'reporter',
                    text: 'distance to x [X] y [Y]',
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                {
                    opcode: 'directionTo',
                    blockType: 'reporter',
                    text: 'direction to x [X] y [Y]',
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                '---',
                {
                    opcode: 'clamp',
                    blockType: 'reporter',
                    text: 'clamp [N] between [MIN] and [MAX]',
                    arguments: {
                        N: {type: 'number', defaultValue: 50},
                        MIN: {type: 'number', defaultValue: 0},
                        MAX: {type: 'number', defaultValue: 100}
                    }
                },
                {
                    opcode: 'wrap',
                    blockType: 'reporter',
                    text: 'wrap [N] between [MIN] and [MAX]',
                    arguments: {
                        N: {type: 'number', defaultValue: 6},
                        MIN: {type: 'number', defaultValue: 1},
                        MAX: {type: 'number', defaultValue: 5}
                    }
                },
                {
                    opcode: 'chance',
                    blockType: 'Boolean',
                    text: '[P] % chance',
                    arguments: {P: {type: 'number', defaultValue: 50}}
                },
                '---',
                {
                    opcode: 'broadcastWithData',
                    blockType: 'command',
                    text: 'broadcast [MESSAGE] with [DATA]',
                    arguments: {
                        MESSAGE: {type: 'string', menu: 'messages', defaultValue: this.firstMessage()},
                        DATA: {type: 'string', defaultValue: 'hello'}
                    }
                },
                {
                    opcode: 'broadcastData',
                    blockType: 'reporter',
                    text: 'broadcast data'
                }
            ],
            menus: {
                messages: {acceptReporters: true, items: 'messageMenu'}
            }
        };
    }

    messageNames () {
        const stage = this.runtime.getTargetForStage && this.runtime.getTargetForStage();
        if (!stage || !stage.variables) return [];
        return Object.keys(stage.variables)
            .map(id => stage.variables[id])
            .filter(variable => variable && variable.type === 'broadcast_msg')
            .map(variable => variable.name)
            .sort((a, b) => a.localeCompare(b));
    }

    firstMessage () {
        const names = this.messageNames();
        return names.length ? names[0] : DEFAULT_MESSAGE;
    }

    messageMenu () {
        const names = this.messageNames();
        return names.length ? names : [DEFAULT_MESSAGE];
    }

    moveToward (args, util) {
        const target = util.target;
        const steps = num(args.N);
        const x = num(args.X);
        const y = num(args.Y);
        const dx = x - target.x;
        const dy = y - target.y;
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        if (distance === 0 || steps === 0) return;
        if (steps >= distance) {
            target.setXY(x, y);
            return;
        }
        target.setXY(target.x + (dx / distance * steps), target.y + (dy / distance * steps));
    }

    distanceTo (args, util) {
        const dx = num(args.X) - util.target.x;
        const dy = num(args.Y) - util.target.y;
        return Math.sqrt((dx * dx) + (dy * dy));
    }

    directionTo (args, util) {
        const target = util.target;
        const x = num(args.X);
        const y = num(args.Y);
        if (x === target.x && y === target.y) return target.isStage ? 90 : target.direction;
        return directionBetween(target.x, target.y, x, y);
    }

    clamp (args) {
        return clamp(num(args.N), num(args.MIN), num(args.MAX));
    }

    wrap (args) {
        return wrap(num(args.N), num(args.MIN), num(args.MAX));
    }

    chance (args) {
        const p = num(args.P);
        if (p <= 0) return false;
        if (p >= 100) return true;
        return Math.random() * 100 < p;
    }

    broadcastWithData (args, util) {
        const name = str(args.MESSAGE);
        if (!name) return;
        const data = str(args.DATA);
        const threads = util.startHats(RECEIVE_HAT, {BROADCAST_OPTION: name});
        if (!threads) return;
        for (let i = 0; i < threads.length; i++) threads[i][THREAD_DATA] = data;
    }

    broadcastData (args, util) {
        const data = util && util.thread && util.thread[THREAD_DATA];
        return typeof data === 'string' ? data : '';
    }
}

registerKit({
    id: ID,
    extension: SquiggleToolsBlocks
});

export {clamp, wrap, directionBetween, THREAD_DATA};
export default SquiggleToolsBlocks;
