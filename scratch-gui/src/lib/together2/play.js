import coplay from '../coplay/index.js';
import {TOGETHER_ID, listKits, requiresTogether} from '../kits/registry.js';
import {gameServerReady} from '../rules/flags.js';
import {createPlayClient} from './play-client.js';

const gameExtensionIds = () => [TOGETHER_ID].concat(listKits().map(kit => kit.id)
    .filter(requiresTogether));

const playMode = (vm, ready) => {
    const manager = ready && vm && vm.extensionManager;
    if (!manager) return 'drive';
    return gameExtensionIds().some(id => manager.isExtensionLoaded(id)) ? 'game' : 'drive';
};

const projectLoaded = runtime => (runtime.targets.length ? Promise.resolve() :
    new Promise(resolve => runtime.once('PROJECT_LOADED', resolve)));

const initPlay = (vm, {code, name = ''} = {}, {
    ready = gameServerReady,
    drive = coplay.init,
    game = createPlayClient,
    win
} = {}) => {
    if (!code) return Promise.resolve(null);
    if (!ready()) {
        drive(vm, {code, name});
        return Promise.resolve('drive');
    }
    return projectLoaded(vm.runtime).then(() => {
        const mode = playMode(vm, ready());
        if (mode === 'drive') drive(vm, {code, name});
        else game(Object.assign({vm, code: String(code).toUpperCase(), name}, win ? {win} : {})).install();
        return mode;
    });
};

export {
    gameExtensionIds,
    initPlay,
    playMode
};
