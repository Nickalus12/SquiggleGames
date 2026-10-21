import {registerKit} from '../../../kits/registry.js';
import {KIT_COLORS} from '../../../themes/tokens.js';
import {attachWhenReady, getWorld, installWorldApi} from '../../../world/world.js';
import {getView3d} from '../../../world/view3d.js';

const ID = 'squiggle3d';
const COLORS = KIT_COLORS[ID];

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<rect width="40" height="40" rx="8" fill="${COLORS.color1}"/>` +
    `<path d="M6 8l9 6v12l-9 6z" fill="#fff" opacity="0.7"/><path d="M34 8l-9 6v12l9 6z" fill="#fff" opacity="0.7"/>` +
    `<rect x="15" y="14" width="10" height="12" fill="#fff"/>` +
    `<circle cx="20" cy="20" r="2" fill="${COLORS.color3}"/></svg>`;
const ICON_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON)}`;

const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const str = value => (value === null || typeof value === 'undefined' ? '' : String(value));

const round = value => (Number.isFinite(value) ? Math.round(value * 100) / 100 : value);

class Squiggle3dBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this.world = getWorld(runtime);
        attachWhenReady(this.world);
        this.view = getView3d(runtime, this.world);
    }

    getInfo () {
        return {
            id: ID,
            name: '3D',
            color1: COLORS.color1,
            color2: COLORS.color2,
            color3: COLORS.color3,
            menuIconURI: ICON_URI,
            blocks: [
                {
                    opcode: 'setView',
                    blockType: 'command',
                    text: '3D view [ONOFF]',
                    arguments: {ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}}
                },
                {
                    opcode: 'setPlayer',
                    blockType: 'command',
                    text: '3D player at x [X] y [Y] facing [D]',
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0},
                        D: {type: 'angle', defaultValue: 90}
                    }
                },
                {
                    opcode: 'movePlayer',
                    blockType: 'command',
                    text: 'move 3D player [N] steps stopping at walls',
                    arguments: {N: {type: 'number', defaultValue: 4}}
                },
                {
                    opcode: 'turnPlayer',
                    blockType: 'command',
                    text: 'turn 3D player [D] degrees',
                    arguments: {D: {type: 'number', defaultValue: 5}}
                },
                {
                    opcode: 'setFov',
                    blockType: 'command',
                    text: 'set field of view [F]',
                    arguments: {F: {type: 'number', defaultValue: 66}}
                },
                {
                    opcode: 'setColors',
                    blockType: 'command',
                    text: 'set 3D floor [FLOOR] ceiling [CEILING]',
                    arguments: {
                        FLOOR: {type: 'color', defaultValue: '#5b4b3d'},
                        CEILING: {type: 'color', defaultValue: '#8fb4d6'}
                    }
                },
                '---',
                {
                    opcode: 'billboard',
                    blockType: 'command',
                    text: 'show me as billboard [ONOFF]',
                    filter: ['sprite'],
                    arguments: {ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}}
                },
                '---',
                {opcode: 'playerX', blockType: 'reporter', text: '3D x'},
                {opcode: 'playerY', blockType: 'reporter', text: '3D y'},
                {opcode: 'playerDirection', blockType: 'reporter', text: '3D direction'},
                {opcode: 'wallAhead', blockType: 'reporter', text: 'distance to wall ahead'},
                {opcode: 'crosshair', blockType: 'reporter', text: 'sprite in crosshair'}
            ],
            menus: {
                onOff: {acceptReporters: false, items: ['on', 'off']}
            }
        };
    }

    setView (args) {
        this.view.setOn(str(args.ONOFF) !== 'off');
    }

    setPlayer (args) {
        this.view.setPlayer(num(args.X), num(args.Y), num(args.D));
    }

    movePlayer (args) {
        this.view.move(num(args.N));
    }

    turnPlayer (args) {
        this.view.turn(num(args.D));
    }

    setFov (args) {
        this.view.setFov(num(args.F));
    }

    setColors (args) {
        this.view.setColors(str(args.FLOOR), str(args.CEILING));
    }

    billboard (args, util) {
        this.view.setBillboard(util.target, str(args.ONOFF) !== 'off');
    }

    playerX () {
        return round(this.view.player().x);
    }

    playerY () {
        return round(this.view.player().y);
    }

    playerDirection () {
        return round(this.view.player().direction);
    }

    wallAhead () {
        return round(this.view.distanceAhead());
    }

    crosshair () {
        return this.view.crosshair();
    }
}

registerKit({
    id: ID,
    layers: ['sq-hud'],
    provides: ['world'],
    extension: Squiggle3dBlocks
});

installWorldApi();

export default Squiggle3dBlocks;
