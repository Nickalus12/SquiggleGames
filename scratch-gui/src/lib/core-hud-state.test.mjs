process.removeAllListeners('warning');

const {extractHudState, formatClock, moodFor} = await import('./core-hud-state.js');
const {RULES_KEY} = await import('./collab/project-seam.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(
        `  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`
    );
};

ok('formatClock formats seconds into MM:SS', formatClock(125) === '02:05' && formatClock(0) === '00:00');

const emptyVm = {
    runtime: {
        targets: [
            {isStage: true, isOriginal: true, variables: {}, comments: {}}
        ]
    }
};
const blankState = extractHudState(emptyVm, null);
ok('blank project has no HUD content', blankState.enabled === true && blankState.hasHudContent === false);

const gameVm = {
    runtime: {
        targets: [
            {
                isStage: true,
                isOriginal: true,
                variables: {
                    v1: {name: 'core_carrier', value: 'AT CENTER'}
                },
                comments: {}
            },
            {
                isStage: false,
                isOriginal: true,
                getName: () => 'Game Rules',
                variables: {
                    v2: {name: 'red_score', value: 4},
                    v3: {name: 'blue_score', value: 2},
                    v4: {name: 'cur_timer', value: 95}
                },
                extensionStorage: {
                    [RULES_KEY]: {
                        role: 'rules',
                        teams: ['Red', 'Blue'],
                        boards: [{name: 'captures'}],
                        players: [
                            {name: 'shield', default: 100},
                            {name: 'captures', default: 3}
                        ]
                    }
                }
            }
        ]
    }
};

const hud = extractHudState(gameVm, null);
ok('detects teams and scores from Game Rules',
    hud.hasHudContent === true &&
    hud.teams.length === 2 &&
    hud.teams[0].name === 'Red' &&
    hud.teams[0].score === 4 &&
    hud.teams[1].score === 2);
ok('detects round timer and formats MM:SS',
    hud.timer && hud.timer.seconds === 95 && hud.timer.formatted === '01:35');
ok('detects player shield vitals from defaults/vars',
    hud.vitals && hud.vitals.shield === 100 && hud.vitals.maxShield === 100);
ok('detects leaderboard and status pill',
    hud.leaderboard &&
    hud.leaderboard.boardName === 'Captures' &&
    hud.leaderboard.rows[0].score === 3 &&
    hud.statusPill === 'AT CENTER');

const vars = pairs => {
    const out = {};
    Object.keys(pairs).forEach((name, i) => {
        out[`v${i}`] = {name, value: pairs[name]};
    });
    return out;
};

const hangarVm = () => ({
    runtime: {
        targets: [
            {isStage: true, isOriginal: true, variables: {}, comments: {}},
            {
                isStage: false,
                isOriginal: true,
                getName: () => 'Game Rules',
                variables: vars({mode: 'deathmatch', target: 0, dmg: 25}),
                extensionStorage: {
                    [RULES_KEY]: {
                        role: 'rules',
                        teams: ['Red', 'Blue'],
                        boards: [{n: 'frags', name: 'frags'}, {n: 'clears', name: 'clears'}],
                        players: [
                            {name: 'hp', default: 100},
                            {name: 'armor', default: 50},
                            {name: 'ammo', default: 40},
                            {name: 'gold_key', default: 1},
                            {name: 'weapon', default: 2},
                            {name: 'frags', default: 0}
                        ]
                    }
                }
            },
            {isStage: false, isOriginal: true, getName: () => 'WeaponHUD', variables: vars({cur_wpn: 3})},
            {
                isStage: false,
                isOriginal: true,
                getName: () => 'StatusHUD',
                variables: vars({last_hp: 100, last_armor: 50, last_ammo: 40, last_frags: 0})
            }
        ]
    }
});

const solo = extractHudState(hangarVm(), null);
ok('a Hangar Breach style game gets the full status band',
    solo.bar && solo.bar.layout === 'band', solo.bar);
ok('solo play reads the game variables for health, armor and ammo',
    solo.vitals.hp === 100 && solo.vitals.shield === 50 && solo.vitals.ammo === 40 &&
    solo.vitals.shieldKind === 'armor', solo.vitals);
ok('the live weapon variable beats the rules default',
    solo.vitals.weapon && solo.vitals.weapon.slot === 3 && solo.vitals.weapon.slots === 3, solo.vitals.weapon);
ok('a declared key shows as an owned item with its colour',
    solo.vitals.items.length === 1 && solo.vitals.items[0].id === 'gold_key' &&
    solo.vitals.items[0].tone === 'gold' && solo.vitals.items[0].owned === true, solo.vitals.items);
ok('full health reads as a great mood', solo.vitals.mood === 'great');
ok('the solo frags board folds into the band',
    solo.bar.frags && solo.bar.frags.value === 0 && solo.bar.frags.label === 'Frags' && solo.bar.foldsBoard === true,
    solo.bar);

const room = {
    slot: 2,
    game: {
        players: {
            1: {hp: 90, armor: 10, ammo: 30, frags: 1},
            2: {hp: 40, armor: 0, ammo: 12, weapon: 1, frags: 5, gold_key: 0}
        },
        values: {red_score: 3, blue_score: 7},
        names: {1: 'Ada', 2: 'Bo'},
        timers: {},
        boards: []
    }
};
const live = extractHudState(hangarVm(), room);
ok('in a room my player values beat the project variables',
    live.vitals.hp === 40 && live.vitals.shield === 0 && live.vitals.ammo === 12, live.vitals);
ok('in a room the weapon comes from my player value', live.vitals.weapon.slot === 1, live.vitals.weapon);
ok('a lost key shows as not owned', live.vitals.items[0].owned === false, live.vitals.items);
ok('forty of a hundred health reads as worried', live.vitals.mood === 'worried');
ok('team scores come from game values', live.teams[0].score === 3 && live.teams[1].score === 7, live.teams);
ok('my frags lead the band and the board keeps both players',
    live.bar.frags.value === 5 && live.leaderboard.rows.length === 2 && live.bar.foldsBoard === false, live.bar);

const lives = extractHudState({
    runtime: {targets: [{isStage: true, isOriginal: true, comments: {}, variables: vars({lives: 3, score: 120})}]}
}, null);
ok('a platformer with only lives gets the compact bar', lives.bar && lives.bar.layout === 'compact' &&
    lives.vitals.hpKind === 'lives', lives.bar);

const scoreOnly = extractHudState({
    runtime: {targets: [{isStage: true, isOriginal: true, comments: {}, variables: vars({score: 9})}]}
}, null);
ok('a score only game gets no status bar, just the board',
    scoreOnly.bar === null && scoreOnly.leaderboard && scoreOnly.leaderboard.rows[0].score === 9);

ok('mood steps down with health',
    moodFor(100, 100) === 'great' && moodFor(60, 100) === 'good' && moodFor(35, 100) === 'worried' &&
    moodFor(10, 100) === 'low' && moodFor(0, 100) === 'out');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
