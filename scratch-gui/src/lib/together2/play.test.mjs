import {register} from 'node:module';

register('../collab/collab-test-loader.mjs', import.meta.url);
process.removeAllListeners('warning');

const {ok, section, done, fakeClock} = await import('./harness.test-util.mjs');
const {pageSocketBase, playSocketUrl, gameSocketUrl} = await import('./net.js');
const {PLAY_CLOSE_DEFAULT, PLAY_CLOSE_TEXTS, playCloseText, RELOAD_TEXT, BAD_FRAME_TEXT} = await import('./texts.js');
const {NET_BRIDGE_KEYS, createPlayClient} = await import('./play-client.js');
const {gameExtensionIds, initPlay, playMode} = await import('./play.js');

const flush = () => new Promise(resolve => setImmediate(resolve));

const fakeRuntime = extra => {
    const handlers = {};
    return Object.assign({
        targets: [{isOriginal: true, isStage: true, extensionStorage: {}}],
        threads: [],
        renderer: null,
        on (type, fn) {
            (handlers[type] = handlers[type] || []).push(fn);
        },
        once (type, fn) {
            const wrapped = (...args) => {
                this.off(type, wrapped);
                fn(...args);
            };
            this.on(type, wrapped);
        },
        off (type, fn) {
            handlers[type] = (handlers[type] || []).filter(h => h !== fn);
        },
        emit (type, ...args) {
            (handlers[type] || []).slice().forEach(fn => fn(...args));
        },
        count: type => (handlers[type] || []).length
    }, extra);
};

const fakeVm = (loaded, runtime) => ({
    runtime: runtime || fakeRuntime(),
    extensionManager: {isExtensionLoaded: id => loaded.indexOf(id) !== -1}
});

const fakeWin = () => {
    const posts = [];
    const listeners = {};
    const events = [];
    return {
        posts,
        events,
        location: {protocol: 'https:', host: 'sq.test', origin: 'https://sq.test'},
        parent: {postMessage: (data, origin) => posts.push({data, origin})},
        addEventListener: (type, fn) => {
            listeners[type] = fn;
        },
        dispatchEvent: event => events.push(event.type),
        fire: (type, event) => listeners[type] && listeners[type](event)
    };
};

const socketKit = () => {
    const sockets = [];
    class FakeSocket {
        constructor (url) {
            this.url = url;
            this.sent = [];
            sockets.push(this);
        }
        send (text) {
            this.sent.push(JSON.parse(text));
        }
        close (code, reason) {
            this.onclose({code, reason});
        }
        deliver (msg) {
            this.onmessage({data: JSON.stringify(msg)});
        }
    }
    return {sockets, FakeSocket};
};

const playFixture = () => {
    const clock = fakeClock();
    const win = fakeWin();
    const {sockets, FakeSocket} = socketKit();
    const runtime = fakeRuntime();
    const client = createPlayClient({vm: {runtime}, code: 'AB12', name: 'Guest', win, WebSocketImpl: FakeSocket,
        now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer}).install();
    const posted = event => win.posts.filter(p => p.data.event === event).map(p => p.data.detail);
    const open = slot => {
        runtime.emit('PROJECT_START');
        const ws = sockets[sockets.length - 1];
        ws.onopen();
        ws.deliver({type: 'welcome', proto: 2, mode: 'relay', slot, ack: 0, tickHz: 20, t: 0});
        return ws;
    };
    return {clock, win, sockets, runtime, client, posted, open, net: client.bridge};
};

section('the mode follows the blocks the project uses');
{
    ok('the kits that need Together are named with it',
        gameExtensionIds().join() === 'together,squigglescores,squiggleteams,squigglearena', gameExtensionIds());
    ok('flag off drives a project that loads together', playMode(fakeVm(['together']), false) === 'drive');
    ok('flag on with together loaded joins the game', playMode(fakeVm(['together']), true) === 'game');
    ok('flag on with an Arena project joins the game', playMode(fakeVm(['squigglearena', 'pen']), true) === 'game');
    ok('flag on without any of them drives', playMode(fakeVm(['pen', 'squiggleworld']), true) === 'drive');
}

section('initPlay picks drive or game once the project is in');
{
    const calls = [];
    const drive = (vm, opts) => calls.push(['drive', opts]);
    const game = opts => ({install: () => calls.push(['game', opts.code, opts.name])});
    const empty = fakeRuntime({targets: []});
    const off = await initPlay(fakeVm(['together'], empty), {code: 'ab12', name: 'Guest'},
        {ready: () => false, drive, game});
    ok('flag off drives at once without waiting for the project', off === 'drive' && calls.length === 1 &&
        calls[0][1].code === 'ab12' && calls[0][1].name === 'Guest', calls);
    calls.length = 0;
    const waiting = initPlay(fakeVm(['together'], empty), {code: 'ab12'}, {ready: () => true, drive, game});
    await flush();
    ok('flag on waits for the project to load', calls.length === 0 && empty.count('PROJECT_LOADED') === 1);
    empty.emit('PROJECT_LOADED');
    ok('then joins the game with the code in capitals', await waiting === 'game' && calls[0].join() === 'game,AB12,',
        calls);
    calls.length = 0;
    ok('a project already loaded decides at once',
        await initPlay(fakeVm(['pen']), {code: 'x9'}, {ready: () => true, drive, game}) === 'drive' &&
        calls[0][0] === 'drive');
    ok('no code does nothing', await initPlay(fakeVm([]), {}, {ready: () => true, drive, game}) === null);
}

section('the play and drive sockets go to /ws/play/<code> on the page origin');
{
    ok('https pages use wss', pageSocketBase({protocol: 'https:', host: 'sq.test'}) === 'wss://sq.test');
    ok('http pages use ws', pageSocketBase({protocol: 'http:', host: 'localhost:8601'}) === 'ws://localhost:8601');
    ok('the play url keeps only the origin of its base',
        playSocketUrl('wss://sq.test/some/path/', 'AB12') === 'wss://sq.test/ws/play/AB12');
    ok('the room game url is unchanged', gameSocketUrl('wss://sq.test/', 'blue fox') ===
        'wss://sq.test/ws/room/blue%20fox/game');
    const {sockets} = socketKit();
    class DriveSocket {
        constructor (url) {
            this.url = url;
            this.sent = [];
            this.listeners = {};
            sockets.push(this);
        }
        addEventListener (type, fn) {
            this.listeners[type] = fn;
        }
        send (text) {
            this.sent.push(JSON.parse(text));
        }
    }
    DriveSocket.prototype.readyState = 1;
    globalThis.location = {protocol: 'https:', host: 'sq.test', origin: 'https://sq.test'};
    globalThis.document = {addEventListener: () => {}, querySelector: () => null};
    globalThis.window = {addEventListener: () => {}, parent: {postMessage: () => {}}};
    globalThis.WebSocket = DriveSocket;
    const coplay = (await import('../coplay/index.js')).default;
    coplay.init({on: () => {}, runtime: fakeRuntime()}, {code: 'ab12', name: ''});
    ok('drive opens the play socket for the code', sockets[0] && sockets[0].url === 'wss://sq.test/ws/play/AB12',
        sockets[0] && sockets[0].url);
    sockets[0].listeners.open();
    ok('and joins with the 1.8 play-join frame', JSON.stringify(sockets[0].sent[0]) ===
        '{"type":"play-join","code":"AB12"}', sockets[0].sent);
    delete globalThis.WebSocket;
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.location;
}

section('the player bridge has the editor bridge surface');
{
    const {client, win} = playFixture();
    ok('the keys are the shared list', Object.keys(client.bridge).sort()
        .join() === NET_BRIDGE_KEYS.slice().sort()
        .join(), Object.keys(client.bridge));
    ok('the list is frozen', Object.isFrozen(NET_BRIDGE_KEYS));
    ok('install puts it on the window under both names', win.SquiggleNet === client.bridge &&
        win.ScratchTogetherNet === client.bridge);
    ok('and tells the extensions it is ready', win.events.indexOf('SquiggleNetReady') !== -1, win.events);
}

section('the green flag starts the game socket and stop closes it');
{
    const {sockets, runtime, net, clock} = playFixture();
    ok('nothing opens before the flag', sockets.length === 0);
    runtime.emit('PROJECT_START');
    ok('the flag opens /ws/play/<code>', sockets.length === 1 && sockets[0].url === 'wss://sq.test/ws/play/AB12',
        sockets.map(s => s.url));
    sockets[0].onopen();
    ok('the join frame is the game join', JSON.stringify(sockets[0].sent[0]) === '{"type":"join","proto":2}',
        sockets[0].sent);
    sockets[0].deliver({type: 'welcome', proto: 2, mode: 'rules', slot: 3, ack: 0, tickHz: 20, t: 0});
    ok('the bridge reports the game', net.inGame && net.connected && net.slot === 3 && net.mode === 'rules');
    ok('the room is the code', net.room === 'AB12');
    runtime.emit('PROJECT_STOP_ALL');
    clock.advance(10);
    ok('stop leaves the game', net.inGame === false && net.connected === false);
}

section('a project already running starts the game at install');
{
    const {sockets, FakeSocket} = socketKit();
    const runtime = fakeRuntime({threads: [{}]});
    createPlayClient({vm: {runtime}, code: 'AB12', win: fakeWin(), WebSocketImpl: FakeSocket}).install();
    ok('the socket opens without another flag', sockets.length === 1);
}

section('shared variables round trip');
{
    const {sockets, runtime, net, clock} = playFixture();
    const games = [];
    const states = [];
    net.on('game', msg => games.push(msg));
    runtime.emit('PROJECT_START');
    const ws = sockets[0];
    ws.onopen();
    net.send({type: 'game', action: 'var', name: 'score', value: '12'});
    ok('a set before the welcome reads back at once', net.sharedVars.score === '12');
    ws.deliver({type: 'welcome', proto: 2, mode: 'relay', slot: 1, ack: 0, tickHz: 20, t: 0});
    const first = ws.sent.find(f => f.type === 'in');
    ok('it goes out as an in.g set once the game opens', first && JSON.stringify(first.g) ===
        '[{"action":"set","name":"score","value":12}]', first);
    net.send({type: 'game', action: 'var-add', name: 'score', delta: 3});
    net.send({type: 'game', action: 'msg', name: 'go', value: 'now'});
    clock.advance(50);
    ws.deliver({type: 'tick', t: 1, kf: 1, ack: 1});
    const second = ws.sent.filter(f => f.type === 'in')[1];
    ok('var-add goes out as change and a message as msg', second && JSON.stringify(second.g) ===
        '[{"action":"change","name":"score","delta":3},{"action":"msg","name":"go","value":"now"}]', second);
    ok('the change adds to the cached value', net.sharedVars.score === 15, net.sharedVars.score);
    ws.deliver({type: 'game', action: 'var', name: 'lives', value: 2, from: 2, fromName: 'Player Two'});
    ok('a var frame lands in sharedVars', net.sharedVars.lives === 2);
    ok('and reaches the Together extension as a game message', games.length === 1 && games[0].action === 'var' &&
        games[0].name === 'lives', games);
    net.on('game-state', msg => states.push(msg));
    await flush();
    ok('a late game-state listener gets the cache', states.length === 1 && states[0].vars.lives === 2);
    ws.deliver({type: 'game', action: 'msg', name: 'hello', value: 'there', from: 2});
    ok('a game frame that is not a var leaves sharedVars alone', !('hello' in net.sharedVars) && games.length === 1);
    ws.deliver({type: 'tick', t: 2, ack: 1, sv: {ignored: 1}});
    ok('sv on a delta tick is ignored', !('ignored' in net.sharedVars));
    ws.deliver({type: 'tick', t: 40, kf: 1, ack: 1, sv: {score: 20, round: 'two'}});
    ok('the keyframe sv replaces every shared variable', Object.keys(net.sharedVars).sort()
        .join() === 'round,score' && net.sharedVars.score === 20, net.sharedVars);
    ok('and is announced as the game state', states.length === 2 && states[1].vars.round === 'two');
}

section('each close code has its kid-safe sentence');
{
    ok('the table is frozen', Object.isFrozen(PLAY_CLOSE_TEXTS));
    ok('1000 the game ended', playCloseText(1000) === 'The game ended. Play again from the page.');
    ok('1013 the game is full', playCloseText(1013) === 'This game is full right now.');
    ok('4003 you cannot join', playCloseText(4003) === 'You cannot join this game.');
    ok('4011 reload to join', playCloseText(4011) === 'Reload the page to join.');
    ok('4012 the game went quiet', playCloseText(4012) === 'The game went quiet. Reload to play again.');
    ok('1007 and 4010 say what the room game says', playCloseText(1007) === BAD_FRAME_TEXT &&
        playCloseText(4010) === RELOAD_TEXT);
    ok('any other code gets the default', playCloseText(4013) === PLAY_CLOSE_DEFAULT &&
        playCloseText('toString') === PLAY_CLOSE_DEFAULT);
    ok('no sentence has an em dash', Object.values(PLAY_CLOSE_TEXTS).concat(PLAY_CLOSE_DEFAULT)
        .every(t => t.indexOf('—') === -1));
    const {open, posted} = playFixture();
    open(1).close(4011, 'wrong-mode');
    ok('a 4011 close tells the page to reload', JSON.stringify(posted('error')) ===
        '[{"error":"wrong-mode","message":"Reload the page to join."}]', posted('error'));
    const bad = playFixture();
    bad.open(1).close(1007, 'bad-frame');
    ok('a first 1007 rejoins without telling the page', bad.posted('error').length === 0 &&
        bad.clock.pending() === 1);
    bad.clock.advance(300);
    bad.sockets[1].onopen();
    bad.sockets[1].close(1007, 'bad-frame');
    ok('a second one inside a minute says the room game sentence', JSON.stringify(bad.posted('error')) ===
        JSON.stringify([{error: 'bad-frame', message: BAD_FRAME_TEXT}]), bad.posted('error'));
    const drop = playFixture();
    drop.open(1).close(1006);
    ok('a plain drop says not connected and nothing else', drop.posted('error').length === 0 &&
        drop.posted('status').slice(-1)[0].connected === false);
    const full = playFixture();
    full.open(1).close(1013, 'session-full');
    ok('a full game says so and keeps trying', JSON.stringify(full.posted('error')) ===
        '[{"error":"session-full","message":"This game is full right now."}]' && full.clock.pending() === 1,
    full.posted('error'));
}

section('the page hears joined, left and ended from the game socket');
{
    const {open, posted, win, net} = playFixture();
    const peerEvents = [];
    net.on('peer-joined', msg => peerEvents.push(['joined', msg.peer.name]));
    net.on('peer-left', msg => peerEvents.push(['left', msg.name]));
    const ws = open(1);
    ok('the welcome says connected', JSON.stringify(posted('status')[0]) === '{"connected":true,"code":"AB12"}');
    ws.deliver({type: 'tick', t: 1, kf: 1, ack: 0, y: {names: {1: 'Player One', 2: 'Player Two'}}});
    const roster = posted('roster')[0];
    ok('the first names post a roster', roster && roster.players.length === 2 && roster.me.id === 1 &&
        roster.me.name === 'Player One' && roster.driver === null && roster.driving === false, roster);
    ok('players already there are not announced', posted('joined').length === 0);
    ok('peers leave out the own player', net.peersText === 'Player Two' && net.playerName === 'Player One');
    ws.deliver({type: 'tick', t: 2, ack: 0, y: {names: {3: 'Player Three'}}});
    const joined = posted('joined');
    ok('a new name posts joined with an id, name and color', joined.length === 1 && joined[0].id === 3 &&
        joined[0].name === 'Player Three' && /^#[0-9a-f]{6}$/.test(joined[0].color), joined);
    ws.deliver({type: 'tick', t: 3, ack: 0, y: {names: {3: 'Player Three B'}}});
    ok('a new name on a known slot is no join', posted('joined').length === 1 &&
        posted('roster').slice(-1)[0].players.some(p => p.name === 'Player Three B'));
    ws.deliver({type: 'tick', t: 4, ack: 0, y: {names: {2: null}}});
    ok('a name gone posts left', JSON.stringify(posted('left')) === '[{"id":2,"name":"Player Two"}]', posted('left'));
    ok('the Together extension hears both', JSON.stringify(peerEvents) ===
        '[["joined","Player Three"],["left","Player Two"]]', peerEvents);
    ok('every post is from squiggle-coplay to the page origin', win.posts.every(p => p.data.source ===
        'squiggle-coplay' && p.origin === 'https://sq.test'));
    const rosters = posted('roster').length;
    win.fire('message', {origin: 'https://sq.test', data: {source: 'squiggle-coplay-host', action: 'roster'}});
    ok('the page can ask for the roster again', posted('roster').length === rosters + 1);
    win.fire('message', {origin: 'https://evil.test', data: {source: 'squiggle-coplay-host', action: 'roster'}});
    ok('but not from another origin', posted('roster').length === rosters + 1);
    ws.deliver({type: 'game-ended', reason: 'over', winner: 1});
    ws.close(1000, 'game-ended');
    ok('the game ending posts the 1.8 ended error once', JSON.stringify(posted('error')) ===
        '[{"error":"no-such-session","message":"The game ended. Play again from the page."}]', posted('error'));
    ok('and status goes to not connected', posted('status').slice(-1)[0].connected === false);
    const late = playFixture();
    const lateWs = late.open(4);
    lateWs.deliver({type: 'tick', t: 1, kf: 1, ack: 0, y: {names: {1: 'Player One'}}});
    lateWs.deliver({type: 'tick', t: 2, ack: 0, y: {names: {4: 'Player Four'}}});
    ok('the own name arriving late is not a join', late.posted('joined').length === 0 &&
        late.net.playerName === 'Player Four');
    const bare = playFixture();
    bare.open(1).close(1000, 'game-ended');
    ok('a 1000 close without a game-ended frame ends it too', bare.posted('error').length === 1 &&
        bare.posted('error')[0].error === 'no-such-session');
}

section('latency goes to the page at most once a second');
{
    const {open, posted, clock, net} = playFixture();
    const ws = open(1);
    ws.deliver({type: 'tick', t: 1, kf: 1, ack: 0});
    ok('no latency before a measured round trip', posted('latency').length === 0);
    net.send({type: 'game', action: 'var', name: 'a', value: 1});
    clock.advance(40);
    ws.deliver({type: 'tick', t: 2, ack: 1});
    ok('the first round trip is posted', JSON.stringify(posted('latency')) === '[{"ms":40}]', posted('latency'));
    clock.advance(100);
    net.send({type: 'game', action: 'var', name: 'a', value: 2});
    clock.advance(80);
    ws.deliver({type: 'tick', t: 3, ack: 2});
    ok('a new value inside the second waits', posted('latency').length === 1, [net.rtt, posted('latency')]);
    clock.advance(1000);
    net.send({type: 'game', action: 'var', name: 'a', value: 3});
    clock.advance(80);
    ws.deliver({type: 'tick', t: 4, ack: 3});
    ok('and goes out after it', posted('latency').length === 2, posted('latency'));
}

done();
