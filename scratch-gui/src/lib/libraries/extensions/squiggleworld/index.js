import log from '../../../log.js';
import {registerKit} from '../../../kits/registry.js';
import {KIT_COLORS} from '../../../themes/tokens.js';
import {FLAGS, cellAt, cellCenter, flagsAt, getCell, tileIndex} from '../../../world/tilemap.js';
import {attachWhenReady, getWorld, installWorldApi} from '../../../world/world.js';

const ID = 'squiggleworld';
const COLORS = KIT_COLORS[ID];

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<rect width="40" height="40" rx="8" fill="${COLORS.color1}"/>` +
    `<rect x="7" y="22" width="8" height="8" fill="#fff"/><rect x="16" y="22" width="8" height="8" fill="#fff"/>` +
    `<rect x="25" y="22" width="8" height="8" fill="#fff"/><rect x="25" y="13" width="8" height="8" fill="#fff"/>` +
    `<circle cx="13" cy="15" r="4" fill="${COLORS.color3}"/></svg>`;
const ICON_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON)}`;

const MYSELF = '_myself_';
const NOBODY = '_nobody_';

const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const str = value => (value === null || typeof value === 'undefined' ? '' : String(value));

const KIND_FLAGS = {solid: FLAGS.solid, hazard: FLAGS.hazard, goal: FLAGS.goal};

class SquiggleWorldBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this.world = getWorld(runtime);
        attachWhenReady(this.world);
        if (typeof window !== 'undefined' && typeof document !== 'undefined') this.mountPainter();
    }

    mountPainter () {
        import('../../../../components/tile-painter/mount.jsx')
            .then(mod => mod.installTilePainter({runtime: this.runtime, world: this.world}))
            .catch(error => log.warn('Squiggle tile painter did not load', error));
    }

    getInfo () {
        return {
            id: ID,
            name: 'World',
            color1: COLORS.color1,
            color2: COLORS.color2,
            color3: COLORS.color3,
            menuIconURI: ICON_URI,
            blocks: [
                {
                    opcode: 'useLevel',
                    blockType: 'command',
                    text: 'use level [LEVEL]',
                    arguments: {LEVEL: {type: 'string', menu: 'levels', defaultValue: this.firstLevel()}}
                },
                {
                    opcode: 'setTile',
                    blockType: 'command',
                    text: 'set tile at x [X] y [Y] to [TILE]',
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0},
                        TILE: {type: 'string', defaultValue: 'empty'}
                    }
                },
                {
                    opcode: 'tileAt',
                    blockType: 'reporter',
                    text: 'tile at x [X] y [Y]',
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                {
                    opcode: 'gridAt',
                    blockType: 'reporter',
                    text: 'grid [AXIS] at x [X] y [Y]',
                    arguments: {
                        AXIS: {type: 'string', menu: 'gridAxis', defaultValue: 'column'},
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                '---',
                {
                    opcode: 'touchingTile',
                    blockType: 'Boolean',
                    text: 'touching [KIND] tile?',
                    filter: ['sprite'],
                    arguments: {KIND: {type: 'string', menu: 'tileKinds', defaultValue: 'solid'}}
                },
                {
                    opcode: 'whenTouchTile',
                    blockType: 'hat',
                    isEdgeActivated: true,
                    text: 'when I touch [KIND] tile',
                    filter: ['sprite'],
                    arguments: {KIND: {type: 'string', menu: 'hatKinds', defaultValue: 'hazard'}}
                },
                {
                    opcode: 'setHitbox',
                    blockType: 'command',
                    text: 'set my hitbox to [W] by [H]',
                    filter: ['sprite'],
                    arguments: {
                        W: {type: 'number', defaultValue: 16},
                        H: {type: 'number', defaultValue: 16}
                    }
                },
                {
                    opcode: 'moveStopping',
                    blockType: 'command',
                    text: 'move [AXIS] by [N] stopping at walls',
                    filter: ['sprite'],
                    arguments: {
                        AXIS: {type: 'string', menu: 'axis', defaultValue: 'x'},
                        N: {type: 'number', defaultValue: 10}
                    }
                },
                {
                    opcode: 'hitWall',
                    blockType: 'Boolean',
                    text: 'hit a wall on [SIDE]?',
                    filter: ['sprite'],
                    arguments: {SIDE: {type: 'string', menu: 'sides', defaultValue: 'any'}}
                },
                {
                    opcode: 'onGround',
                    blockType: 'Boolean',
                    text: 'on the ground?',
                    filter: ['sprite']
                },
                '---',
                {
                    opcode: 'cameraFollow',
                    blockType: 'command',
                    text: 'camera follow [TARGET] smoothness [S]',
                    arguments: {
                        TARGET: {type: 'string', menu: 'followTargets', defaultValue: MYSELF},
                        S: {type: 'number', defaultValue: 50}
                    }
                },
                {
                    opcode: 'setCamera',
                    blockType: 'command',
                    text: 'set camera to x [X] y [Y]',
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                {
                    opcode: 'setZoom',
                    blockType: 'command',
                    text: 'set camera zoom to [N] %',
                    arguments: {N: {type: 'number', defaultValue: 100}}
                },
                {
                    opcode: 'keepInside',
                    blockType: 'command',
                    text: 'keep camera inside the level [ONOFF]',
                    arguments: {ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}}
                },
                {
                    opcode: 'shakeCamera',
                    blockType: 'command',
                    text: 'shake camera for [T] secs strength [S]',
                    arguments: {
                        T: {type: 'number', defaultValue: 0.5},
                        S: {type: 'number', defaultValue: 8}
                    }
                },
                {
                    opcode: 'cameraValue',
                    blockType: 'reporter',
                    text: 'camera [PROP]',
                    arguments: {PROP: {type: 'string', menu: 'cameraProps', defaultValue: 'x'}}
                },
                '---',
                {
                    opcode: 'pinToScreen',
                    blockType: 'command',
                    text: 'pin me to the screen [ONOFF]',
                    filter: ['sprite'],
                    arguments: {ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}}
                },
                {
                    opcode: 'setBackdrop',
                    blockType: 'command',
                    text: 'backdrop [MODE] speed [F] %',
                    arguments: {
                        MODE: {type: 'string', menu: 'backdropModes', defaultValue: 'parallax'},
                        F: {type: 'number', defaultValue: 50}
                    }
                },
                {
                    opcode: 'mouseScreen',
                    blockType: 'reporter',
                    text: 'mouse screen [AXIS]',
                    arguments: {AXIS: {type: 'string', menu: 'axis', defaultValue: 'x'}}
                },
                {
                    opcode: 'randomSpot',
                    blockType: 'command',
                    text: 'go to a random [SPOT] spot in the level',
                    filter: ['sprite'],
                    arguments: {SPOT: {type: 'string', menu: 'spots', defaultValue: 'floor'}}
                }
            ],
            menus: {
                levels: {acceptReporters: true, items: 'levelMenu'},
                followTargets: {acceptReporters: true, items: 'followMenu'},
                gridAxis: {acceptReporters: false, items: ['column', 'row']},
                tileKinds: {acceptReporters: false, items: ['solid', 'hazard', 'goal']},
                hatKinds: {acceptReporters: false, items: ['hazard', 'goal']},
                axis: {acceptReporters: false, items: ['x', 'y']},
                sides: {
                    acceptReporters: false,
                    items: [
                        {text: 'any side', value: 'any'},
                        {text: 'left', value: 'left'},
                        {text: 'right', value: 'right'},
                        {text: 'top', value: 'top'},
                        {text: 'bottom', value: 'bottom'}
                    ]
                },
                onOff: {acceptReporters: false, items: ['on', 'off']},
                cameraProps: {acceptReporters: false, items: ['x', 'y', 'zoom', 'left', 'right', 'top', 'bottom']},
                backdropModes: {acceptReporters: false, items: ['fixed', 'scrolls', 'parallax']},
                spots: {acceptReporters: false, items: ['floor', 'empty', 'goal']}
            }
        };
    }

    firstLevel () {
        const levels = this.world.levels();
        return levels.length ? levels[0].name : '';
    }

    levelMenu () {
        const names = this.world.levels().map(grid => grid.name);
        return names.length ? names : [''];
    }

    followMenu () {
        const items = [{text: 'myself', value: MYSELF}, {text: 'nobody', value: NOBODY}];
        this.runtime.targets
            .filter(target => target.isOriginal && !target.isStage)
            .forEach(target => items.push({text: target.getName(), value: target.getName()}));
        return items;
    }

    useLevel (args) {
        this.world.useLevel(str(args.LEVEL));
    }

    setTile (args) {
        const grid = this.world.current();
        if (!grid) return;
        let value = tileIndex(grid, args.TILE);
        if (value === -1) {
            const name = str(args.TILE).trim();
            const runtime = this.runtime;
            const owner = grid.tileset ? runtime.getSpriteTargetByName(grid.tileset) : runtime.getTargetForStage();
            const has = owner && owner.getCostumes().some(costume => costume.name.toLowerCase() === name.toLowerCase());
            value = has ? this.world.addPlayTile(name) : 0;
            if (!value) return;
        }
        this.world.setTileAt(num(args.X), num(args.Y), value, 'main');
    }

    tileAt (args) {
        const grid = this.world.current();
        if (!grid) return '';
        const cell = cellAt(grid, num(args.X), num(args.Y));
        const value = getCell(grid, 'main', cell.col, cell.row);
        const tile = value ? grid.tiles[value - 1] : null;
        return tile ? tile.name : '';
    }

    gridAt (args) {
        const grid = this.world.current();
        if (!grid) return 0;
        const cell = cellAt(grid, num(args.X), num(args.Y));
        return str(args.AXIS) === 'row' ? cell.row + 1 : cell.col + 1;
    }

    touchingTile (args, util) {
        const flag = KIND_FLAGS[str(args.KIND)];
        return !!flag && this.world.touching(util.target, flag);
    }

    whenTouchTile (args, util) {
        return this.touchingTile(args, util);
    }

    setHitbox (args, util) {
        this.world.setHitbox(util.target, num(args.W), num(args.H));
    }

    moveStopping (args, util) {
        this.world.move(util.target, str(args.AXIS) === 'y' ? 'y' : 'x', num(args.N));
    }

    hitWall (args, util) {
        return this.world.hit(util.target, str(args.SIDE) || 'any');
    }

    onGround (args, util) {
        return this.world.onGround(util.target);
    }

    cameraFollow (args, util) {
        const choice = str(args.TARGET);
        const camera = this.world.camera;
        if (choice === NOBODY || !choice) {
            camera.follow(null, num(args.S));
            return;
        }
        if (choice === MYSELF) {
            if (util.target.isStage) return;
            camera.follow(util.target, num(args.S));
            return;
        }
        camera.follow(choice, num(args.S));
    }

    setCamera (args) {
        this.world.camera.set(num(args.X), num(args.Y));
    }

    setZoom (args) {
        this.world.camera.setZoom(num(args.N));
    }

    keepInside (args) {
        this.world.keepCameraInside(str(args.ONOFF) !== 'off');
    }

    shakeCamera (args) {
        this.world.camera.shake(num(args.T), num(args.S));
    }

    cameraValue (args) {
        return Math.round(this.world.camera.report(str(args.PROP)) * 100) / 100;
    }

    pinToScreen (args, util) {
        this.world.pin(util.target, str(args.ONOFF) !== 'off');
    }

    setBackdrop (args) {
        this.world.setBackdrop(str(args.MODE), num(args.F));
    }

    mouseScreen (args) {
        const mouse = this.runtime.ioDevices.mouse;
        const value = str(args.AXIS) === 'y' ? mouse._scratchY : mouse._scratchX;
        return Math.round(num(value));
    }

    randomSpot (args, util) {
        const grid = this.world.current();
        if (!grid) return;
        const spot = str(args.SPOT);
        const picks = [];
        for (let row = 0; row < grid.rows; row++) {
            for (let col = 0; col < grid.cols; col++) {
                const flags = flagsAt(grid, col, row);
                const blocked = (flags & FLAGS.solid) !== 0;
                if (spot === 'goal') {
                    if (flags & FLAGS.goal) picks.push([col, row]);
                } else if (spot === 'empty') {
                    if (!flags && !getCell(grid, 'main', col, row)) picks.push([col, row]);
                } else if (!blocked && (flagsAt(grid, col, row + 1) & (FLAGS.solid | FLAGS.oneway))) {
                    picks.push([col, row]);
                }
            }
        }
        if (!picks.length) return;
        const pick = picks[Math.floor(Math.random() * picks.length)];
        const centre = cellCenter(grid, pick[0], pick[1]);
        let y = centre.y;
        if (spot === 'floor') {
            const box = this.world.box(util.target);
            y = grid.origin[1] - ((pick[1] + 1) * grid.tileSize) + (box.h / 2);
        }
        util.target.setXY(centre.x, y);
    }
}

registerKit({
    id: ID,
    layers: ['sq-tiles-back', 'sq-tiles-front'],
    provides: ['world'],
    extension: SquiggleWorldBlocks
});

installWorldApi();

export default SquiggleWorldBlocks;
