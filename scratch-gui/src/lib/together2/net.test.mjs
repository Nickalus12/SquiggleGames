process.removeAllListeners('warning');

const {ok, section, done, fakeClock} = await import('./harness.test-util.mjs');
const {createGameSession, gameSocketUrl, MAX_FRAME_BYTES, cutOp, wireValue} = await import('./net.js');

const sockets = [];
class FakeSocket {
    constructor (url) {
        this.url = url;
        this.sent = [];
        this.closed = null;
        sockets.push(this);
    }
    send (text) {
        this.sent.push(JSON.parse(text));
    }
    close (code) {
        this.closed = code;
        this.onclose({code});
    }
    open () {
        this.onopen();
    }
    deliver (msg) {
        this.onmessage({data: JSON.stringify(msg)});
    }
    drop (code) {
        this.onclose({code});
    }
}

const make = () => {
    const clock = fakeClock();
    sockets.length = 0;
    const session = createGameSession({url: 'wss://sq.test/ws/room/blue/game', WebSocketImpl: FakeSocket,
        now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, random: () => 0});
    const events = [];
    ['welcome', 'tick', 'correction', 'rules-status', 'closed', 'dropped', 'ended', 'error']
        .forEach(type => session.on(type, msg => events.push({type, msg})));
    session.start();
    const ws = sockets[0];
    ws.open();
    return {clock, session, ws, events};
};

const ins = ws => ws.sent.filter(m => m.type === 'in');

section('the game socket url');
ok('it hangs off the room origin', gameSocketUrl('wss://sq.test', 'blue fox') === 'wss://sq.test/ws/room/blue%20fox/game');
ok('a path on the base is dropped', gameSocketUrl('wss://sq.test/ws/', 'a') === 'wss://sq.test/ws/room/a/game');

section('join and welcome');
{
    const {session, ws, events} = make();
    ok('it joins with proto 2', ws.sent[0].type === 'join' && ws.sent[0].proto === 2 && !('resume' in ws.sent[0]));
    ws.deliver({type: 'welcome', proto: 2, mode: 'rules', slot: 3, ack: 0, resume: 'r1', tickHz: 20, region: 'x', t: 40});
    ok('the welcome gives the slot', session.slot === 3 && events.some(e => e.type === 'welcome'));
    ok('and the mode and tick rate', session.mode === 'rules' && session.tickHz === 20, [session.mode, session.tickHz]);
    ok('the welcome tick is not a tick seen', session.k === -1, session.k);
}

section('nothing goes out before the welcome');
{
    const {clock, session, ws} = make();
    ok('an open socket is not open before the welcome', session.open === false);
    session.setAvatar([0, 0, 90, 1, 1, 0]);
    session.queueOp({action: 'input', name: 'jump', value: ''});
    clock.advance(200);
    ok('only the join went out', ws.sent.length === 1 && ws.sent[0].type === 'join', ws.sent);
    ws.deliver({type: 'welcome', slot: 2, ack: 0});
    ok('the welcome opens it', session.open === true);
    clock.advance(50);
    ok('the held avatar and op go out after it', ins(ws).length === 1 && ins(ws)[0].s === 1 &&
        ins(ws)[0].a[0] === 0 && ins(ws)[0].g[0].name === 'jump', ins(ws));
}

section('only input, fire and msg go out');
{
    const {clock, session, ws} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0});
    const taken = ['input', 'fire', 'msg', 'var', 'spawn', '', 7].map(action => session.queueOp({action, name: 'x'}));
    ok('the three actions are taken, the rest refused', taken.join() === 'true,true,true,false,false,false,false',
        taken);
    clock.advance(50);
    ok('only they ride the frames', ins(ws).reduce((list, frame) => list.concat(frame.g || []), [])
        .map(op => op.action).join() === 'input,fire,msg', ins(ws));
}

section('in frames: leading edge, then 20 a second');
{
    const {clock, session, ws} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0});
    session.setAvatar([0, 0, 90, 1, 1, 0]);
    ok('the first change after quiet goes at once', ins(ws).length === 1 && ins(ws)[0].s === 1, ins(ws));
    session.setAvatar([1, 0, 90, 1, 1, 0]);
    session.queueOp({action: 'input', name: 'jump', value: ''});
    session.setAvatar([2, 0, 90, 1, 1, 0]);
    ok('later changes wait for the batch', ins(ws).length === 1);
    clock.advance(50);
    const second = ins(ws)[1];
    ok('they ride one frame 50 ms later', ins(ws).length === 2 && second.s === 2 && second.a[0] === 2 &&
        second.g.length === 1, second);
    session.setAvatar([2, 0, 90, 1, 1, 0]);
    clock.advance(200);
    ok('an unchanged avatar sends nothing', ins(ws).length === 2);
    ok('frames carry k and cid', second.k === -1 && second.cid === 0, second);
    const slice = Array.prototype.slice;
    let slices = 0;
    Array.prototype.slice = function (...args) {
        slices += 1;
        return slice.apply(this, args);
    };
    const mine = [3, 0, 90, 1, 1, 0];
    session.setAvatar(mine);
    mine[0] = 99;
    clock.advance(50);
    session.setAvatar([4, 0, 90, 1, 1, 0]);
    clock.advance(50);
    session.setAvatar([5, 0, 90, 1, 1, 0]);
    clock.advance(50);
    Array.prototype.slice = slice;
    ok('setAvatar copies into its own buffers without slicing', slices === 0, slices);
    ok('a change to the caller array after setAvatar is not sent', ins(ws)[2].a[0] === 3, ins(ws)[2]);
    ok('three avatars in a row go out in order', ins(ws).slice(2).map(f => f.a[0]).join() === '3,4,5',
        ins(ws).map(f => f.a && f.a[0]));
}

section('ops are limited to 25 a second, burst 50');
{
    const {session, ws} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0});
    let taken = 0;
    for (let i = 0; i < 60; i++) if (session.queueOp({action: 'msg', name: 'x', value: ''})) taken++;
    ok('the burst stops at 50', taken === 50 && session.dropped === 10, {taken, dropped: session.dropped});
}

section('at most 50 ops ride one frame');
{
    const {clock, session, ws} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0});
    ws.drop(1006);
    for (let i = 0; i < 50; i++) session.queueOp({action: 'msg', name: `a${i}`, value: ''});
    clock.advance(3000);
    for (let i = 0; i < 20; i++) session.queueOp({action: 'msg', name: `b${i}`, value: ''});
    const next = sockets[1];
    next.open();
    next.deliver({type: 'welcome', slot: 1, ack: 0});
    ok('the first frame carries 50', ins(next).length === 1 && ins(next)[0].g.length === 50, ins(next).map(f => f.g.length));
    clock.advance(50);
    ok('the rest follow in the next frame', ins(next).length === 2 && ins(next)[1].g.length === 20 &&
        ins(next)[1].g[19].name === 'b19', ins(next).map(f => f.g.length));
}

section('ops are cut and frames are sized by bytes');
{
    const {clock, session, ws} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0});
    session.queueOp({action: 'msg', name: 'n'.repeat(150), value: 'v'.repeat(9000)});
    clock.advance(50);
    const cut = ins(ws)[0].g[0];
    ok('a long value is cut to 4096 and still sent', cut.value.length === 4096, cut.value.length);
    ok('a long name is cut to 100', cut.name.length === 100, cut.name.length);
    ok('wireValue sends numbers as numbers and the rest as text', wireValue('42') === 42 && wireValue(' -3.5') === -3.5 &&
        wireValue('007') === '007' && wireValue('') === '' && wireValue('Infinity') === 'Infinity' &&
        wireValue(NaN) === 'NaN', ['42', '007', '', 'Infinity'].map(wireValue));
    ok('typed text with 5 or more digits in a row stays text', wireValue('5551234567') === '5551234567' &&
        wireValue('12345') === '12345' && wireValue(' 12345678 ') === ' 12345678 ', ['5551234567', '12345'].map(wireValue));
    ok('shorter digit runs and numbers the VM holds still go as numbers', wireValue('123') === 123 &&
        wireValue('1234') === 1234 && wireValue(5551234567) === 5551234567, [wireValue('123'), wireValue(5551234567)]);
    ok('cutOp leaves short ops alone', JSON.stringify(cutOp({action: 'msg', name: 'a', value: 'b'})) ===
        '{"action":"msg","name":"a","value":"b"}');
    clock.advance(5000);
    for (let i = 0; i < 50; i++) session.queueOp({action: 'msg', name: `m${i}`, value: 'x'.repeat(140)});
    clock.advance(50);
    clock.advance(50);
    clock.advance(50);
    const sized = ins(ws).slice(1);
    const counts = sized.map(f => f.g.length);
    const bytes = sized.map(f => new TextEncoder().encode(JSON.stringify(f)).length);
    ok('50 ops of about 165 bytes spill into more frames', counts.reduce((a, b) => a + b, 0) === 50 &&
        Math.max(...counts) < 50 && counts.length >= 2, counts);
    ok('each frame stays under 7 KiB', bytes.every(n => n <= 7 * 1024), bytes);
    clock.advance(5000);
    const before = ins(ws).length;
    const bigTaken = session.queueOp({action: 'msg', name: 'big', value: '\u20ac'.repeat(5000)});
    session.queueOp({action: 'msg', name: 'small', value: ''});
    clock.advance(50);
    const after = ins(ws).slice(before);
    ok('an op over 8 KiB once encoded is never queued and is counted', !bigTaken && session.oversized === 1 &&
        after.length === 1 && after[0].g.length === 1 && after[0].g[0].name === 'small', after);
    ok('no frame goes over 8 KiB', ins(ws).every(f => new TextEncoder().encode(JSON.stringify(f)).length <=
        MAX_FRAME_BYTES));
}

section('ticks, acks and rtt');
{
    const {clock, session, ws, events} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0});
    session.setAvatar([0, 0, 90, 1, 1, 0]);
    clock.advance(80);
    ws.deliver({type: 'tick', t: 7, ack: 1, kf: 1});
    ok('rtt is the time to the ack of that frame', session.rtt === 80, session.rtt);
    ok('k follows the newest tick', session.k === 7);
    ok('acked frames are released', session.unacked === 0);
    session.setAvatar([1, 0, 90, 1, 1, 0]);
    clock.advance(40);
    ws.deliver({type: 'tick', t: 8, ack: 2, c: [5, 5, 1]});
    ok('rtt is smoothed', session.rtt === 72, session.rtt);
    ok('a correction is handed on after the tick',
        events.map(e => e.type).slice(-2).join() === 'tick,correction', events.map(e => e.type));
    ws.deliver({type: 'rules-status', hash: 'h', ok: true, phase: 'run', errors: []});
    ok('rules-status is handed on', events.some(e => e.type === 'rules-status'));
    session.setCid(1);
    session.setAvatar([2, 0, 90, 1, 1, 0]);
    clock.advance(50);
    ok('the next frame carries the new cid', ins(ws).pop().cid === 1);
}

section('a drop resumes and resends what was not acked');
{
    const {clock, session, ws, events} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0, resume: 'tok'});
    session.queueOp({action: 'input', name: 'a', value: ''});
    clock.advance(50);
    session.queueOp({action: 'input', name: 'b', value: ''});
    clock.advance(50);
    ok('two frames are out', ins(ws).length === 2);
    ws.drop(1006);
    ok('the drop is reported', events.some(e => e.type === 'dropped'));
    clock.advance(250);
    const next = sockets[1];
    ok('it reconnects', !!next);
    next.open();
    ok('the join carries the resume token', next.sent[0].resume === 'tok', next.sent[0]);
    next.deliver({type: 'welcome', slot: 1, ack: 1});
    const resent = ins(next);
    ok('only the unacked frame is resent with its s', resent.length === 1 && resent[0].s === 2 &&
        resent[0].g[0].name === 'b', resent);
    session.queueOp({action: 'input', name: 'c', value: ''});
    clock.advance(50);
    ok('numbering carries on', ins(next).pop().s === 3);
    clock.advance(10);
    ws.deliver({type: 'tick', t: 50, ack: 3});
    ok('frames from the old socket are ignored', session.k === -1);
    next.deliver({type: 'tick', t: 50, ack: 3});
    ok('rtt comes from the fresh frame, not the welcome or a resent frame', session.rtt === 60, session.rtt);
}

section('a resent frame keeps the avatar it was sent with');
{
    const {clock, session, ws} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0, resume: 'tok'});
    session.setAvatar([5, 0, 90, 1, 1, 0]);
    clock.advance(50);
    session.setAvatar([6, 0, 90, 1, 1, 0]);
    clock.advance(50);
    ok('two avatars went out 50 ms apart, neither acked', ins(ws).map(f => f.s).join() === '1,2' &&
        session.unacked === 2, ins(ws));
    ws.drop(1006);
    session.setAvatar([7, 0, 90, 1, 1, 0]);
    clock.advance(250);
    const next = sockets[sockets.length - 1];
    next.open();
    next.deliver({type: 'welcome', slot: 1, ack: 0});
    clock.advance(50);
    const sent = ins(next).map(f => `${f.s}:${f.a && f.a[0]}`).join();
    ok('the resent s=1 and s=2 carry their own avatars and the third follows under s=3', sent === '1:5,2:6,3:7',
        ins(next));
}

section('a refused resume starts over');
{
    const {clock, session, ws} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0, resume: 'tok'});
    session.queueOp({action: 'input', name: 'a', value: ''});
    clock.advance(50);
    session.queueOp({action: 'input', name: 'b', value: ''});
    clock.advance(50);
    ws.drop(1006);
    clock.advance(250);
    const next = sockets[1];
    next.open();
    ok('the join asks to resume', next.sent[0].resume === 'tok');
    next.deliver({type: 'welcome', slot: 4, ack: 0, resume: 'tok2'});
    ok('a new slot means nothing old is resent', ins(next).length === 0 && session.unacked === 0, ins(next));
    session.queueOp({action: 'input', name: 'c', value: ''});
    clock.advance(50);
    ok('numbering starts again at 1', ins(next).length === 1 && ins(next)[0].s === 1, ins(next));
    ok('the new slot is kept', session.slot === 4);
}

section('close codes');
{
    const run = code => {
        const env = make();
        env.ws.drop(code);
        env.clock.advance(20000);
        return {reconnected: sockets.length > 1, closed: env.events.find(e => e.type === 'closed')};
    };
    const reload = run(4010);
    ok('4010 asks for a reload and stays closed', !reload.reconnected && reload.closed.msg.reason === 'reload');
    const refused = run(4003);
    ok('an app refusal stays closed', !refused.reconnected && !!refused.closed);
    ok('1009 frame-too-large stays closed', !run(1009).reconnected);
    ok('4009 not-started stays closed', !run(4009).reconnected);
    const bad = run(1007);
    ok('1007 bad-frame stays closed and says why', !bad.reconnected && bad.closed.msg.reason === 'bad-frame');
    ok('1012 reconnects', run(1012).reconnected);
    const env = make();
    env.ws.drop(1013);
    env.clock.advance(4000);
    ok('1013 backs off longer', sockets.length === 1);
    env.clock.advance(2000);
    ok('then reconnects', sockets.length === 2);
}

section('stop');
{
    const {session, ws, events} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0});
    session.stop();
    ok('stop closes with 1000', ws.closed === 1000);
    ok('and reports closed', events.some(e => e.type === 'closed' && e.msg.reason === 'stopped'));
    ok('it is not open', !session.open && session.stopped);
    session.setAvatar([9, 9, 90, 1, 1, 0]);
    ok('nothing is sent after stop', ins(ws).length === 0);
}

done();
