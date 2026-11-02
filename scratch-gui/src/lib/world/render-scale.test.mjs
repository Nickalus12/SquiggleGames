import {ok, section, done} from './harness.mjs';

const {
    DEFAULT_RAY_CAP,
    DEFAULT_SPRITE_STEP,
    FAST_RAY_CAP,
    FAST_SPRITE_STEP,
    HEADROOM,
    LATE_SHARE_DOWN,
    MIN_PACED_FRAMES,
    OVER_BUDGET,
    RUNG_MESSAGES,
    ULTRA_CLEAN_WINDOWS,
    ULTRA_P95_MS,
    WINDOW,
    createScalePolicy,
    startScale,
    textureFilterFor
} = await import('./render-scale.js');

const FRAME = 1000 / 30;

const feed = (policy, tickMs, renderMs, count = WINDOW) => {
    let last = null;
    for (let i = 0; i < count; i++) {
        const next = policy.sample(tickMs, renderMs, FRAME);
        if (next !== null) last = next;
    }
    return last;
};

section('start scale');
ok('a 1x screen on the normal stage starts at 0.75', startScale({dpr: 1, width: 480, height: 360}) === 0.75);
ok('a 2x screen on the normal stage starts at 1', startScale({dpr: 2, width: 480, height: 360}) === 1);
ok('a 1.5x screen counts as sharp', startScale({dpr: 1.5, width: 480, height: 360}) === 1);
ok('a wide stage on a 2x screen starts at 0.75', startScale({dpr: 2, width: 640, height: 360}) === 0.75);
ok('a tall stage on a 2x screen starts at 0.75', startScale({dpr: 2, width: 360, height: 640}) === 0.75);
ok('a huge custom stage starts at 0.5', startScale({dpr: 2, width: 1280, height: 720}) === 0.5);
ok('junk input still gives a rung', startScale({}) === 0.75);

section('fixed modes');
const crisp = createScalePolicy({mode: 'crisp', dpr: 1, width: 480, height: 360});
ok('Crisp is full resolution on any screen with floorTextures on, spriteStep 1, rayCap 40',
    crisp.scale === 1 && crisp.floorTextures === true &&
    crisp.spriteStep === DEFAULT_SPRITE_STEP && crisp.rayCap === DEFAULT_RAY_CAP);
ok('Crisp never steps', feed(crisp, 40, 30) === null && crisp.scale === 1);
const fast = createScalePolicy({mode: 'fast', dpr: 2, width: 480, height: 360});
ok('Fast is half resolution on any screen and sets floorTextures false, spriteStep 2, rayCap 16',
    fast.scale === 0.5 && fast.floorTextures === false &&
    fast.spriteStep === FAST_SPRITE_STEP && fast.rayCap === FAST_RAY_CAP);
ok('Fast never steps up', feed(fast, 0.1, 0.1) === null && fast.scale === 0.5);
const fastest = createScalePolicy({mode: 'fastest', dpr: 2, width: 480, height: 360});
ok('Fastest is 0.375 resolution and turns floor textures off',
    fastest.scale === 0.375 && fastest.floorTextures === false);
ok('Fastest never steps', feed(fastest, 0.1, 0.1) === null && fastest.scale === 0.375);
const sharpest = createScalePolicy({mode: 'sharpest', dpr: 1, width: 480, height: 360});
ok('Sharpest is 1.5x resolution and keeps floor textures on',
    sharpest.scale === 1.5 && sharpest.floorTextures === true);
ok('Sharpest never steps', feed(sharpest, 40, 30) === null && sharpest.scale === 1.5);
const ultra2x = createScalePolicy({mode: '2x', dpr: 1, width: 640, height: 360});
ok('2.0x rung is 2x resolution (1280x720 on 640x360) and keeps floor textures on',
    ultra2x.scale === 2 && ultra2x.floorTextures === true &&
    createScalePolicy({mode: '2.0x', dpr: 1, width: 640, height: 360}).scale === 2);
ok('2.0x rung never steps', feed(ultra2x, 40, 30) === null && ultra2x.scale === 2);
ok('sq. message ids cover 2.0x rung and textureFilter',
    RUNG_MESSAGES['2x'].id === 'sq.playerSettings.quality.2x' &&
    RUNG_MESSAGES.textureFilter.id === 'sq.playerSettings.textureFilter');
ok('bilinear textureFilter is off by default and active only on Crisp and 2.0x rungs',
    textureFilterFor('crisp', 1, false) === false &&
    textureFilterFor('2x', 2, false) === false &&
    textureFilterFor('crisp', 1, true) === true &&
    textureFilterFor('2x', 2, true) === true &&
    textureFilterFor('2.0x', 2, true) === true &&
    textureFilterFor('fast', 0.5, true) === false &&
    textureFilterFor('fastest', 0.375, true) === false &&
    textureFilterFor('sharpest', 1.5, true) === false &&
    textureFilterFor('auto', 1, true) === false &&
    textureFilterFor('auto', 2, true) === true);
ok('an unknown mode is Auto', createScalePolicy({mode: 'ultra', dpr: 2}).mode === 'auto');

section('auto steps');
const auto = createScalePolicy({mode: 'auto', dpr: 2, width: 480, height: 360});
const slow = (OVER_BUDGET * FRAME) + 2;
ok('nothing changes before a full window', feed(auto, slow, 8, WINDOW - 1) === null && auto.scale === 1);
ok('a slow window steps 1 down to 0.75 and keeps floor textures on',
    auto.sample(slow, 8, FRAME) === 0.75 && auto.scale === 0.75 && auto.floorTextures === true);
ok('the next slow window steps to 0.5 and turns floor textures off',
    feed(auto, slow, 6) === 0.5 && auto.floorTextures === false);
ok('there is no rung below 0.5', feed(auto, slow, 4) === null && auto.scale === 0.5);
const between = ((HEADROOM + OVER_BUDGET) / 2) * FRAME;
ok('a tick between headroom and budget holds still', feed(auto, between, 1) === null && auto.scale === 0.5);
const ups = [];
let firstUp = -1;
for (let w = 0; w < 20; w++) {
    const next = feed(auto, 2, 1);
    if (next !== null) {
        ups.push(next);
        if (firstUp < 0) firstUp = w;
    }
}
ok('headroom steps back up one rung at a time after a hold', ups.join() === '0.75,1' && firstUp > 0,
    {ups, firstUp});
ok('Auto stops at the starting scale', feed(auto, 1, 0.5) === null && auto.scale === 1);
ok('every step is counted', auto.steps === 4, auto.steps);

const flappy = createScalePolicy({mode: 'auto', dpr: 2, width: 480, height: 360});
const windowsToRecover = () => {
    feed(flappy, slow, 8);
    for (let w = 1; w <= 20; w++) {
        if (feed(flappy, 2, 1) !== null) return w;
    }
    return -1;
};
const waits = [windowsToRecover(), windowsToRecover(), windowsToRecover(), windowsToRecover()];
ok('each step down doubles the wait before trying sharper again, up to a cap', waits.join() === '3,5,9,9', waits);

const heavyRender = createScalePolicy({mode: 'auto', dpr: 2, width: 480, height: 360});
feed(heavyRender, slow, 9);
ok('a window that would blow the budget once sharper does not step up',
    feed(heavyRender, 9, 8) === null && heavyRender.scale === 0.75);

const outlier = createScalePolicy({mode: 'auto', dpr: 2, width: 480, height: 360});
let spikes = null;
for (let i = 0; i < WINDOW; i++) {
    const next = outlier.sample(i % 5 === 0 ? 80 : 4, 2, FRAME);
    if (next !== null) spikes = next;
}
ok('a few long ticks in a window do not step down, the median rules', spikes === null && outlier.scale === 1);

section('display pacing');
const pace = (policy, frames, late) => {
    for (let i = 0; i < frames; i++) policy.paced(i < late);
};
const janky = createScalePolicy({mode: 'auto', dpr: 2, width: 480, height: 360});
pace(janky, 90, Math.ceil(90 * LATE_SHARE_DOWN) + 2);
ok('late display frames step Auto down even when the tick is cheap', feed(janky, 2, 1) === 0.75);
pace(janky, 90, 3);
ok('three percent late frames block stepping back up', feed(janky, 2, 1) === null && janky.scale === 0.75);
pace(janky, 90, 0);
let smoothUp = null;
for (let w = 0; w < 4 && smoothUp === null; w++) {
    pace(janky, 90, 0);
    smoothUp = feed(janky, 2, 1);
}
ok('smooth windows step back up once the hold runs out', smoothUp === 1);
const fewFrames = createScalePolicy({mode: 'auto', dpr: 2, width: 480, height: 360});
pace(fewFrames, MIN_PACED_FRAMES - 1, MIN_PACED_FRAMES - 1);
ok('too few display frames to judge are ignored', feed(fewFrames, 2, 1) === null && fewFrames.scale === 1);
const fixedPace = createScalePolicy({mode: 'crisp'});
pace(fixedPace, 90, 90);
ok('Crisp ignores late frames', feed(fixedPace, 2, 1) === null && fixedPace.scale === 1);

const reconfigured = createScalePolicy({mode: 'auto', dpr: 1, width: 480, height: 360});
reconfigured.configure({mode: 'auto', dpr: 2, width: 480, height: 360});
ok('configure picks a new start for a new screen', reconfigured.scale === 1);

section('auto 2.0x climb guard');
{
    const autoClimb = createScalePolicy({mode: 'auto', dpr: 2, width: 480, height: 360, textureFilter: true});
    ok('Auto starts at 1.0x and keeps bilinear filter off below 2.0x',
        autoClimb.scale === 1 && autoClimb.textureFilter === false);
    for (let w = 0; w < ULTRA_CLEAN_WINDOWS - 1; w++) {
        pace(autoClimb, 60, 0);
        ok(`clean window ${w + 1} with p95 < ${ULTRA_P95_MS} ms holds at 1.0x before ${ULTRA_CLEAN_WINDOWS} windows`,
            feed(autoClimb, 1.5, 0.8) === null && autoClimb.scale === 1);
    }
    pace(autoClimb, 60, 0);
    for (let i = 0; i < WINDOW; i++) {
        autoClimb.sample(i < 4 ? 7.5 : 1.5, 0.8, FRAME);
    }
    ok('a window with display p95 >= 6 ms resets the 2.0x clean window streak',
        autoClimb.scale === 1 && autoClimb.cleanWindows === 0);
    for (let w = 0; w < ULTRA_CLEAN_WINDOWS - 1; w++) {
        pace(autoClimb, 60, 0);
        feed(autoClimb, 1.5, 0.8);
    }
    ok('7 clean windows still hold at 1.0x', autoClimb.scale === 1 && autoClimb.cleanWindows === 7);
    pace(autoClimb, 60, 0);
    const climbed = feed(autoClimb, 1.5, 0.8);
    ok('8th consecutive clean window with display frame p95 < 6 ms climbs to 2.0x',
        climbed === 2 && autoClimb.scale === 2 && autoClimb.textureFilter === true);
}

done();
