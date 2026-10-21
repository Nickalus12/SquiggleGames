process.removeAllListeners('warning');

import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const IntlMessageFormat = require('intl-messageformat');
const {
    KIND_ORDER, readableProccode, insertDom, buildItems, groupResults, isPaletteKey,
    commandItems, checkerItems, myBlockItems, variableItems, spriteItems, worldItems, peerItems, blockItems
} = await import('./sources.js');
const {prepare, search} = await import('./fuzzy.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

const intl = {
    formatMessage: (descriptor, values) => new IntlMessageFormat(descriptor.defaultMessage, 'en').format(values)
};

const calls = [];
const log = name => (...args) => calls.push([name].concat(args));

const target = (id, name, extra) => Object.assign({
    id,
    isOriginal: true,
    isStage: false,
    getName: () => name,
    getCostumes: () => [{name: `${name} pose`}],
    getSounds: () => [{name: `${name} meow`}],
    setCostume: log(`costume:${id}`),
    blocks: {_blocks: {}}
}, extra || {});

const makeBlock = (props, workspace) => {
    const block = Object.assign({
        type: 'motion_movesteps',
        x: 0,
        y: 0,
        workspace,
        previousConnection: {},
        nextConnection: null,
        isShadow: () => false,
        getRelativeToSurfaceXY () {
            return {x: this.x, y: this.y};
        },
        moveBy (dx, dy) {
            this.x += dx;
            this.y += dy;
        },
        select () {
            calls.push(['select', this.type]);
        },
        toString: () => 'move (10) steps'
    }, props);
    return block;
};

const makeScratchBlocks = workspace => {
    const SB = {
        selected: null,
        groups: [],
        Events: {setGroup: on => SB.groups.push(on)},
        Xml: {
            textToDom: text => ({firstChild: {text}}),
            blockToDom: (block, flag) => ({fromBlock: block.type, flag}),
            domToBlock: dom => {
                const block = makeBlock({type: dom.fromBlock || 'parsed', dom}, workspace);
                SB.made = block;
                return block;
            }
        }
    };
    return SB;
};

const makeWorkspace = () => {
    const workspace = {
        scale: 2,
        options: {zoomOptions: {startScale: 0.675}},
        getMetrics: () => ({viewLeft: 100, viewTop: 40, viewWidth: 400, viewHeight: 200}),
        getAllVariables: () => [
            {type: '', name: 'score', getId: () => 'v1'},
            {type: 'list', name: 'items <&>', getId: () => 'v"2'},
            {type: 'broadcast_msg', name: 'go', getId: () => 'b1'}
        ],
        cleanUp: log('cleanUp'),
        undo: log('undo'),
        zoomCenter: log('zoomCenter'),
        setScale: log('setScale')
    };
    const flyoutBlocks = [
        makeBlock({type: 'motion_movesteps'}, null),
        makeBlock({type: 'motion_movesteps'}, null),
        makeBlock({type: 'looks_say', toString: () => 'say (Hello!)'}, null),
        makeBlock({type: 'math_number', isShadow: () => true}, null)
    ];
    workspace.getFlyout = () => ({getWorkspace: () => ({getTopBlocks: () => flyoutBlocks})});
    return workspace;
};

const makeEnv = overrides => {
    const workspace = makeWorkspace();
    const cat = target('t1', 'Cat', {
        blocks: {_blocks: {
            p1: {id: 'p1', opcode: 'procedures_prototype', parent: 'd1', mutation: {proccode: 'jump %n  high %b'}},
            p2: {id: 'p2', opcode: 'procedures_prototype', parent: null, mutation: {proccode: 'orphan'}},
            x1: {id: 'x1', opcode: 'motion_movesteps'}
        }}
    });
    const stage = target('s', 'Stage', {isStage: true});
    const clone = target('c', 'Cat', {isOriginal: false});
    const vm = {
        editingTarget: cat,
        runtime: {targets: [stage, cat, clone], turboMode: false},
        greenFlag: log('greenFlag'),
        stopAll: log('stopAll'),
        setTurboMode: log('turbo'),
        setEditingTarget: log('setEditingTarget')
    };
    return Object.assign({
        vm,
        workspace,
        ScratchBlocks: makeScratchBlocks(workspace),
        win: {},
        intl,
        checkerItems: [],
        targetName: id => (id === 't1' ? 'Cat' : ''),
        showMe: log('showMe'),
        reveal: log('reveal'),
        follow: null,
        actions: {
            openChecker: log('openChecker'),
            toggleFocus: log('toggleFocus'),
            showTab: log('showTab')
        }
    }, overrides || {});
};

const last = () => calls[calls.length - 1];

console.log('readableProccode');
ok('fills inputs and collapses spaces', readableProccode('jump %n  high %b of %s') === 'jump () high <> of ()');
ok('handles empty', readableProccode(null) === '');

console.log('isPaletteKey');
ok('ctrl k', isPaletteKey({ctrlKey: true, key: 'k'}));
ok('cmd K', isPaletteKey({metaKey: true, key: 'K'}));
ok('plain k is not', !isPaletteKey({key: 'k'}));
ok('ctrl shift k is not', !isPaletteKey({ctrlKey: true, shiftKey: true, key: 'K'}));
ok('ctrl alt k is not', !isPaletteKey({ctrlKey: true, altKey: true, key: 'k'}));

console.log('commandItems');
{
    const env = makeEnv();
    const items = commandItems(env);
    const ids = items.map(entry => entry.id);
    ok('has the flag and zoom commands', ids.includes('command:greenFlag') && ids.includes('command:zoomReset'));
    ok('labels come from messages', items.find(entry => entry.id === 'command:stop').label === 'Stop');
    items.find(entry => entry.id === 'command:greenFlag').run();
    ok('flag runs vm.greenFlag', last()[0] === 'greenFlag');
    items.find(entry => entry.id === 'command:redo').run();
    ok('redo calls undo(true)', last()[0] === 'undo' && last()[1] === true);
    items.find(entry => entry.id === 'command:zoomReset').run();
    ok('zoom reset uses start scale', last()[0] === 'setScale' && last()[1] === 0.675);
    items.find(entry => entry.id === 'command:costumesTab').run();
    ok('costumes tab', last()[0] === 'showTab' && last()[1] === 'costumes');
    items.find(entry => entry.id === 'command:turbo').run();
    ok('turbo flips', last()[0] === 'turbo' && last()[1] === true);
    const bare = commandItems(makeEnv({workspace: null}));
    ok('no workspace drops workspace commands', !bare.some(entry => entry.id === 'command:cleanUp'));
    ok('no workspace keeps the flag', bare.some(entry => entry.id === 'command:greenFlag'));
}

console.log('checkerItems');
{
    const entry = {key: 'k1', rule: 'messages', code: 'message-not-received', values: {message: 'go'},
        severity: 'warn', targetId: 't1'};
    const items = checkerItems(makeEnv({checkerItems: [entry]}));
    ok('one item', items.length === 1 && items[0].id === 'checker:k1');
    ok('label is the checker text', typeof items[0].label === 'string' && items[0].label.includes('go'), items[0].label);
    ok('detail is the target name', items[0].detail === 'Cat');
    ok('severity carried', items[0].severity === 'warn');
    items[0].run();
    ok('run shows the item', last()[0] === 'showMe' && last()[1] === entry);
}

console.log('blockItems');
{
    const env = makeEnv();
    const items = blockItems(env);
    ok('dedupes and skips shadows', items.length === 2, items.map(entry => entry.label));
    ok('label from toString', items[0].label === 'move (10) steps');
    ok('category keyword', items[0].keywords[0] === 'motion');
    items[1].run();
    ok('insert builds dom from the flyout block', env.ScratchBlocks.made.type === 'looks_say');
    ok('no flyout gives nothing', blockItems(makeEnv({workspace: {getFlyout: () => null}})).length === 0);
}

console.log('insertDom');
{
    const env = makeEnv();
    const SB = env.ScratchBlocks;
    insertDom(env, {fromBlock: 'looks_say'});
    ok('placed at view centre in workspace units', SB.made.x === 150 && SB.made.y === 70, [SB.made.x, SB.made.y]);
    ok('event group opened and closed', SB.groups.join() === 'true,false');
    ok('new block selected', last()[0] === 'select' && last()[1] === 'looks_say');

    let connected = null;
    SB.selected = makeBlock({
        workspace: env.workspace,
        nextConnection: {isConnected: () => false, connect: other => {
            connected = other;
        }}
    }, env.workspace);
    insertDom(env, {fromBlock: 'looks_think'});
    ok('attaches under a free selected block', connected === SB.made.previousConnection && SB.made.x === 0);

    SB.selected = makeBlock({
        workspace: env.workspace,
        nextConnection: {isConnected: () => true, connect: () => {
            connected = 'wrong';
        }}
    }, env.workspace);
    insertDom(env, {fromBlock: 'looks_think'});
    ok('busy selection falls back to centre', connected !== 'wrong' && SB.made.x === 150);

    SB.selected = makeBlock({workspace: {}, nextConnection: {isConnected: () => false, connect: () => {
        connected = 'other';
    }}}, {});
    insertDom(env, {fromBlock: 'looks_think'});
    ok('selection on another workspace is ignored', connected !== 'other');

    const failing = makeEnv();
    failing.ScratchBlocks.Xml.domToBlock = () => {
        throw new Error('bad');
    };
    let threw = false;
    try {
        insertDom(failing, {});
    } catch (e) {
        threw = true;
    }
    ok('group closes when parsing throws', threw && failing.ScratchBlocks.groups.join() === 'true,false');
    ok('no workspace returns false', insertDom(makeEnv({workspace: null}), {}) === false);
}

console.log('myBlockItems');
{
    const items = myBlockItems(makeEnv());
    ok('only defined prototypes', items.length === 1 && items[0].id === 'myblock:p1');
    ok('readable label', items[0].label === 'jump () high <>');
    items[0].run();
    ok('reveals the definition', last()[0] === 'reveal' && last()[1] === 'd1');
}

console.log('variableItems');
{
    const env = makeEnv();
    const items = variableItems(env);
    ok('variables and lists only', items.length === 2);
    ok('list keyword', items[1].keywords[0] === 'list');
    items[1].run();
    const xml = env.ScratchBlocks.made.dom.text;
    ok('list xml escaped', xml.includes('data_listcontents') && xml.includes('items &lt;&amp;&gt;') &&
        xml.includes('id="v&quot;2"'), xml);
    items[0].run();
    ok('variable xml', env.ScratchBlocks.made.dom.text.includes('<block type="data_variable"><field name="VARIABLE" id="v1"'));
}

console.log('spriteItems');
{
    const items = spriteItems(makeEnv());
    ok('originals only', items.length === 2);
    ok('stage is named Stage', items[0].label === 'Stage');
    items[1].run();
    ok('switches sprite', last()[0] === 'setEditingTarget' && last()[1] === 't1');
}

console.log('worldItems and peerItems');
{
    ok('no seam, no world items', worldItems(makeEnv()).length === 0);
    ok('seam without show functions gives nothing', worldItems(makeEnv({win: {SquiggleWorld: {scenes: () => ['A']}}})).length === 0);
    const seam = {
        scenes: () => ['Forest'],
        levels: () => [{id: 'l1', name: 'Cave'}],
        showScene: log('showScene'),
        showLevel: log('showLevel')
    };
    const items = worldItems(makeEnv({win: {SquiggleWorld: seam}}));
    ok('scene and level', items.length === 2 && items[0].kind === 'scene' && items[1].kind === 'level');
    items[1].run();
    ok('shows level by id', last()[0] === 'showLevel' && last()[1] === 'l1');
    const throwing = worldItems(makeEnv({win: {SquiggleWorld: {scenes: () => {
        throw new Error('x');
    }, showScene: () => {}}}}));
    ok('throwing seam is ignored', throwing.length === 0);

    const net = {SquiggleNet: {peers: ['Robin', 'Sky']}};
    ok('no follow, no peers', peerItems(makeEnv({win: net})).length === 0);
    const peers = peerItems(makeEnv({win: net, follow: log('follow')}));
    ok('peers with follow', peers.length === 2);
    peers[1].run();
    ok('follow by name', last()[0] === 'follow' && last()[1] === 'Sky');
}

console.log('buildItems');
{
    const env = makeEnv({checkerItems: [{key: 'k', code: 'loose-blocks', values: {count: 2, sprite: 'Cat'}, severity: 'info'}]});
    const items = buildItems(env);
    const kinds = new Set(items.map(entry => entry.kind));
    ok('covers the kinds', ['command', 'checker', 'block', 'myblock', 'variable', 'sprite', 'costume', 'sound']
        .every(kind => kinds.has(kind)), [...kinds]);
    ok('boosts commands', items.find(entry => entry.kind === 'command').boost === 3);
    ok('blocks unboosted', items.find(entry => entry.kind === 'block').boost === 0);
    ok('costume boost defaults to 0', items.find(entry => entry.kind === 'costume').boost === 0);
    ok('ids unique', new Set(items.map(entry => entry.id)).size === items.length);
    const broken = makeEnv();
    broken.vm.runtime.targets = null;
    const survived = buildItems(broken);
    ok('a failing source drops only itself', !survived.some(entry => entry.kind === 'sprite') &&
        survived.some(entry => entry.kind === 'command'));
    ok('every kind is ordered', [...kinds].every(kind => KIND_ORDER.includes(kind)));

    const found = search(prepare(items), 'say', 10);
    ok('search finds the say block', found.some(entry => entry.id.startsWith('block:looks_say')));
    const flag = search(prepare(items), 'flag', 10);
    ok('command ranks first for flag', flag[0].id === 'command:greenFlag', flag.map(entry => entry.id));
    const tidy = search(prepare(items), 'tidy', 10);
    ok('keywords match', tidy[0] && tidy[0].id === 'command:cleanUp');
}

console.log('groupResults');
{
    const groups = groupResults([
        {id: 'a', kind: 'block'}, {id: 'b', kind: 'command'}, {id: 'c', kind: 'block'}
    ]);
    ok('groups in first-seen order', groups.map(group => group.kind).join() === 'block,command');
    ok('keeps item order within a group', groups[0].items.map(entry => entry.id).join() === 'a,c');
    ok('empty input', groupResults([]).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
