import '../rules/json-hook.mjs';

process.removeAllListeners('warning');

const {ok, section, done, fakeClock} = await import('./harness.test-util.mjs');
const {createGameLink} = await import('./session.js');
const {gameFlags} = await import('../rules/flags.js');
const {deviceBlocks, slotOf} = await import('./device-blocks.js');
const TogetherBlocks = (await import('../libraries/extensions/together/index.js')).default;
const ScoresBlocks = (await import('../libraries/extensions/squigglescores/index.js')).default;
const TeamsBlocks = (await import('../libraries/extensions/squiggleteams/index.js')).default;
const ArenaBlocks = (await import('../libraries/extensions/squigglearena/index.js')).default;

const fakeSession = () => {
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
    const hats = [];
    const rules = {
        isOriginal: true,
        isStage: false,
        name: 'Game Rules',
        extensionStorage: {together: {role: 'rules', teams: ['Red', 'Blue'], boards: ['Best']}},
        variables: {}
    };
    const runtime = {
        targets: [{isOriginal: true, isStage: true, extensionStorage: {}, variables: {}}, rules],
        on () {},
        off () {},
        startHats (opcode) {
            const thread = {opcode};
            hats.push(thread);
            return [thread];
        }
    };
    const link = createGameLink({vm: {runtime}, base: 'wss://sq.test', slug: 'blue', WebSocketImpl: FakeSocket,
        now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer});
    const ended = [];
    const net = {
        onTick: cb => link.onTick(cb),
        sendInput: input => link.sendInput(input),
        on (type, cb) {
            if (type === 'game-ended') ended.push(cb);
            return () => {};
        },
        get inGame () {
            return link.inGame;
        },
        get slot () {
            return link.slot;
        },
        get tickHz () {
            return link.tickHz;
        },
        get game () {
            return link.game;
        }
    };
    global.window = {SquiggleNet: net, addEventListener () {}, removeEventListener () {}};
    link.start();
    const ws = () => sockets[sockets.length - 1];
    ws().onopen();
    const welcome = slot => ws().onmessage({data: JSON.stringify({type: 'welcome', slot, ack: 0, tickHz: 20})});
    const tick = msg => ws().onmessage({data: JSON.stringify(Object.assign({type: 'tick'}, msg))});
    const named = opcode => hats.filter(thread => thread.opcode === opcode);
    const ops = () => sockets.reduce((list, socket) => list.concat(socket.sent), [])
        .filter(frame => frame.type === 'in' && Array.isArray(frame.g))
        .reduce((list, frame) => list.concat(frame.g), []);
    return {clock, link, runtime, hats, named, welcome, tick, ops, ws, ended};
};

section('the player slot');
{
    const net = {slot: 3};
    ok('me is my slot', slotOf('me', net) === 3 && slotOf(' ME ', net) === 3);
    ok('nobody is slot 0', slotOf('0', net) === 0 && slotOf('', net) === 0);
    ok('a player reporter gives its slot', slotOf(2, net) === 2 && slotOf('2', net) === 2);
    ok('anything else is nobody', slotOf('Pal', net) === 0 && slotOf(-1, net) === 0 && slotOf(1.5, net) === 0);
    ok('me before a welcome is nobody', slotOf('me', {slot: null}) === 0);
}

section('the flag hides every device block');
{
    gameFlags.serverReady = false;
    const cards = ['together', 'squigglescores', 'squiggleteams', 'squigglearena'];
    ok('off: all hidden', cards.every(card => deviceBlocks(card).every(block => block.hideFromPalette === true)));
    gameFlags.serverReady = true;
    ok('on: all shown', cards.every(card => deviceBlocks(card).every(block => block.hideFromPalette === false)));
    gameFlags.serverReady = false;
}

section('Together: when game value changes, a player value of, name of');
{
    const env = fakeSession();
    const ext = new TogetherBlocks(env.runtime);
    env.welcome(1);
    env.tick({t: 10, kf: 1, v: {score: 1}, p: {1: {hp: 5}, 2: {hp: 3}}, y: {names: {1: 'Me', 2: 'Pal'}}});
    const first = env.named('together_whenGameValueChanges');
    ok('a value arriving starts the hat', first.length === 1);
    ok('the hat runs for that value', ext.whenGameValueChanges({NAME: 'score'}, {thread: first[0]}) === true);
    ok('and not for another', ext.whenGameValueChanges({NAME: 'lives'}, {thread: first[0]}) === false);
    env.tick({t: 11, v: {score: 1}});
    ok('the same value again starts nothing', env.named('together_whenGameValueChanges').length === 1);
    env.tick({t: 12, v: {score: 2}});
    const second = env.named('together_whenGameValueChanges');
    ok('a new value starts it again', second.length === 2 &&
        ext.whenGameValueChanges({NAME: 'score'}, {thread: second[1]}) === true);
    env.tick({t: 13, v: {score: null}});
    ok('a removed value is a change too', env.named('together_whenGameValueChanges').length === 3);
    ok('a player value of another player', ext.playerValueOf({NAME: 'hp', PLAYER: 2}) === 3);
    ok('a player value of me', ext.playerValueOf({NAME: 'hp', PLAYER: 'me'}) === 5);
    ok('nobody has no values', ext.playerValueOf({NAME: 'hp', PLAYER: '0'}) === '');
    ok('name of me and of a slot', ext.nameOfPlayer({PLAYER: 'me'}) === 'Me' && ext.nameOfPlayer({PLAYER: 2}) === 'Pal');
    ok('name of nobody is empty', ext.nameOfPlayer({PLAYER: '0'}) === '');
    env.tick({t: 14, y: {names: {2: null}}});
    ok('a player who left has no name', ext.nameOfPlayer({PLAYER: 2}) === '');
    env.link.stop();
}

section('Scores: round hats, board places, my place');
{
    const env = fakeSession();
    const ext = new ScoresBlocks(env.runtime);
    const starts = () => env.named('squigglescores_whenTheRoundStarts').length;
    const ends = () => env.named('squigglescores_whenTheRoundEnds').length;
    env.welcome(1);
    env.tick({t: 10, kf: 1, y: {round: [1, 1], names: {1: 'Me', 2: 'Pal'},
        boards: [{n: 'Best', top: [[2, 50], [1, 40]]}], places: {Best: 2}}});
    ok('the number rising starts a round', starts() === 1 && ends() === 0);
    ok('the start hat always runs once started', ext.whenTheRoundStarts() === true);
    env.tick({t: 11, y: {round: [1, 0]}});
    ok('running dropping ends it', starts() === 1 && ends() === 1);
    env.tick({t: 12, y: {round: [2, 1]}});
    ok('a new number after an end only starts', starts() === 2 && ends() === 1);
    env.tick({t: 13, y: {round: [3, 1]}});
    ok('a new number while running ends and starts', starts() === 3 && ends() === 2);
    const order = env.hats.slice(-2).map(thread => thread.opcode);
    ok('the end comes before the start', order.join() ===
        'squigglescores_whenTheRoundEnds,squigglescores_whenTheRoundStarts', order);
    ok('place 1 name', ext.boardPlace({BOARD: 'Best', N: 1, PART: 'name'}) === 'Pal');
    ok('place 2 score', ext.boardPlace({BOARD: 'Best', N: 2, PART: 'score'}) === 40);
    ok('an empty place gives "" and 0', ext.boardPlace({BOARD: 'Best', N: 3, PART: 'name'}) === '' &&
        ext.boardPlace({BOARD: 'Best', N: 3, PART: 'score'}) === 0);
    ok('past the top 10 gives "" and 0', ext.boardPlace({BOARD: 'Best', N: 11, PART: 'name'}) === '' &&
        ext.boardPlace({BOARD: 'Best', N: 11, PART: 'score'}) === 0);
    ok('an unknown board gives ""', ext.boardPlace({BOARD: 'Worst', N: 1, PART: 'name'}) === '');
    ok('my place', ext.myPlace({BOARD: 'Best'}) === 2);
    ok('my place on a board I am not on is 0', ext.myPlace({BOARD: 'Worst'}) === 0);
    env.link.stop();
}

section('Teams: team of, players on team');
{
    const env = fakeSession();
    const ext = new TeamsBlocks(env.runtime);
    env.welcome(1);
    env.tick({t: 10, kf: 1, y: {names: {1: 'Me', 2: 'Pal', 3: 'Bo', 4: 'Ann'}, teams: {1: 1, 2: 2, 3: 1, 4: 0}}});
    ok('team of me', ext.teamOfPlayer({PLAYER: 'me'}) === 'Red');
    ok('team of a slot', ext.teamOfPlayer({PLAYER: 2}) === 'Blue');
    ok('team of nobody and of a player with no team', ext.teamOfPlayer({PLAYER: '0'}) === '' &&
        ext.teamOfPlayer({PLAYER: 4}) === '');
    ok('players on a team', ext.countOnTeam({TEAM: 'Red'}) === 2 && ext.countOnTeam({TEAM: 'Blue'}) === 1);
    ok('players on no team', ext.countOnTeam({TEAM: ''}) === 0 && ext.countOnTeam({TEAM: 'Green'}) === 0);
    env.tick({t: 11, y: {names: {3: null}}});
    ok('a player who left is not counted', ext.countOnTeam({TEAM: 'Red'}) === 1);
    env.link.stop();
}

section('Arena: fire, when I get hit, who hit me last');
{
    const env = fakeSession();
    const ext = new ArenaBlocks(env.runtime);
    env.welcome(1);
    env.tick({t: 10, kf: 1, y: {names: {1: 'Me', 2: 'Pal'}}});
    ok('nobody hit me yet', ext.whoHitMeLast() === 0);
    ext.fire();
    env.clock.advance(100);
    const sent = env.ops();
    ok('fire goes as an in.g fire op', sent.length === 1 && sent[0].action === 'fire' && !('name' in sent[0]), sent);
    for (let i = 0; i < 80; i++) ext.fire();
    env.clock.advance(2000);
    const fired = env.ops().length - 1;
    ok('fire is counted in the op bucket', fired > 0 && fired < 80, fired);
    env.tick({t: 11, e: [{hit: 2}]});
    ok('a hit starts when I get hit', env.named('squigglearena_whenIGetHit').length === 1);
    ok('the hat runs', ext.whenIGetHit() === true);
    ok('who hit me last is the shooter', ext.whoHitMeLast() === 2);
    env.tick({t: 12, y: {names: {2: null}}});
    ok('the shooter leaving makes it nobody', ext.whoHitMeLast() === 0);
    env.tick({t: 13, e: [{hit: 2}]});
    env.welcome(3);
    env.tick({t: 14, kf: 1, y: {names: {3: 'Me'}}});
    ok('a rejoin as a new slot makes it nobody', ext.whoHitMeLast() === 0);
    env.link.stop();
    const before = env.ops().length;
    ext.fire();
    env.clock.advance(2000);
    ok('fire outside a game sends nothing', env.ops().length === before);
}

section('every card reads the one game the session parsed');
{
    const env = fakeSession();
    const together = new TogetherBlocks(env.runtime);
    const scores = new ScoresBlocks(env.runtime);
    env.welcome(1);
    env.tick({t: 10, kf: 1, v: {score: 1}, y: {round: [1, 1], names: {1: 'Me', 2: 'Pal'},
        teams: {1: 1, 2: 2}, boards: [{n: 'Best', top: [[2, 50]]}], places: {Best: 1}}});
    env.tick({t: 11, v: {score: 4}});
    ok('the cards hold no game of their own', scores._device.game === env.link.game &&
        together.gameValue({NAME: 'score'}) === 4);
    const late = new TeamsBlocks(env.runtime);
    const arena = new ArenaBlocks(env.runtime);
    ok('a card made mid-game reads the game at once', late.teamOfPlayer({PLAYER: 2}) === 'Blue' &&
        late._device.game === env.link.game && arena._device.game === env.link.game);
    const lateScores = new ScoresBlocks(env.runtime);
    ok('without waiting for the next keyframe', lateScores.boardPlace({BOARD: 'Best', N: 1, PART: 'name'}) === 'Pal' &&
        lateScores.myPlace({BOARD: 'Best'}) === 1);
    env.tick({t: 12, y: {round: [2, 1]}});
    ok('a card bound late still fires its hats from the shared tick', env.named('squigglescores_whenTheRoundStarts')
        .length === 3 && env.named('squigglescores_whenTheRoundEnds').length === 2);
    env.link.stop();
    ok('a stopped game reads empty on every card', together.gameValue({NAME: 'score'}) === '' &&
        late.teamOfPlayer({PLAYER: 2}) === '' && lateScores.boardPlace({BOARD: 'Best', N: 1, PART: 'name'}) === '');
    lateScores._device.dispose();
    global.window = {};
    ok('with no bridge a card reads an empty game', scores.myPlace({BOARD: 'Best'}) === 0 &&
        scores._device.game.round === 0);
}

done();
