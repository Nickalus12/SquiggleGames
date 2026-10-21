process.removeAllListeners('warning');

const {ok, section, done} = await import('./harness.test-util.mjs');
const {applyTick, createGameState, gameValue, playerName, playerValue, teamName, timeLeft} =
    await import('./game-state.js');

section('keyframes and deltas');
{
    const state = createGameState();
    ok('a delta before the first keyframe asks for one', applyTick(state, {t: 3, v: {a: 1}}).needKeyframe === true);
    applyTick(state, {t: 4, kf: 1, v: {a: 1, b: 2}, p: {1: {hp: 3}}, a: {1: [0, 0, 90, 1, 1, 0]}});
    ok('the keyframe sets values', gameValue(state, 'a') === 1 && playerValue(state, 1, 'hp') === 3);
    applyTick(state, {t: 5, v: {a: null, c: 3}, p: {1: {hp: 2}}});
    ok('a delta merges and a null removes', gameValue(state, 'a') === '' && gameValue(state, 'c') === 3 &&
        gameValue(state, 'b') === 2);
    ok('a stale delta is ignored', applyTick(state, {t: 5, v: {c: 9}}).stale === true && gameValue(state, 'c') === 3);
    applyTick(state, {t: 40, kf: 1, v: {d: 1}});
    ok('a later keyframe resets everything it does not carry',
        gameValue(state, 'b') === '' && playerValue(state, 1, 'hp') === '' && !state.avatars[1]);
    applyTick(state, {t: 38, kf: 1, v: {e: 1}});
    ok('a keyframe always applies, even an older one after a resume', gameValue(state, 'e') === 1 && state.t === 38);
}

section('tick apply order');
{
    const state = createGameState();
    const result = applyTick(state, {t: 10, kf: 1, v: {n: 1}, y: {round: [1, 1], names: {2: 'Pal'}},
        e: [{n: 'first', v: '', f: 0}, {hit: 2}, {n: 'second', v: '', f: 3}]});
    ok('events come back in server order', result.events.map(e => e.n || 'hit').join() === 'first,hit,second');
    ok('values are in place before events are handed out', gameValue(state, 'n') === 1);
    ok('a hit records the shooter', state.lastHit === 2);
}

section('a keyframe forgets a shooter who is gone');
{
    const state = createGameState();
    applyTick(state, {t: 10, kf: 1, y: {names: {1: 'Me', 2: 'Pal', 3: 'Bo'}}, e: [{hit: 2}]});
    applyTick(state, {t: 50, kf: 1, y: {names: {1: 'Me', 2: 'Pal'}}});
    ok('a keyframe that still names the shooter keeps them', state.lastHit === 2, state.lastHit);
    applyTick(state, {t: 90, kf: 1, y: {names: {1: 'Me', 3: 'Bo'}}});
    ok('a keyframe without the shooter makes it nobody', state.lastHit === 0, state.lastHit);
    applyTick(state, {t: 91, e: [{hit: 3}]});
    applyTick(state, {t: 130, kf: 1});
    ok('a keyframe with no names at all makes it nobody', state.lastHit === 0, state.lastHit);
    applyTick(state, {t: 170, kf: 1, y: {names: {4: 'Ann'}}, e: [{hit: 4}]});
    ok('a hit in the keyframe itself still counts', state.lastHit === 4, state.lastHit);
}

section('tick.y');
{
    const state = createGameState();
    applyTick(state, {t: 100, kf: 1, y: {round: [2, 1], names: {1: 'Me', 2: 'Pal'}, teams: {1: 1, 2: 2},
        timers: {clock: 160, old: 90}, boards: [{n: 'Best', top: [[1, 5]]}], places: {Best: 1}}, e: [{hit: 2}]});
    ok('round reads the number and running', state.round === 2 && state.running === true);
    ok('names by slot', playerName(state, 2) === 'Pal');
    ok('team by index into the mark teams', teamName(state, 1, ['Red', 'Blue']) === 'Red' &&
        teamName(state, 2, ['Red', 'Blue']) === 'Blue');
    ok('a slot with no team entry has no team', teamName(state, 3, ['Red']) === '');
    const zero = createGameState();
    applyTick(zero, {t: 1, kf: 1, y: {teams: {4: 0, 5: 1}}});
    ok('team 0 is no team', teamName(zero, 4, ['Red']) === '' && teamName(zero, 5, ['Red']) === 'Red');
    const slow = createGameState(0.1);
    applyTick(slow, {t: 10, kf: 1, y: {timers: {go: 30}}});
    ok('time left follows the tick rate it was made with', timeLeft(slow, 'go') === 2, timeLeft(slow, 'go'));
    ok('time left is end minus t at 20 a second', timeLeft(state, 'clock') === 3, timeLeft(state, 'clock'));
    ok('a past timer reads 0', timeLeft(state, 'old') === 0);
    ok('boards and places arrive', state.boards.length === 1 && state.places.Best === 1);
    applyTick(state, {t: 101, y: {round: [2, 0]}});
    ok('running drops while the number stays', state.round === 2 && state.running === false);
    applyTick(state, {t: 102, y: {names: {2: null}}, p: {2: {hp: 1}}});
    ok('a slot that leaves tick.y is forgotten', playerName(state, 2) === '' && teamName(state, 2, ['Red', 'Blue']) === '');
    ok('who hit me last becomes nobody when that slot leaves', state.lastHit === 0);
    applyTick(state, {t: 103, y: {round: 4}});
    ok('a bare round number still reads', state.round === 4 && state.running === true);
}

section('what a tick changed');
{
    const state = createGameState();
    const names = result => result.changed.slice().sort()
        .join();
    const first = applyTick(state, {t: 1, kf: 1, v: {a: 1, b: 2}, y: {round: [1, 1]}});
    ok('a first keyframe changes every value it brings', names(first) === 'a,b', first.changed);
    ok('and says the round it found', first.roundWas === 0 && first.runningWas === false);
    const delta = applyTick(state, {t: 2, v: {a: 1, b: 3, c: null}, y: {round: [1, 0]}});
    ok('a delta changes only the values that differ', names(delta) === 'b', delta.changed);
    ok('the round before the delta', delta.roundWas === 1 && delta.runningWas === true);
    ok('removing a value is a change', names(applyTick(state, {t: 3, v: {b: null}})) === 'b');
    ok('a tick with no values changes none', applyTick(state, {t: 4}).changed.length === 0);
    const again = applyTick(state, {t: 40, kf: 1, v: {a: 1, d: 4}});
    ok('a keyframe changes only what it adds or alters', names(again) === 'd', again.changed);
    ok('a keyframe that drops a value says so', names(applyTick(state, {t: 80, kf: 1, v: {d: 4}})) === 'a');
}

done();
