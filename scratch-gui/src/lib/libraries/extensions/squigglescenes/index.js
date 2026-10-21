import {registerKit} from '../../../kits/registry.js';
import {KIT_COLORS} from '../../../themes/tokens.js';
import {ANY, getScenes} from '../../../world/scenes.js';
import {installWorldApi} from '../../../world/world.js';

const ID = 'squigglescenes';
const COLORS = KIT_COLORS[ID];

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<rect width="40" height="40" rx="8" fill="${COLORS.color1}"/>` +
    `<rect x="6" y="11" width="13" height="18" rx="2" fill="#fff" opacity="0.6"/>` +
    `<rect x="14" y="9" width="20" height="22" rx="2" fill="#fff"/>` +
    `<path d="M21 15l7 5-7 5z" fill="${COLORS.color3}"/></svg>`;
const ICON_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON)}`;

const str = value => (value === null || typeof value === 'undefined' ? '' : String(value));

class SquiggleScenesBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this.scenes = getScenes(runtime);
        if (typeof window !== 'undefined' && typeof document !== 'undefined') this.mountStrip();
    }

    mountStrip () {
        import('../../../../components/scene-strip/mount.jsx')
            .then(mod => mod.installSceneStrip({runtime: this.runtime, controller: this.scenes}))
            .catch(() => null);
    }

    getInfo () {
        return {
            id: ID,
            name: 'Scenes',
            color1: COLORS.color1,
            color2: COLORS.color2,
            color3: COLORS.color3,
            menuIconURI: ICON_URI,
            blocks: [
                {
                    opcode: 'switchTo',
                    blockType: 'command',
                    text: 'switch to scene [SCENE] with [FX]',
                    arguments: {
                        SCENE: {type: 'string', menu: 'scenes', defaultValue: this.firstScene()},
                        FX: {type: 'string', menu: 'transitions', defaultValue: 'cut'}
                    }
                },
                {
                    opcode: 'nextScene',
                    blockType: 'command',
                    text: 'next scene'
                },
                {
                    opcode: 'resetToSpawns',
                    blockType: 'command',
                    text: 'reset to spawns'
                },
                '---',
                {
                    opcode: 'whenSceneStarts',
                    blockType: 'hat',
                    isEdgeActivated: false,
                    text: 'when scene [SCENE] starts',
                    arguments: {SCENE: {type: 'string', menu: 'hatScenes', defaultValue: ANY}}
                },
                {
                    opcode: 'whenSceneEnds',
                    blockType: 'hat',
                    isEdgeActivated: false,
                    text: 'when scene [SCENE] ends',
                    arguments: {SCENE: {type: 'string', menu: 'hatScenes', defaultValue: ANY}}
                },
                '---',
                {
                    opcode: 'currentScene',
                    blockType: 'reporter',
                    text: 'current scene [PROP]',
                    arguments: {PROP: {type: 'string', menu: 'sceneProps', defaultValue: 'name'}}
                }
            ],
            menus: {
                scenes: {acceptReporters: true, items: 'sceneMenu'},
                hatScenes: {acceptReporters: false, items: 'hatSceneMenu'},
                transitions: {acceptReporters: false, items: ['cut', 'fade', 'pixelate']},
                sceneProps: {acceptReporters: false, items: ['name', 'number']}
            }
        };
    }

    firstScene () {
        const scenes = this.scenes.list();
        return scenes.length ? scenes[0].name : '';
    }

    sceneMenu () {
        const names = this.scenes.list().map(scene => scene.name);
        return names.length ? names : [''];
    }

    hatSceneMenu () {
        return [{text: 'any scene', value: ANY}].concat(this.scenes.list().map(scene => scene.name));
    }

    settle (promise, util) {
        const target = util.target;
        return promise.then(result => {
            if (result && result.callerLeaves) this.runtime.stopForTarget(target);
        });
    }

    switchTo (args, util) {
        const options = {transition: str(args.FX), thread: util.thread};
        return this.settle(this.scenes.switchTo(str(args.SCENE), options), util);
    }

    nextScene (args, util) {
        return this.settle(this.scenes.next({transition: 'cut', thread: util.thread}), util);
    }

    resetToSpawns () {
        this.scenes.resetToSpawns();
    }

    whenSceneStarts (args) {
        return this.scenes.matchesStart(str(args.SCENE));
    }

    whenSceneEnds (args) {
        return this.scenes.matchesEnd(str(args.SCENE));
    }

    currentScene (args) {
        const now = this.scenes.current();
        if (str(args.PROP) === 'number') return now.index + 1;
        return now.scene ? now.scene.name : '';
    }
}

registerKit({
    id: ID,
    provides: ['scenes'],
    extension: SquiggleScenesBlocks
});

installWorldApi();

export default SquiggleScenesBlocks;
