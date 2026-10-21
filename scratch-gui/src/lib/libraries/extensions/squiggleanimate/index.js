import {registerKit} from '../../../kits/registry.js';
import {KIT_COLORS} from '../../../themes/tokens.js';
import {peekWorld} from '../../../world/world.js';

const ID = 'squiggleanimate';
const COLORS = KIT_COLORS[ID];

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<rect width="40" height="40" rx="8" fill="${COLORS.color1}"/>` +
    `<path d="M7 29 Q17 29 21 20 T33 11" fill="none" stroke="${COLORS.color3}" stroke-width="3" ` +
    `stroke-linecap="round"/><circle cx="29" cy="12" r="5" fill="#fff"/>` +
    `<path d="M8 16h7M6 21h7M9 26h5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const ICON_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON)}`;

const MAX_DT = 0.1;
const DEFAULT_DT = 1 / 30;
const DEFAULT_FPS = 12;
const MAX_FPS = 60;
const EPSILON = 1e-9;
const CAMERA = 'camera';
const BEFORE_EXECUTE = 'BEFORE_EXECUTE';
const PROJECT_STOP_ALL = 'PROJECT_STOP_ALL';
const HAT = `${ID}_whenClipFrame`;

const BASE_PROPS = ['x', 'y', 'size', 'direction', 'ghost', 'brightness', 'color'];
const CAMERA_PROPS = ['camera x', 'camera y', 'camera zoom'];
const MODES = ['loop', 'once', 'ping-pong'];

const bounceOut = t => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return (n * (t -= 1.5 / d) * t) + 0.75;
    if (t < 2.5 / d) return (n * (t -= 2.25 / d) * t) + 0.9375;
    return (n * (t -= 2.625 / d) * t) + 0.984375;
};

const EASES = Object.freeze({
    linear: t => t,
    smooth: t => (1 - Math.cos(Math.PI * t)) / 2,
    bounce: bounceOut,
    spring: t => {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        return (Math.pow(2, -10 * t) * Math.sin(((t * 10) - 0.75) * ((2 * Math.PI) / 3))) + 1;
    },
    back: t => {
        const c1 = 1.70158;
        return 1 + ((c1 + 1) * Math.pow(t - 1, 3)) + (c1 * Math.pow(t - 1, 2));
    }
});

const CONFLICTS = Object.freeze({
    x: ['x', 'xy'],
    y: ['y', 'xy'],
    xy: ['x', 'y', 'xy']
});

const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const str = value => (value === null || typeof value === 'undefined' ? '' : String(value));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const easeFor = name => EASES[str(name).toLowerCase()] || EASES.linear;

const clearSet = set => set.clear();

const isCameraProp = prop => prop.indexOf(CAMERA) === 0;

const seamFor = runtime => {
    if (typeof window === 'undefined') return null;
    const seam = window.SquiggleWorld;
    return seam && seam.runtime === runtime ? seam : null;
};

const clipFrames = (target, name, defined) => {
    if (defined) {
        const step = defined.from <= defined.to ? 1 : -1;
        const frames = [];
        for (let i = defined.from; i !== defined.to + step; i += step) frames.push(i);
        return frames;
    }
    const frames = [];
    for (let i = 1; ; i++) {
        const index = target.getCostumeIndexByName(`${name}${i}`);
        if (index === -1) break;
        frames.push(index);
    }
    return frames;
};

const costumeIndex = (target, value) => {
    const count = target.getCostumes().length;
    if (!count) return -1;
    const byName = target.getCostumeIndexByName(str(value));
    if (byName !== -1) return byName;
    const n = Math.round(num(value));
    if (!n) return -1;
    return clamp(n, 1, count) - 1;
};

const advanceFrame = playback => {
    const last = playback.frames.length - 1;
    if (playback.mode === 'once') {
        if (playback.index >= last) {
            playback.done = true;
            return false;
        }
        playback.index++;
        return true;
    }
    if (playback.mode === 'ping-pong') {
        if (!last) return false;
        if (playback.index + playback.dir > last || playback.index + playback.dir < 0) playback.dir = -playback.dir;
        playback.index += playback.dir;
        return true;
    }
    playback.index = last ? (playback.index + 1) % (last + 1) : 0;
    return !!last;
};

class SquiggleAnimateBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this.clock = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
        this.last = null;
        this.dt = 0;
        this.tweens = [];
        this.clips = new WeakMap();
        this.playing = new Map();
        this.hits = new WeakMap();
        this.hitTargets = new Set();
        this.pending = [];
        this.live = new Set();
        this.liveReady = false;
        this.detachTick = null;
        this.cameraWrite = {x: NaN, y: NaN, zoom: NaN, hooked: false};
        this.flushCamera = this.flushCamera.bind(this);
        this.tick = this.tick.bind(this);
        this.stepClip = this.stepClip.bind(this);
        this.clearHits = this.clearHits.bind(this);
        this.startHat = this.startHat.bind(this);
        this.stopAll = this.stopAll.bind(this);
        runtime.on(PROJECT_STOP_ALL, this.stopAll);
        this.attachClock();
    }

    attachClock () {
        const seam = seamFor(this.runtime);
        if (seam) {
            this.detachTick = seam.onBeforeExecute(this.tick);
            return;
        }
        const runtime = this.runtime;
        runtime.on(BEFORE_EXECUTE, this.tick);
        this.detachTick = () => runtime.removeListener(BEFORE_EXECUTE, this.tick);
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        const onReady = () => {
            const ready = seamFor(runtime);
            if (!ready) return;
            window.removeEventListener('SquiggleWorldReady', onReady);
            this.detachTick();
            this.detachTick = ready.onBeforeExecute(this.tick);
        };
        window.addEventListener('SquiggleWorldReady', onReady);
    }

    getInfo () {
        const tweenArgs = {
            PROP: {type: 'string', menu: 'props', defaultValue: 'x'},
            V: {type: 'number', defaultValue: 100},
            T: {type: 'number', defaultValue: 1},
            EASE: {type: 'string', menu: 'eases', defaultValue: 'smooth'}
        };
        return {
            id: ID,
            name: 'Animate',
            color1: COLORS.color1,
            color2: COLORS.color2,
            color3: COLORS.color3,
            menuIconURI: ICON_URI,
            blocks: [
                {
                    opcode: 'tween',
                    blockType: 'command',
                    text: 'tween [PROP] to [V] in [T] secs [EASE]',
                    arguments: tweenArgs
                },
                {
                    opcode: 'startTween',
                    blockType: 'command',
                    text: 'start tween [PROP] to [V] in [T] secs [EASE]',
                    arguments: tweenArgs
                },
                {
                    opcode: 'glideTo',
                    blockType: 'command',
                    text: 'glide to x [X] y [Y] in [T] secs [EASE]',
                    filter: ['sprite'],
                    arguments: {
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0},
                        T: {type: 'number', defaultValue: 1},
                        EASE: {type: 'string', menu: 'eases', defaultValue: 'smooth'}
                    }
                },
                {
                    opcode: 'stopTweens',
                    blockType: 'command',
                    text: 'stop my tweens'
                },
                {
                    opcode: 'isTweening',
                    blockType: 'Boolean',
                    text: 'tweening?'
                },
                '---',
                {
                    opcode: 'defineClip',
                    blockType: 'command',
                    text: 'define clip [NAME] from costume [A] to [B] at [FPS] fps',
                    arguments: {
                        NAME: {type: 'string', defaultValue: 'walk'},
                        A: {type: 'string', menu: 'costumes', defaultValue: '1'},
                        B: {type: 'string', menu: 'costumes', defaultValue: '2'},
                        FPS: {type: 'number', defaultValue: DEFAULT_FPS}
                    }
                },
                {
                    opcode: 'playClip',
                    blockType: 'command',
                    text: 'play clip [NAME] [MODE]',
                    arguments: {
                        NAME: {type: 'string', defaultValue: 'walk'},
                        MODE: {type: 'string', menu: 'modes', defaultValue: 'loop'}
                    }
                },
                {
                    opcode: 'playClipWait',
                    blockType: 'command',
                    text: 'play clip [NAME] once and wait',
                    arguments: {NAME: {type: 'string', defaultValue: 'walk'}}
                },
                {
                    opcode: 'whenClipFrame',
                    blockType: 'hat',
                    isEdgeActivated: false,
                    text: 'when clip [NAME] hits frame [N]',
                    arguments: {
                        NAME: {type: 'string', defaultValue: 'walk'},
                        N: {type: 'number', defaultValue: 1}
                    }
                },
                {
                    opcode: 'clipFrame',
                    blockType: 'reporter',
                    text: 'clip frame'
                },
                {
                    opcode: 'deltaTime',
                    blockType: 'reporter',
                    text: 'delta time'
                }
            ],
            menus: {
                props: {acceptReporters: true, items: 'propMenu'},
                eases: {acceptReporters: false, items: Object.keys(EASES)},
                modes: {acceptReporters: false, items: MODES},
                costumes: {acceptReporters: true, items: 'costumeMenu'}
            }
        };
    }

    cameraActive () {
        const seam = seamFor(this.runtime);
        return !!(seam && typeof seam.camera === 'function' && seam.camera());
    }

    worldLoaded () {
        return !!peekWorld(this.runtime);
    }

    propMenu () {
        return this.worldLoaded() ? BASE_PROPS.concat(CAMERA_PROPS) : BASE_PROPS.slice();
    }

    costumeMenu () {
        const target = this.runtime.getEditingTarget && this.runtime.getEditingTarget();
        const names = target ? target.getCostumes().map(costume => costume.name) : [];
        return names.length ? names : [''];
    }

    camera () {
        const world = peekWorld(this.runtime);
        return world ? world.camera : null;
    }

    read (target, prop) {
        if (isCameraProp(prop)) {
            const camera = this.camera();
            if (!camera) return null;
            const pending = this.cameraWrite;
            if (prop === 'camera x') return [Number.isNaN(pending.x) ? camera.state.x : pending.x];
            if (prop === 'camera y') return [Number.isNaN(pending.y) ? camera.state.y : pending.y];
            if (prop === 'camera zoom') return [Number.isNaN(pending.zoom) ? camera.state.zoom * 100 : pending.zoom];
            return null;
        }
        if (target.isStage && ['x', 'y', 'xy', 'size', 'direction'].indexOf(prop) !== -1) return null;
        switch (prop) {
        case 'x': return [target.x];
        case 'y': return [target.y];
        case 'xy': return [target.x, target.y];
        case 'size': return [target.size];
        case 'direction': return [target.direction];
        case 'ghost':
        case 'brightness':
        case 'color':
            return [num(target.effects[prop])];
        default: return null;
        }
    }

    write (target, prop, v, w) {
        switch (prop) {
        case 'x': target.setXY(v, target.y); return;
        case 'y': target.setXY(target.x, v); return;
        case 'xy': target.setXY(v, w); return;
        case 'size': target.setSize(v); return;
        case 'direction': target.setDirection(v); return;
        case 'ghost': target.setEffect('ghost', clamp(v, 0, 100)); return;
        case 'brightness': target.setEffect('brightness', clamp(v, -100, 100)); return;
        case 'color': target.setEffect('color', v); return;
        }
        if (!this.camera()) return;
        const pending = this.cameraWrite;
        if (prop === 'camera x') pending.x = v;
        else if (prop === 'camera y') pending.y = v;
        else if (prop === 'camera zoom') pending.zoom = v;
        if (pending.hooked) return;
        const seam = seamFor(this.runtime);
        if (!seam) {
            this.flushCamera();
            return;
        }
        seam.onAfterExecute(this.flushCamera);
        pending.hooked = true;
    }

    flushCamera () {
        const pending = this.cameraWrite;
        if (Number.isNaN(pending.x) && Number.isNaN(pending.y) && Number.isNaN(pending.zoom)) return;
        const camera = this.camera();
        if (camera) {
            camera.setTarget(Number.isNaN(pending.x) ? null : pending.x, Number.isNaN(pending.y) ? null : pending.y,
                Number.isNaN(pending.zoom) ? null : pending.zoom);
        }
        pending.x = NaN;
        pending.y = NaN;
        pending.zoom = NaN;
    }

    startTween (args, util) {
        const prop = str(args.PROP).toLowerCase();
        if (this.propMenu().indexOf(prop) === -1) return {done: true};
        return this.begin(util.target, prop, [num(args.V)], num(args.T), args.EASE);
    }

    begin (target, prop, to, seconds, ease) {
        const tween = {
            owner: target,
            prop,
            from: null,
            to,
            duration: Math.max(0, seconds),
            elapsed: 0,
            ease: easeFor(ease),
            done: false
        };
        const subject = isCameraProp(prop) ? CAMERA : target;
        const clash = CONFLICTS[prop] || [prop];
        this.tweens = this.tweens.filter(other => {
            const otherSubject = isCameraProp(other.prop) ? CAMERA : other.owner;
            if (otherSubject !== subject || clash.indexOf(other.prop) === -1) return true;
            other.done = true;
            return false;
        });
        tween.from = this.read(target, prop);
        if (!tween.from) {
            tween.done = true;
            return tween;
        }
        if (tween.duration === 0) {
            this.write(target, prop, to[0], to[1]);
            tween.done = true;
            return tween;
        }
        this.tweens.push(tween);
        return tween;
    }

    waitFor (util, start) {
        const frame = util.stackFrame;
        if (!frame.sqAnimate) {
            frame.sqAnimate = start();
            if (frame.sqAnimate.done) return;
            util.yield();
            return;
        }
        if (!frame.sqAnimate.done) util.yield();
    }

    tween (args, util) {
        this.waitFor(util, () => this.startTween(args, util));
    }

    glideTo (args, util) {
        this.waitFor(util, () => this.begin(util.target, 'xy', [num(args.X), num(args.Y)], num(args.T), args.EASE));
    }

    stopTweens (args, util) {
        const owner = util.target;
        this.tweens = this.tweens.filter(tween => {
            if (tween.owner !== owner) return true;
            tween.done = true;
            return false;
        });
    }

    isTweening (args, util) {
        return this.tweens.some(tween => tween.owner === util.target && !tween.done);
    }

    defineClip (args, util) {
        const target = util.target;
        const from = costumeIndex(target, args.A);
        const to = costumeIndex(target, args.B);
        if (from === -1 || to === -1) return;
        let clips = this.clips.get(target.sprite);
        if (!clips) {
            clips = new Map();
            this.clips.set(target.sprite, clips);
        }
        clips.set(str(args.NAME).trim()
            .toLowerCase(), {from, to, fps: clamp(num(args.FPS) || DEFAULT_FPS, 1, MAX_FPS)});
    }

    play (target, rawName, mode) {
        const name = str(rawName).trim();
        const key = name.toLowerCase();
        const clips = this.clips.get(target.sprite);
        const defined = clips ? clips.get(key) : null;
        const frames = clipFrames(target, name, defined);
        const previous = this.playing.get(target);
        if (previous) previous.done = true;
        if (!frames.length) {
            this.playing.delete(target);
            return {done: true};
        }
        const playback = {
            key,
            frames,
            fps: defined ? defined.fps : DEFAULT_FPS,
            mode: MODES.indexOf(mode) === -1 ? 'loop' : mode,
            index: 0,
            dir: 1,
            elapsed: 0,
            done: false
        };
        this.playing.set(target, playback);
        target.setCostume(frames[0]);
        this.pending.push(target, key, 1);
        return playback;
    }

    playClip (args, util) {
        this.play(util.target, args.NAME, str(args.MODE));
    }

    playClipWait (args, util) {
        this.waitFor(util, () => this.play(util.target, args.NAME, 'once'));
    }

    hit (target, key, frame) {
        let keys = this.hits.get(target);
        if (!keys) {
            keys = new Map();
            this.hits.set(target, keys);
        }
        let frames = keys.get(key);
        if (!frames) {
            frames = new Set();
            keys.set(key, frames);
        }
        frames.add(frame);
        this.hitTargets.add(target);
    }

    clearHits (target) {
        const keys = this.hits.get(target);
        if (keys) keys.forEach(clearSet);
    }

    startHat (target) {
        this.runtime.startHats(HAT, null, target);
    }

    whenClipFrame (args, util) {
        if (!this.hitTargets.has(util.target)) return false;
        const frames = this.hits.get(util.target).get(str(args.NAME).trim()
            .toLowerCase());
        return !!frames && frames.has(Math.round(num(args.N)));
    }

    clipFrame (args, util) {
        const playback = this.playing.get(util.target);
        return playback ? playback.index + 1 : 0;
    }

    deltaTime () {
        return this.dt;
    }

    alive (target) {
        if (!this.liveReady) {
            const targets = this.runtime.executableTargets;
            this.live.clear();
            for (let i = 0; i < targets.length; i++) this.live.add(targets[i]);
            this.liveReady = true;
        }
        return this.live.has(target);
    }

    tick () {
        const now = this.clock();
        const raw = this.last === null ? DEFAULT_DT : (now - this.last) / 1000;
        this.last = now;
        this.dt = clamp(raw, 0, MAX_DT);
        this.liveReady = false;
        if (this.hitTargets.size) {
            this.hitTargets.forEach(this.clearHits);
            this.hitTargets.clear();
        }
        const pending = this.pending;
        for (let i = 0; i < pending.length; i += 3) this.hit(pending[i], pending[i + 1], pending[i + 2]);
        pending.length = 0;
        this.stepTweens(this.dt);
        if (this.playing.size) this.playing.forEach(this.stepClip);
        if (this.hitTargets.size) this.hitTargets.forEach(this.startHat);
    }

    stepTweens (dt) {
        const tweens = this.tweens;
        if (!tweens.length) return;
        let kept = 0;
        for (let i = 0; i < tweens.length; i++) {
            const tween = tweens[i];
            if (tween.done) continue;
            if (!isCameraProp(tween.prop) && !this.alive(tween.owner)) {
                tween.done = true;
                continue;
            }
            tween.elapsed += dt;
            const t = tween.elapsed >= tween.duration - EPSILON ? 1 : tween.elapsed / tween.duration;
            const k = t >= 1 ? 1 : tween.ease(t);
            const from = tween.from;
            const to = tween.to;
            const v = from[0] + ((to[0] - from[0]) * k);
            const w = to.length > 1 ? from[1] + ((to[1] - from[1]) * k) : 0;
            this.write(tween.owner, tween.prop, v, w);
            if (t >= 1) tween.done = true;
            else tweens[kept++] = tween;
        }
        tweens.length = kept;
    }

    stepClip (playback, target) {
        if (!this.alive(target)) {
            playback.done = true;
            this.playing.delete(target);
            return;
        }
        if (playback.done) return;
        const step = 1 / playback.fps;
        playback.elapsed += this.dt;
        let moved = false;
        while (playback.elapsed >= step - EPSILON && !playback.done) {
            playback.elapsed -= step;
            if (advanceFrame(playback)) {
                moved = true;
                this.hit(target, playback.key, playback.index + 1);
            }
        }
        if (moved) target.setCostume(playback.frames[playback.index]);
    }

    stopAll () {
        this.tweens.forEach(tween => {
            tween.done = true;
        });
        this.tweens = [];
        this.playing.forEach(playback => {
            playback.done = true;
        });
        this.playing.clear();
        this.hitTargets.forEach(this.clearHits);
        this.hitTargets.clear();
        this.pending.length = 0;
    }
}

registerKit({
    id: ID,
    extension: SquiggleAnimateBlocks
});

export {EASES, advanceFrame, MAX_DT};
export default SquiggleAnimateBlocks;
