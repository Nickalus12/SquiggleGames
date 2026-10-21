process.removeAllListeners('warning');

const {
    DRAG_LOCK_MS,
    FOLLOW_GRACE_MS,
    createFields,
    createFollow,
    createGate,
    createLocks,
    createStyleBook,
    initials
} = await import('./presence.js');
const {assignPeerStyles, peerStyle} = await import('../themes/peers.js');

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

const clock = () => {
    let t = 1000;
    const now = () => t;
    now.advance = ms => {
        t += ms;
    };
    return now;
};

console.log('style book');
{
    const book = createStyleBook();
    const lone = book.assign('abc');
    ok('a lone peer takes its own slot', lone.slot === peerStyle('abc').slot, lone);
    ok('the PEERS.md check value holds for abc', lone.color === 'rose' && lone.shape === 'triangle', lone);
    const first = ['abc', 'peer-0', 'peer-1', 'sprout', '42'].map(id => book.assign(id));
    ok('assigning again returns the same style', first[0].slot === lone.slot);
    const again = book.assign('peer-0');
    ok('a peer keeps its slot across calls', again.slot === first[1].slot);
    const slots = new Set(first.map(s => s.slot));
    ok('five peers hold five slots', slots.size === 5, [...slots]);
    const colours = new Set(first.map(s => s.color));
    const shapes = new Set(first.map(s => s.shape));
    ok('five peers have five colours', colours.size === 5, [...colours]);
    ok('five peers have five shapes', shapes.size === 5, [...shapes]);
    const before = first.map(s => s.slot);
    for (let i = 0; i < 7; i++) book.assign(`late-${i}`);
    const after = ['abc', 'peer-0', 'peer-1', 'sprout', '42'].map(id => book.get(id).slot);
    ok('later joins never move earlier peers', JSON.stringify(before) === JSON.stringify(after), {before, after});
    const twelve = new Set(['abc', 'peer-0', 'peer-1', 'sprout', '42'].concat(
        Array.from({length: 7}, (v, i) => `late-${i}`)
    ).map(id => book.get(id).color));
    ok('twelve peers joined one by one have twelve colours', twelve.size === 12, [...twelve]);
    book.release('peer-1');
    ok('a released peer has no style', book.get('peer-1') === null);
    ok('releasing leaves the others in place', book.get('abc').slot === before[0]);
    const back = book.assign('peer-1');
    ok('a returning id gets a free slot', !after.filter((s, i) => i !== 2).includes(back.slot), back.slot);
    ok('numbers and strings name the same peer', book.assign(42).slot === book.get('42').slot);
    book.reset();
    ok('reset empties the book', book.size === 0);
}

console.log('style book agrees with the room algorithm for one arrival order');
{
    const ids = ['sprout', '42', 'abc', 'peer-0', 'peer-1'];
    const room = assignPeerStyles(ids);
    const book = createStyleBook();
    const bySlot = ids.slice().sort((a, b) => (room[a].slot - room[b].slot));
    const sorted = ids.slice().sort((a, b) => peerStyle(a).slot - peerStyle(b).slot);
    sorted.forEach(id => book.assign(id));
    ok('the room order fixture is sorted by home slot', JSON.stringify(sorted) === JSON.stringify(bySlot), sorted);
    ok('sprout keeps indigo circle', book.get('sprout').color === 'indigo' && book.get('sprout').shape === 'circle');
}

console.log('soft lock');
{
    const now = clock();
    const locks = createLocks({now});
    ok('the lock lasts 1.5 s', DRAG_LOCK_MS === 1500);
    locks.apply(7, {targetId: 'Cat', blockId: 'b1', phase: 'start'});
    ok('a start frame locks the stack', locks.holder('b1', 'Cat').peer === 7);
    ok('another sprite with the same block id is not locked', locks.holder('b1', 'Dog') === null);
    now.advance(1000);
    ok('the lock holds before 1.5 s', locks.holder('b1', 'Cat') !== null);
    ok('remaining time counts down', locks.remaining('b1', 'Cat') === 500, locks.remaining('b1', 'Cat'));
    locks.apply(7, {targetId: 'Cat', blockId: 'b1', phase: 'move'});
    now.advance(1400);
    ok('a move frame extends the lock', locks.holder('b1', 'Cat') !== null);
    now.advance(101);
    ok('the lock drops 1.5 s after the last frame', locks.holder('b1', 'Cat') === null);
    ok('an expired lock is swept from the list', locks.list().length === 0);
    locks.apply(7, {targetId: 'Cat', blockId: 'b2', phase: 'start'});
    locks.apply(7, {targetId: 'Cat', blockId: 'b2', phase: 'end'});
    ok('an end frame unlocks at once', locks.holder('b2', 'Cat') === null);
    locks.apply(7, {targetId: 'Cat', blockId: 'b3', phase: 'start'});
    locks.apply(7, {targetId: 'Cat', blockId: 'b4', phase: 'start'});
    ok('one peer holds one stack at a time', locks.holder('b3') === null && locks.holder('b4').peer === 7);
    locks.apply(9, {targetId: 'Cat', blockId: 'b5', phase: 'start'});
    locks.release(7);
    ok('a leaver drops their lock', locks.holder('b4') === null && locks.holder('b5').peer === 9);
    ok('a frame without a block id is ignored', locks.apply(9, {phase: 'start'}) === null);
    ok('an unknown phase is ignored', locks.apply(9, {blockId: 'x', phase: 'hold'}) === null);
    locks.clear();
    ok('clear drops every lock', locks.list().length === 0);
}

console.log('typing caret');
{
    const now = clock();
    const fields = createFields({now, ttl: 10000});
    fields.apply(3, {targetId: 'Cat', blockId: 'f1', on: true});
    ok('field on marks the block', fields.holder('f1').peer === 3);
    fields.apply(3, {targetId: 'Cat', blockId: 'f1', on: false});
    ok('field off clears it', fields.holder('f1') === null);
    fields.apply(3, {targetId: 'Cat', blockId: 'f2', on: true});
    now.advance(10001);
    ok('a silent caret expires', fields.holder('f2') === null);
}

console.log('follow');
{
    const now = clock();
    const follow = createFollow({now});
    const events = [];
    follow.subscribe(e => events.push(e.reason));
    const known = new Set([4, 5]);
    ok('following a gone peer fails', follow.start(9, id => known.has(id)) === false);
    ok('following a present peer starts', follow.start(4, id => known.has(id)) === true && follow.following === 4);
    ok('a viewport from someone else is ignored', follow.viewport(5, {targetId: 'Cat', tab: 'code', x: 1, y: 2, zoom: 1}) === null);
    const view = follow.viewport(4, {targetId: 'Cat', tab: 'code', x: 10, y: 20, zoom: 0.75});
    ok('a viewport from the followed peer moves us', view && view.targetId === 'Cat' && view.x === 10 && view.zoom === 0.75, view);
    const odd = follow.viewport(4, {targetId: 'Cat', tab: 'paint', x: 'a', zoom: -1});
    ok('bad fields read as safe defaults', odd.tab === 'code' && odd.x === null && odd.zoom === null, odd);
    ok('input inside the grace window does not stop', follow.input('pointer') === false && follow.following === 4);
    now.advance(FOLLOW_GRACE_MS + 1);
    ok('own input stops following', follow.input('pointer') === true && follow.following === null);
    ok('viewports after stopping are ignored', follow.viewport(4, {targetId: 'Cat'}) === null);
    follow.start(4, id => known.has(id));
    ok('Escape stops at once', follow.input('escape') === true && follow.following === null);
    follow.start(5, id => known.has(id));
    ok('another peer leaving does not stop', follow.peerLeft(4) === false && follow.following === 5);
    ok('the followed peer leaving stops', follow.peerLeft(5) === true && follow.following === null);
    ok('stop when idle is a no-op', follow.stop() === false);
    ok('transitions were announced in order',
        JSON.stringify(events) === JSON.stringify(['start', 'input', 'start', 'escape', 'start', 'left']), events);
}

console.log('gate and initials');
{
    const now = clock();
    const gate = createGate(1000, now);
    ok('the first call passes', gate.ready() === true);
    ok('a second call inside the window waits', gate.ready() === false);
    now.advance(1000);
    ok('the window reopens', gate.ready() === true);
    ok('initials of two words', initials('Ada Lovelace') === 'AL');
    ok('initials of one word', initials('sam') === 'S');
    ok('initials of nothing', initials('  ') === '?');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
