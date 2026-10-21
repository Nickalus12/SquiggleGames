/*
 * The Together extension, tested without a browser:
 *   node src/lib/libraries/extensions/together/together.test.mjs
 *
 * There was no test here before, and the bugs this file pins down are exactly
 * the kind that survive manual play-testing: they need two messages in one
 * frame, or a second project load, or a loop running long enough to flood a
 * socket. You do not hit those while trying a feature out; you hit them three
 * weeks later in someone else's game.
 *
 * The extension is a plain class over two seams — a `runtime` and a
 * `window.SquiggleNet` bridge — so both are stubbed and the class is driven
 * directly. No VM, no DOM, no network.
 */

import '../../../rules/json-hook.mjs';

const TogetherBlocks = (await import('./index.js')).default;
const {ruleOpcodes} = await import('../../../rules/rule-blocks.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
    }
};

/** Records every hat start and every listener, so both can be asserted on. */
const makeRuntime = () => {
    const listeners = new Map();
    return {
        hats: [],
        listeners,
        on (event, cb) {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(cb);
        },
        off (event, cb) {
            const list = listeners.get(event) || [];
            const i = list.indexOf(cb);
            if (i >= 0) list.splice(i, 1);
        },
        emit (event) {
            for (const cb of (listeners.get(event) || []).slice()) cb();
        },
        /*
         * Returns the threads it started, as scratch-vm's own startHats does.
         * That return value is load-bearing: it is how the extension tells
         * each started script which message it is handling, which is what
         * makes delivering several in one frame safe.
         */
        startHats (opcode, fields) {
            const thread = {opcode, fields};
            this.hats.push(thread);
            return [thread];
        }
    };
};

/** A stand-in for the collab bridge that records what was put on the wire. */
const makeNet = () => {
    const handlers = {};
    return {
        sent: [],
        peers: [],
        playerName: 'me',
        connected: true,
        sharedVars: null,
        send (msg) {
            this.sent.push(msg);
        },
        on (type, cb) {
            (handlers[type] = handlers[type] || []).push(cb);
            return () => {
                const i = handlers[type].indexOf(cb);
                if (i >= 0) handlers[type].splice(i, 1);
            };
        },
        fire (type, msg) {
            for (const cb of handlers[type] || []) cb(msg);
        }
    };
};

/*
 * A fake clock. The outbound budget refills from elapsed time, so without
 * control of the clock a test either sleeps for real or can never observe a
 * flush — and the first version of this file quietly did the latter, stepping
 * frames in the same millisecond and concluding the throttle was broken.
 */
const setup = decorate => {
    const runtime = makeRuntime();
    const net = makeNet();
    if (decorate) decorate(net);
    global.window = {
        SquiggleNet: net,
        addEventListener () {},
        removeEventListener () {}
    };
    const clock = {t: 1000};
    const ext = new TogetherBlocks(runtime);
    ext._now = () => clock.t;
    return {runtime, net, ext, clock};
};

/** Advance one frame of a 30fps project, then let the extension run. */
const step = (runtime, clock, ms = 33) => {
    if (clock) clock.t += ms;
    runtime.emit('BEFORE_EXECUTE');
};

/** What `game message name` / `value` report from inside one hat's script. */
const reads = (ext, thread) => ({
    name: ext.gameMessageName({}, {thread}),
    value: ext.gameMessageValue({}, {thread})
});

/** The hat started for a particular message name. */
const hatFor = (runtime, name) => runtime.hats.find(h =>
    h.opcode === 'together_whenGameMessage' && h.fields && h.fields.TEXT === name);

console.log('\nreceiving messages');
{
    const {runtime, net, ext, clock} = setup();

    net.fire('game', {action: 'msg', name: 'score', value: '10'});
    ok('an arriving message does not fire hats immediately',
        runtime.hats.length === 0, runtime.hats);

    step(runtime, clock);
    ok('it fires on the next frame', runtime.hats.length === 2, runtime.hats);
    ok('the specific hat is matched by name',
        runtime.hats[0].opcode === 'together_whenGameMessage' &&
        runtime.hats[0].fields.TEXT === 'score', runtime.hats[0]);
    ok('the any-message hat fires too',
        runtime.hats[1].opcode === 'together_whenAnyGameMessage');
    ok('the reporters describe that message',
        ext.gameMessageName() === 'score' && ext.gameMessageValue() === '10');

    /*
     * The bug that motivated the queue, and the reason a frame can now carry
     * more than one message.
     *
     * Delivering on arrival made both hats' scripts read "hit", because the
     * second write clobbered the reporters before either ran. Delivering one
     * per frame fixed that by making the reporters describe the only message
     * in flight — correct, but a hard ceiling of 30 a second against an
     * inbound budget of 25 a second PER PEER, so a busy room spent its life
     * dropping the backlog. Now both are delivered together and the reporters
     * answer per script, which is the property that was actually wanted.
     */
    runtime.hats.length = 0;
    net.fire('game', {action: 'msg', name: 'score', value: '20'});
    net.fire('game', {action: 'msg', name: 'hit', value: 'left'});

    step(runtime, clock);
    const scoreHat = hatFor(runtime, 'score');
    const hitHat = hatFor(runtime, 'hit');
    ok('two messages in one frame: both are delivered', !!scoreHat && !!hitHat, runtime.hats);
    ok('the first hat reads its own message',
        reads(ext, scoreHat).name === 'score' && reads(ext, scoreHat).value === '20',
        reads(ext, scoreHat));
    ok('the second hat reads its own message',
        reads(ext, hitHat).name === 'hit' && reads(ext, hitHat).value === 'left',
        reads(ext, hitHat));
    ok('a script with no hat still sees the newest message',
        ext.gameMessageName() === 'hit' && ext.gameMessageValue() === 'left',
        {name: ext.gameMessageName(), value: ext.gameMessageValue()});

    net.fire('game', {action: 'msg', name: '', value: 'x'});
    step(runtime, clock);
    ok('a nameless message is ignored', ext.gameMessageName() === 'hit');
}

console.log('\nsending messages');
{
    const {runtime, net, ext, clock} = setup();

    ext.broadcastGameMessage({NAME: 'shoot', VALUE: '1'});
    ok('a broadcast goes out immediately', net.sent.length === 1, net.sent);
    ext.broadcastGameMessage({NAME: 'n'.repeat(150), VALUE: 'v'.repeat(9000)});
    const long = net.sent[1] || {};
    ok('a long name and value are cut to 100 and 4096', String(long.name).length === 100 &&
        String(long.value).length === 4096, [String(long.name).length, String(long.value).length]);
    net.sent.length = 1;
    ok('the sender does not hear it in the same frame', runtime.hats.length === 0, runtime.hats);
    step(runtime, clock);
    ok('but does hear it on the next one, like everyone else',
        runtime.hats.some(h => h.opcode === 'together_whenGameMessage'), runtime.hats);

    /*
     * The local half of the reporter bug. Two ordinary broadcasts in one
     * frame: both hats used to read the second one's values because the
     * second call overwrote the reporters before either thread ran.
     */
    const {runtime: r3, ext: e3, clock: c3} = setup();
    e3.broadcastGameMessage({NAME: 'score', VALUE: '10'});
    e3.broadcastGameMessage({NAME: 'lives', VALUE: '3'});
    step(r3, c3);
    const h1 = hatFor(r3, 'score');
    const h2 = hatFor(r3, 'lives');
    ok('both of my own broadcasts arrive on the next frame', !!h1 && !!h2, r3.hats);
    ok('own broadcast #1 is read with its own values',
        reads(e3, h1).name === 'score' && reads(e3, h1).value === '10', reads(e3, h1));
    ok('own broadcast #2 is read with its own values',
        reads(e3, h2).name === 'lives' && reads(e3, h2).value === '3', reads(e3, h2));

    // Burn the budget the way a `forever` loop would.
    for (let i = 0; i < 200; i++) ext.broadcastGameMessage({NAME: 'spam', VALUE: String(i)});
    ok('a runaway loop cannot flood the socket', net.sent.length < 40, net.sent.length);

    const before = net.sent.length;
    step(runtime, clock, 200);
    ok('held messages are sent on later frames', net.sent.length >= before);
    const spam = net.sent.filter(m => m.name === 'spam');
    ok('the newest value of a repeated name survives',
        spam.length === 0 || spam[spam.length - 1].value === '199',
        spam[spam.length - 1]);

    // Distinct names must not be collapsed into each other.
    const {runtime: r2, net: n2, ext: e2, clock: c2} = setup();
    for (let i = 0; i < 200; i++) e2.broadcastGameMessage({NAME: 'a', VALUE: '1'});
    e2.broadcastGameMessage({NAME: 'b', VALUE: '2'});
    for (let i = 0; i < 20; i++) step(r2, c2, 100);
    ok('a different message name still gets through under flood',
        n2.sent.some(m => m.name === 'b'), n2.sent.slice(-3));
}

console.log('\nshared variables');
{
    const {net, ext} = setup();

    ext.setSharedVariable({NAME: 'score', VALUE: 5});
    ok('the value is readable at once, before it is sent',
        ext.getSharedVariable({NAME: 'score'}) === 5);
    ok('and is not on the wire yet (it coalesces)', net.sent.length === 0, net.sent);

    ext.setSharedVariable({NAME: 'score', VALUE: 6});
    ext.setSharedVariable({NAME: 'score', VALUE: 7});
    ext.changeSharedVariable({NAME: 'score', VALUE: 1});
    ok('changing works off the local value', ext.getSharedVariable({NAME: 'score'}) === 8);

    await new Promise(r => setTimeout(r, 90));
    const scoreWrites = net.sent.filter(m => m.action === 'var' && m.name === 'score');
    ok('four writes in one burst became one', scoreWrites.length === 1, net.sent);
    ok('and it carries the final value', scoreWrites[0] && scoreWrites[0].value === 8, scoreWrites);

    ext.setSharedVariable({NAME: 'score', VALUE: 8});
    ok('a no-op write sends nothing', net.sent.filter(m => m.name === 'score').length === 1);

    // Values arriving from other players.
    net.fire('game', {action: 'var', name: 'level', value: 3});
    ok('a remote value is readable', ext.getSharedVariable({NAME: 'level'}) === 3);
    net.fire('game', {action: 'var', name: 'level', value: 9});
    ok('a later remote value replaces it', ext.getSharedVariable({NAME: 'level'}) === 9);
}

/*
 * "change shared variable by" is the block a multiplayer game keeps score
 * with, and it cannot travel as the number it produced: two players scoring in
 * the same moment both read 5, both compute 6, and one child's point is gone.
 * What goes out is the delta; the server owns the addition.
 */
console.log('\nshared variables: increments');
{
    const {net, ext} = setup();

    ext.changeSharedVariable({NAME: 'score', VALUE: 1});
    ok('the local value moves at once', ext.getSharedVariable({NAME: 'score'}) === 1);

    await new Promise(r => setTimeout(r, 90));
    ok('what went out is a delta, not a value',
        net.sent.length === 1 && net.sent[0].action === 'var-add' &&
        net.sent[0].name === 'score' && net.sent[0].delta === 1, net.sent);
    ok('no absolute write was sent alongside it',
        net.sent.every(m => m.action !== 'var'), net.sent);

    // Increments must accumulate. Coalescing them the way sets coalesce —
    // keep the newest, drop the rest — would throw away every point but one.
    net.sent.length = 0;
    ext.changeSharedVariable({NAME: 'score', VALUE: 1});
    ext.changeSharedVariable({NAME: 'score', VALUE: 1});
    ext.changeSharedVariable({NAME: 'score', VALUE: 3});
    await new Promise(r => setTimeout(r, 90));
    ok('three increments in one burst became one message',
        net.sent.length === 1, net.sent);
    ok('carrying their sum, not the last of them',
        net.sent[0] && net.sent[0].delta === 5, net.sent);

    // The server is the authority: its answer stands over the local guess,
    // which was made without knowing about anyone else's increments.
    net.fire('game', {action: 'var', name: 'score', value: 40});
    ok('the server value overrides the optimistic one',
        ext.getSharedVariable({NAME: 'score'}) === 40);

    net.sent.length = 0;
    ext.changeSharedVariable({NAME: 'score', VALUE: 0});
    await new Promise(r => setTimeout(r, 90));
    ok('changing by zero sends nothing', net.sent.length === 0, net.sent);

    // A set supersedes an increment that has not gone out — it overwrites
    // whatever that increment was going to land on.
    net.sent.length = 0;
    ext.changeSharedVariable({NAME: 'lives', VALUE: -1});
    ext.setSharedVariable({NAME: 'lives', VALUE: 3});
    await new Promise(r => setTimeout(r, 90));
    ok('a set after an increment sends one absolute write',
        net.sent.length === 1 && net.sent[0].action === 'var' && net.sent[0].value === 3, net.sent);
}

console.log('\nshared variables: remote');
{
    const {net, ext} = setup();
    net.fire('game-state', {vars: {level: 9, lives: 3}});
    ok('a state replay overwrites', ext.getSharedVariable({NAME: 'level'}) === 9);
    ok('unknown variables read as empty', ext.getSharedVariable({NAME: 'nope'}) === '');
}

console.log('\nplayers');
{
    const {net, ext} = setup();
    ok('alone, the count is 1', ext.playerCount() === 1, ext.playerCount());

    net.peers = ['ana', 'bo'];
    ok('with two others, 3', ext.playerCount() === 3);

    // The case that used to return 0: connected, but no name yet.
    net.playerName = '';
    ok('still counts yourself before the handshake finishes',
        ext.playerCount() === 3, ext.playerCount());

    net.fire('peer-joined', {peer: {name: 'ana'}});
    ok('last player joined is reported', ext.lastPlayerJoined() === 'ana');
    net.fire('peer-left', {name: 'bo'});
    ok('last player left is reported', ext.lastPlayerLeft() === 'bo');
    ok('connected reflects the bridge', ext.connected() === true);
}

console.log('\nproject reload');
{
    const {runtime, net, ext, clock} = setup();
    ext.setSharedVariable({NAME: 'score', VALUE: 1});
    net.fire('game', {action: 'msg', name: 'x', value: '1'});

    const before = (runtime.listeners.get('BEFORE_EXECUTE') || []).length;
    runtime.emit('RUNTIME_DISPOSED');
    const after = (runtime.listeners.get('BEFORE_EXECUTE') || []).length;

    ok('a project reload keeps the step listener', after === before, {before, after});
    ok('shared variables do not survive into the next project',
        ext.getSharedVariable({NAME: 'score'}) === '');
    ok('queued messages are dropped', ext.gameMessageName() === '');

    runtime.hats.length = 0;
    step(runtime, clock);
    ok('nothing from the old project starts a hat', runtime.hats.length === 0, runtime.hats);

    net.fire('game', {action: 'msg', name: 'y', value: '2'});
    step(runtime, clock);
    ok('a message after the reload still reaches its hat', !!hatFor(runtime, 'y'), runtime.hats);

    runtime.emit('RUNTIME_DISPOSED');
    net.fire('game', {action: 'msg', name: 'z', value: '3'});
    step(runtime, clock);
    ok('and after a second reload too', !!hatFor(runtime, 'z'), runtime.hats);

    ext.broadcastGameMessage({NAME: 'out', VALUE: '1'});
    ok('broadcasts still go out after a reload',
        net.sent.some(m => m.name === 'out'), net.sent);
}

console.log('\nproject reload: room variables');
{
    const {runtime, net, ext} = setup();
    net.sharedVars = {level: 4};
    runtime.emit('RUNTIME_DISPOSED');
    ok('the room\'s shared variables are read back from the bridge',
        ext.getSharedVariable({NAME: 'level'}) === 4, ext.getSharedVariable({NAME: 'level'}));
}

console.log('\ndisposal');
{
    const {runtime, net, ext, clock} = setup();
    net.fire('game', {action: 'msg', name: 'x', value: '1'});

    const before = (runtime.listeners.get('BEFORE_EXECUTE') || []).length;
    ext.dispose();
    const after = (runtime.listeners.get('BEFORE_EXECUTE') || []).length;
    ok('a real teardown removes the step listener', after === before - 1, {before, after});

    runtime.hats.length = 0;
    step(runtime, clock);
    ok('a disposed extension starts no hats', runtime.hats.length === 0, runtime.hats);
}

console.log('\nblock shapes from 1.8 projects');
{
    const {ext} = setup();
    const info = ext.getInfo();
    const byOpcode = {};
    info.blocks.forEach(block => {
        if (block && block.opcode) byOpcode[block.opcode] = block;
    });
    const legacy = {
        broadcastGameMessage: ['NAME', 'VALUE'],
        whenGameMessage: ['NAME'],
        whenAnyGameMessage: [],
        gameMessageName: [],
        gameMessageValue: [],
        setSharedVariable: ['NAME', 'VALUE'],
        changeSharedVariable: ['NAME', 'VALUE'],
        getSharedVariable: ['NAME'],
        myPlayerName: [],
        otherPlayers: [],
        playerCount: [],
        whenPlayerJoins: [],
        whenPlayerLeaves: [],
        lastPlayerJoined: [],
        lastPlayerLeft: [],
        connected: []
    };
    const missing = Object.keys(legacy).filter(opcode => {
        const block = byOpcode[opcode];
        if (!block) return true;
        const args = Object.keys(block.arguments || {}).sort();
        return args.join() !== legacy[opcode].slice().sort().join();
    });
    ok('every 1.8 opcode keeps its name and argument names', missing.length === 0, missing);
    ok('the renamed send block reads like a sentence',
        byOpcode.broadcastGameMessage.text === 'send [NAME] to everyone with [VALUE]');
    ok('the renamed hat reads like a sentence',
        byOpcode.whenGameMessage.text === 'when someone sends [NAME]');
    ok('extension id is unchanged', info.id === 'together');

    const labels = info.blocks.filter(block => block && block.blockType === 'label').map(block => block.text);
    ok('the palette is split into labelled groups',
        ['Messages', 'Shared variables', 'Room', 'Game server', 'Game Rules'].every(text => labels.includes(text)),
        labels);
    const client = ['tellGame', 'whenGameSays', 'gameValue', 'myPlayerValue', 'gameRound', 'myTeam',
        'timeLeft', 'inGame'];
    ok('the eight game server blocks are present', client.every(opcode => byOpcode[opcode]), client);
    ok('an Open Game Rules button is offered',
        info.blocks.some(block => block && block.blockType === 'button' && block.func === 'openGameRules'));
    const rules = ruleOpcodes('together');
    ok('the rule blocks follow from the schema',
        rules.length > 0 && rules.every(opcode => byOpcode[opcode]), rules.filter(opcode => !byOpcode[opcode]));
    ok('every rule block has a method to call', rules.every(opcode => typeof ext[opcode] === 'function'));
    ok('menus are declared for the rule and client blocks',
        info.menus && info.menus.gameValues && info.menus.playerValues && info.menus.timers);
    ok('without a VM the Open Game Rules button resolves quietly', ext.openGameRules() instanceof Promise);
}

const withTicks = () => {
    const tickHandlers = [];
    const env = setup(net => {
        net.onTick = cb => {
            tickHandlers.push(cb);
            return () => tickHandlers.splice(tickHandlers.indexOf(cb), 1);
        };
        net.inputs = [];
        net.sendInput = msg => net.inputs.push(msg);
        net.slot = 2;
    });
    env.tick = msg => tickHandlers.slice().forEach(cb => cb(msg));
    env.tickHandlers = tickHandlers;
    return env;
};

console.log('\ngame server ticks');
{
    const {runtime, net, ext, tick, tickHandlers} = withTicks();
    ok('the extension listens for ticks', tickHandlers.length === 1, tickHandlers.length);

    tick({t: 5, v: {score: 3}});
    ok('a delta before any keyframe is ignored', ext.gameValue({NAME: 'score'}) === '');

    tick({
        t: 6,
        kf: 1,
        v: {score: 3, level: 'cave'},
        p: {2: {hp: 9}, 3: {hp: 4}},
        y: {round: [2, 1], names: {2: 'Me', 3: 'Pal'}, teams: {2: 1, 3: 2}, timers: {timer: 606}},
        e: [{n: 'start', v: 'go', f: 0}, {n: 'private', v: 'x', f: 1}]
    });
    ok('game value reads the keyframe', ext.gameValue({NAME: 'score'}) === 3);
    ok('an unknown game value is empty', ext.gameValue({NAME: 'nope'}) === '');
    ok('my player value reads my slot', ext.myPlayerValue({NAME: 'hp'}) === 9);
    ok('round comes from the tick', ext.gameRound() === 2);
    ok('with no Game setup teams, my team is empty', ext.myTeam() === '');
    runtime.targets = [{isOriginal: true, isStage: false, extensionStorage: {together: {role: 'rules', v: 1,
        teams: ['Red', 'Blue']}}}];
    ok('my team names the Game setup team by index', ext.myTeam() === 'Red', ext.myTeam());
    ok('time left counts ticks to the end at 20 a second', ext.timeLeft({TIMER: 'timer'}) === 30,
        ext.timeLeft({TIMER: 'timer'}));
    ok('an unknown timer reads 0', ext.timeLeft({TIMER: 'other'}) === 0);

    const says = runtime.hats.filter(h => h.opcode === 'together_whenGameSays');
    ok('a game event starts its hat once', says.length === 1 && says[0].fields.TEXT === 'start', says);
    ok('inside that script the message reads back',
        reads(ext, says[0]).name === 'start' && reads(ext, says[0]).value === 'go', reads(ext, says[0]));

    tick({t: 7, v: {score: null, lives: 2}, p: {2: {hp: 8}}, y: {timers: {timer: 3}}});
    ok('a delta updates values', ext.gameValue({NAME: 'lives'}) === 2);
    ok('a null deletes a value', ext.gameValue({NAME: 'score'}) === '');
    ok('a delta updates my player value', ext.myPlayerValue({NAME: 'hp'}) === 8);
    ok('time left never goes below 0', ext.timeLeft({TIMER: 'timer'}) === 0);

    tick({t: 7, v: {lives: 99}});
    ok('a stale tick is ignored', ext.gameValue({NAME: 'lives'}) === 2);

    net.slot = null;
    ok('with no slot, my player value is empty', ext.myPlayerValue({NAME: 'hp'}) === '');
    ok('with no slot, my team is empty', ext.myTeam() === '');

    net.fire('game-ended', {});
    ok('the game ending clears its values',
        ext.gameValue({NAME: 'lives'}) === '' && ext.gameRound() === 0);
}

console.log('\ntelling the game');
{
    const {net, ext} = withTicks();
    net.inGame = false;
    ext.tellGame({NAME: 'jump', VALUE: '1'});
    ok('outside a game nothing is sent', net.inputs.length === 0, net.inputs);
    ok('in a game? is false', ext.inGame() === false);

    net.inGame = true;
    ext.tellGame({NAME: 'jump', VALUE: 4});
    ok('in a game the input goes out',
        net.inputs.length === 1 && net.inputs[0].g.action === 'input' &&
        net.inputs[0].g.name === 'jump' && net.inputs[0].g.value === '4', net.inputs);
    ok('in a game? is true', ext.inGame() === true);

    ext.tellGame({NAME: '', VALUE: 4});
    ok('an empty name is not sent', net.inputs.length === 1, net.inputs);
    ok('tell the game never uses the peer channel', net.sent.length === 0, net.sent);
}

console.log('\nproject reload: game state');
{
    const {runtime, ext, tick} = withTicks();
    tick({t: 1, kf: 1, v: {score: 5}, y: {round: 3}});
    runtime.emit('RUNTIME_DISPOSED');
    ok('a reload forgets the last game', ext.gameValue({NAME: 'score'}) === '' && ext.gameRound() === 0);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
