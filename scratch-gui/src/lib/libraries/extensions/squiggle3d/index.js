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

const MYSELF = '_myself_';

const str = value => (value === null || typeof value === 'undefined' ? '' : String(value));

class Squiggle3dBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this.world = getWorld(runtime);
        attachWhenReady(this.world);
        this.view = getView3d(runtime, this.world);
        attachWhenReady(this.view);
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
                    opcode: 'showView',
                    blockType: 'command',
                    text: 'show 3D view from [VIEWER]',
                    arguments: {VIEWER: {type: 'string', menu: 'viewers', defaultValue: MYSELF}}
                },
                {
                    opcode: 'hideView',
                    blockType: 'command',
                    text: 'hide 3D view'
                },
                {
                    opcode: 'viewOn',
                    blockType: 'Boolean',
                    text: '3D view on?'
                },
                '---',
                {
                    opcode: 'setViewSetting',
                    blockType: 'command',
                    text: 'set 3D [SETTING] to [N]',
                    arguments: {
                        SETTING: {type: 'string', menu: 'settings', defaultValue: 'fov'},
                        N: {type: 'number', defaultValue: 66}
                    }
                },
                {
                    opcode: 'setSurfaceColor',
                    blockType: 'command',
                    text: 'set 3D [SURFACE] color to [COLOR]',
                    arguments: {
                        SURFACE: {type: 'string', menu: 'surfaces', defaultValue: 'floor'},
                        COLOR: {type: 'color', defaultValue: '#5b4b3d'}
                    }
                },
                {
                    opcode: 'setSurfaceTexture',
                    blockType: 'command',
                    text: 'set 3D [SURFACE] texture to [TEXTURE]',
                    arguments: {
                        SURFACE: {type: 'string', menu: 'surfaces', defaultValue: 'floor'},
                        TEXTURE: {type: 'string', menu: 'surfaceTextures', defaultValue: 'color'}
                    }
                },
                {
                    opcode: 'setLightFalloff',
                    blockType: 'command',
                    text: 'set 3D light falloff to [N]',
                    arguments: {
                        N: {type: 'number', defaultValue: 0}
                    }
                },
                '---',
                {
                    opcode: 'showMeAs',
                    blockType: 'command',
                    text: 'show me in 3D as [LOOK]',
                    filter: ['sprite'],
                    arguments: {LOOK: {type: 'string', menu: 'looks', defaultValue: 'picture'}}
                },
                {
                    opcode: 'setMyHeight',
                    blockType: 'command',
                    text: 'set my 3D height to [N]',
                    filter: ['sprite'],
                    arguments: {N: {type: 'number', defaultValue: 0}}
                },
                {
                    opcode: 'glowIn3d',
                    blockType: 'command',
                    text: 'glow in 3D with [COLOR] radius [N]',
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
                    text: 'turn with the mouse in 3D [ONOFF]',
                    arguments: {ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}}
                },
                {opcode: 'spriteInSights', blockType: 'reporter', text: 'sprite in my sights'}
            ],
            menus: {
                viewers: {acceptReporters: true, items: 'viewerMenu'},
                settings: {
                    acceptReporters: false,
                    items: [
                        {text: 'field of view', value: 'fov'},
                        {text: 'fog', value: 'fog'},
                        {text: 'eye height', value: 'eye'}
                    ]
                },
                surfaces: {
                    acceptReporters: false,
                    items: [{text: 'floor', value: 'floor'}, {text: 'ceiling', value: 'ceiling'}]
                },
                surfaceTextures: {
                    acceptReporters: true,
                    items: 'surfaceTextureMenu'
                },
                looks: {
                    acceptReporters: false,
                    items: [
                        {text: 'a picture', value: 'picture'},
                        {text: '8 views', value: 'views'},
                        {text: 'nothing', value: 'nothing'}
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
        return [{text: 'me', value: MYSELF}].concat(names);
    }

    surfaceTextureMenu () {
        const base = [
            {text: 'color', value: 'color'},
            {text: 'sky', value: 'sky'}
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

    spriteInSights () {
        return this.view.crosshair();
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
