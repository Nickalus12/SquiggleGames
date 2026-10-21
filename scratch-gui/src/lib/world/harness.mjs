process.removeAllListeners('warning');

let pass = 0;
let fail = 0;

const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${typeof detail === 'undefined' ? '' : ` : ${JSON.stringify(detail)}`}`);
    }
};

const near = (a, b, tolerance) => Math.abs(a - b) <= (typeof tolerance === 'number' ? tolerance : 1e-6);

const section = name => console.log(`\n${name}`);

const done = () => {
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) process.exit(1);
};

export {ok, near, section, done};

const stubRenderer = (RenderWebGL, twgl) => {
    const renderer = Object.create(RenderWebGL.prototype);
    Object.assign(renderer, {
        _layerGroups: {},
        _groupOrdering: [],
        _drawList: [],
        _allDrawables: [],
        _allSkins: [],
        _nextDrawableId: 0,
        _nativeSize: [480, 360],
        _gl: {canvas: {clientWidth: 480, clientHeight: 360}},
        _xLeft: -240,
        _xRight: 240,
        _yBottom: -180,
        _yTop: 180,
        _projection: twgl.m4.ortho(-240, 240, -180, 180, -1, 1),
        dirty: false,
        draws: 0,
        positions: new Map(),
        scales: new Map(),
        visible: new Map(),
        skins: new Map(),
        skinOf: new Map(),
        skinUpdates: 0,
        destroyed: 0
    });
    const noop = () => {};
    let skinIds = 0;
    renderer.draw = function () {
        if (!this.dirty) return;
        this.dirty = false;
        this.draws++;
    };
    Object.assign(renderer, {
        createDrawable (group) {
            const id = this._nextDrawableId++;
            this._addToDrawList(id, group);
            return id;
        },
        destroyDrawable (id, group) {
            this.destroyed++;
            const list = this._drawList;
            const at = list.indexOf(id);
            if (at !== -1) {
                list.splice(at, 1);
                const groups = this._groupOrdering;
                for (let i = groups.indexOf(group) + 1; i < groups.length; i++) {
                    this._layerGroups[groups[i]].drawListOffset--;
                }
            }
        },
        updateDrawableSkinId (id, skin) {
            this.skinOf.set(id, skin);
        },
        updateDrawableVisible (id, visible) {
            this.visible.set(id, visible);
        },
        updateDrawableEffect: noop,
        setDrawableOrder: noop,
        getDrawableOrder: () => 0,
        getCurrentSkinSize: () => [20, 30],
        getSkinSize: () => [0, 0],
        getSkinRotationCenter: () => [0, 0],
        getFencedPositionOfDrawable: (id, position) => position,
        createSVGSkin: () => ++skinIds,
        createBitmapSkin (canvas, resolution, center) {
            const id = ++skinIds;
            this.skins.set(id, {canvas, resolution, center});
            return id;
        },
        updateBitmapSkin (id, canvas, resolution, center) {
            this.skinUpdates++;
            this.skins.set(id, {canvas, resolution, center});
        },
        destroySkin (id) {
            this.skins.delete(id);
        },
        setPrivateSkinAccess: noop,
        markSkinAsPrivate: noop,
        updateDrawablePosition (id, position) {
            this.positions.set(id, position.slice());
        },
        updateDrawableDirectionScale (id, direction, scale) {
            this.scales.set(id, scale.slice());
        },
        updateDrawableProperties (id, properties) {
            if (properties.position) this.positions.set(id, properties.position.slice());
            if (properties.scale) this.scales.set(id, properties.scale.slice());
            if ('visible' in properties) this.visible.set(id, properties.visible);
        }
    });
    return renderer;
};

const fakeCanvas = (width, height) => {
    const ops = [];
    return {
        width,
        height,
        ops,
        getContext: () => ({
            imageSmoothingEnabled: true,
            clearRect: () => ops.push('clear'),
            drawImage: (image, x, y, w, h) => ops.push(['draw', image.name, x, y, w, h]),
            fillRect: (x, y, w, h) => ops.push(['fill', x, y, w, h]),
            set fillStyle (v) {
                ops.push(['style', v]);
            }
        })
    };
};

export {stubRenderer, fakeCanvas};
