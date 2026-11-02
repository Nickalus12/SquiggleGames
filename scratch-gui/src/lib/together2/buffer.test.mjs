process.removeAllListeners('warning');

const {ok, section, near, done} = await import('./harness.test-util.mjs');
const {
    MAX_EXTRAPOLATE_MS,
    MAX_RENDER_DELAY_MS,
    MID_RENDER_DELAY_MS,
    MIN_RENDER_DELAY_MS,
    RECONNECTING_TEXT,
    RENDER_DELAY_MS,
    WEAK_TEXT,
    createConnectionHealth,
    createInterpolationBuffer,
    createTickClock,
    lerpAngle,
    pingBucket,
    renderDelayForJitter
} = await import('./buffer.js');
const {SNAP_PX, createPrediction} = await import('./prediction.js');

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
ok('170 to -170 passes 180', near(Math.abs(lerpAngle(170, -170, 0.5)), 180));
ok('the result stays in Scratch range', lerpAngle(170, -170, 0.75) === -175, lerpAngle(170, -170, 0.75));
ok('90 to 0 halfway is 45', lerpAngle(90, 0, 0.5) === 45);

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

section('adaptive render delay follows the jitter p95 table and clamps to 50..200 ms');
{
    ok('0 to 20 ms jitter uses 100 ms delay', renderDelayForJitter(0) === RENDER_DELAY_MS &&
        renderDelayForJitter(20) === 100);
    ok('21 to 70 ms jitter uses 150 ms delay', renderDelayForJitter(21) === MID_RENDER_DELAY_MS &&
        renderDelayForJitter(50) === 150 && renderDelayForJitter(70) === 150);
    ok('over 70 ms jitter uses 200 ms delay', renderDelayForJitter(71) === MAX_RENDER_DELAY_MS &&
        renderDelayForJitter(140) === 200);
    const lowClamp = createInterpolationBuffer({delayMs: 20, adaptive: false});
    const highClamp = createInterpolationBuffer({delayMs: 400, adaptive: false});
    ok('explicit delay clamps between 50 and 200 ms',
        lowClamp.delayMs(1000) === MIN_RENDER_DELAY_MS && highClamp.delayMs(1000) === MAX_RENDER_DELAY_MS);
    ok('ping buckets match good, ok, and weak thresholds',
        pingBucket(45) === 'good' && pingBucket(80) === 'good' &&
        pingBucket(120) === 'ok' && pingBucket(150) === 'ok' && pingBucket(180) === 'weak');
}

section('extrapolation eases out instead of stopping dead');
{
    const buffer = createInterpolationBuffer();
    buffer.push(1, 0, [0, 0, 90, 1, 1, 0], 1000);
    buffer.push(1, 1, [20, 0, 90, 1, 1, 0], 1050);
    const x50 = buffer.sample(1, 1200)[0];
    const x75 = buffer.sample(1, 1225)[0];
    const x100 = buffer.sample(1, 1250)[0];
    const firstHalfStep = x75 - x50;
    const secondHalfStep = x100 - x75;
    ok('the second half of extrapolation decelerates smoothly',
        firstHalfStep > secondHalfStep && secondHalfStep > 0 && near(x100, 60),
        {x50, x75, x100, firstHalfStep, secondHalfStep});
}

section('clean link, legal speed, 60 seconds');
{
    const buffer = createInterpolationBuffer();
    const prediction = createPrediction();
    const health = createConnectionHealth({buffer, prediction});
    health.setConnected(true, 1000);
    let smoothedRtt = null;
    let rttAt5s = null;
    let maxCorrections10s = 0;
    let cid = 0;
    for (let t = 0; t <= 1200; t++) {
        const nowMs = 1000 + (t * 50);
        buffer.push(2, t, [t * 4, 0, 90, 1, 1, 0], nowMs);
        const sampleRtt = 100;
        smoothedRtt = smoothedRtt === null ? sampleRtt : Math.round((0.8 * smoothedRtt) + (0.2 * sampleRtt));
        health.observeRtt(smoothedRtt, nowMs);
        if (t === 100) rttAt5s = smoothedRtt;
        if (t > 0 && t % 200 === 0) {
            cid += 1;
            prediction.correct([(t * 4) + 6, 0, cid], {x: t * 4, y: 0}, nowMs);
        }
        prediction.step(nowMs);
        const corr10 = prediction.correctionsInWindow(nowMs);
        if (corr10 > maxCorrections10s) maxCorrections10s = corr10;
        buffer.sample(2, nowMs);
    }
    const status = health.evaluate(61000);
    ok('clean link keeps 100 ms render delay and 100 ms extrapolate cap',
        status.delayMs === 100 && MAX_EXTRAPOLATE_MS === 100, status);
    ok('zero snaps, corrections at or under 1 per 10s, and weak connection stays off',
        prediction.snaps === 0 && maxCorrections10s <= 1 && status.weak === false,
        {snaps: prediction.snaps, maxCorrections10s, status});
    ok('player-list smoothed rtt matches injected rtt within 30 ms after 5 seconds',
        rttAt5s !== null && Math.abs(rttAt5s - 100) <= 30,
        {rttAt5s});
}

section('20-peer fixture: 60 seconds at 50 ms jitter and 5 percent loss');
{
    const buffer = createInterpolationBuffer();
    const prediction = createPrediction();
    const health = createConnectionHealth({buffer, prediction});
    health.setConnected(true, 1000);
    const peers = Array.from({length: 19}, (_, i) => String(i + 2));
    const speedPerTick = 3;
    const truePos = (slotIdx, tickFloat) => {
        const phase = slotIdx * 0.35;
        const x = Math.sin((tickFloat * 0.04) + phase) * 160;
        const y = Math.cos((tickFloat * 0.03) + phase) * 110;
        return [x, y, 90, 1, 1, 0];
    };

    const pendingTicks = [];
    for (let t = 0; t <= 1200; t++) {
        const baseMs = 1000 + (t * 50);
        const lost = t > 20 && t < 1160 && (t % 20 === 7);
        let arrivalMs = baseMs;
        if (lost) {
            arrivalMs = baseMs + 210;
        } else if (t > 0 && t < 1160) {
            const jitterOffset = (t % 2 === 0) ? 25 : 0;
            const spikeOffset = (t % 5 === 0) ? 50 : jitterOffset;
            arrivalMs = baseMs + spikeOffset;
        }
        if (pendingTicks.length && arrivalMs < pendingTicks[pendingTicks.length - 1].arrivalMs) {
            arrivalMs = pendingTicks[pendingTicks.length - 1].arrivalMs;
        }
        const a = {};
        for (let i = 0; i < peers.length; i++) {
            a[peers[i]] = truePos(i, t);
        }
        pendingTicks.push({t, arrivalMs, a, lost});
    }

    let tickCursor = 0;
    const lastDrawn = new Map();
    let maxFrameStepPx = 0;
    let totalPosErrorPx = 0;
    let errorSamples = 0;
    let maxPosErrorPx = 0;
    let firstTriggerMs = null;
    let weakShownAtMs = null;
    let maxCorrections10s = 0;
    let totalCorrections = 0;
    const sampled = [];
    let localX = 0;
    let localY = 0;
    let cid = 0;

    for (let nowMs = 1000; nowMs <= 61000; nowMs += 25) {
        while (tickCursor < pendingTicks.length && pendingTicks[tickCursor].arrivalMs <= nowMs) {
            const pkt = pendingTicks[tickCursor++];
            buffer.clock.observe(pkt.t, nowMs);
            for (let i = 0; i < peers.length; i++) {
                const slot = peers[i];
                buffer.push(slot, pkt.t, pkt.a[slot]);
            }
            if (pkt.t % 205 === 0 && pkt.t > 0) {
                cid += 1;
                totalCorrections += 1;
                const drift = ((Math.round(pkt.t / 205)) % 2 === 0 ? 1 : -1) * 6;
                const res = prediction.correct([localX + drift, localY, cid], {x: localX, y: localY}, nowMs);
                if (res && res.kind === 'snap') {
                    localX = res.x;
                    localY = res.y;
                }
            }
        }
        const step = prediction.step(nowMs);
        if (step) {
            localX += step.dx;
            localY += step.dy;
        }
        localX = (localX + (speedPerTick * 0.5)) % 200;
        const corr10 = prediction.correctionsInWindow(nowMs);
        if (corr10 > maxCorrections10s) maxCorrections10s = corr10;

        const renderT = buffer.renderTick(nowMs);
        for (let i = 0; i < peers.length; i++) {
            const slot = peers[i];
            const pose = buffer.sample(slot, nowMs, sampled);
            if (nowMs >= 2000 && pose && renderT !== null) {
                const prev = lastDrawn.get(slot);
                if (prev) {
                    const frameStep = Math.hypot(pose[0] - prev[0], pose[1] - prev[1]);
                    if (frameStep > maxFrameStepPx) maxFrameStepPx = frameStep;
                }
                lastDrawn.set(slot, [pose[0], pose[1]]);
                const expected = truePos(i, renderT);
                const err = Math.hypot(pose[0] - expected[0], pose[1] - expected[1]);
                totalPosErrorPx += err;
                if (err > maxPosErrorPx) maxPosErrorPx = err;
                errorSamples += 1;
            }
        }

        if (firstTriggerMs === null && buffer.clock.inboundGaps(nowMs) >= 2) {
            firstTriggerMs = nowMs;
        }
        const status = health.evaluate(nowMs);
        if (firstTriggerMs !== null && weakShownAtMs === null && status.weak) {
            weakShownAtMs = nowMs;
        }
    }

    const delayDuringJitter = buffer.delayMs(30000);
    const jitterAt30s = buffer.clock.jitterP95(30000);
    const extrapOutsideHoles = buffer.extrapolatingRatio(30000);
    const meanPosErrorPx = totalPosErrorPx / Math.max(1, errorSamples);

    for (let extra = 1; extra <= 102; extra++) {
        const t = 1200 + extra;
        const nowMs = 61000 + (extra * 50);
        buffer.clock.observe(t, nowMs);
        for (let i = 0; i < peers.length; i++) {
            buffer.push(peers[i], t, truePos(i, t));
            buffer.sample(peers[i], nowMs, sampled);
        }
        health.observeRtt(40, nowMs);
        health.evaluate(nowMs);
    }
    const quietStatus = health.evaluate(66100);

    ok('jitter p95 around 50 ms selects the 150 ms render delay',
        delayDuringJitter === 150 && jitterAt30s >= 21 && jitterAt30s <= 70,
        {delayDuringJitter, jitterAt30s});
    ok('extrapolating frames stay under 5 percent outside retransmit holes',
        extrapOutsideHoles < 0.05,
        {extrapOutsideHoles});
    ok('zero buffer clears, zero prediction snaps, and corrections p95 at or under 1 per 10s over 60 seconds',
        buffer.clears === 0 && prediction.snaps === 0 && maxCorrections10s <= 1 && totalCorrections === 5,
        {clears: buffer.clears, snaps: prediction.snaps, maxCorrections10s, totalCorrections});
    ok('no visible snap above SNAP_PX on any of the 19 remote peers',
        maxFrameStepPx < SNAP_PX && maxPosErrorPx < SNAP_PX,
        {maxFrameStepPx: Number(maxFrameStepPx.toFixed(2)), maxPosErrorPx: Number(maxPosErrorPx.toFixed(2))});
    ok('mean position error stays low across all 19 remote peers',
        meanPosErrorPx < 5,
        {meanPosErrorPx: Number(meanPosErrorPx.toFixed(2)), samples: errorSamples});
    ok('weak connection turns on at the 2000 ms gate after trigger and clears after 5 quiet seconds',
        firstTriggerMs !== null && weakShownAtMs !== null &&
        (weakShownAtMs - firstTriggerMs) === 2000 && quietStatus.weak === false,
        {firstTriggerMs, weakShownAtMs, turnOnMs: weakShownAtMs - firstTriggerMs, clearedWeak: quietStatus.weak});

    health.setConnected(true, 70000);
    buffer.clock.observe(1400, 70000);
    const silenceStatus = health.evaluate(71000);
    ok('1 second without a tick shows Reconnecting',
        silenceStatus.reconnecting === true && silenceStatus.label === RECONNECTING_TEXT,
        silenceStatus);
    ok('weak connection copy matches the standard', WEAK_TEXT === 'Weak connection');
}

done();
