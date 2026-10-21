let pass = 0;
let fail = 0;

const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${typeof detail === 'undefined' ? '' : ` : ${JSON.stringify(detail)}`}`);
    }
};

const section = name => console.log(`\n${name}`);

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const done = () => {
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
};

const fakeClock = () => {
    let t = 1000;
    let id = 0;
    const timers = new Map();
    return {
        now: () => t,
        setTimer: (fn, ms) => {
            id += 1;
            timers.set(id, {fn, at: t + ms});
            return id;
        },
        clearTimer: handle => timers.delete(handle),
        advance (ms) {
            const end = t + ms;
            for (;;) {
                let next = null;
                timers.forEach((timer, key) => {
                    if (timer.at <= end && (!next || timer.at < next.timer.at)) next = {key, timer};
                });
                if (!next) break;
                timers.delete(next.key);
                t = next.timer.at;
                next.timer.fn();
            }
            t = end;
        },
        pending: () => timers.size
    };
};

export {ok, section, near, done, fakeClock};
