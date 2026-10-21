process.removeAllListeners('warning');

import {performance} from 'node:perf_hooks';

const {prepare, search, scoreToken, normalize} = await import('./fuzzy.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

const WORDS = [
    'move', 'steps', 'turn', 'degrees', 'go to', 'random position', 'glide', 'secs', 'point in direction', 'change x',
    'set y', 'if on edge bounce', 'say', 'think', 'switch costume', 'next backdrop', 'size', 'effect', 'show', 'hide',
    'play sound', 'until done', 'volume', 'when flag clicked', 'when key pressed', 'broadcast', 'wait', 'repeat',
    'forever', 'if then else', 'create clone', 'delete this clone', 'touching', 'ask and wait', 'timer', 'pick random',
    'join', 'letter of', 'length of', 'round', 'variable', 'list', 'Cat', 'Dog', 'Level', 'Scene', 'tile', 'score'
];
const KINDS = ['block', 'sprite', 'costume', 'sound', 'scene', 'variable', 'command', 'checker'];

const items = [];
for (let i = 0; i < 2000; i++) {
    const a = WORDS[i % WORDS.length];
    const b = WORDS[(i * 7 + 3) % WORDS.length];
    items.push({id: `i${i}`, kind: KINDS[i % KINDS.length], label: `${a} ${b} ${i}`});
}

const prepared = prepare(items);
const QUERIES = ['mov', 'when flag', 'clne', 'say hello', 'xyzzy', 'pick rnd', 'cat', 'set y 19', 'brd', 'f'];

for (let warm = 0; warm < 20; warm++) QUERIES.forEach(q => search(prepared, q));

const times = [];
for (let round = 0; round < 30; round++) {
    for (const q of QUERIES) {
        const start = performance.now();
        search(prepared, q);
        times.push(performance.now() - start);
    }
}
times.sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const p95 = times[Math.floor(times.length * 0.95)];
console.log(`  bench  2000 items: median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`);
ok('fuzzy search over 2,000 items stays under 10 ms (p95)', p95 < 10, {median, p95});

const prepStart = performance.now();
prepare(items);
const prepMs = performance.now() - prepStart;
ok('preparing 2,000 items stays under 10 ms', prepMs < 10, prepMs);

const small = prepare([
    {id: 'a', label: 'when green flag clicked'},
    {id: 'b', label: 'forever'},
    {id: 'c', label: 'create clone of myself'},
    {id: 'd', label: 'delete this clone'},
    {id: 'e', label: 'Écran titre', keywords: ['scene']}
]);
ok('a prefix match comes first', search(small, 'for')[0].id === 'b');
ok('word starts beat the middle', search(small, 'clone')[0].id === 'c');
ok('subsequences still match', search(small, 'crcln').map(entry => entry.id).indexOf('c') === 0);
ok('every token must match', search(small, 'clone delete').length === 1 && search(small, 'clone delete')[0].id === 'd');
ok('accents and case do not matter', search(small, 'ecran')[0].id === 'e' && normalize('ÉCRAN') === 'ecran');
ok('keywords are searchable', search(small, 'scene')[0].id === 'e');
ok('no match gives nothing', search(small, 'qqq').length === 0 && scoreToken('abc', 'z') === -1);
ok('an empty query lists the first items', search(small, '  ').length === 5);
ok('the limit is honoured', search(prepared, 'e', 7).length === 7);
ok('boost lifts an item', search(prepare([{id: 'x', label: 'say'}, {id: 'y', label: 'say', boost: 5}]), 'say')[0].id === 'y');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
