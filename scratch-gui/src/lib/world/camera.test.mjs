import {ok, near, section, done} from './harness.mjs';
import {createCamera, toView, toWorld, viewRect, clampAxis} from './camera.js';

section('view maths');
const view = {x: 100, y: -50, zoom: 2};
const p = toView(view, 110, -40);
ok('toView offsets and scales', p.x === 20 && p.y === 20 && p.scale === 2, p);
const w = toWorld(view, p.x, p.y);
ok('toWorld inverts toView', near(w.x, 110) && near(w.y, -40), w);
const rect = viewRect(view);
ok('view rect halves the stage by zoom', rect.left === -20 && rect.right === 220 && rect.top === 40, rect);
ok('clampAxis centres when the level is narrower than the view', clampAxis(5, 0, 100, 240) === 50);
ok('clampAxis keeps the view inside', clampAxis(-500, -1000, 1000, 240) === -500 && clampAxis(900, -1000, 1000, 240) === 760);

section('camera state');
const cam = createCamera({random: () => 1});
ok('inactive until a block uses it', cam.info() === null && !cam.isActive());
cam.set(30, 40);
ok('set moves and activates', cam.report('x') === 30 && cam.report('y') === 40 && cam.info() !== null);
cam.setZoom(200);
ok('zoom is a percent', cam.report('zoom') === 200 && near(cam.report('left'), 30 - 120));
cam.setZoom(1);
ok('zoom clamps at 10 percent', near(cam.report('zoom'), 10));
cam.setZoom(100);

cam.follow('hero', 0);
cam.step(1 / 30, {x: 200, y: 0});
ok('smoothness 0 snaps to the target', cam.report('x') === 200 && cam.report('y') === 0);
cam.follow('hero', 50);
cam.step(1 / 30, {x: 300, y: 0});
ok('smoothness 50 closes half the gap in one frame', near(cam.report('x'), 250), cam.report('x'));
cam.step(1 / 60, {x: 300, y: 0});
ok('a half step closes less', cam.report('x') > 250 && cam.report('x') < 275, cam.report('x'));
cam.step(1 / 30, {x: 300, y: 0});
ok('interpolation starts from the previous frame', near(cam.view(0).x, cam.state.from.x) &&
    near(cam.view(0.5).x, (cam.state.from.x + cam.report('x')) / 2));

cam.set(0, 0);
ok('set stops following', cam.state.follow === null);
cam.setBounds({left: 0, right: 1000, bottom: -500, top: 0});
cam.keepInside(true);
ok('keep inside clamps the view into the level', cam.report('left') === 0 && cam.report('top') === 0, cam.info());
cam.set(5000, -5000);
ok('keep inside clamps a set', cam.report('right') === 1000 && cam.report('bottom') === -500, cam.info());
cam.keepInside(false);
cam.set(5000, 0);
ok('off lets the camera leave', cam.report('x') === 5000);

cam.set(0, 0);
cam.shake(1, 10);
cam.step(0.5, null);
ok('shake offsets by strength times what is left', near(cam.report('x'), 5) && near(cam.report('y'), 5), cam.info());
cam.step(0.6, null);
ok('shake ends after its time', cam.report('x') === 0 && cam.state.shake === null);

cam.reset();
ok('reset makes the camera inactive', cam.info() === null && cam.report('zoom') === 100);

section('hold');
const held = createCamera();
held.set(40, 0);
const release = held.hold({kit: 'a'});
ok('a held camera is not active', !held.isActive() && held.isHeld());
held.follow('Hero', 0);
ok('camera blocks still set the camera while held', held.state.follow === 'Hero' && !held.isActive());
const second = held.hold({kit: 'b'});
release();
ok('every holder must let go', !held.isActive());
second();
ok('the camera resumes after the last release', held.isActive() && !held.isHeld() && held.view(1).x === 40);
release();
ok('releasing twice is harmless', held.isActive());

done();
