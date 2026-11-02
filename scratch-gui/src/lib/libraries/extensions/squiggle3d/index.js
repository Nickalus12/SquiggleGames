import {registerKit} from '../../../kits/registry.js';
import {KIT_COLORS} from '../../../themes/tokens.js';
import {attachWhenReady, getWorld, installWorldApi} from '../../../world/world.js';
import {getView3d} from '../../../world/view3d.js';
import {getDoors} from '../../../world/doors.js';

const ID = 'squiggle3d';
const COLORS = KIT_COLORS[ID];

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<rect width="40" height="40" rx="8" fill="${COLORS.color1}"/>` +
    `<path d="M6 8l9 6v12l-9 6z" fill="#fff" opacity="0.7"/><path d="M34 8l-9 6v12l9 6z" fill="#fff" opacity="0.7"/>` +
    `<rect x="15" y="14" width="10" height="12" fill="#fff"/>` +
    `<circle cx="20" cy="20" r="2" fill="${COLORS.color3}"/></svg>`;
const ICON_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON)}`;

const MYSELF = '_myself_';

const str = value => (value === null || typeof value === 'undefined' ? '' : String(value));

const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const formatMessage = msg => (msg && typeof msg.default === 'string' ? msg.default : '');

class Squiggle3dBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this.world = getWorld(runtime);
        attachWhenReady(this.world);
        this.view = getView3d(runtime, this.world);
        attachWhenReady(this.view);
        this.doors = getDoors(runtime, this.world);
    }

    getInfo () {
        return {
            id: ID,
            name: formatMessage({
                id: 'sq.squiggle3d.name',
                default: '3D'
            }),
            color1: COLORS.color1,
            color2: COLORS.color2,
            color3: COLORS.color3,
            menuIconURI: ICON_URI,
            blocks: [
                {
                    opcode: 'showView',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.showView',
                        default: 'show 3D view from [VIEWER]'
                    }),
                    arguments: {VIEWER: {type: 'string', menu: 'viewers', defaultValue: MYSELF}}
                },
                {
                    opcode: 'hideView',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.hideView',
                        default: 'hide 3D view'
                    })
                },
                {
                    opcode: 'viewOn',
                    blockType: 'Boolean',
                    text: formatMessage({
                        id: 'sq.squiggle3d.viewOn',
                        default: '3D view on?'
                    })
                },
                '---',
                {
                    opcode: 'setViewSetting',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setViewSetting',
                        default: 'set 3D [SETTING] to [N]'
                    }),
                    arguments: {
                        SETTING: {type: 'string', menu: 'settings', defaultValue: 'fov'},
                        N: {type: 'number', defaultValue: 66}
                    }
                },
                {
                    opcode: 'setSurfaceColor',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setSurfaceColor',
                        default: 'set 3D [SURFACE] color to [COLOR]'
                    }),
                    arguments: {
                        SURFACE: {type: 'string', menu: 'surfaces', defaultValue: 'floor'},
                        COLOR: {type: 'color', defaultValue: '#5b4b3d'}
                    }
                },
                {
                    opcode: 'setSurfaceTexture',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setSurfaceTexture',
                        default: 'set 3D [SURFACE] texture to [TEXTURE]'
                    }),
                    arguments: {
                        SURFACE: {type: 'string', menu: 'surfaces', defaultValue: 'floor'},
                        TEXTURE: {type: 'string', menu: 'surfaceTextures', defaultValue: 'color'}
                    }
                },
                {
                    opcode: 'setLightFalloff',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setLightFalloff',
                        default: 'set 3D light falloff to [N]'
                    }),
                    arguments: {
                        N: {type: 'number', defaultValue: 0}
                    }
                },
                '---',
                {
                    opcode: 'showMeAs',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.showMeAs',
                        default: 'show me in 3D as [LOOK]'
                    }),
                    filter: ['sprite'],
                    arguments: {LOOK: {type: 'string', menu: 'looks', defaultValue: 'picture'}}
                },
                {
                    opcode: 'setMyHeight',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setMyHeight',
                        default: 'set my 3D height to [N]'
                    }),
                    filter: ['sprite'],
                    arguments: {N: {type: 'number', defaultValue: 0}}
                },
                {
                    opcode: 'glowIn3d',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.glowIn3d',
                        default: 'glow in 3D with [COLOR] radius [N]'
                    }),
                    filter: ['sprite'],
                    arguments: {
                        COLOR: {type: 'color', defaultValue: '#22d3ee'},
                        N: {type: 'number', defaultValue: 3}
                    }
                },
                '---',
                {
                    opcode: 'mouseTurn',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.mouseTurn',
                        default: 'turn with the mouse in 3D [ONOFF]'
                    }),
                    arguments: {ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}}
                },
                {
                    opcode: 'usePlayerSettings',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.usePlayerSettings',
                        default: 'use the player\'s 3D settings [ONOFF]'
                    }),
                    arguments: {ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}}
                },
                {
                    opcode: 'setPitch',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setPitch',
                        default: 'set 3D pitch to [N]'
                    }),
                    arguments: {N: {type: 'number', defaultValue: 0}}
                },
                {
                    opcode: 'pitch',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'sq.squiggle3d.pitch',
                        default: '3D pitch'
                    })
                },
                {
                    opcode: 'jumpIn3d',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.jumpIn3d',
                        default: 'jump in 3D'
                    })
                },
                {
                    opcode: 'setToolSway',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setToolSway',
                        default: 'set 3D tool sway to [ONOFF]'
                    }),
                    arguments: {ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}}
                },
                {
                    opcode: 'whenStep',
                    blockType: 'hat',
                    isEdgeActivated: true,
                    text: formatMessage({
                        id: 'sq.squiggle3d.whenStep',
                        default: 'when I take a 3D step'
                    }),
                    filter: ['sprite']
                },
                {
                    opcode: 'setFootsteps',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setFootsteps',
                        default: 'set 3D footsteps to [ONOFF]'
                    }),
                    arguments: {ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}}
                },
                {
                    opcode: 'setSoundRange',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setSoundRange',
                        default: 'set 3D sound range to [N]'
                    }),
                    arguments: {N: {type: 'number', defaultValue: 640}}
                },
                {
                    opcode: 'spriteInSights',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'sq.squiggle3d.spriteInSights',
                        default: 'sprite in my sights'
                    })
                },
                '---',
                {
                    opcode: 'openDoor',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.openDoor',
                        default: 'open the 3D door at x [X] y [Y]'
                    }),
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                {
                    opcode: 'closeDoor',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.closeDoor',
                        default: 'close the 3D door at x [X] y [Y]'
                    }),
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                {
                    opcode: 'doorOpen',
                    blockType: 'Boolean',
                    text: formatMessage({
                        id: 'sq.squiggle3d.doorOpen',
                        default: '3D door at x [X] y [Y] open?'
                    }),
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                {
                    opcode: 'whenTouchDoor',
                    blockType: 'hat',
                    isEdgeActivated: true,
                    text: formatMessage({
                        id: 'sq.squiggle3d.whenTouchDoor',
                        default: 'when I touch a 3D door'
                    }),
                    filter: ['sprite']
                },
                '---',
                {
                    opcode: 'setFloorTextureAt',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setFloorTextureAt',
                        default: 'set 3D floor texture at x [X] y [Y] to [T]'
                    }),
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0},
                        T: {type: 'string', menu: 'surfaceTextures', defaultValue: 'color'}
                    }
                },
                {
                    opcode: 'setCeilingTextureAt',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setCeilingTextureAt',
                        default: 'set 3D ceiling texture at x [X] y [Y] to [T]'
                    }),
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0},
                        T: {type: 'string', menu: 'surfaceTextures', defaultValue: 'color'}
                    }
                },
                {
                    opcode: 'setLightAt',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setLightAt',
                        default: 'set 3D light at x [X] y [Y] to [N]'
                    }),
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0},
                        N: {type: 'number', defaultValue: 100}
                    }
                },
                {
                    opcode: 'setWallHeightAt',
                    blockType: 'command',
                    text: formatMessage({
                        id: 'sq.squiggle3d.setWallHeightAt',
                        default: 'set 3D wall height at x [X] y [Y] to [H]'
                    }),
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0},
                        H: {type: 'number', defaultValue: 1}
                    }
                },
                {
                    opcode: 'lightAt',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'sq.squiggle3d.lightAt',
                        default: '3D light at x [X] y [Y]'
                    }),
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                {
                    opcode: 'wallHeightAt',
                    blockType: 'reporter',
                    text: formatMessage({
                        id: 'sq.squiggle3d.wallHeightAt',
                        default: '3D wall height at x [X] y [Y]'
                    }),
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                }
            ],
            menus: {
                viewers: {acceptReporters: true, items: 'viewerMenu'},
                settings: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'sq.squiggle3d.setting.fov',
                                default: 'field of view'
                            }),
                            value: 'fov'
                        },
                        {
                            text: formatMessage({
                                id: 'sq.squiggle3d.setting.fog',
                                default: 'fog'
                            }),
                            value: 'fog'
                        },
                        {
                            text: formatMessage({
                                id: 'sq.squiggle3d.setting.eye',
                                default: 'eye height'
                            }),
                            value: 'eye'
                        }
                    ]
                },
                surfaces: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'sq.squiggle3d.surface.floor',
                                default: 'floor'
                            }),
                            value: 'floor'
                        },
                        {
                            text: formatMessage({
                                id: 'sq.squiggle3d.surface.ceiling',
                                default: 'ceiling'
                            }),
                            value: 'ceiling'
                        }
                    ]
                },
                surfaceTextures: {
                    acceptReporters: true,
                    items: 'surfaceTextureMenu'
                },
                looks: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'sq.squiggle3d.look.picture',
                                default: 'a picture'
                            }),
                            value: 'picture'
                        },
                        {
                            text: formatMessage({
                                id: 'sq.squiggle3d.look.views',
                                default: '8 views'
                            }),
                            value: 'views'
                        },
                        {
                            text: formatMessage({
                                id: 'sq.squiggle3d.look.nothing',
                                default: 'nothing'
                            }),
                            value: 'nothing'
                        }
                    ]
                },
                onOff: {acceptReporters: false, items: ['on', 'off']}
            }
        };
    }

    viewerMenu () {
        const names = this.runtime.targets
            .filter(target => target.isOriginal && !target.isStage)
            .map(target => target.getName());
        return [{
            text: formatMessage({
                id: 'sq.squiggle3d.viewer.me',
                default: 'me'
            }),
            value: MYSELF
        }].concat(names);
    }

    surfaceTextureMenu () {
        const base = [
            {
                text: formatMessage({
                    id: 'sq.squiggle3d.texture.color',
                    default: 'color'
                }),
                value: 'color'
            },
            {
                text: formatMessage({
                    id: 'sq.squiggle3d.texture.sky',
                    default: 'sky'
                }),
                value: 'sky'
            }
        ];
        const level = this.world && typeof this.world.current === 'function' ? this.world.current() : null;
        if (!level || !Array.isArray(level.tiles)) return base;
        const seen = new Set(['color', 'sky']);
        for (const tile of level.tiles) {
            const name = tile && tile.name ? String(tile.name) : '';
            if (!name || seen.has(name)) continue;
            seen.add(name);
            base.push({text: name, value: name});
        }
        return base;
    }

    showView (args, util) {
        const choice = str(args.VIEWER);
        const viewer = choice === MYSELF ? util.target : this.runtime.getSpriteTargetByName(choice);
        if (!viewer || viewer.isStage) return;
        this.view.show(viewer);
    }

    hideView () {
        this.view.hide();
    }

    viewOn () {
        return this.view.isOn();
    }

    setViewSetting (args) {
        this.view.setSetting(str(args.SETTING), args.N);
    }

    setSurfaceColor (args) {
        this.view.setSurfaceColor(str(args.SURFACE), str(args.COLOR));
    }

    setSurfaceTexture (args) {
        this.view.setSurfaceTexture(str(args.SURFACE), str(args.TEXTURE));
    }

    setLightFalloff (args) {
        this.view.setLightFalloff(args.N);
    }

    showMeAs (args, util) {
        this.view.setLook(util.target, str(args.LOOK));
    }

    setMyHeight (args, util) {
        this.view.setElevation(util.target, args.N);
    }

    glowIn3d (args, util) {
        this.view.setGlow(util.target, str(args.COLOR), args.N);
    }

    mouseTurn (args) {
        this.view.setMouseTurn(str(args.ONOFF) !== 'off');
    }

    usePlayerSettings (args) {
        this.view.setUsePlayerSettings(str(args.ONOFF) !== 'off');
    }

    setPitch (args) {
        this.view.setPitch(args.N);
    }

    pitch () {
        return this.view.pitch();
    }

    setToolSway (args) {
        this.view.setToolSway(str(args.ONOFF) !== 'off');
    }

    whenStep (args, util) {
        const viewer = this.view.viewer();
        const target = util && util.target ? util.target : viewer;
        if (!target || target.isStage) return false;
        if (viewer && target !== viewer) return false;
        return this.view.stepFired(target);
    }

    setFootsteps (args) {
        this.view.setFootsteps(str(args.ONOFF) !== 'off');
    }

    setSoundRange (args) {
        this.view.setSoundRange(num(args.N));
    }

    jumpIn3d () {
        this.view.jump();
    }

    jump () {
        this.view.jump();
    }

    spriteInSights () {
        return this.view.crosshair();
    }

    openDoor (args) {
        this.doors.open(num(args.X), num(args.Y));
    }

    closeDoor (args) {
        this.doors.close(num(args.X), num(args.Y));
    }

    doorOpen (args) {
        return this.doors.isOpen(num(args.X), num(args.Y));
    }

    whenTouchDoor (args, util) {
        const viewer = this.view.viewer();
        const target = util && util.target ? util.target : viewer;
        if (!target || target.isStage) return false;
        if (viewer && target !== viewer) return false;
        return this.doors.touching(target);
    }

    setFloorTextureAt (args) {
        this.world.setFloorTextureAt(num(args.X), num(args.Y), str(args.T));
    }

    setCeilingTextureAt (args) {
        this.world.setCeilingTextureAt(num(args.X), num(args.Y), str(args.T));
    }

    setLightAt (args) {
        this.world.setLightAt(num(args.X), num(args.Y), num(args.N));
    }

    setWallHeightAt (args) {
        this.world.setWallHeightAt(num(args.X), num(args.Y), args.H);
    }

    lightAt (args) {
        return this.world.lightAt(num(args.X), num(args.Y));
    }

    wallHeightAt (args) {
        return this.world.wallHeightAt(num(args.X), num(args.Y));
    }
}

registerKit({
    id: ID,
    layers: ['sq-tiles-back'],
    provides: ['world'],
    extension: Squiggle3dBlocks
});

installWorldApi();

export default Squiggle3dBlocks;
