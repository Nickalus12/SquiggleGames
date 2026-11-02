process.removeAllListeners('warning');

const {boardRows, statusKey, usage, valueRows, valueText} = await import('./model.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    const more = !cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : '';
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${more}`);
};

ok('no snapshot yet reads as loading', statusKey(null) === 'loading');
ok('a live status wins', ['loading', 'saving', 'saved', 'offline', 'full']
    .every(status => statusKey({status, signedIn: true, projectId: 'p'}) === status));
ok('signed out says sign in', statusKey({status: 'device', signedIn: false, projectId: 'p'}) === 'signedOut');
ok('signed in with no saved game says save it in a room',
    statusKey({status: 'device', signedIn: true, projectId: null}) === 'unsaved');
ok('signed in on a device fallback says device', statusKey({status: 'device', signedIn: true, projectId: 'p'}) === 'device');
ok('numbers show bare and text shows in quotes', valueText(10) === '10' && valueText('red') === '"red"');
ok('values sort by name', JSON.stringify(valueRows({values: [{name: 'level', value: 10}, {name: 'hat', value: 'red'}]})) ===
    '[{"name":"hat","text":"\\"red\\""},{"name":"level","text":"10"}]');
ok('boards keep a place only when it is known', JSON.stringify(boardRows({boards: [{board: 'Ninjas', best: 120, place: 3},
    {board: 'Race', best: 31}]})) === '[{"board":"Ninjas","best":120,"place":3},{"board":"Race","best":31,"place":null}]');
ok('usage counts the saves', JSON.stringify(usage({values: [{name: 'a', value: 1}], bytes: 1})) === '{"used":1,"bytes":1}' &&
    JSON.stringify(usage(null)) === '{"used":0,"bytes":0}');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
