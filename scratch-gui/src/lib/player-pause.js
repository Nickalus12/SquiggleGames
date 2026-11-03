import {defineMessages} from 'react-intl';

const messages = defineMessages({
    keepPlaying: {
        id: 'sq.playerPause.keepPlaying',
        defaultMessage: 'Paused. Press Escape or tap to keep playing',
        description: 'Card shown when Escape pauses a game with one player'
    },
    friends: {
        id: 'sq.playerPause.friends',
        defaultMessage: 'The game keeps going for your friends',
        description: 'Card line when Escape is pressed in a room with other players'
    }
});

const initialPause = () => ({overlay: false, held: false, card: null});

const pauseScope = peerCount => (Number(peerCount) > 0 ? 'room' : 'solo');

const peerCountOf = net => {
    const peers = net && net.peers;
    return Array.isArray(peers) ? peers.length : 0;
};

const livePeerCount = () => peerCountOf(typeof window === 'undefined' ? null : window.SquiggleNet);

const scopeOf = event => {
    if (event && (event.scope === 'solo' || event.scope === 'room')) return event.scope;
    return pauseScope(event && event.peerCount);
};

const effects = (clock, vm, restart) => ({clock, vm, restart});

const kept = () => effects('keep', 'keep', false);

const stepPause = (state, event) => {
    const base = state && typeof state.overlay === 'boolean' ? state : initialPause();
    const type = event && event.type;
    const scope = scopeOf(event);
    if (type === 'stop') {
        return {
            state: initialPause(),
            effects: base.held ? effects('resume', 'resume', false) : kept()
        };
    }
    if (type === 'greenFlag') {
        return {
            state: initialPause(),
            effects: base.held ? effects('clear', 'resume', true) : effects('keep', 'keep', true)
        };
    }
    if (type === 'escape' && !base.overlay) {
        const held = scope === 'solo';
        return {
            state: {overlay: true, held, card: scope},
            effects: held ? effects('pause', 'pause', false) : kept()
        };
    }
    if ((type === 'escape' || type === 'tap') && base.overlay) {
        return {
            state: initialPause(),
            effects: base.held ? effects('resume', 'resume', false) : kept()
        };
    }
    return {state: base, effects: kept()};
};

const applyPause = (vm, change) => {
    const runtime = vm && vm.runtime;
    if (!runtime || !change) return;
    const clock = runtime.ioDevices && runtime.ioDevices.clock;
    const loop = runtime.frameLoop;
    if (change.clock === 'pause' && clock && !clock._paused && typeof clock.pause === 'function') clock.pause();
    if (change.clock === 'resume' && clock && clock._paused && typeof clock.resume === 'function') clock.resume();
    if (change.clock === 'clear' && clock) clock._paused = false;
    if (change.vm === 'pause' && loop && loop.running && typeof loop.stop === 'function') loop.stop();
    if (change.vm === 'resume' && loop && !loop.running && typeof loop.start === 'function') loop.start();
    const audio = runtime.audioEngine && runtime.audioEngine.audioContext;
    if (audio && change.vm === 'pause' && typeof audio.suspend === 'function') audio.suspend();
    if (audio && change.vm === 'resume' && typeof audio.resume === 'function') audio.resume();
};

export {
    applyPause,
    initialPause,
    livePeerCount,
    messages,
    pauseScope,
    peerCountOf,
    stepPause
};
