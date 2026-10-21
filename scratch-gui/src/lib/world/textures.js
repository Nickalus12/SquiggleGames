const costumeFor = (runtime, grid, value) => {
    const tile = grid && grid.tiles[value - 1];
    if (!tile || !runtime) return null;
    const sprite = grid.tileset ? runtime.getSpriteTargetByName(grid.tileset) : null;
    const owner = sprite || runtime.getTargetForStage();
    if (!owner) return null;
    const lower = tile.name.toLowerCase();
    return owner.getCostumes().find(costume => String(costume.name).toLowerCase() === lower) || null;
};

const createTextureCache = options => {
    const runtime = options.runtime;
    const loadImage = options.loadImage;
    const onLoad = options.onLoad || (() => {});
    const images = new Map();

    const keyOf = costume => `${costume.assetId}:${costume.dataFormat}`;

    const get = (grid, value) => {
        const costume = costumeFor(runtime, grid, value);
        if (!costume || !costume.asset) return null;
        const key = keyOf(costume);
        const entry = images.get(key);
        if (entry) return entry.image;
        const pending = {image: null};
        images.set(key, pending);
        Promise.resolve(loadImage(costume))
            .then(image => {
                pending.image = image || null;
                if (image) onLoad(key);
            })
            .catch(() => {
                images.delete(key);
            });
        return null;
    };

    return {
        get,
        has: key => images.has(key),
        clear: () => images.clear(),
        size: () => images.size
    };
};

const browserImageLoader = costume => new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
        resolve(null);
        return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = costume.asset.encodeDataURI();
});

const browserCanvas = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
};

export {
    costumeFor,
    createTextureCache,
    browserImageLoader,
    browserCanvas
};
