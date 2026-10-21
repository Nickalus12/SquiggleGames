process.removeAllListeners('warning');

const {MINE, THEIRS, askKeepWork, createKeepWork, setKeepWorkHandler} = await import('./keep-work.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
    }
};

console.log('no sheet');
{
    const kw = createKeepWork();
    ok('takes theirs without a handler', await kw.ask({pending: 3}) === THEIRS);
    ok('is not asking after', kw.isAsking() === false);
}

console.log('choices');
{
    const kw = createKeepWork();
    const asked = [];
    let answer;
    kw.setHandler(d => {
        asked.push(d);
        return new Promise(resolve => {
            answer = resolve;
        });
    });
    const first = kw.ask({pending: 2.7});
    ok('passes a whole pending count', asked.length === 1 && asked[0].pending === 2);
    ok('is asking while open', kw.isAsking() === true);
    const second = kw.ask({pending: 9});
    ok('a second ask joins the open one', second === first && asked.length === 1);
    answer(MINE);
    ok('keep mine resolves mine', await first === MINE);
    ok('stops asking once answered', kw.isAsking() === false);
    const third = kw.ask({pending: -1});
    ok('a later ask opens again', asked.length === 2 && asked[1].pending === 0);
    answer(THEIRS);
    ok('take theirs resolves theirs', await third === THEIRS);
}

console.log('odd answers');
{
    const kw = createKeepWork();
    kw.setHandler(() => 'maybe');
    ok('an unknown answer is theirs', await kw.ask({}) === THEIRS);
    kw.setHandler(() => Promise.reject(new Error('gone')));
    ok('a rejected answer is theirs', await kw.ask({}) === THEIRS);
    kw.setHandler(() => {
        throw new Error('boom');
    });
    ok('a throwing handler is theirs', await kw.ask({}) === THEIRS);
    ok('a throwing handler does not stay asking', kw.isAsking() === false);
    kw.setHandler(() => MINE);
    ok('a plain mine works', await kw.ask({pending: 1}) === MINE);
    kw.setHandler('nope');
    ok('a non function clears the handler', await kw.ask({}) === THEIRS);
}

console.log('module handler');
{
    setKeepWorkHandler(({pending}) => (pending > 0 ? MINE : THEIRS));
    ok('askKeepWork uses the set handler', await askKeepWork({pending: 1}) === MINE);
    ok('askKeepWork passes pending', await askKeepWork({pending: 0}) === THEIRS);
    setKeepWorkHandler(null);
    ok('clearing it falls back to theirs', await askKeepWork({pending: 5}) === THEIRS);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
