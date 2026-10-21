process.removeAllListeners('warning');

const {
    default: reducer,
    closeRoomPanel,
    openRoomPanel,
    roomPanelInitialState,
    toggleRoomPanel
} = await import('../../reducers/room-panel.js');
const {default: startRoomFlow} = await import('../../components/room-panel/start-room.js');
const api = await import('./room-api.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
    }
};

console.log('reducer');
{
    const start = reducer(undefined, {type: 'nothing'});
    ok('starts closed', start === roomPanelInitialState && start.open === false);
    const opened = reducer(start, openRoomPanel());
    ok('open opens', opened.open === true);
    ok('open twice keeps the same state', reducer(opened, openRoomPanel()) === opened);
    ok('close closes', reducer(opened, closeRoomPanel()).open === false);
    ok('close when closed keeps the same state', reducer(start, closeRoomPanel()) === start);
    ok('toggle flips', reducer(reducer(start, toggleRoomPanel()), toggleRoomPanel()).open === false);
}

console.log('start a room');
{
    const run = async (opts = {}) => {
        const seen = {shown: 0, went: [], failed: [], created: []};
        const result = await startRoomFlow(Object.assign({
            title: '  My Game  ',
            inRoom: () => false,
            showRoom: () => seen.shown++,
            fail: key => seen.failed.push(key),
            create: body => {
                seen.created.push(body);
                return Promise.resolve({slug: 'my-game'});
            },
            go: url => seen.went.push(url)
        }, opts));
        return Object.assign(seen, {result});
    };
    const inside = await run({inRoom: () => true});
    ok('inside a room it shows the room', inside.result === 'shown' && inside.shown === 1 && !inside.created.length);
    const fresh = await run();
    ok('outside a room it creates one with the project title', fresh.created[0].title === 'My Game', fresh.created);
    ok('then opens the editor in that room', fresh.went[0] === '/editor.html?room=my-game', fresh.went);
    const blank = await run({title: '   '});
    ok('a blank title lets the server name it', JSON.stringify(blank.created[0]) === '{}');
    const long = await run({title: 'x'.repeat(80)});
    ok('a long title is cut to 60', long.created[0].title.length === 60);
    const out = await run({create: () => Promise.reject(new Error('http-401'))});
    ok('signed out goes home to sign in', out.result === 'sign-in' && out.went[0] === '/');
    const full = await run({create: () => Promise.reject(new Error('http-429'))});
    ok('the room limit says so', full.failed[0] === 'roomLimit' && !full.went.length);
    const broken = await run({create: () => Promise.reject(new Error('http-500'))});
    ok('other failures say try again', broken.failed[0] === 'startFailed');
    const empty = await run({create: () => Promise.resolve(null)});
    ok('no slug back is a failure', empty.failed[0] === 'startFailed' && !empty.went.length);
}

console.log('room api');
{
    const calls = [];
    const fetcher = (url, init) => {
        calls.push({url, init});
        return Promise.resolve({ok: true, json: () => Promise.resolve({mine: [{id: 'p1'}], room: {slug: 's'}})});
    };
    await api.patchRoom('my room', {chatOn: false}, fetcher);
    ok('patch goes to the room by slug', calls[0].url === '/api/rooms/my%20room' && calls[0].init.method === 'PATCH');
    ok('patch carries the json body', calls[0].init.body === '{"chatOn":false}');
    ok('writes carry the x-squiggle header', calls[0].init.headers['x-squiggle'] === '1');
    const mine = await api.listProjects(fetcher);
    ok('the library list is the signed in mine list', mine.length === 1 && calls[1].url === '/api/projects');
    await api.createInvite('s', {}, fetcher);
    ok('invites post to the room', calls[2].url === '/api/rooms/s/invites' && calls[2].init.method === 'POST');
    await api.historySummary('s', 7, fetcher);
    ok('a history summary is one version', calls[3].url === '/api/rooms/s/history/7');
    let refused = null;
    await api.request('/x', {fetcher: () => Promise.resolve({ok: false, status: 403})}).catch(e => {
        refused = e.message;
    });
    ok('a refusal rejects with the status', refused === 'http-403');
    let told = null;
    await api.request('/x', {fetcher: () => Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({error: 'host-only', message: 'Only the room host can.'})
    })}).catch(e => {
        told = e;
    });
    ok('a refusal carries the server code and words', told && told.message === 'http-403' &&
        told.code === 'host-only' && told.friendly === 'Only the room host can.');
    let garbled = null;
    await api.request('/x', {fetcher: () => Promise.resolve({ok: false, status: 502, json: () => Promise.reject(new Error('html'))})})
        .catch(e => {
            garbled = e;
        });
    ok('a refusal without json still rejects', garbled && garbled.message === 'http-502' && !garbled.friendly);
    const posts = [];
    const poster = (url, init) => {
        posts.push({url, body: init.body, method: init.method});
        return Promise.resolve({ok: true, json: () => Promise.resolve({ok: true})});
    };
    await api.restoreVersion('s', {v: 3, sha: 'x'}, poster);
    await api.restoreVersion('s', {file: '2026-09-30T10-15-00-000Z.sb3'}, poster);
    ok('restore posts a live version by v', posts[0].url === '/api/rooms/s/history/restore' &&
        posts[0].method === 'POST' && posts[0].body === '{"v":3}');
    ok('restore posts a 1.x stamp by file', posts[1].body === '{"file":"2026-09-30T10-15-00-000Z.sb3"}');
    await api.roomHistory('a b', poster);
    ok('history lists by slug', posts[2].url === '/api/rooms/a%20b/history');
    let none = null;
    await api.patchRoom('', {}, fetcher).catch(e => {
        none = e.message;
    });
    ok('no slug never calls out', none === 'no-room' && calls.length === 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
