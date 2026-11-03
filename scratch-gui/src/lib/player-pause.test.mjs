process.removeAllListeners('warning');

const {createRequire} = process.getBuiltinModule('module');
const {readFileSync} = process.getBuiltinModule('fs');
const {fileURLToPath} = process.getBuiltinModule('url');

const loadPkg = createRequire(import.meta.url);
const {transformSync} = loadPkg('@babel/core');
const React = loadPkg('react');
const {renderToStaticMarkup} = loadPkg('react-dom/server');
const {IntlProvider} = loadPkg('react-intl');

const {
    applyPause,
    initialPause,
    messages,
    pauseScope,
    peerCountOf,
    stepPause
} = await import('./player-pause.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    const extra = !cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : '';
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra}`);
};

const load = name => {
    const file = fileURLToPath(new URL(name, import.meta.url));
    const presets = [
        [loadPkg.resolve('@babel/preset-env'), {targets: {node: 'current'}, ignoreBrowserslistConfig: true}],
        loadPkg.resolve('@babel/preset-react')
    ];
    const {code} = transformSync(readFileSync(file, 'utf8'), {
        babelrc: false,
        configFile: false,
        filename: file,
        presets
    });
    const mod = {exports: {}};
    const stubs = {
        './player-pause.css': new Proxy({}, {
            get: (unused, key) => (typeof key === 'string' && key !== '__esModule' ? key : null)
        })
    };
    const fromJsx = createRequire(file);
    const local = id => (Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : fromJsx(id));
    new Function('require', 'module', 'exports', code)(local, mod, mod.exports);
    return mod.exports;
};

ok('one player is solo, other players are a room',
    pauseScope(0) === 'solo' && pauseScope(undefined) === 'solo' && pauseScope(2) === 'room');
ok('an empty roster is solo and named peers are a room',
    peerCountOf(null) === 0 && peerCountOf({peers: []}) === 0 && peerCountOf({peers: ['Ada']}) === 1);

ok('the solo card is the keep playing sentence',
    messages.keepPlaying.id === 'sq.playerPause.keepPlaying' &&
    messages.keepPlaying.defaultMessage === 'Paused. Press Escape or tap to keep playing');
ok('the room card adds the friends sentence',
    messages.friends.id === 'sq.playerPause.friends' &&
    messages.friends.defaultMessage === 'The game keeps going for your friends');

const playing = initialPause();
const opened = stepPause(playing, {type: 'escape', peerCount: 0});
ok('solo Escape pauses the clock and the VM and opens the card',
    opened.state.overlay === true && opened.state.held === true && opened.state.card === 'solo' &&
    opened.effects.clock === 'pause' && opened.effects.vm === 'pause' && opened.effects.restart === false,
    opened);
const resumed = stepPause(opened.state, {type: 'escape', peerCount: 0});
ok('a second Escape resumes the clock and the VM',
    resumed.state.overlay === false && resumed.state.held === false &&
    resumed.effects.clock === 'resume' && resumed.effects.vm === 'resume');
const tapped = stepPause(opened.state, {type: 'tap', peerCount: 0});
ok('a tap on the solo card resumes the same way',
    tapped.effects.clock === 'resume' && tapped.effects.vm === 'resume' && tapped.state.overlay === false);
ok('a tap while playing does nothing',
    stepPause(playing, {type: 'tap', peerCount: 0}).state === playing);

const flagged = stepPause(opened.state, {type: 'greenFlag', peerCount: 0});
ok('the green flag clears a solo pause and restarts the round',
    flagged.state.overlay === false && flagged.effects.clock === 'clear' &&
    flagged.effects.vm === 'resume' && flagged.effects.restart === true);
ok('the green flag while playing still restarts and leaves the clock alone',
    stepPause(playing, {type: 'greenFlag', peerCount: 0}).effects.restart === true &&
    stepPause(playing, {type: 'greenFlag', peerCount: 0}).effects.clock === 'keep');

const room = stepPause(playing, {type: 'escape', peerCount: 3});
ok('a room Escape opens the card and does not stop the shared clock or the VM',
    room.state.overlay === true && room.state.held === false && room.state.card === 'room' &&
    room.effects.clock === 'keep' && room.effects.vm === 'keep', room);
const roomAgain = stepPause(room.state, {type: 'escape', peerCount: 3});
ok('a second Escape in a room only closes the card',
    roomAgain.state.overlay === false && roomAgain.effects.clock === 'keep' && roomAgain.effects.vm === 'keep');
const joined = stepPause(opened.state, {type: 'escape', peerCount: 2});
ok('leaving a solo pause still resumes, even if friends joined while the card was up',
    joined.effects.clock === 'resume' && joined.effects.vm === 'resume' && joined.state.held === false);

const stopped = stepPause(opened.state, {type: 'stop', peerCount: 0});
const afterStop = stepPause(stopped.state, {type: 'greenFlag', peerCount: 0});
ok('stop releases a solo hold, then the green flag restarts without pausing again',
    stopped.effects.clock === 'resume' && stopped.effects.vm === 'resume' && stopped.effects.restart === false &&
    afterStop.effects.clock === 'keep' && afterStop.effects.restart === true && afterStop.state.overlay === false);

const calls = [];
const clock = {
    _paused: false,
    pause () {
        this._paused = true;
        calls.push('pause');
    },
    resume () {
        this._paused = false;
        calls.push('resume');
    }
};
const loop = {
    running: true,
    stop () {
        this.running = false;
        calls.push('loop-stop');
    },
    start () {
        this.running = true;
        calls.push('loop-start');
    }
};
const audio = {
    suspend () {
        calls.push('audio-off');
    },
    resume () {
        calls.push('audio-on');
    }
};
const vm = {runtime: {ioDevices: {clock}, frameLoop: loop, audioEngine: {audioContext: audio}}};
applyPause(vm, opened.effects);
ok('applying a solo pause stops the timer, the frame loop and the sound',
    clock._paused === true && loop.running === false &&
    calls.join(',') === 'pause,loop-stop,audio-off', calls);
applyPause(vm, flagged.effects);
ok('applying a green flag releases the timer flag and starts the loop again',
    clock._paused === false && loop.running === true && calls[calls.length - 2] === 'loop-start' &&
    calls[calls.length - 1] === 'audio-on', calls);
applyPause(vm, room.effects);
ok('applying a room card does not touch the clock or the loop',
    calls.length === 5 && loop.running === true);

const {PauseCard} = load('../components/player-pause/player-pause.jsx');
const markup = card => renderToStaticMarkup(
    React.createElement(IntlProvider, {locale: 'en', messages: {}},
        React.createElement(PauseCard, {card, onTap () {}}))
);
const soloHtml = markup('solo');
const roomHtml = markup('room');
ok('the solo card renders the keep playing sentence and not the friends line',
    soloHtml.includes('Paused. Press Escape or tap to keep playing') &&
    !soloHtml.includes('The game keeps going for your friends') &&
    soloHtml.includes('data-pause-card="solo"'));
ok('the room card renders both sentences',
    roomHtml.includes('Paused. Press Escape or tap to keep playing') &&
    roomHtml.includes('The game keeps going for your friends') &&
    roomHtml.includes('data-pause-card="room"'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
