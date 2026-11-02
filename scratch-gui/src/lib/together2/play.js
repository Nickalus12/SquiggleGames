import coplay from '../coplay/index.js';
import {TOGETHER_ID, listKits, requiresTogether} from '../kits/registry.js';
import {gameServerReady} from '../rules/flags.js';
import {isRulesTarget} from '../collab/project-seam.js';
import {createPlayClient} from './play-client.js';

const gameExtensionIds = () => [TOGETHER_ID].concat(listKits().map(kit => kit.id)
    .filter(requiresTogether));

const hasGameRules = runtime => ((runtime && runtime.targets) || []).some(target => target.isOriginal &&
    isRulesTarget(target) && Object.keys((target.blocks && target.blocks._blocks) || {}).length > 0);

const playMode = (vm, ready) => {
    const manager = ready && vm && vm.extensionManager;
    if (!manager || !hasGameRules(vm.runtime)) return 'drive';
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
    hasGameRules,
    initPlay,
    playMode
};
