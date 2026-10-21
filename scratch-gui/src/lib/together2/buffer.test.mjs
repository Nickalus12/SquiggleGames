process.removeAllListeners('warning');

const {ok, section, near, done} = await import('./harness.test-util.mjs');
const {createInterpolationBuffer, createTickClock, lerpAngle} = await import('./buffer.js');

section('the tick clock');
{
    const clock = createTickClock();
    clock.observe(10, 1500);
    ok('it maps the first tick to its arrival', clock.tickAt(1500) === 10);
    clock.observe(11, 1580);
    ok('a late tick barely moves the clock', near(clock.tickAt(1550), 11, 0.05), clock.tickAt(1550));
    clock.observe(12, 1590);
    ok('an early tick pulls the clock forward', near(clock.tickAt(1590), 12));
}

section('others are drawn 100 ms behind');
{
    const buffer = createInterpolationBuffer();
    for (let t = 0; t <= 4; t++) buffer.push(3, t, [t * 10, 0, 90, 1, 1, 0], 1000 + (t * 50));
    ok('at the newest tick the drawing is two ticks back', near(buffer.sample(3, 1200)[0], 20), buffer.sample(3, 1200));
    ok('between ticks it interpolates linearly', near(buffer.sample(3, 1225)[0], 25), buffer.sample(3, 1225));
    ok('costume and flags step, they do not blend', buffer.sample(3, 1225)[3] === 1);
    ok('before the oldest sample it holds the oldest', buffer.sample(3, 900)[0] === 0);
}

section('starved: extrapolate up to 100 ms, then hold');
{
    const buffer = createInterpolationBuffer();
    buffer.push(1, 0, [0, 0, 90, 1, 1, 0], 1000);
    buffer.push(1, 1, [10, 5, 90, 1, 1, 0], 1050);
    ok('50 ms past the newest it runs on', near(buffer.sample(1, 1200)[0], 20), buffer.sample(1, 1200));
    ok('100 ms past the newest it runs on', near(buffer.sample(1, 1250)[0], 30), buffer.sample(1, 1250));
    ok('beyond 100 ms it holds', near(buffer.sample(1, 1400)[0], 30) && near(buffer.sample(1, 1400)[1], 15),
        buffer.sample(1, 1400));
}

section('direction takes the short way round');
{
    ok('170 to -170 passes 180', near(Math.abs(lerpAngle(170, -170, 0.5)), 180));
    ok('the result stays in Scratch range', lerpAngle(170, -170, 0.75) === -175, lerpAngle(170, -170, 0.75));
    ok('90 to 0 halfway is 45', lerpAngle(90, 0, 0.5) === 45);
}

section('slots');
{
    const buffer = createInterpolationBuffer();
    buffer.push(1, 5, [1, 1, 90, 0, 1, 0], 1000);
    buffer.push(2, 5, [2, 2, 90, 0, 1, 0], 1000);
    buffer.push(1, 5, [7, 7, 90, 0, 1, 0], 1000);
    ok('a repeat of the same tick replaces it', buffer.sampleAt(1, 5)[0] === 7);
    buffer.push(1, 4, [9, 9, 90, 0, 1, 0], 1000);
    ok('an older tick is ignored', buffer.sampleAt(1, 5)[0] === 7);
    buffer.drop(2);
    ok('a dropped slot is gone', buffer.slots().join() === '1' && buffer.sample(2, 1000) === null);
}

done();
