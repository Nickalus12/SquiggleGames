process.removeAllListeners('warning');

const {ok, section, done, fakeClock} = await import('./harness.test-util.mjs');
const {createInterpolationBuffer} = await import('./buffer.js');
const {createPrediction} = await import('./prediction.js');
const {timeLeft} = await import('./game-state.js');
const {avatarOf, blockedAt, createAvatarLayer, createGameLink, findPlayerSprite, outboundOp, renderedDirection,
    worldLevel} = await import('./session.js');

const sprite = (name, extra) => Object.assign({
    name, isOriginal: true, isStage: false, extensionStorage: {}, x: 0, y: 0, direction: 90, size: 100,
    visible: true, currentCostume: 0, rotationStyle: 'all around',
    sprite: {costumes: [{skinId: 11}, {skinId: 12}]}
}, extra);

section('the own sprite');
{
    const rules = sprite('Rules', {extensionStorage: {together: {role: 'rules', v: 1}}});
    const cat = sprite('Cat');
    const hero = sprite('Hero', {extensionStorage: {together: {role: 'player'}}});
    const stage = {isOriginal: true, isStage: true, extensionStorage: {}};
    ok('a sprite marked player wins', findPlayerSprite({targets: [stage, rules, cat, hero]}) === hero);
    ok('else the first sprite that is not Game Rules', findPlayerSprite({targets: [stage, rules, cat]}) === cat);
    ok('Game Rules alone is nobody', findPlayerSprite({targets: [stage, rules]}) === null);
}

section('outbound messages are cut');
{
    const op = outboundOp({type: 'game', action: 'msg', name: 'n'.repeat(150), value: 'v'.repeat(9000)});
    ok('the name is cut to 100 and the value to 4096', op.name.length === 100 && op.value.length === 4096,
        [op.name.length, op.value.length]);
    ok('a numeric value goes as a JSON number', JSON.stringify(outboundOp({type: 'game', action: 'msg', name: 'a',
        value: '12'})) === '{"action":"msg","name":"a","value":12}');
    ok('007 and 1e5 stay text', outboundOp({type: 'game', action: 'msg', name: 'a', value: '007'}).value === '007' &&
        outboundOp({type: 'game', action: 'msg', name: 'a', value: '1e5'}).value === '1e5');
}

section('the avatar frame');
{
    const a = avatarOf(sprite('Cat', {x: 10.3, y: -4.8, direction: 44.6, currentCostume: 1, visible: false}), 2);
    ok('x and y at half pixels, direction in degrees, 1-based costume, flags, level', a.join() === '10.5,-5,45,2,0,2', a);
    const far = avatarOf(sprite('Cat', {x: 900, y: -700.2, direction: 270, currentCostume: 4000}), 300);
    ok('x, y, costume and level clamp to the PROTOCOL limits', far.join() === '480,-360,-90,1000,1,100', far);
    ok('direction 180 stays 180 and -180 turns to 180',
        avatarOf(sprite('Cat', {direction: 180}), 0)[2] === 180 && avatarOf(sprite('Cat', {direction: -180}), 0)[2] === 180);
}

section('others are drawn without clones');
{
    const calls = [];
    const renderer = new Proxy({}, {get: (target, key) => (...args) => {
        calls.push([key].concat(args));
        return key === 'createDrawable' ? 7 : undefined;
    }});
    const layer = createAvatarLayer({renderer});
    const source = sprite('Cat');
    layer.draw('3', [20, 30, -90, 2, 1, 0], source);
    ok('one drawable in the sprite layer', calls[0][0] === 'createDrawable' && calls[0][1] === 'sprite');
    ok('it wears the 1-based costume', calls.some(c => c[0] === 'updateDrawableSkinId' && c[2] === 12));
    ok('it stands where the tick says', calls.some(c => c[0] === 'updateDrawablePosition' && c[2].join() === '20,30'));
    layer.draw('3', [21, 30, -90, 9, 0, 0], source);
    ok('the drawable is reused', calls.filter(c => c[0] === 'createDrawable').length === 1);
    ok('a costume past the end clamps', calls.filter(c => c[0] === 'updateDrawableSkinId').pop()[2] === 12);
    ok('the visible flag hides it', calls.filter(c => c[0] === 'updateDrawableVisible').pop()[2] === false);
    layer.remove('3');
    ok('removing destroys it', calls.some(c => c[0] === 'destroyDrawable' && c[1] === 7) && layer.slots().length === 0);
    ok('no renderer draws nothing', (createAvatarLayer({}).draw('1', [0, 0, 90, 0, 1, 0], source), true));
}

section('walls come from the world kit');
ok('no world means no walls', blockedAt(5, 5) === false);
globalThis.window = {SquiggleWorld: {solidAt: (x, y) => x > 100 && y > 0}};
ok('a solid tile blocks the eased step', blockedAt(120, 4) === true);
ok('open ground does not', blockedAt(20, 4) === false);
delete globalThis.window;

section('the game link follows the welcome tick rate');
{
    const clock = fakeClock();
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
        close (code) {
            this.onclose({code});
        }
    }
    const handlers = {};
    const positions = [];
    let lookups = 0;
    const hero = sprite('Hero', {extensionStorage: {together: {role: 'player'}}});
    const runtime = {
        targets: [{isOriginal: true, isStage: true, extensionStorage: {}}, hero],
        renderer: new Proxy({}, {get: (target, key) => (...args) => {
            if (key === 'updateDrawablePosition') positions.push(args[1]);
            return key === 'createDrawable' ? 7 : undefined;
        }}),
        on: (type, fn) => {
            handlers[type] = fn;
        },
        off: type => {
            delete handlers[type];
        }
    };
    Object.defineProperty(hero, 'extensionStorage', {get: () => {
        lookups += 1;
        return {together: {role: 'player'}};
    }});
    const link = createGameLink({vm: {runtime}, base: 'wss://sq.test', slug: 'blue', WebSocketImpl: FakeSocket,
        now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer});
    link.start();
    const ws = sockets[0];
    ws.onopen();
    ok('before the welcome it assumes 20 a second', link.tickHz === 20 && link.game.tickSeconds === 0.05);
    ws.onmessage({data: JSON.stringify({type: 'welcome', slot: 1, ack: 0, mode: 'relay', tickHz: 10})});
    ok('the welcome sets the tick rate and the mode', link.tickHz === 10 && link.mode === 'relay',
        [link.tickHz, link.mode]);
    ok('timers count down at that rate', link.game.tickSeconds === 0.1);
    ws.onmessage({data: JSON.stringify({type: 'tick', t: 10, kf: 1, a: {2: [0, 0, 90, 1, 1, 0]}, y: {timers: {go: 30}}})});
    ok('a timer 20 ticks away at 10 a second is 2 seconds', timeLeft(link.game, 'go') === 2, timeLeft(link.game, 'go'));
    clock.advance(100);
    ws.onmessage({data: JSON.stringify({type: 'tick', t: 11, a: {2: [10, 0, 90, 1, 1, 0]}})});
    handlers.AFTER_EXECUTE();
    const firstX = positions[0] && positions[0][0];
    ok('the 100 ms render delay is one tick at 10 a second', positions.length === 1 && firstX === 0, firstX);
    const seen = lookups;
    clock.advance(50);
    handlers.AFTER_EXECUTE();
    ok('half a tick later it is half way', positions[1] && positions[1][0] === 5, positions.map(p => p[0]));
    ok('frames reuse one position array', positions[0] === positions[1]);
    ok('the own sprite is not looked up again while the targets are the same', lookups === seen, [seen, lookups]);
    runtime.targets.push(sprite('Cat'));
    handlers.AFTER_EXECUTE();
    ok('a new target looks it up again', lookups > seen);
    handlers.PROJECT_CHANGED();
    const before = lookups;
    handlers.AFTER_EXECUTE();
    ok('and so does a project change', lookups > before);
    link.stop();
}

section('a bad-frame close on the game socket rejoins once, a second one inside a minute is final');
{
    const clock = fakeClock();
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
        close (code) {
            this.onclose({code});
        }
    }
    const closed = [];
    const runtime = {targets: [], renderer: null, on: () => {}, off: () => {}};
    const make = () => createGameLink({vm: {runtime}, base: 'wss://sq.test', slug: 'blue', WebSocketImpl: FakeSocket,
        now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, onClosed: msg => closed.push(msg)});
    const join = ws => {
        ws.onopen();
        ws.onmessage({data: JSON.stringify({type: 'welcome', slot: 1, ack: 0})});
    };
    const link = make();
    link.start();
    join(sockets[0]);
    sockets[0].onclose({code: 1007, reason: 'bad-frame'});
    ok('the first says bad-frame and is not final', closed.length === 1 && closed[0].reason === 'bad-frame' &&
        closed[0].final === false, closed);
    ok('and counts it', link.badFrames === 1, link.badFrames);
    clock.advance(1000);
    ok('one new game socket opens by itself while the game runs', sockets.length === 2, sockets.length);
    join(sockets[1]);
    ok('with a fresh join', sockets[1].sent[0] && sockets[1].sent[0].type === 'join' &&
        !('resume' in sockets[1].sent[0]), sockets[1].sent[0]);
    clock.advance(30000);
    sockets[1].onclose({code: 1007, reason: 'bad-frame'});
    ok('a second inside a minute is final', closed.length === 2 && closed[1].final === true, closed);
    clock.advance(60000);
    ok('nothing opens again', sockets.length === 2, sockets.length);
    ok('and start is null until a reload', link.start() === null && link.latched === 'bad-frame' && sockets.length === 2);

    const spaced = make();
    spaced.start();
    join(sockets[2]);
    sockets[2].onclose({code: 1007, reason: 'bad-frame'});
    clock.advance(1000);
    join(sockets[3]);
    clock.advance(61000);
    sockets[3].onclose({code: 1007, reason: 'bad-frame'});
    clock.advance(1000);
    ok('two a minute apart each rejoin', sockets.length === 5 && spaced.latched === null, sockets.length);
    spaced.stop();

    const idle = make();
    idle.start();
    join(sockets[5]);
    idle.stop();
    sockets[5].onclose({code: 1007, reason: 'bad-frame'});
    clock.advance(5000);
    ok('a stopped game does not rejoin by itself', sockets.length === 6, sockets.length);
    ok('the next start is the fresh join', idle.start() !== null && sockets.length === 7, sockets.length);
    idle.stop();

    const reload = make();
    reload.start();
    join(sockets[7]);
    sockets[7].onclose({code: 4010, reason: 'please-reload'});
    clock.advance(5000);
    ok('a 4010 is final at once', closed[closed.length - 1].reason === 'reload' && closed[closed.length - 1].final === true,
        closed[closed.length - 1]);
    ok('and start is null after it', reload.start() === null && sockets.length === 8, sockets.length);
}

section('own game messages and input after stop');
{
    const clock = fakeClock();
    const sockets = [];
    class SlowSocket {
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
        }
    }
    const runtime = {targets: [{isOriginal: true, isStage: true, extensionStorage: {}}, sprite('Cat')], on () {}, off () {}};
    const messages = [];
    const link = createGameLink({vm: {runtime}, base: 'wss://sq.test', slug: 'blue', WebSocketImpl: SlowSocket,
        now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, onGameMessage: msg => messages.push(msg)});
    link.start();
    const ws = sockets[0];
    ws.onopen();
    ok('input before the welcome is refused', link.inGame === false &&
        link.sendInput({g: {action: 'input', name: 'left', value: ''}}) === false);
    ws.onmessage({data: JSON.stringify({type: 'welcome', slot: 1, ack: 0})});
    ws.onmessage({data: JSON.stringify({type: 'tick', t: 1, kf: 1, y: {names: {1: 'Me', 2: 'Pal'}},
        e: [{n: 'mine', v: '', f: 1}, {n: 'theirs', v: 'x', f: 2}]})});
    ok('an event from my own slot is skipped', messages.map(msg => msg.name).join() === 'theirs', messages);
    ok('input in the game is taken', link.sendInput({g: {action: 'input', name: 'left', value: ''}}) === true);
    link.stop();
    ok('the socket is closing but not closed yet', ws.closed === 1000);
    ok('input after stop is refused', link.sendInput({g: {action: 'input', name: 'right', value: ''}}) === false);
    ok('a message after stop is not relayed', link.relay({type: 'game', action: 'msg', name: 'hi', value: ''}) === false);
    ok('it is no longer in the game', link.inGame === false);
    clock.advance(200);
    const ops = ws.sent.filter(frame => frame.type === 'in').reduce((list, frame) => list.concat(frame.g || []), []);
    ok('only the input before stop went out', ops.map(op => op.name).join() === 'left', ops);
}

section('the render helpers write into what they are given');
{
    const buffer = createInterpolationBuffer();
    buffer.clock.observe(1, 1000);
    buffer.push('2', 1, [0, 0, 90, 1, 1, 0]);
    buffer.push('2', 2, [10, 0, 90, 1, 1, 0]);
    const out = [];
    ok('sample fills the caller array', buffer.sample('2', 1200, out) === out && out.length === 6);
    const keys = [];
    const forEach = Map.prototype.forEach;
    let walks = 0;
    Map.prototype.forEach = function (...args) {
        walks += 1;
        return forEach.apply(this, args);
    };
    const filled = buffer.slots(keys);
    const layer = createAvatarLayer({renderer: new Proxy({}, {get: (target, key) => () =>
        (key === 'createDrawable' ? 7 : undefined)})});
    layer.draw('3', [0, 0, 90, 1, 1, 0], sprite('Cat'));
    const drawnKeys = [];
    layer.slots(drawnKeys);
    Map.prototype.forEach = forEach;
    ok('slots fills the caller array', filled === keys && keys.join() === '2');
    ok('the avatar layer lists its slots into the caller array', drawnKeys.join() === '3', drawnKeys);
    ok('neither walks its map with a callback', walks === 0, walks);
    const savedWindow = globalThis.window;
    const findIndex = Array.prototype.findIndex;
    let finds = 0;
    Array.prototype.findIndex = function (...args) {
        finds += 1;
        return findIndex.apply(this, args);
    };
    globalThis.window = {SquiggleWorld: {levels: () => [{id: 'a'}, null, {id: 'c'}], currentLevel: () => 'c'}};
    const level = worldLevel();
    globalThis.window.SquiggleWorld.currentLevel = () => 'gone';
    const missing = worldLevel();
    Array.prototype.findIndex = findIndex;
    globalThis.window = savedWindow;
    ok('the world level is the 1-based place of the current level', level === 3 && missing === 0, [level, missing]);
    ok('found without a callback', finds === 0, finds);
    const a = [];
    ok('avatarOf fills the caller array', avatarOf(sprite('Cat'), 0, a) === a && a.length === 6);
    const prediction = createPrediction();
    prediction.correct([10, 0, 1], {x: 0, y: 0}, 0);
    const first = prediction.step(50);
    ok('the eased step reuses one delta', prediction.step(100) === first);
    const turned = {direction: 0, scale: [0, 0]};
    ok('renderedDirection fills the caller object', renderedDirection('left-right', -45, 80, turned) === turned &&
        turned.scale[0] === -80);
}

section('rotation styles');
ok('all around turns', renderedDirection('all around', -45, 100).direction === -45);
ok('left-right flips', renderedDirection('left-right', -45, 100).scale[0] === -100 &&
    renderedDirection('left-right', -45, 100).direction === 90);
ok('don\'t rotate stays at 90', renderedDirection('don\'t rotate', 10, 50).direction === 90);

done();
