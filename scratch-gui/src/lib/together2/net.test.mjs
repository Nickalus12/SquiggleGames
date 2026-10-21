process.removeAllListeners('warning');

const {ok, section, done, fakeClock} = await import('./harness.test-util.mjs');
const {createGameSession, gameSocketUrl} = await import('./net.js');

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
    ws.deliver({type: 'welcome', slot: 3, ack: 0, resume: 'r1'});
    ok('the welcome gives the slot', session.slot === 3 && events.some(e => e.type === 'welcome'));
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
}

section('ops are limited to 25 a second, burst 50');
{
    const {session, ws} = make();
    ws.deliver({type: 'welcome', slot: 1, ack: 0});
    let taken = 0;
    for (let i = 0; i < 60; i++) if (session.queueOp({action: 'msg', name: 'x', value: ''})) taken++;
    ok('the burst stops at 50', taken === 50 && session.dropped === 10, {taken, dropped: session.dropped});
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
    ws.deliver({type: 'rules-status', hash: 'h', ok: true, phase: 'compile', errors: []});
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
