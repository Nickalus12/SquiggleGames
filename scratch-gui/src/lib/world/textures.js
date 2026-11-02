const SKY_WIDTH = 256;
const SKY_HEIGHT = 64;
const OPAQUE = 0xff000000;

const packRgb = (r, g, b) => ((OPAQUE | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0);

const NIGHT_SKY_PALETTE = Object.freeze({
    zenith: packRgb(0x0d, 0x10, 0x20),
    deep: packRgb(0x12, 0x12, 0x1f),
    slate: packRgb(0x1b, 0x1f, 0x36),
    purple: packRgb(0x6d, 0x4a, 0xe0),
    violet: packRgb(0x7c, 0x5c, 0xff),
    cyan: packRgb(0x22, 0xd3, 0xee),
    emerald: packRgb(0x34, 0xd3, 0x99),
    gold: packRgb(0xfb, 0xbf, 0x24),
    white: packRgb(0xff, 0xff, 0xff)
});

let cachedDefaultSky = null;

const createSkyTexture = (width, height) => {
    const w = Math.max(16, Math.round(Number(width) || SKY_WIDTH));
    const h = Math.max(16, Math.round(Number(height) || SKY_HEIGHT));
    const data = new Uint32Array(w * h);
    const {zenith, deep, slate, purple, violet, cyan, emerald, gold, white} = NIGHT_SKY_PALETTE;
    for (let y = 0; y < h; y++) {
        const yn = y / h;
        const base = yn < 0.28 ? zenith : (yn < 0.55 ? deep : (yn < 0.78 ? slate : purple));
        const rowOffset = y * w;
        for (let x = 0; x < w; x++) {
            const wave = Math.sin((x / w) * Math.PI * 4) * 0.06;
            const ridge = Math.floor(h * (0.86 + (Math.sin((x / w) * Math.PI * 6) * 0.05) +
                (Math.cos((x / w) * Math.PI * 10) * 0.03)));
            if (y >= ridge) {
                data[rowOffset + x] = y === ridge ? violet : zenith;
            } else if (yn + wave > 0.82) {
                data[rowOffset + x] = violet;
            } else if (yn + wave > 0.72) {
                data[rowOffset + x] = purple;
            } else {
                data[rowOffset + x] = base;
            }
        }
    }
    const starColors = [white, white, cyan, gold, violet, emerald];
    for (let i = 0; i < 96; i++) {
        const hash = ((i * 2654435761) >>> 0);
        const sx = hash % w;
        const sy = ((hash >>> 8) % Math.max(1, Math.floor(h * 0.72)));
        const color = starColors[i % starColors.length];
        data[(sy * w) + sx] = color;
        if (i % 7 === 0 && sx + 1 < w && sy + 1 < h) {
            data[(sy * w) + ((sx + 1) % w)] = color;
        }
    }
    const moonX = Math.floor(w * 0.25);
    const moonY = Math.floor(h * 0.26);
    const moonR = Math.max(2, Math.floor(h * 0.09));
    for (let dy = -moonR; dy <= moonR; dy++) {
        for (let dx = -moonR; dx <= moonR; dx++) {
            const d2 = (dx * dx) + (dy * dy);
            if (d2 > moonR * moonR) continue;
            const mx = (moonX + dx + w) % w;
            const my = moonY + dy;
            if (my >= 0 && my < h) {
                data[(my * w) + mx] = d2 < (moonR - 1) * (moonR - 1) ? white : gold;
            }
        }
    }
    const nebX = Math.floor(w * 0.72);
    const nebY = Math.floor(h * 0.36);
    const nebR = Math.max(3, Math.floor(h * 0.14));
    for (let dy = -nebR; dy <= nebR; dy++) {
        for (let dx = -nebR * 2; dx <= nebR * 2; dx++) {
            const norm = ((dx * dx) / 4) + (dy * dy);
            if (norm > nebR * nebR) continue;
            const nx = (nebX + dx + w) % w;
            const ny = nebY + dy;
            if (ny >= 0 && ny < h && ((dx + dy) & 1) === 0) {
                data[(ny * w) + nx] = norm < (nebR * nebR * 0.35) ? cyan : violet;
            }
        }
    }
    return {width: w, height: h, data};
};

const defaultSkyTexture = () => {
    if (!cachedDefaultSky) cachedDefaultSky = createSkyTexture(SKY_WIDTH, SKY_HEIGHT);
    return cachedDefaultSky;
};

const costumeByName = (runtime, grid, name) => {
    if (!runtime || !name) return null;
    const lower = String(name).trim()
        .toLowerCase();
    if (!lower || lower === 'color' || lower === 'none' || lower === 'empty') return null;
    const sprite = grid && grid.tileset ? runtime.getSpriteTargetByName(grid.tileset) : null;
    const stage = typeof runtime.getTargetForStage === 'function' ? runtime.getTargetForStage() : null;
    const owners = [sprite, stage].filter(Boolean);
    for (const owner of owners) {
        const found = owner.getCostumes().find(costume => String(costume.name).toLowerCase() === lower);
        if (found) return found;
    }
    return null;
};

const costumeFor = (runtime, grid, value) => {
    const tile = grid && grid.tiles[value - 1];
    if (!tile || !runtime) return null;
    return costumeByName(runtime, grid, tile.name);
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
    SKY_WIDTH,
    SKY_HEIGHT,
    NIGHT_SKY_PALETTE,
    createSkyTexture,
    defaultSkyTexture,
    costumeByName,
    costumeFor,
    createTextureCache,
    browserImageLoader,
    browserCanvas
};
