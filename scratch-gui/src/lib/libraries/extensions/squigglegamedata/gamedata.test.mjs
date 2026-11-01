process.removeAllListeners('warning');

await import('../../../rules/json-hook.mjs');
const {createRequire} = await import('node:module');
const {ok, section, done, fakeClock} = await import('../../../together2/harness.test-util.mjs');
const {DEBOUNCE_MS, LIMITS, RETRY_MS, STATUS, STORAGE_PREFIX, cleanValue, createGameData, topText} =
    await import('./store.js');
const {createContext, projectFromSearch, roomFrom} = await import('./context.js');
const {GAME_DATA_ID, listNames, makeGameDataBlocks} = await import('./index.js');

const flush = () => new Promise(resolve => setImmediate(resolve));

const fakeStorage = () => {
    const data = new Map();
    return {
        data,
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key)
    };
};

const fakeServer = () => {
    const calls = [];
    const state = {values: {}, revs: {}, boards: {}, down: 0, status: 200, top: []};
    const reply = (status, data) => Promise.resolve({ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data)});
    const fetchImpl = (url, init) => {
        const method = init.method;
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({url, method, body, headers: init.headers, credentials: init.credentials});
        if (state.down > 0) {
            state.down -= 1;
            return Promise.reject(new Error('offline'));
        }
        if (state.status !== 200) return reply(state.status, {error: 'nope'});
        const path = url.replace(/^.*\/api\/games\/[^/]+/, '');
        if (method === 'GET' && path === '/saves') {
            return reply(200, {values: state.values, revs: state.revs, shared: {}, boards: state.boards,
                limits: {keys: 16, bytes: 4096}});
        }
        if (method === 'PUT' && path === '/saves') {
            const results = body.writes.map(w => {
                if (w.forget) delete state.values[w.name];
                else state.values[w.name] = w.value;
                return {name: w.name, ok: true, rev: 1};
            });
            return reply(200, {results});
        }
        if (method === 'DELETE' && path === '/saves') {
            state.values = {};
            return reply(200, {ok: true, removed: 1});
        }
        if (method === 'POST' && path.startsWith('/boards/')) {
            const board = decodeURIComponent(path.slice(8));
            const was = state.boards[board];
            const best = !was || (body.keep === 'min' ? body.score < was.best : body.score > was.best) ? body.score :
                was.best;
            state.boards[board] = {best, place: 1};
            return reply(200, {board, best, place: 1, top: [{place: 1, name: 'Fred', score: best, me: true}]});
        }
        if (method === 'GET' && path.startsWith('/boards/')) {
            return reply(200, {board: 'x', top: state.top, me: null});
        }
        if (method === 'DELETE' && path.startsWith('/boards/')) return reply(200, {ok: true, removed: 2});
        return reply(404, {error: 'not-found'});
    };
    return {calls, state, fetchImpl};
};

const make = (server = fakeServer()) => {
    const clock = fakeClock();
    const storage = fakeStorage();
    const store = createGameData({fetchImpl: server.fetchImpl, storage, now: clock.now, setTimer: clock.setTimer,
        clearTimer: clock.clearTimer});
    return {clock, storage, server, store};
};

section('values');
ok('a plain number becomes a number', cleanValue('10') === 10 && cleanValue('-2.5') === -2.5);
ok('text stays text', cleanValue('red') === 'red' && cleanValue('007') === '007' && cleanValue('1e3') === '1e3');
ok('numbers stay numbers', cleanValue(3) === 3 && cleanValue(Number.NaN) === 0);
ok('the top reads like a sentence', topText([{place: 1, name: 'Fred', score: 120, me: false},
    {place: 2, name: null, score: 90, me: false}, {place: 3, name: 'Bill', score: 50, me: true}]) ===
    '1. Fred 120, 2. a player 90, 3. you 50');

section('signed out: saves stay on this device, one box per game');
{
    const {store, storage, server} = make();
    await store.load({projectId: 'p-ninja', signedIn: false});
    ok('it is ready at once and says device', store.ready && store.status === STATUS.device && !store.signedIn);
    ok('nothing goes to the server', server.calls.length === 0);
    ok('save keeps the value', store.set('level', '10') && store.get('level') === 10);
    ok('the device box is namespaced by game', JSON.parse(storage.getItem(`${STORAGE_PREFIX}p-ninja`)).values.level === 10);
    await store.load({projectId: 'p-other', signedIn: false});
    ok('another game starts empty', store.get('level') === '');
    await store.load({projectId: 'p-ninja', signedIn: false});
    ok('coming back finds level 10', store.get('level') === 10);
    ok('forget removes it', store.forget('level') && store.get('level') === '' &&
        storage.getItem(`${STORAGE_PREFIX}p-ninja`) === null);
    ok('a missing name reads as empty', store.get('nope') === '' && store.get('') === '');
    await store.post('Ninjas', 120, 'max');
    await store.post('Ninjas', 80, 'max');
    await store.post('Race', 31, 'min');
    await store.post('Race', 40, 'min');
    ok('my best keeps the highest or the lowest', store.best('Ninjas') === 120 && store.best('Race') === 31);
    ok('the top on a device is just me', topText(await store.top('Ninjas', 10)) === '1. you 120');
    await store.load({projectId: null, signedIn: false});
    store.set('draft', 1);
    ok('an unsaved game keeps its saves in a draft box', storage.getItem(`${STORAGE_PREFIX}draft`) !== null);
}

section('the limits');
{
    const {store} = make();
    await store.load({projectId: 'p-limits', signedIn: false});
    for (let i = 0; i < LIMITS.keys; i++) store.set(`k${i}`, i);
    ok('sixteen values fit', store.snapshot().values.length === 16);
    ok('the seventeenth is refused and says full', !store.set('one-more', 1) && store.status === STATUS.full);
    ok('changing a kept value still works', store.set('k1', 'changed') && store.get('k1') === 'changed');
    store.forget('k0');
    ok('a value too big for 4096 letters is refused', !store.set('big', 'x'.repeat(LIMITS.bytes)));
    ok('names are cut to 64 letters', store.set('n'.repeat(80), 1) && store.get('n'.repeat(64)) === 1);
    ok('a name with a control character is refused', !store.set('bad\nname', 1));
}

section('signed in: Fred is at level 10 on any device');
{
    const server = fakeServer();
    server.state.values = {level: 10, hat: 'red'};
    server.state.boards = {Ninjas: {best: 120, place: 3}};
    const {store, clock, storage} = make(server);
    let readies = 0;
    store.onReady(() => readies++);
    await store.load({projectId: 'p-ninja', signedIn: true});
    ok('it loads his values and boards', store.get('level') === 10 && store.get('hat') === 'red' &&
        store.best('Ninjas') === 120);
    ok('it is ready once and on the account', store.ready && readies === 1 && store.snapshot().onAccount);
    ok('the read sends the cookie', server.calls[0].credentials === 'include' && server.calls[0].method === 'GET');
    store.set('level', 11);
    store.set('coins', 5);
    store.set('coins', 6);
    ok('writes wait for a quiet second', server.calls.length === 1 && store.status === STATUS.saving);
    clock.advance(DEBOUNCE_MS);
    await flush();
    const put = server.calls[1];
    ok('then one PUT carries the newest of each', put.method === 'PUT' && JSON.stringify(put.body.writes) ===
        JSON.stringify([{name: 'level', value: 11}, {name: 'coins', value: 6}]), put.body);
    ok('a write says it came from Squiggle', put.headers['x-squiggle'] === '1');
    ok('and the status says saved', store.status === STATUS.saved && store.snapshot().pending === 0);
    ok('nothing went to the device box', storage.data.size === 0);
    store.forget('coins');
    clock.advance(DEBOUNCE_MS);
    await flush();
    ok('forget sends forget', JSON.stringify(server.calls[2].body.writes) === '[{"name":"coins","forget":true}]');
}

section('a save waits and retries when the server cannot be reached');
{
    const server = fakeServer();
    const {store, clock} = make(server);
    await store.load({projectId: 'p-ninja', signedIn: true});
    server.state.down = 2;
    store.set('level', 12);
    clock.advance(DEBOUNCE_MS);
    await flush();
    ok('the first try fails quietly and says offline', store.status === STATUS.offline && store.snapshot().pending === 1);
    clock.advance(RETRY_MS[0]);
    await flush();
    ok('the second try fails too', store.status === STATUS.offline);
    clock.advance(RETRY_MS[1]);
    await flush();
    ok('the third try saves it', store.status === STATUS.saved && server.state.values.level === 12 &&
        store.snapshot().pending === 0);
}

section('signing in carries device saves up the first time');
{
    const server = fakeServer();
    const {store, clock, storage} = make(server);
    storage.setItem(`${STORAGE_PREFIX}p-ninja`, JSON.stringify({values: {level: 4}, boards: {}}));
    await store.load({projectId: 'p-ninja', signedIn: true});
    clock.advance(DEBOUNCE_MS);
    await flush();
    ok('the empty account gets level 4', server.state.values.level === 4 && store.get('level') === 4);
    server.state.values = {level: 9};
    storage.setItem(`${STORAGE_PREFIX}p-ninja`, JSON.stringify({values: {level: 1}, boards: {}}));
    await store.load({projectId: 'p-ninja', signedIn: true});
    clock.advance(DEBOUNCE_MS);
    await flush();
    ok('an account that already has saves keeps them', store.get('level') === 9 && server.state.values.level === 9);
}

section('a session that ended falls back to the device');
{
    const server = fakeServer();
    const {store, clock, storage} = make(server);
    await store.load({projectId: 'p-ninja', signedIn: true});
    server.state.status = 401;
    store.set('level', 3);
    clock.advance(DEBOUNCE_MS);
    await flush();
    ok('it says device and keeps the value here', store.status === STATUS.device && !store.signedIn &&
        JSON.parse(storage.getItem(`${STORAGE_PREFIX}p-ninja`)).values.level === 3);
}

section('boards on the account');
{
    const server = fakeServer();
    server.state.top = [{place: 1, name: 'Fred', score: 120, me: false}, {place: 2, name: null, score: 90, me: true}];
    const {store, clock} = make(server);
    await store.load({projectId: 'p-ninja', signedIn: true});
    await store.post('Ninjas', 100, 'max');
    const post = server.calls.find(c => c.method === 'POST');
    ok('post sends the score and the order', post.url.endsWith('/boards/Ninjas') && post.body.score === 100 &&
        post.body.keep === 'max');
    ok('my best follows the server', store.best('Ninjas') === 100);
    ok('the top just posted comes from the post reply', topText(await store.top('Ninjas', 10)) === '1. you 100' &&
        server.calls.filter(c => c.method === 'GET').length === 1);
    clock.advance(6000);
    ok('after a few seconds the top is read again', topText(await store.top('Ninjas', 1)) === '1. Fred 120' &&
        server.calls.filter(c => c.method === 'GET').length === 2);
    ok('a board name with a slash is sent safely', (await store.post('a/b', 1, 'max')) &&
        server.calls.at(-1).url.endsWith('/boards/a%2Fb'));
    ok('reset forgets my saves on the account', await store.resetMine() && server.calls.at(-1).method === 'DELETE');
    ok('clear board asks the server', await store.clearBoard('Ninjas') && store.best('Ninjas') === '');
}

section('where the game is');
ok('a play link names the project', projectFromSearch('?project_url=%2Fapi%2Fprojects%2Fabc-123%2Fsb3&autoplay') ===
    'abc-123');
ok('a full url works too', projectFromSearch('?project_url=https%3A%2F%2Fsquigglegames.app%2Fapi%2Fprojects%2Fp9%2Fsb3') ===
    'p9');
ok('anything else is not a project', projectFromSearch('?project_url=https%3A%2F%2Fevil.test%2Fx.sb3') === null &&
    projectFromSearch('') === null);
ok('a room comes from the path, the query or the tab', roomFrom({pathname: '/r/blue-fox', search: ''}) === 'blue-fox' &&
    roomFrom({pathname: '/editor.html', search: '?room=red'}) === 'red' &&
    roomFrom({pathname: '/', search: ''}, {getItem: () => 'kept'}) === 'kept');
{
    const asked = [];
    const fetchImpl = url => {
        asked.push(url);
        const data = url.endsWith('/api/me') ? {user: {displayName: 'Fred'}} : {projectId: 'room-game'};
        return Promise.resolve({ok: true, json: () => Promise.resolve(data)});
    };
    const fromRoom = await createContext({where: {pathname: '/editor.html', search: '?room=blue'}, fetchImpl})();
    ok('in a room the editor asks for the room game', fromRoom.projectId === 'room-game' && fromRoom.signedIn &&
        asked.includes('/api/rooms/blue/game'));
    const solo = await createContext({where: {pathname: '/editor.html', search: '?solo=1'}, session: null,
        fetchImpl: () => Promise.resolve({ok: false, json: () => Promise.resolve({})})})();
    ok('the solo editor has no project and nobody signed in', solo.projectId === null && solo.signedIn === false);
}

section('the extension');
{
    const {store} = make();
    const hats = [];
    const listeners = {};
    const runtime = {
        startHats: opcode => hats.push(opcode),
        on: (type, fn) => {
            listeners[type] = fn;
        },
        off: () => {},
        getEditingTarget: () => ({variables: {a: {name: 'top scores', type: 'list'}, b: {name: 'x', type: ''}}}),
        getTargetForStage: () => ({variables: {c: {name: 'all time', type: 'list'}}})
    };
    let told = 0;
    let contexts = 0;
    const Blocks = makeGameDataBlocks({store, resolve: () => {
        contexts++;
        return {projectId: 'p-ninja', signedIn: false};
    }, notifyParent: () => told++});
    const ext = new Blocks(runtime);
    await flush();
    const info = ext.getInfo();
    const opcodes = info.blocks.filter(b => b && b.opcode).map(b => b.opcode);
    ok('the id is gamedata', info.id === GAME_DATA_ID && GAME_DATA_ID === 'gamedata' && info.name === 'Game data');
    ok('it has the ten blocks', JSON.stringify(opcodes) === JSON.stringify(['save', 'saved', 'forget', 'whenReady',
        'isReady', 'isSignedIn', 'postScore', 'myBest', 'top', 'topIntoList']), opcodes);
    const labels = info.blocks.filter(b => b && b.blockType === 'label').map(b => b.text);
    ok('the first label says the limits', labels[0] === 'Up to 16 saves, 4096 letters in all', labels);
    ok('no two labels sit together, so the toolbox keeps both', info.blocks.every((b, i) => !b || b.blockType !==
        'label' || !info.blocks[i + 1] || info.blocks[i + 1].blockType !== 'label') && labels.length === 2, labels);
    const post = info.blocks.find(b => b && b.opcode === 'postScore');
    ok('post score reads post score 100 to Ninjas highest wins', post.text === 'post score [SCORE] to [BOARD] [ORDER]' &&
        info.menus.order.items.map(i => i.text).join() === 'highest wins,lowest wins');
    ok('no em dash in any block text', info.blocks.every(b => !b || !/—/.test(b.text || '')));
    ok('every block has a method', opcodes.every(op => typeof ext[op] === 'function'));
    ok('loading fires when saves are ready', hats.includes('gamedata_whenReady') && contexts === 1);
    ok('the ready blocks answer', ext.isReady() === true && ext.isSignedIn() === false);
    ext.save({NAME: 'level', VALUE: '10'});
    ok('save then saved', ext.saved({NAME: 'level'}) === 10);
    ok('the play page hears about it once', told === 1);
    ext.forget({NAME: 'level'});
    ok('forget', ext.saved({NAME: 'level'}) === '');
    await ext.postScore({SCORE: 70, BOARD: 'Ninjas', ORDER: 'max'});
    ok('post score then my best', ext.myBest({BOARD: 'Ninjas'}) === 70);
    ok('top reads as a sentence', await ext.top({N: 10, BOARD: 'Ninjas'}) === '1. you 70');
    const list = {value: ['old'], _monitorUpToDate: true};
    await ext.topIntoList({N: 10, BOARD: 'Ninjas', LIST: 'top scores'},
        {target: {lookupVariableByNameAndType: (name, type) => (name === 'top scores' && type === 'list' ? list : null)}});
    ok('top into a list fills the list', JSON.stringify(list.value) === '["1. you 70"]' && !list._monitorUpToDate);
    ok('the list menu offers the lists here', JSON.stringify(ext.listMenu()) === '["all time","top scores"]' &&
        JSON.stringify(listNames({})) === '[]');
    listeners.PROJECT_LOADED();
    await flush();
    ok('a new project loads again', contexts === 2);
    ext.dispose();
}

section('the VM runs the blocks in a project');
{
    const require = createRequire(import.meta.url);
    const VM = require('scratch-vm');
    const vmLog = require('scratch-vm/src/util/log.js');
    vmLog.warn = () => {};
    vmLog.info = () => {};
    const {store} = make();
    const Blocks = makeGameDataBlocks({store, resolve: () => ({projectId: 'p-vm', signedIn: false})});
    const vm = new VM();
    vm.extensionManager.addBuiltinExtension(GAME_DATA_ID, Blocks);
    vm.extensionManager.loadExtensionIdSync(GAME_DATA_ID);
    const blk = (opcode, extra) => Object.assign({opcode, next: null, parent: null, inputs: {}, fields: {},
        shadow: false, topLevel: false}, extra);
    const project = {
        targets: [
            {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
                currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0},
            {isStage: false, name: 'Ninja', variables: {v: ['shown', '']}, lists: {}, broadcasts: {}, comments: {},
                currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true, x: 0, y: 0,
                size: 100, direction: 90, draggable: false, rotationStyle: 'all around',
                blocks: {
                    h: blk('gamedata_whenReady', {topLevel: true, x: 0, y: 0, next: 's'}),
                    s: blk('gamedata_save', {parent: 'h', next: 'r', inputs: {NAME: [1, [10, 'level']], VALUE: [1, [10, '10']]}}),
                    r: blk('data_setvariableto', {parent: 's', fields: {VARIABLE: ['shown', 'v']},
                        inputs: {VALUE: [3, 'g', [10, '']]}}),
                    g: blk('gamedata_saved', {parent: 'r', inputs: {NAME: [1, [10, 'level']]}})
                }}
        ],
        monitors: [],
        extensions: ['gamedata'],
        meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
    };
    await vm.loadProject(JSON.stringify(project));
    vm.runtime.emit('PROJECT_LOADED');
    await flush();
    for (let i = 0; i < 4; i++) vm.runtime._step();
    const ninja = vm.runtime.targets.find(t => t.isOriginal && t.getName() === 'Ninja');
    ok('when saves are ready runs save and saved', Number(ninja.lookupVariableById('v').value) === 10,
        ninja.lookupVariableById('v').value);
    const saved = JSON.parse(vm.toJSON());
    ok('the project names the extension once it uses it', saved.extensions.includes('gamedata'));
}

done();
