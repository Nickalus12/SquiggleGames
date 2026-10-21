import {peekWorld} from '../../../world/world.js';
import {cameraActive, createOverlay} from '../vfx/overlay.js';

const menuIconURI = 'data:image/svg+xml;base64,' +
    'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0i' +
    'MCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSI4IiBmaWxsPSIjRkZENTAwIi8+PHBhdGggZD0i' +
    'TTIwIDEybDEuNSAzLjVsMy41IDEuNWwtMy41IDEuNWwtMS41IDMuNWwtMS41LTMuNWwtMy41LTEuNWwzLjUtMS41bDEuNS0z' +
    'LjV6IiBmaWxsPSIjZmZmIi8+PC9zdmc+';

class Particle {
    constructor (x, y, vx, vy, size, color, life, gravity, fade, shape, trail) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.size = size;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.gravity = gravity;
        this.fade = fade;
        this.shape = shape;
        this.trailEnabled = trail;
        this.history = [];
    }

    update (dt, trailLength) {
        if (this.trailEnabled) {
            this.history.push({x: this.x, y: this.y});
            if (this.history.length > trailLength) this.history.shift();
        }
        this.vy += this.gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        return this.life > 0;
    }

    get alpha () {
        if (!this.fade) return 1;
        return Math.max(0, this.life / this.maxLife);
    }
}

class ParticleSystem {
    constructor (id) {
        this.id = id;
        this.particles = [];
        this.gravity = 200;
        this.running = true;
        this.shape = 'circle';
        this.trailEnabled = false;
        this.trailLength = 8;
    }

    emit (count, x, y, color, size, speed, lifetime, spread) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2 * (spread / 360);
            const baseAngle = (-Math.PI / 2) - (Math.PI * (spread / 360));
            const finalAngle = baseAngle + angle;
            const s = speed * (0.5 + (Math.random() * 0.5));
            const vx = Math.cos(finalAngle) * s;
            const vy = Math.sin(finalAngle) * s;
            this.particles.push(
                new Particle(
                    x, y, vx, vy, size, color, lifetime, this.gravity, true,
                    this.shape, this.trailEnabled
                )
            );
        }
    }

    update (dt) {
        if (!this.running) return;
        this.particles = this.particles.filter(p => p.update(dt, this.trailLength));
    }

    clear () {
        this.particles = [];
    }
}

class ThunderboltSystem {
    constructor (runtime) {
        this.runtime = runtime;
        this.systems = new Map();
        this.shakeDuration = 0;
        this.shakeIntensity = 0;
        this.shakeElapsed = 0;
        this.overlay = createOverlay(runtime, {zIndex: 10, frame: this.frame.bind(this)});
    }

    _drawShape (ctx, shape, x, y, size) {
        switch (shape) {
        case 'square':
            ctx.beginPath();
            ctx.rect(x - size, y - size, size * 2, size * 2);
            ctx.fill();
            break;
        case 'triangle':
            ctx.beginPath();
            ctx.moveTo(x, y - size);
            ctx.lineTo(x - size, y + size);
            ctx.lineTo(x + size, y + size);
            ctx.closePath();
            ctx.fill();
            break;
        case 'star': {
            const spikes = 5;
            const outerR = size;
            const innerR = size / 2.5;
            let rot = (Math.PI / 2) * 3;
            const step = Math.PI / spikes;
            ctx.beginPath();
            ctx.moveTo(x, y - outerR);
            for (let i = 0; i < spikes; i++) {
                let sx = x + (Math.cos(rot) * outerR);
                let sy = y + (Math.sin(rot) * outerR);
                ctx.lineTo(sx, sy);
                rot += step;
                sx = x + (Math.cos(rot) * innerR);
                sy = y + (Math.sin(rot) * innerR);
                ctx.lineTo(sx, sy);
                rot += step;
            }
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 'circle':
        default:
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
    }

    frame (ctx, dt) {
        let count = 0;
        let moving = false;
        for (const system of this.systems.values()) {
            system.update(dt);
            count += system.particles.length;
            if (system.running && system.particles.length) moving = true;
        }
        const shaking = this.shakeElapsed < this.shakeDuration;
        if (ctx && count) this.paint(ctx, dt, shaking);
        else if (shaking) this.shakeElapsed += dt;
        return moving || shaking || (count > 0 && this.overlay.isRunning());
    }

    paint (ctx, dt, shaking) {
        ctx.save();
        if (shaking) {
            this.shakeElapsed += dt;
            const falloff = Math.max(0, 1 - (this.shakeElapsed / this.shakeDuration));
            ctx.translate(((Math.random() * 2) - 1) * this.shakeIntensity * falloff,
                ((Math.random() * 2) - 1) * this.shakeIntensity * falloff);
        }
        const project = this.overlay.projector(false);
        for (const system of this.systems.values()) {
            for (const p of system.particles) {
                const at = project(p.x, p.y);
                const drawSize = Math.max(1, p.size * at.scale);
                ctx.fillStyle = p.color;
                if (p.trailEnabled && p.history.length > 1) {
                    for (let i = 0; i < p.history.length; i++) {
                        const pt = project(p.history[i].x, p.history[i].y);
                        if (!this.overlay.onScreen(pt, drawSize)) continue;
                        ctx.globalAlpha = p.alpha * ((i + 1) / p.history.length) * 0.5;
                        this._drawShape(ctx, p.shape, pt.x, pt.y, drawSize * 0.6);
                    }
                }
                if (!this.overlay.onScreen(at, drawSize * 2)) continue;
                ctx.globalAlpha = p.alpha;
                this._drawShape(ctx, p.shape, at.x, at.y, drawSize);
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _getSystem (id) {
        if (!this.systems.has(id)) {
            this.systems.set(id, new ParticleSystem(id));
        }
        return this.systems.get(id);
    }

    getInfo () {
        return {
            id: 'thunderboltparticlesystem',
            name: 'Thunderbolt Particles',
            color1: '#FFD500',
            color2: '#E6C200',
            color3: '#CCAA00',
            menuIconURI: menuIconURI,
            blockIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'createSystem',
                    blockType: 'command',
                    text: 'create particle system [ID]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'sparkles'}
                    }
                },
                {
                    opcode: 'emit',
                    blockType: 'command',
                    text: 'emit [COUNT] particles at x:[X] y:[Y] color [COLOR] size [SIZE] speed [SPEED] ' +
                        'lifetime [LIFE] spread [SPREAD] in [ID]',
                    arguments: {
                        COUNT: {type: 'number', defaultValue: 10},
                        X: {type: 'number', defaultValue: 0},
                        Y: {type: 'number', defaultValue: 0},
                        COLOR: {type: 'color', defaultValue: '#FFD500'},
                        SIZE: {type: 'number', defaultValue: 5},
                        SPEED: {type: 'number', defaultValue: 100},
                        LIFE: {type: 'number', defaultValue: 1},
                        SPREAD: {type: 'number', defaultValue: 360},
                        ID: {type: 'string', defaultValue: 'sparkles'}
                    }
                },
                {
                    opcode: 'setShape',
                    blockType: 'command',
                    text: 'set particle shape to [SHAPE] for [ID]',
                    arguments: {
                        SHAPE: {type: 'string', menu: 'shapes', defaultValue: 'circle'},
                        ID: {type: 'string', defaultValue: 'sparkles'}
                    }
                },
                {
                    opcode: 'setTrail',
                    blockType: 'command',
                    text: 'set trail [TRAIL] with length [LENGTH] for [ID]',
                    arguments: {
                        TRAIL: {type: 'string', menu: 'onOff', defaultValue: 'on'},
                        LENGTH: {type: 'number', defaultValue: 8},
                        ID: {type: 'string', defaultValue: 'sparkles'}
                    }
                },
                {
                    opcode: 'setGravity',
                    blockType: 'command',
                    text: 'set gravity to [GRAVITY] for [ID]',
                    arguments: {
                        GRAVITY: {type: 'number', defaultValue: 200},
                        ID: {type: 'string', defaultValue: 'sparkles'}
                    }
                },
                {
                    opcode: 'setRunning',
                    blockType: 'command',
                    text: 'set [ID] running [RUNNING]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'sparkles'},
                        RUNNING: {
                            type: 'string',
                            menu: 'onOff',
                            defaultValue: 'on'
                        }
                    }
                },
                {
                    opcode: 'clearSystem',
                    blockType: 'command',
                    text: 'clear particles in [ID]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'sparkles'}
                    }
                },
                {
                    opcode: 'particleCount',
                    blockType: 'reporter',
                    text: 'particle count in [ID]',
                    arguments: {
                        ID: {type: 'string', defaultValue: 'sparkles'}
                    }
                },
                '---',
                {
                    opcode: 'shakeScreen',
                    blockType: 'command',
                    text: 'shake screen for [DURATION] seconds with intensity [INTENSITY]',
                    arguments: {
                        DURATION: {type: 'number', defaultValue: 0.5},
                        INTENSITY: {type: 'number', defaultValue: 10}
                    }
                }
            ],
            menus: {
                onOff: {
                    acceptReporters: false,
                    items: ['on', 'off']
                },
                shapes: {
                    acceptReporters: false,
                    items: ['circle', 'square', 'triangle', 'star']
                }
            }
        };
    }

    createSystem (args) {
        this._getSystem(args.ID);
    }

    emit (args) {
        const system = this._getSystem(args.ID);
        system.emit(
            Math.max(0, Math.round(args.COUNT)),
            Number(args.X),
            Number(args.Y),
            args.COLOR,
            Number(args.SIZE),
            Number(args.SPEED),
            Number(args.LIFE),
            Number(args.SPREAD)
        );
        this.overlay.wake();
    }

    setShape (args) {
        const system = this._getSystem(args.ID);
        system.shape = args.SHAPE;
    }

    setTrail (args) {
        const system = this._getSystem(args.ID);
        system.trailEnabled = args.TRAIL === 'on';
        system.trailLength = Math.max(1, Math.round(Number(args.LENGTH)));
    }

    setGravity (args) {
        const system = this._getSystem(args.ID);
        system.gravity = Number(args.GRAVITY);
    }

    setRunning (args) {
        const system = this._getSystem(args.ID);
        system.running = args.RUNNING === 'on';
        this.overlay.wake();
    }

    clearSystem (args) {
        const system = this._getSystem(args.ID);
        system.clear();
        this.overlay.wake();
    }

    particleCount (args) {
        const system = this._getSystem(args.ID);
        return system.particles.length;
    }

    shakeScreen (args) {
        const duration = Math.max(0, Number(args.DURATION) || 0);
        const intensity = Math.max(0, Number(args.INTENSITY) || 0);
        const camera = cameraActive(this.runtime) && peekWorld(this.runtime);
        if (camera) {
            camera.camera.shake(duration, intensity);
            return;
        }
        this.shakeDuration = duration;
        this.shakeIntensity = intensity;
        this.shakeElapsed = 0;
        this.overlay.wake();
    }
}

export default ThunderboltSystem;
