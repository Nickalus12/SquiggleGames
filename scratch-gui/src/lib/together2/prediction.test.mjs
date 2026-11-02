process.removeAllListeners('warning');

const {ok, section, near, done} = await import('./harness.test-util.mjs');
const {EASE_MS, SNAP_PX, createPrediction} = await import('./prediction.js');

section('ease under 30 px');
{
    const p = createPrediction();
    ok('thresholds match the standard', EASE_MS === 150 && SNAP_PX === 30);
    const r = p.correct([20, 0, 1], {x: 0, y: 0}, 1000);
    ok('a 20 px error eases', r.kind === 'ease' && p.cid === 1, r);
    const a = p.step(1075);
    ok('half way through 150 ms it has moved half', near(a.dx, 10), a);
    const b = p.step(1150);
    ok('at 150 ms the rest lands', near(a.dx + b.dx, 20) && !p.easing, b);
    ok('after easing there is nothing to do', p.step(1200) === null);
    ok('exactly 30 px still eases', p.correct([30, 0, 2], {x: 0, y: 0}, 2000).kind === 'ease' && p.snaps === 0);
    const tele = p.correct([10, 0, 3, 1], {x: 0, y: 0}, 2500);
    ok('an explicit teleport under 30 px snaps', tele.kind === 'snap' && p.snaps === 1, tele);
    ok('snaps in 10 s window are counted', p.snapsInWindow(3000) === 1 && p.snapsInWindow(13000) === 0);
}

section('snap over 30 px');
{
    const p = createPrediction();
    const r = p.correct([31, 0, 1], {x: 0, y: 0}, 1000);
    ok('31 px snaps', r.kind === 'snap' && r.x === 31 && p.snaps === 1, r);
    ok('a snap leaves nothing to ease', p.step(1050) === null);
    ok('an older or repeated cid is ignored', p.correct([90, 0, 1], {x: 0, y: 0}, 1100) === null && p.snaps === 1);
    ok('a bad correction is ignored', p.correct([1, 'x', 3], {x: 0, y: 0}, 1100) === null);
}

done();
