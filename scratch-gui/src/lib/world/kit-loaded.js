const kitLoaded = (runtime, id) => {
    const manager = runtime && runtime.extensionManager;
    return !!(manager && typeof manager.isExtensionLoaded === 'function' && manager.isExtensionLoaded(id));
};

export default kitLoaded;
