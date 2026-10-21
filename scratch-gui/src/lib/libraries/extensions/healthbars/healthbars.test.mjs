import {ok, near, section, done} from '../../../world/harness.mjs';
import {boot, fixedClock, frame, frames, pending} from '../vfx/overlay-harness.mjs';

const {default: ThunderboltHealthBars} = await import('./index.js');

const {runtime, cat, world, step} = await boot();

const same = (a, b) => near(a.x, b.x) && near(a.y, b.y) && near(a.scale, b.scale);

section('health bars');
const bars = new ThunderboltHealthBars(runtime);
fixedClock(bars.overlay);
frame();
const ctx = bars.overlay.ctx;
bars.createBar({ID: 'boss', MAX: 100, X: 0, Y: 150});
frame();
const hud = bars.anchor(bars.bars.get('boss'));
ok('a new bar is pinned to the screen like 1.8', hud.x === 480 && hud.y === 60 && hud.scale === 2, hud);
ok('a woken bar draws', ctx.calls.some(c => c[0] === 'arcTo'));
ok('a still bar lets the loop sleep', pending() === 0);

section('stick bar to me through the camera');
const made = world();
made.camera.set(100, 0);
made.camera.setZoom(200);
step();
cat.setXY(100, 0);
bars.stickToMe({ID: 'boss', DY: 50}, {target: cat});
frame();
const stuck = bars.anchor(bars.bars.get('boss'));
ok('a stuck bar rides its sprite through the camera', near(stuck.x, 480) && near(stuck.y, 160) &&
    stuck.scale === 4, stuck);
cat.setXY(110, 0);
step();
ok('a step with a stuck bar wakes the overlay while stopped', pending() === 1);
frame();
ok('the stuck bar reads the sprite position', near(bars.anchor(bars.bars.get('boss')).x, 520));
cat.setXY(100, 0);

section('pin bar to screen does not jump');
const riding = bars.anchor(bars.bars.get('boss'));
bars.pinToScreen({ID: 'boss', ONOFF: 'on'});
const freed = bars.bars.get('boss');
const pinnedAt = bars.anchor(freed);
ok('pinning drops the sprite', !freed.target && freed.pinned && bars.stuck.size === 0);
ok('pinning at camera x 100 zoom 2 keeps the screen spot', near(pinnedAt.x, riding.x) && near(pinnedAt.y, riding.y),
    {riding, pinnedAt});
ok('the pinned spot is in screen units', near(freed.x, 0) && near(freed.y, 100), freed);
bars.pinToScreen({ID: 'boss', ONOFF: 'off'});
const unpinned = bars.anchor(freed);
ok('unpinning at camera x 100 zoom 2 keeps the screen spot', same(unpinned, riding), {riding, unpinned});
ok('the unpinned spot is in world units', near(freed.x, 100) && near(freed.y, 50), freed);
bars.pinToScreen({ID: 'boss', ONOFF: 'on'});
ok('pinning a free world bar keeps the screen spot', near(bars.anchor(freed).x, riding.x) &&
    near(bars.anchor(freed).y, riding.y));

section('a deleted clone');
const clone = cat.makeClone();
runtime.addTarget(clone);
clone.setXY(140, 30);
bars.createBar({ID: 'minion', MAX: 10, X: 0, Y: 0});
bars.stickToMe({ID: 'minion', DY: 10}, {target: clone});
step();
frame();
const alive = bars.anchor(bars.bars.get('minion'));
runtime.disposeTarget(clone);
step();
frame();
const minion = bars.bars.get('minion');
ok('a deleted clone leaves the bar at its last spot', !minion.target && minion.x === 140 && minion.y === 40,
    {x: minion.x, y: minion.y});
ok('the bar does not move on screen', same(bars.anchor(minion), alive));
ok('a released bar leaves the stuck set', !bars.stuck.has(minion));

section('drawing');
bars.stickToMe({ID: 'boss', DY: 0}, {target: cat});
cat.setXY(2000, 0);
ctx.calls.length = 0;
bars.overlay.wake();
frame();
ok('a bar outside the view is not drawn', !ctx.calls.some(c => c[0] === 'arcTo' && c[1] > 2000));
bars.setPosition({ID: 'boss', X: 0, Y: 0});
ok('set position detaches the bar', bars.bars.get('boss').target === null && !bars.stuck.has(bars.bars.get('boss')));
bars.changeHealth({ID: 'boss', VALUE: -10});
ok('damage leaves a popup', bars.bars.get('boss').popups.length === 1);
frames(80);
ok('popups age out on the display clock', bars.bars.get('boss').popups.length === 0);
bars.deleteBar({ID: 'minion'});
ok('deleting a bar forgets it', !bars.bars.has('minion') && bars.stuck.size === 0);

done();
