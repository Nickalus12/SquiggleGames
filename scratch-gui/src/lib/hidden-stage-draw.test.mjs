process.removeAllListeners('warning');

const {installHiddenStageDraw} = await import('./hidden-stage-draw.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

let callback = null;
class FakeObserver {
    constructor (cb) {
        callback = cb;
        this.observed = [];
    }
    observe (el) {
        this.observed.push(el);
    }
    disconnect () {
        this.disconnected = true;
    }
}
const makeRenderer = () => {
    const r = {canvas: {tag: 'canvas'}, draws: 0, _snapshotCallbacks: []};
    r.draw = function () {
        this.draws++;
        return 'drew';
    };
    return r;
};

const r = makeRenderer();
const uninstall = installHiddenStageDraw(r, {Observer: FakeObserver});
ok('the canvas is observed', callback !== null);
ok('draws while visible', r.draw() === 'drew' && r.draws === 1);
callback([{isIntersecting: false}]);
ok('skips the draw while the stage is hidden', r.draw() === null && r.draws === 1);
ok('reports hidden', r.sqHiddenDraw.visible === false);
r._snapshotCallbacks.push(() => {});
ok('still draws when a snapshot was requested', r.draw() === 'drew' && r.draws === 2);
r._snapshotCallbacks.length = 0;
callback([{isIntersecting: false}, {isIntersecting: true}]);
ok('the newest entry wins', r.draw() === 'drew' && r.draws === 3);
ok('installing twice is a no-op', installHiddenStageDraw(r, {Observer: FakeObserver})() === undefined && r.draws === 3);
uninstall();
callback([{isIntersecting: false}]);
ok('uninstall restores the original draw', r.draw() === 'drew' && r.draws === 4 && r.sqHiddenDraw === null);
ok('no observer means no wrapping', installHiddenStageDraw(makeRenderer(), {Observer: null})() === undefined);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
