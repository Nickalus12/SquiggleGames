import {createRequire} from 'node:module';
import {ok, section, done, stubRenderer, fakeCanvas} from '../../../world/harness.mjs';

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');
const RenderWebGL = require('scratch-render/src/RenderWebGL.js');
const twgl = createRequire(require.resolve('scratch-render/src/RenderWebGL.js'))('twgl.js');

vmLog.warn = () => {};
vmLog.info = () => {};
globalThis.document = {hidden: true};

const {installWorldSeams} = await import('../../../world/seams.js');
const {getWorld} = await import('../../../world/world.js');
const {getView3d} = await import('../../../world/view3d.js');
const {pixel} = await import('../../../world/raycast.js');
const {getKit} = await import('../../../kits/registry.js');
const {default: Squiggle3dBlocks} = await import('./index.js');

const sprite = (name, extra) => Object.assign({
    isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
    x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
}, extra);

const project = () => ({
    targets: [
        {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
            videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null},
        sprite('Hero', {direction: 90}),
        sprite('Coin', {x: 96, y: 0, layerOrder: 2})
    ],
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
});

const vm = new VM();
vm.attachRenderer(stubRenderer(RenderWebGL, twgl));
const seam = installWorldSeams(vm);
const runtime = vm.runtime;
const world = getWorld(runtime, {createCanvas: fakeCanvas, loadImage: () => null});
const view = getView3d(runtime, world, {
    toBitmap: data => ({data}),
    loadImage: () => Promise.resolve({width: 32, height: 32}),
    createCanvas: (width, height) => ({
        getContext: () => ({
            clearRect: () => null,
            drawImage: () => null,
            getImageData: () => {
                const data = new Uint8ClampedArray(width * height * 4);
                new Uint32Array(data.buffer).fill(pixel(250, 200, 0));
                return {data};
            }
        })
    })
});
await vm.loadProject(JSON.stringify(project()));
world.attach(seam);
view.attach(seam);
const ext = new Squiggle3dBlocks(runtime);
const hero = runtime.getSpriteTargetByName('Hero');
const coin = runtime.getSpriteTargetByName('Coin');
const coinCostumes = [{name: 'coin', assetId: 'coin', dataFormat: 'png', asset: {}, size: [32, 32]}];
coin.getCostumes = () => coinCostumes;
const util = target => ({target});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

section('kit and getInfo');
const kit = getKit('squiggle3d');
ok('squiggle3d registers on sq-tiles-back and provides world', kit.extension === Squiggle3dBlocks &&
    kit.layers.join() === 'sq-tiles-back' && kit.provides.indexOf('world') !== -1);
const info = ext.getInfo();
const blocks = info.blocks.filter(block => typeof block === 'object');
const opcodes = blocks.map(block => block.opcode);
ok('id and name', info.id === 'squiggle3d' && info.name === '3D');
ok('the opcode list is final', opcodes.join() === ['showView', 'hideView', 'viewOn', 'setViewSetting',
    'setSurfaceColor', 'showMeAs', 'setMyHeight', 'mouseTurn', 'spriteInSights'].join(), opcodes);
ok('every opcode has a method', opcodes.every(opcode => typeof ext[opcode] === 'function'));
const byOp = Object.fromEntries(blocks.map(block => [block.opcode, block]));
ok('block text follows rev 3', byOp.showView.text === 'show 3D view from [VIEWER]' &&
    byOp.hideView.text === 'hide 3D view' && byOp.viewOn.text === '3D view on?' &&
    byOp.setViewSetting.text === 'set 3D [SETTING] to [N]' &&
    byOp.setSurfaceColor.text === 'set 3D [SURFACE] color to [COLOR]' &&
    byOp.showMeAs.text === 'show me in 3D as [LOOK]' && byOp.setMyHeight.text === 'set my 3D height to [N]' &&
    byOp.mouseTurn.text === 'turn with the mouse in 3D [ONOFF]' && byOp.spriteInSights.text === 'sprite in my sights');
ok('block types', byOp.viewOn.blockType === 'Boolean' && byOp.spriteInSights.blockType === 'reporter' &&
    byOp.showView.blockType === 'command');
ok('sprite-only blocks are filtered', byOp.showMeAs.filter.join() === 'sprite' &&
    byOp.setMyHeight.filter.join() === 'sprite');
const items = name => info.menus[name].items.map(item => (typeof item === 'object' ? item.text : item)).join('/');
ok('menus read as rev 3', items('settings') === 'field of view/fog/eye height' &&
    items('surfaces') === 'floor/ceiling' && items('looks') === 'a picture/8 views/nothing' &&
    items('onOff') === 'on/off');
ok('the viewer menu lists me and the sprites', JSON.stringify(ext.viewerMenu()) ===
    '[{"text":"me","value":"_myself_"},"Hero","Coin"]');

section('opcodes');
ext.showView({VIEWER: '_myself_'}, util(runtime.getTargetForStage()));
ok('show from me on the stage does nothing', ext.viewOn() === false);
ext.showView({VIEWER: 'Nobody'}, util(hero));
ok('show from an unknown sprite does nothing', ext.viewOn() === false);
ext.showView({VIEWER: '_myself_'}, util(hero));
ok('show from me uses the calling sprite', ext.viewOn() === true && view.viewer() === hero);
ext.showView({VIEWER: 'Coin'}, util(hero));
ok('show from a named sprite switches the viewer', view.viewer() === coin);
ext.showView({VIEWER: 'Hero'}, util(coin));
ext.setViewSetting({SETTING: 'fov', N: '90'});
ext.setViewSetting({SETTING: 'fog', N: 25});
ext.setViewSetting({SETTING: 'eye', N: 70});
ext.setViewSetting({SETTING: 'nope', N: 1});
ok('set 3D setting casts and applies each', JSON.stringify(view.settings()) === '{"fov":90,"fog":25,"eye":70}');
ext.setSurfaceColor({SURFACE: 'floor', COLOR: '#010203'});
ext.setSurfaceColor({SURFACE: 'ceiling', COLOR: '#040506'});
ok('set 3D color sets floor and ceiling', view.colors().floor === pixel(1, 2, 3) &&
    view.colors().ceiling === pixel(4, 5, 6));
ext.showMeAs({LOOK: 'picture'}, util(coin));
ok('show me in 3D as a picture', view.lookOf(coin) === 1);
ext.showMeAs({LOOK: 'views'}, util(coin));
ok('show me in 3D as 8 views', view.lookOf(coin) === 2);
ext.showMeAs({LOOK: 'picture'}, util(runtime.getTargetForStage()));
ok('the stage has no 3D look', view.lookOf(runtime.getTargetForStage()) === 0);
ext.showMeAs({LOOK: 'picture'}, util(coin));
ext.setMyHeight({N: '25'}, util(coin));
ok('set my 3D height casts', view.elevationOf(coin) === 25);
ext.setMyHeight({N: 0}, util(coin));
ext.setViewSetting({SETTING: 'fog', N: 0});
runtime._step();
await flush();
runtime._step();
ok('sprite in my sights reports the coin ahead', ext.spriteInSights() === 'Coin', ext.spriteInSights());
ext.showMeAs({LOOK: 'nothing'}, util(coin));
ok('nothing leaves the sights empty', ext.spriteInSights() === '');
ext.mouseTurn({ONOFF: 'on'});
ok('turn with the mouse on', view.mouseTurn() === true);
ext.mouseTurn({ONOFF: 'off'});
ok('turn with the mouse off', view.mouseTurn() === false);
ext.hideView();
ok('hide 3D view', ext.viewOn() === false && ext.spriteInSights() === '');

section('saved projects');
const saved = JSON.parse(vm.toJSON());
ok('using 3D writes no storage of its own', !saved.extensionStorage || !saved.extensionStorage.squiggle3d);

done();
