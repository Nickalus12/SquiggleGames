import {peekWorld} from '../../../world/world.js';
import {cameraActive, createOverlay, onStep} from './overlay.js';

const menuIconURI = 'data:image/svg+xml;base64,' +
    'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0i' +
    'MCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSI4IiBmaWxsPSIjRkY2NjgwIi8+PHBhdGggZD0i' +
    'TTEyIDEyaDE2djEyaC0xNnYtMTJ6TTggMjBoMnY0aC0ydi00ek0zMCAyMGgydjRoLTJ2LTR6IiBmaWxsPSIjZmZmIi8+PC9z' +
    'dmc+';

const clamp01 = n => Math.max(0, Math.min(1, n));
const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const idle = () => ({
    shake: {elapsed: 0, duration: 0, intensity: 0},
    zoom: {elapsed: 0, duration: 0, amount: 0, camera: null, start: 0, applied: 1, written: null},
    tilt: {from: 0, to: 0, elapsed: 0, duration: 0, current: 0},
    flash: {r: 255, g: 255, b: 255, elapsed: 0, duration: 0},
    vignette: {elapsed: 0, duration: 0, intensity: 0}
});

class ThunderboltVFX {
    constructor (runtime) {
        this.runtime = runtime;
        Object.assign(this, idle());
        this.transform = '';
        this.clock = now;
        this.overlay = createOverlay(runtime, {zIndex: 11, frame: this.frame.bind(this)});
        this.disposeStep = null;
        this.stageCanvas = this.overlay.stageCanvas;
        if (this.stageCanvas && this.stageCanvas.style) this.stageCanvas.style.transformOrigin = 'center center';
    }

    worldCamera () {
        if (!cameraActive(this.runtime)) return null;
        const world = peekWorld(this.runtime);
        return world ? world.camera : null;
    }

    setTransform (value) {
        if (value === this.transform) return;
        this.transform = value;
        if (this.stageCanvas && this.stageCanvas.style) this.stageCanvas.style.transform = value;
    }

    stepZoom (dt) {
        const zoom = this.zoom;
        if (zoom.camera || zoom.elapsed >= zoom.duration) return 1;
        zoom.elapsed += dt;
        const progress = clamp01(zoom.elapsed / zoom.duration);
        return 1 + (zoom.amount * Math.sin(Math.PI * progress));
    }

    applyPunch (factor) {
        const zoom = this.zoom;
        const camera = zoom.camera;
        const current = camera.state.zoom;
        const base = current === zoom.written ? current / zoom.applied : current;
        camera.setTarget(null, null, base * factor * 100);
        zoom.applied = factor;
        zoom.written = camera.state.zoom;
    }

    stepPunch () {
        const zoom = this.zoom;
        if (!zoom.camera) return;
        const progress = clamp01((this.clock() - zoom.start) / 1000 / zoom.duration);
        this.applyPunch(progress >= 1 ? 1 : 1 + (zoom.amount * Math.sin(Math.PI * progress)));
        if (progress >= 1) zoom.camera = null;
    }

    endPunch () {
        if (!this.zoom.camera) return;
        this.applyPunch(1);
        this.zoom.camera = null;
    }

    frame (ctx, dt) {
        let live = false;
        let shakeX = 0;
        let shakeY = 0;
        if (this.shake.elapsed < this.shake.duration) {
            this.shake.elapsed += dt;
            const falloff = Math.max(0, 1 - (this.shake.elapsed / this.shake.duration));
            shakeX = ((Math.random() * 2) - 1) * this.shake.intensity * falloff;
            shakeY = ((Math.random() * 2) - 1) * this.shake.intensity * falloff;
            live = true;
        }
        const zooming = !this.zoom.camera && this.zoom.elapsed < this.zoom.duration;
        const zoomScale = this.stepZoom(dt);
        live = live || zooming;
        if (this.tilt.elapsed < this.tilt.duration) {
            this.tilt.elapsed += dt;
            const progress = clamp01(this.tilt.elapsed / this.tilt.duration);
            this.tilt.current = this.tilt.from + ((this.tilt.to - this.tilt.from) * easeOutCubic(progress));
            live = true;
        }
        const still = !shakeX && !shakeY && zoomScale === 1 && !this.tilt.current;
        this.setTransform(still ? '' :
            `translate(${shakeX}px, ${shakeY}px) scale(${zoomScale}) rotate(${this.tilt.current}deg)`);
        const flashing = this.flash.elapsed < this.flash.duration;
        const pulsing = this.vignette.elapsed < this.vignette.duration;
        if (flashing) this.flash.elapsed += dt;
        if (pulsing) this.vignette.elapsed += dt;
        if (ctx) this.paint(ctx, flashing, pulsing);
        return live || flashing || pulsing;
    }

    paint (ctx, flashing, pulsing) {
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        if (flashing) {
            const alpha = 1 - clamp01(this.flash.elapsed / this.flash.duration);
            ctx.fillStyle = `rgba(${this.flash.r}, ${this.flash.g}, ${this.flash.b}, ${alpha})`;
            ctx.fillRect(0, 0, w, h);
        }
        if (pulsing) {
            const progress = clamp01(this.vignette.elapsed / this.vignette.duration);
            const alpha = this.vignette.intensity * Math.sin(Math.PI * progress);
            const gradient = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);
        }
    }

    hexToRgb (hex) {
        const value = parseInt(String(hex).replace('#', ''), 16) || 0;
        return {
            r: (value >> 16) & 255,
            g: (value >> 8) & 255,
            b: value & 255
        };
    }

    getInfo () {
        return {
            id: 'thunderboltvfx',
            name: 'Thunderbolt VFX',
            color1: '#FF6680',
            color2: '#E6415C',
            color3: '#CC2244',
            menuIconURI: menuIconURI,
            blockIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'impactFrame',
                    blockType: 'command',
                    text: 'impact frame! flash [COLOR] zoom [ZOOM] shake [SHAKE] duration [DURATION]',
                    arguments: {
                        COLOR: {type: 'color', defaultValue: '#FFFFFF'},
                        ZOOM: {type: 'number', defaultValue: 0.15},
                        SHAKE: {type: 'number', defaultValue: 12},
                        DURATION: {type: 'number', defaultValue: 0.25}
                    }
                },
                '---',
                {
                    opcode: 'screenFlash',
                    blockType: 'command',
                    text: 'screen flash [COLOR] for [DURATION] seconds',
                    arguments: {
                        COLOR: {type: 'color', defaultValue: '#FFFFFF'},
                        DURATION: {type: 'number', defaultValue: 0.3}
                    }
                },
                {
                    opcode: 'zoomPunch',
                    blockType: 'command',
                    text: 'zoom punch by [AMOUNT] over [DURATION] seconds',
                    arguments: {
                        AMOUNT: {type: 'number', defaultValue: 0.2},
                        DURATION: {type: 'number', defaultValue: 0.3}
                    }
                },
                {
                    opcode: 'shakeScreen',
                    blockType: 'command',
                    text: 'shake screen for [DURATION] seconds with intensity [INTENSITY]',
                    arguments: {
                        DURATION: {type: 'number', defaultValue: 0.5},
                        INTENSITY: {type: 'number', defaultValue: 10}
                    }
                },
                {
                    opcode: 'tiltCamera',
                    blockType: 'command',
                    text: 'tilt camera to [DEGREES] degrees over [DURATION] seconds',
                    arguments: {
                        DEGREES: {type: 'number', defaultValue: 5},
                        DURATION: {type: 'number', defaultValue: 0.4}
                    }
                },
                {
                    opcode: 'vignettePulse',
                    blockType: 'command',
                    text: 'vignette pulse intensity [INTENSITY] over [DURATION] seconds',
                    arguments: {
                        INTENSITY: {type: 'number', defaultValue: 0.6},
                        DURATION: {type: 'number', defaultValue: 0.6}
                    }
                },
                '---',
                {
                    opcode: 'resetCamera',
                    blockType: 'command',
                    text: 'reset camera'
                }
            ]
        };
    }

    startShake (duration, intensity) {
        const camera = this.worldCamera();
        if (camera) {
            camera.shake(duration, intensity);
            this.shake = {elapsed: 0, duration: 0, intensity: 0};
        } else {
            this.shake = {elapsed: 0, duration, intensity};
        }
        this.overlay.wake();
    }

    startZoom (duration, amount) {
        this.endPunch();
        const camera = this.worldCamera();
        this.zoom = {elapsed: 0, duration, amount, camera, start: this.clock(), applied: 1, written: null};
        if (camera && !this.disposeStep) this.disposeStep = onStep(this.runtime, this.stepPunch.bind(this));
        if (!camera) this.overlay.wake();
    }

    startFlash (color, duration) {
        const {r, g, b} = this.hexToRgb(color);
        this.flash = {r, g, b, elapsed: 0, duration};
        this.overlay.wake();
    }

    impactFrame (args) {
        const duration = Math.max(0.01, num(args.DURATION));
        this.startFlash(args.COLOR, duration * 0.6);
        this.startZoom(duration, num(args.ZOOM));
        this.startShake(duration, num(args.SHAKE));
    }

    screenFlash (args) {
        this.startFlash(args.COLOR, Math.max(0.01, num(args.DURATION)));
    }

    zoomPunch (args) {
        this.startZoom(Math.max(0.01, num(args.DURATION)), num(args.AMOUNT));
    }

    shakeScreen (args) {
        this.startShake(Math.max(0.01, num(args.DURATION)), Math.max(0, num(args.INTENSITY)));
    }

    tiltCamera (args) {
        this.tilt = {
            from: this.tilt.current,
            to: num(args.DEGREES),
            elapsed: 0,
            duration: Math.max(0.01, num(args.DURATION)),
            current: this.tilt.current
        };
        this.overlay.wake();
    }

    vignettePulse (args) {
        this.vignette = {
            elapsed: 0,
            duration: Math.max(0.01, num(args.DURATION)),
            intensity: clamp01(num(args.INTENSITY))
        };
        this.overlay.wake();
    }

    resetCamera () {
        this.endPunch();
        const camera = this.worldCamera();
        if (camera) camera.shake(0, 0);
        Object.assign(this, idle());
        this.setTransform('');
        this.overlay.wake();
    }
}

export default ThunderboltVFX;
