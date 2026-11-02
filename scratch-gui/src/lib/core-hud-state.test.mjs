process.removeAllListeners('warning');

const {extractHudState, formatClock} = await import('./core-hud-state.js');
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
