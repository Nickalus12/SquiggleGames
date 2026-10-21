import {builtinKits} from './registry.js';

const installBuiltinKits = extensionManager => {
    const installed = [];
    for (const kit of builtinKits()) {
        if (extensionManager.isBuiltinExtension(kit.id)) continue;
        extensionManager.addBuiltinExtension(kit.id, kit.extension);
        installed.push(kit.id);
    }
    return installed;
};

export default installBuiltinKits;
