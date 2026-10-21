import {ok, near, section, done} from '../../../world/harness.mjs';
import {boot, fixedClock, frame, frames, pending} from '../vfx/overlay-harness.mjs';

const {default: ThunderboltSystem} = await import('./index.js');

const {runtime, world, step} = await boot();

section('particles on the display frame');
const particles = new ThunderboltSystem(runtime);
fixedClock(particles.overlay);
frame();
const ctx = particles.overlay.ctx;
particles.setGravity({ID: 'fx', GRAVITY: 0});
particles.emit({ID: 'fx', COUNT: 5, X: 100, Y: 0, COLOR: '#ff0000', SIZE: 4, SPEED: 0, LIFE: 1, SPREAD: 0});
frame();
ok('particles draw in stage units', ctx.calls.some(c => c[0] === 'arc' && c[1] === 680 && c[2] === 360));
step();
step();
const life = particles.systems.get('fx').particles[0].life;
ok('a vm step does not advance the simulation', near(life, 1 - (1 / 60)), life);
frames(3);
ok('each display frame advances by wall clock dt', near(particles.systems.get('fx').particles[0].life, 1 - (4 / 60)));
frames(80);
ok('spent particles leave and the loop sleeps', particles.particleCount({ID: 'fx'}) === 0 && pending() === 0);

section('trails');
particles.setGravity({ID: 'trail', GRAVITY: 0});
particles.setTrail({ID: 'trail', TRAIL: 'on', LENGTH: 8});
particles.emit({ID: 'trail', COUNT: 1, X: 0, Y: -100, COLOR: '#00ff00', SIZE: 4, SPEED: 600, LIFE: 3, SPREAD: 0});
frames(12);
const runner = particles.systems.get('trail').particles[0];
ok('a default trail keeps eight display frames', runner.history.length === 8, runner.history.length);
const span = (runner.y - runner.history[0].y) / runner.vy;
ok('a default trail covers about 133 ms', near(span, 8 / 60), span);
let culled = false;
let trailDrawn = 0;
for (let i = 0; i < 60 && !culled; i++) {
    ctx.calls.length = 0;
    frame();
    const head = particles.overlay.project(runner.x, runner.y, false);
    if (head.y > 720 + 16) {
        culled = true;
        trailDrawn = ctx.calls.filter(c => c[0] === 'arc').length;
    }
}
ok('a trail still draws after its head leaves the stage', culled && trailDrawn > 0, trailDrawn);
particles.clearSystem({ID: 'trail'});
frames(2);

section('camera');
const made = world();
made.camera.set(100, 0);
made.camera.setZoom(200);
step();
particles.emit({ID: 'fx', COUNT: 1, X: 100, Y: 0, COLOR: '#ff0000', SIZE: 4, SPEED: 0, LIFE: 1, SPREAD: 0});
ctx.calls.length = 0;
frame();
ok('particles follow the world camera', ctx.calls.some(c => c[0] === 'arc' && near(c[1], 480) && c[3] === 16));
particles.shakeScreen({DURATION: 0.5, INTENSITY: 6});
ok('particle shake goes to the world camera', !!made.camera.state.shake && particles.shakeDuration === 0);

done();
