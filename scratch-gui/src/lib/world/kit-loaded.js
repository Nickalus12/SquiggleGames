const kitLoaded = (runtime, id) => {
    const manager = runtime && runtime.extensionManager;
    return !!(manager && typeof manager.isExtensionLoaded === 'function' && manager.isExtensionLoaded(id));
};

const afterKitAdded = sync => () => Promise.resolve().then(sync);

export {afterKitAdded};
export default kitLoaded;
