import {createOverlay} from '../vfx/overlay.js';

const menuIconURI = 'data:image/svg+xml;base64,' +
    'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0i' +
    'MCAwIDQwIDQwIj4gPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzk5NjZGRiIvPiA8cGF0aCBk' +
    'PSJNMTQgMTJoMTJ2M2gtNHYxM2gtM3YtMTNoLTR2LTN6IiBmaWxsPSIjZmZmIi8+PC9zdmc+';

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, ' +
    'U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, ' +
    'U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';
const VIETNAMESE = 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, ' +
    'U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB';
const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
const GREEK = 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF';

const KIT_FONTS = {
    'Bangers': [['bangers-latin', LATIN], ['bangers-latin-ext', LATIN_EXT], ['bangers-vietnamese', VIETNAMESE]],
    'Press Start 2P': [
        ['press-start-2p-latin', LATIN],
        ['press-start-2p-latin-ext', LATIN_EXT],
        ['press-start-2p-cyrillic', CYRILLIC],
        ['press-start-2p-greek', GREEK]
    ],
    'Pacifico': [['pacifico-latin', LATIN], ['pacifico-latin-ext', LATIN_EXT], ['pacifico-cyrillic', CYRILLIC]],
    'Permanent Marker': [['permanent-marker-latin', LATIN]],
    'Luckiest Guy': [['luckiest-guy-latin', LATIN], ['luckiest-guy-latin-ext', LATIN_EXT]]
};

const FONT_PATH = 'fonts/textengine/';

const fontUrl = file => `${process.env.ROOT || ''}${FONT_PATH}${file}.woff2`;

const fontLoads = new Map();

const settle = promise => promise.then(() => true, () => false);

const registerFont = family => {
    const faces = KIT_FONTS[family].map(([file, unicodeRange]) => {
        const face = new FontFace(family, `url(${fontUrl(file)}) format("woff2")`, {display: 'swap', unicodeRange});
        document.fonts.add(face);
        return face;
    });
    return {
        ready: settle(faces[0].load()),
        extra: faces.slice(1).map(face => settle(face.loaded || Promise.resolve()))
    };
};

const loadKitFont = (family, onLoad) => {
    if (!KIT_FONTS[family] || typeof document === 'undefined' || !document.fonts || typeof FontFace !== 'function') {
        return null;
    }
    if (!fontLoads.has(family)) fontLoads.set(family, registerFont(family));
    const load = fontLoads.get(family);
    load.ready.then(onLoad);
    load.extra.forEach(extra => extra.then(loaded => loaded && onLoad()));
    return load.ready;
};

const clamp01 = n => Math.max(0, Math.min(1, n));

class TextObject {
    constructor (id, text, x, y) {
        this.id = id;
        this.text = text;
        this.x = x;
        this.y = y;
        this.font = 'Arial';
        this.size = 32;
        this.color = '#FFFFFF';
        this.outlineColor = null;
        this.outlineWidth = 0;
        this.align = 'center';
        this.bold = false;
        this.italic = false;
        this.visible = true;
        this.animation = 'none';
        this.animSpeed = 1;
        this.elapsed = 0;
        this.pinned = true;
        this.target = null;
        this.offsetY = 0;
    }

    get fontString () {
        const style = this.italic ? 'italic ' : '';
        const weight = this.bold ? 'bold ' : '';
        return `${style}${weight}${this.size}px "${this.font}"`;
    }
}

class ThunderboltText {
    constructor (runtime) {
        this.runtime = runtime;
        this.objects = new Map();
        this.stuck = new Set();
        this.overlay = createOverlay(runtime, {
            zIndex: 12,
            frame: this.frame.bind(this),
            sample: () => this.stuck.size > 0
        });
    }

    anchor (obj, world, pinned) {
        if (obj.target && !this.overlay.alive(obj.target)) this.release(obj);
        if (obj.target) return (world || this.overlay.projector(false))(obj.target.x, obj.target.y + obj.offsetY);
        return ((obj.pinned ? pinned : world) || this.overlay.projector(obj.pinned))(obj.x, obj.y);
    }

    release (obj) {
        obj.x = obj.target.x;
        obj.y = obj.target.y + obj.offsetY;
        obj.target = null;
        this.stuck.delete(obj);
    }

    frame (ctx, dt, time) {
        let animating = false;
        let shown = false;
        const world = this.overlay.projector(false);
        const pinned = this.overlay.projector(true);
        for (const obj of this.objects.values()) {
            if (!obj.visible) continue;
            shown = true;
            obj.elapsed += dt;
            if (obj.animation !== 'none') animating = true;
            if (!ctx) continue;
            const at = this.anchor(obj, world, pinned);
            if (!this.overlay.onScreen(at, obj.size * at.scale * Math.max(2, obj.text.length))) continue;
            this._drawObject(ctx, obj, time, at);
        }
        return animating || (shown && this.overlay.isRunning());
    }

    _drawObject (ctx, obj, time, at) {
        const scale = at.scale;
        ctx.font = `${obj.italic ? 'italic ' : ''}${obj.bold ? 'bold ' : ''}${obj.size * scale}px "${obj.font}"`;
        ctx.textBaseline = 'middle';

        const chars = obj.text.split('');
        const widths = chars.map(c => ctx.measureText(c).width);
        const totalWidth = widths.reduce((a, b) => a + b, 0);

        let startXOffset;
        if (obj.align === 'left') startXOffset = 0;
        else if (obj.align === 'right') startXOffset = -totalWidth;
        else startXOffset = -totalWidth / 2;

        const cx = at.x;
        const cy = at.y;

        let revealCount = chars.length;
        let entranceProgress = 1;

        if (obj.animation === 'typewriter') {
            const charsPerSec = Math.max(0.1, obj.animSpeed) * 8;
            revealCount = Math.floor(obj.elapsed * charsPerSec);
        } else if (obj.animation === 'fadein' || obj.animation === 'bounce') {
            const duration = 0.6 / Math.max(0.1, obj.animSpeed);
            entranceProgress = clamp01(obj.elapsed / duration);
        }

        let cursor = startXOffset;
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            const w = widths[i];
            let dx = 0;
            let dy = 0;
            let alpha = 1;
            let charScale = 1;
            let color = obj.color;

            if (obj.animation === 'typewriter') {
                if (i >= revealCount) {
                    cursor += w;
                    continue;
                }
            } else if (obj.animation === 'wave') {
                dy = Math.sin((time * obj.animSpeed * 4) + (i * 0.5)) * (obj.size * scale * 0.15);
            } else if (obj.animation === 'shake') {
                dx = ((Math.random() * 2) - 1) * obj.animSpeed * 2 * scale;
                dy = ((Math.random() * 2) - 1) * obj.animSpeed * 2 * scale;
            } else if (obj.animation === 'rainbow') {
                const hue = ((time * obj.animSpeed * 60) + (i * 25)) % 360;
                color = `hsl(${hue}, 90%, 65%)`;
            } else if (obj.animation === 'pulse') {
                charScale = 1 + (0.12 * Math.sin(time * obj.animSpeed * 4));
            } else if (obj.animation === 'glitch') {
                if (Math.random() < 0.05 * obj.animSpeed) {
                    dx = ((Math.random() * 2) - 1) * obj.size * scale * 0.2;
                    dy = ((Math.random() * 2) - 1) * obj.size * scale * 0.2;
                    color = ['#00FFFF', '#FF00FF', '#FFFF00'][Math.floor(Math.random() * 3)];
                }
            } else if (obj.animation === 'fadein') {
                const stagger = clamp01((entranceProgress * chars.length) - i);
                alpha = clamp01(stagger);
            } else if (obj.animation === 'bounce') {
                const stagger = clamp01((entranceProgress * chars.length) - i);
                const eased = stagger < 1 ? 1 - Math.pow(1 - stagger, 3) : 1;
                const overshoot = stagger < 1 ? Math.sin(stagger * Math.PI) * 0.3 : 0;
                dy = ((1 - eased) * -(obj.size * scale)) - (overshoot * (obj.size * scale * 0.2));
                alpha = clamp01(stagger * 3);
            }

            const px = cx + cursor + (w / 2) + dx;
            const py = cy + dy;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(px, py);
            ctx.scale(charScale, charScale);
            ctx.textAlign = 'center';

            if (obj.outlineColor && obj.outlineWidth > 0) {
                ctx.lineWidth = obj.outlineWidth * scale;
                ctx.strokeStyle = obj.outlineColor;
                ctx.strokeText(ch, 0, 0);
            }

            ctx.fillStyle = color;
            ctx.fillText(ch, 0, 0);
            ctx.restore();

            cursor += w;
        }
    }

    _getObj (id, createIfMissing) {
        if (!this.objects.has(id) && createIfMissing) {
            this.objects.set(id, new TextObject(id, '', 0, 0));
        }
        return this.objects.get(id);
    }

    getInfo () {
        return {
            id: 'thunderbolttext',
            name: 'Thunderbolt Text',
            color1: '#9966FF',
            color2: '#774DCB',
            color3: '#552299',
            menuIconURI: menuIconURI,
            blockIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'createText',
                    blockType: 'command',
                    text: 'create text [ID] saying [TEXT] at x:[X] y:[Y]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        TEXT: {type: 'string', defaultValue: 'Hello!'},
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                {
                    opcode: 'setText',
                    blockType: 'command',
                    text: 'set text [ID] to [TEXT]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        TEXT: {type: 'string', defaultValue: 'Hello!'}
                    }
                },
                {
                    opcode: 'setPosition',
                    blockType: 'command',
                    text: 'set position of [ID] to x:[X] y:[Y]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0}
                    }
                },
                '---',
                {
                    opcode: 'stickToMe',
                    blockType: 'command',
                    text: 'stick text [ID] to me with y offset [DY]',
                    filter: ['sprite'],
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        DY: {type: 'number', defaultValue: 40}
                    }
                },
                {
                    opcode: 'pinToScreen',
                    blockType: 'command',
                    text: 'pin text [ID] to screen [ONOFF]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        ONOFF: {type: 'string', menu: 'onOff', defaultValue: 'on'}
                    }
                },
                '---',
                {
                    opcode: 'setFont',
                    blockType: 'command',
                    text: 'set font of [ID] to [FONT]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        FONT: {type: 'string', menu: 'fonts', defaultValue: 'Arial'}
                    }
                },
                {
                    opcode: 'setSize',
                    blockType: 'command',
                    text: 'set size of [ID] to [SIZE]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        SIZE: {type: 'number', defaultValue: 32}
                    }
                },
                {
                    opcode: 'setColor',
                    blockType: 'command',
                    text: 'set color of [ID] to [COLOR]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        COLOR: {type: 'color', defaultValue: '#FFFFFF'}
                    }
                },
                {
                    opcode: 'setOutline',
                    blockType: 'command',
                    text: 'set outline of [ID] to [COLOR] width [WIDTH]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        COLOR: {type: 'color', defaultValue: '#000000'},
                        WIDTH: {type: 'number', defaultValue: 3}
                    }
                },
                {
                    opcode: 'setStyle',
                    blockType: 'command',
                    text: 'set [ID] bold: [BOLD] italic: [ITALIC]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        BOLD: {type: 'string', menu: 'onOff', defaultValue: 'off'},
                        ITALIC: {type: 'string', menu: 'onOff', defaultValue: 'off'}
                    }
                },
                {
                    opcode: 'setAlign',
                    blockType: 'command',
                    text: 'set alignment of [ID] to [ALIGN]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        ALIGN: {type: 'string', menu: 'align', defaultValue: 'center'}
                    }
                },
                '---',
                {
                    opcode: 'setAnimation',
                    blockType: 'command',
                    text: 'animate [ID] with [ANIMATION] at speed [SPEED]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'},
                        ANIMATION: {type: 'string', menu: 'animations', defaultValue: 'wave'},
                        SPEED: {type: 'number', defaultValue: 1}
                    }
                },
                {
                    opcode: 'hasFinishedTyping',
                    blockType: 'Boolean',
                    text: 'has [ID] finished typing?',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'}
                    }
                },
                '---',
                {
                    opcode: 'showText',
                    blockType: 'command',
                    text: 'show text [ID]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'}
                    }
                },
                {
                    opcode: 'hideText',
                    blockType: 'command',
                    text: 'hide text [ID]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'}
                    }
                },
                {
                    opcode: 'deleteText',
                    blockType: 'command',
                    text: 'delete text [ID]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'title'}
                    }
                }
            ],
            menus: {
                onOff: {acceptReporters: false, items: ['on', 'off']},
                align: {acceptReporters: false, items: ['left', 'center', 'right']},
                animations: {
                    acceptReporters: false,
                    items: ['none', 'typewriter', 'wave', 'shake', 'rainbow', 'pulse', 'glitch', 'fadein', 'bounce']
                },
                fonts: {
                    acceptReporters: false,
                    items: [
                        'Arial', 'Georgia', 'Courier New', 'Comic Sans MS', 'Impact',
                        'Verdana', 'Times New Roman', ...Object.keys(KIT_FONTS)
                    ]
                }
            }
        };
    }

    createText (args) {
        this.stuck.delete(this.objects.get(args.ID));
        const obj = new TextObject(args.ID, args.TEXT, Number(args.X), Number(args.Y));
        this.objects.set(args.ID, obj);
        this.overlay.wake();
    }

    setText (args) {
        const obj = this._getObj(args.ID, true);
        obj.text = args.TEXT;
        obj.elapsed = 0;
        this.overlay.wake();
    }

    setPosition (args) {
        const obj = this._getObj(args.ID, true);
        obj.x = Number(args.X);
        obj.y = Number(args.Y);
        obj.target = null;
        this.stuck.delete(obj);
        this.overlay.wake();
    }

    stickToMe (args, util) {
        const obj = this._getObj(args.ID, true);
        obj.target = util.target.isStage ? null : util.target;
        obj.offsetY = Number(args.DY) || 0;
        obj.pinned = false;
        if (obj.target) this.stuck.add(obj);
        else this.stuck.delete(obj);
        this.overlay.wake();
    }

    pinToScreen (args) {
        const obj = this._getObj(args.ID, true);
        const pin = args.ONOFF !== 'off';
        if (obj.target) this.release(obj);
        if (pin !== obj.pinned) {
            const at = pin ? this.overlay.toScreen(obj.x, obj.y) : this.overlay.toWorld(obj.x, obj.y);
            obj.x = at.x;
            obj.y = at.y;
        }
        obj.pinned = pin;
        this.overlay.wake();
    }

    setFont (args) {
        const obj = this._getObj(args.ID, true);
        obj.font = args.FONT;
        loadKitFont(obj.font, this.overlay.wake);
        this.overlay.wake();
    }

    setSize (args) {
        const obj = this._getObj(args.ID, true);
        obj.size = Number(args.SIZE);
        this.overlay.wake();
    }

    setColor (args) {
        const obj = this._getObj(args.ID, true);
        obj.color = args.COLOR;
        this.overlay.wake();
    }

    setOutline (args) {
        const obj = this._getObj(args.ID, true);
        obj.outlineColor = args.COLOR;
        obj.outlineWidth = Number(args.WIDTH);
        this.overlay.wake();
    }

    setStyle (args) {
        const obj = this._getObj(args.ID, true);
        obj.bold = args.BOLD === 'on';
        obj.italic = args.ITALIC === 'on';
        this.overlay.wake();
    }

    setAlign (args) {
        const obj = this._getObj(args.ID, true);
        obj.align = args.ALIGN;
        this.overlay.wake();
    }

    setAnimation (args) {
        const obj = this._getObj(args.ID, true);
        obj.animation = args.ANIMATION;
        obj.animSpeed = Number(args.SPEED);
        obj.elapsed = 0;
        this.overlay.wake();
    }

    hasFinishedTyping (args) {
        const obj = this._getObj(args.ID, false);
        if (!obj) return true;
        if (obj.animation !== 'typewriter') return true;
        const charsPerSec = Math.max(0.1, obj.animSpeed) * 8;
        return Math.floor(obj.elapsed * charsPerSec) >= obj.text.length;
    }

    showText (args) {
        const obj = this._getObj(args.ID, true);
        obj.visible = true;
        this.overlay.wake();
    }

    hideText (args) {
        const obj = this._getObj(args.ID, true);
        obj.visible = false;
        this.overlay.wake();
    }

    deleteText (args) {
        this.stuck.delete(this.objects.get(args.ID));
        this.objects.delete(args.ID);
        this.overlay.wake();
    }
}

export {KIT_FONTS, FONT_PATH, loadKitFont};
export default ThunderboltText;
