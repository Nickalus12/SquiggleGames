import {ok, section, done} from './harness.mjs';

const {HEADROOM, OVER_BUDGET, WINDOW, createScalePolicy, startScale} = await import('./render-scale.js');

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
ok('Crisp is full resolution on any screen', crisp.scale === 1);
ok('Crisp never steps', feed(crisp, 40, 30) === null && crisp.scale === 1);
const fast = createScalePolicy({mode: 'fast', dpr: 2, width: 480, height: 360});
ok('Fast is half resolution on any screen', fast.scale === 0.5);
ok('Fast never steps up', feed(fast, 0.1, 0.1) === null && fast.scale === 0.5);
ok('an unknown mode is Auto', createScalePolicy({mode: 'ultra', dpr: 2}).mode === 'auto');

section('auto steps');
const auto = createScalePolicy({mode: 'auto', dpr: 2, width: 480, height: 360});
const slow = (OVER_BUDGET * FRAME) + 2;
ok('nothing changes before a full window', feed(auto, slow, 8, WINDOW - 1) === null && auto.scale === 1);
ok('a slow window steps 1 down to 0.75', auto.sample(slow, 8, FRAME) === 0.75 && auto.scale === 0.75);
ok('the next slow window steps to 0.5', feed(auto, slow, 6) === 0.5);
ok('there is no rung below 0.5', feed(auto, slow, 4) === null && auto.scale === 0.5);
const between = ((HEADROOM + OVER_BUDGET) / 2) * FRAME;
ok('a tick between headroom and budget holds still', feed(auto, between, 1) === null && auto.scale === 0.5);
ok('headroom steps back up one rung at a time', feed(auto, 2, 1) === 0.75 && feed(auto, 2, 1) === 1);
ok('Auto stops at the starting scale', feed(auto, 1, 0.5) === null && auto.scale === 1);
ok('every step is counted', auto.steps === 4, auto.steps);

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

const reconfigured = createScalePolicy({mode: 'auto', dpr: 1, width: 480, height: 360});
reconfigured.configure({mode: 'auto', dpr: 2, width: 480, height: 360});
ok('configure picks a new start for a new screen', reconfigured.scale === 1);

done();
