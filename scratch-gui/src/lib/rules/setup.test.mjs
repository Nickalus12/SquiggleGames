import './json-hook.mjs';
import {createRequire} from 'node:module';

process.removeAllListeners('warning');

const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const vmLog = require('scratch-vm/src/util/log.js');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {IntlProvider} = require('react-intl');

vmLog.warn = () => {};
vmLog.info = () => {};

const {installProjectSeam, RULES_KEY} = await import('../collab/project-seam.js');
const {installRulesGuard} = await import('./guard.js');
const {LIMITS, fromMark, normalizeSetup, readSetup, setupVariables, writeSetup} = await import('./setup-model.js');
const {openGameSetup} = await import('./open-setup.js');
const {OPCODE_SET} = await import('./package.js');
const {KIT_SET_EVENT} = await import('../collab/kit-set.js');
const {OPEN_SETUP_FUNC, OPEN_RULES_FUNC} = await import('./rule-blocks.js');
const {filterCategory, MODE_RULES, MODE_DEVICE} = await import('./toolbox-mode.js');
const {SetupHost} = await import('./mount-setup.jsx');
const TogetherBlocks = (await import('../libraries/extensions/together/index.js')).default;

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${typeof detail === 'undefined' ? '' : ` : ${JSON.stringify(detail)}`}`);
    }
};
const section = name => console.log(`\n${name}`);

section('normalizeSetup');
{
    const empty = normalizeSetup(null);
    ok('an empty mark gives empty lists',
        JSON.stringify(empty) === JSON.stringify({secret: [], saved: [], players: [], teams: [], boards: [], player: ''}), empty);

    const many = Array.from({length: 40}, (unused, i) => ({name: `v${i}`}));
    const clean = normalizeSetup({
        secret: ['a', 'a', 'gone', 7],
        saved: ['b'],
        players: [
            {name: '  coins  ', default: '5', see: 'self', save: 1},
            {name: 'COINS', default: 1},
            {name: '', default: 2},
            {name: 'tag', default: 'it', see: 'nobody'}
        ].concat(many),
        teams: ['Red', 'red', 'Blue', '', 'Green', 'Gold', 'Pink'],
        boards: [{name: 'Best time', order: 'low', keep: 'best'}, {name: 'Laps', order: 'sideways', keep: 'x'}]
    }, [{id: 'a'}, {id: 'b'}]);
    ok('secret ids are unique and must exist', JSON.stringify(clean.secret) === '["a"]', clean.secret);
    ok('saved ids are kept', JSON.stringify(clean.saved) === '["b"]');
    ok('player names are trimmed', clean.players[0].name === 'coins', clean.players[0]);
    ok('a numeric start becomes a number', clean.players[0].default === 5);
    ok('save becomes a boolean', clean.players[0].save === true);
    ok('a name repeated in another case is dropped', !clean.players.some(p => p.name === 'COINS'));
    ok('a blank name is dropped', !clean.players.some(p => p.name === ''));
    ok('a text start stays text', clean.players[1].default === 'it', clean.players[1]);
    ok('an unknown see falls back to all', clean.players[1].see === 'all');
    ok('player values stop at the limit', clean.players.length === LIMITS.players, clean.players.length);
    ok('teams are unique and stop at 4', JSON.stringify(clean.teams) === '["Red","Blue","Green","Gold"]', clean.teams);
    ok('a board keeps its order and keep', clean.boards[0].order === 'low' && clean.boards[0].keep === 'best');
    ok('bad board options fall back', clean.boards[1].order === 'high' && clean.boards[1].keep === 'best');
    ok('long names are cut', normalizeSetup({teams: ['x'.repeat(99)]}).teams[0].length === LIMITS.name);
}

section('sheet render');
{
    const html = renderToStaticMarkup(React.createElement(IntlProvider, {locale: 'en'},
        React.createElement(SetupHost, {
            setup: normalizeSetup({
                secret: ['v1'],
                players: [{name: 'coins', default: 3, see: 'self', save: true}],
                teams: ['Red'],
                boards: [{name: 'Best time', order: 'low', keep: 'last'}]
            }),
            variables: [{id: 'v1', name: 'score', kind: 'variable'}, {id: 'l1', name: 'deck', kind: 'list'}],
            onDone: () => {}
        })));
    ok('the sheet is a labelled modal dialog',
        html.includes('role="dialog"') && html.includes('aria-modal="true"') &&
        html.includes('aria-labelledby="sq-game-setup-title"'));
    ok('it has the title', html.includes('Game setup'));
    ok('each game value is listed', html.includes('score') && html.includes('deck'));
    ok('a secret value starts checked', /data-id="v1" data-section="secret"[^>]*checked|checked=""[^>]*data-id="v1" data-section="secret"/.test(html));
    ok('the player value row is filled', html.includes('value="coins"') && html.includes('value="3"'));
    ok('the team row is filled', html.includes('value="Red"'));
    ok('the board row is filled', html.includes('value="Best time"'));
    ok('the counts show the limits', html.includes(`1 of ${LIMITS.players}`) && html.includes(`1 of ${LIMITS.teams}`));
    ok('the saves note is shown', html.includes('Test games in a room forget saves when they end.'));
    ok('every input has a label', !/<input(?![^>]*(aria-label|type="checkbox"))[^>]*>/.test(html));

    const none = renderToStaticMarkup(React.createElement(IntlProvider, {locale: 'en'},
        React.createElement(SetupHost, {setup: null, variables: [], onDone: () => {}})));
    ok('with no variables it says how to add one', none.includes('Make a variable or list in Game Rules'));
}

section('toolbox');
{
    const category = {
        id: 'together',
        xml: '<category name="Together" id="together"><label text="Game Rules"/>' +
            `<button text="Open Game Rules" callbackKey="EXTENSION_BUTTON" callbackData="together_${OPEN_RULES_FUNC}"/>` +
            `<button text="Game setup" callbackKey="EXTENSION_BUTTON" callbackData="together_${OPEN_SETUP_FUNC}"/>` +
            '<block type="together_ruleWhenGameStarts"/><block type="together_tellGame"/></category>'
    };
    const rules = filterCategory(category, MODE_RULES);
    const device = filterCategory(category, MODE_DEVICE);
    ok('the rules sprite gets the Game setup button', rules.xml.includes(OPEN_SETUP_FUNC), rules.xml);
    ok('a device sprite does not', !device.xml.includes(OPEN_SETUP_FUNC), device.xml);

    const ext = new TogetherBlocks({on () {}, off () {}});
    const info = ext.getInfo();
    ok('Together offers the Game setup button',
        info.blocks.some(block => block && block.blockType === 'button' && block.func === OPEN_SETUP_FUNC));
    ok('the button has a method', typeof ext[OPEN_SETUP_FUNC] === 'function');
}

section('openGameSetup');
{
    const vm = new VM();
    installProjectSeam(vm);
    installRulesGuard(vm);
    await vm.loadProject(JSON.stringify({
        targets: [{
            isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0
        }],
        monitors: [],
        extensions: [],
        meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
    }));
    let changed = 0;
    vm.runtime.on('PROJECT_CHANGED', () => changed++);

    const seen = [];
    const answer = setup => () => Promise.resolve(props => {
        seen.push(props);
        return Promise.resolve(setup);
    });
    const mark = await openGameSetup(vm, answer({teams: ['Red', 'Blue'], players: [{name: 'coins', default: 0}]}));
    const target = vm.runtime.targets.find(t => t.extensionStorage && t.extensionStorage[RULES_KEY]);
    ok('opening setup makes the rules sprite', !!target);
    ok('the editor switches to it', vm.editingTarget === target);
    ok('the sheet got the current setup', seen[0] && Array.isArray(seen[0].setup.teams) && seen[0].setup.teams.length === 0);
    ok('saving writes the mark', JSON.stringify(target.extensionStorage[RULES_KEY].teams) === '["Red","Blue"]',
        target.extensionStorage[RULES_KEY]);
    ok('the mark keeps its role and version', mark.role === 'rules' && mark.v === 1, mark);
    ok('saving marks the project changed', changed > 0, changed);

    target.createVariable('var-1', 'lives', '');
    target.createVariable('list-1', 'deck', 'list');
    ok('the sheet lists the sprite\'s variables and lists',
        JSON.stringify(setupVariables(target).map(v => v.kind)) === '["list","variable"]', setupVariables(target));

    const cancelled = await openGameSetup(vm, answer(null));
    ok('cancel writes nothing', cancelled === null &&
        JSON.stringify(target.extensionStorage[RULES_KEY].teams) === '["Red","Blue"]');
    ok('the second open read the saved setup', seen[1].setup.teams.length === 2 && seen[1].variables.length === 2);

    const first = openGameSetup(vm, answer(null));
    ok('a second click while open reuses the sheet', openGameSetup(vm, answer(null)) === first);
    await first;

    writeSetup(vm, target, {secret: ['var-1', 'nope'], saved: ['list-1']});
    const back = readSetup(target);
    ok('write keeps only ids the sprite has', JSON.stringify(back.secret) === '["var-1"]', back.secret);

    const saved = vm.toJSON();
    const vm2 = new VM();
    installProjectSeam(vm2);
    installRulesGuard(vm2);
    await vm2.loadProject(saved);
    const again = vm2.runtime.targets.find(t => t.extensionStorage && t.extensionStorage[RULES_KEY]);
    ok('the setup survives save and load',
        again && JSON.stringify(readSetup(again).saved) === '["list-1"]' &&
        JSON.stringify(again.extensionStorage[RULES_KEY].teams) === '[]', again && again.extensionStorage[RULES_KEY]);
}

section('the mark on the wire');
{
    const vm = new VM();
    installProjectSeam(vm);
    installRulesGuard(vm);
    const sprite = name => ({
        isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
        currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 1, visible: true,
        x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'
    });
    await vm.loadProject(JSON.stringify({
        targets: [{
            isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0
        }, sprite('Cat'), sprite('Hero')],
        monitors: [],
        extensions: [],
        meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
    }));
    const sets = [];
    vm.runtime.on(KIT_SET_EVENT, event => sets.push(event));
    const opened = [];
    const answer = setup => () => Promise.resolve(props => {
        opened.push(props);
        return Promise.resolve(setup);
    });
    const mark = await openGameSetup(vm, answer({
        players: [{name: 'coins', default: '3', see: 'self', save: true}],
        boards: [{name: 'Best', order: 'low', keep: 'last'}],
        player: 'Hero'
    }));
    ok('player values go out as playerValues {n, d, see, save}',
        JSON.stringify(mark.playerValues) === '[{"n":"coins","d":3,"see":"self","save":true}]', mark.playerValues);
    ok('boards go out as {n, order, keep}', JSON.stringify(mark.boards) === '[{"n":"Best","order":"low","keep":"last"}]',
        mark.boards);
    ok('the old players key is gone', !('players' in mark));
    ok('a setup written without blocks still carries the opcode set', mark.opcodeSet === OPCODE_SET, mark.opcodeSet);
    const rulesSprite = vm.runtime.targets.find(t => t.extensionStorage[RULES_KEY] &&
        t.extensionStorage[RULES_KEY].role === 'rules');
    rulesSprite.extensionStorage[RULES_KEY] = Object.assign({}, rulesSprite.extensionStorage[RULES_KEY],
        {opcodeSet: OPCODE_SET + 4});
    ok('a newer opcode set is never lowered',
        writeSetup(vm, rulesSprite, readSetup(rulesSprite, vm.runtime)).opcodeSet === OPCODE_SET + 4);
    ok('the sheet was offered the sprites but not Game Rules',
        JSON.stringify(opened[0].sprites) === '["Cat","Hero"]', opened[0].sprites);
    const byName = name => vm.runtime.targets.find(t => t.isOriginal && t.getName() === name);
    ok('the chosen sprite gets the player mark',
        JSON.stringify(byName('Hero').extensionStorage[RULES_KEY]) === '{"role":"player","v":1}');
    ok('the other sprite stays unmarked', !byName('Cat').extensionStorage[RULES_KEY]);
    ok('the player mark travels as kit-set', sets.some(e => e.target === byName('Hero') && e.path[0] === 'role'),
        sets.map(e => e.path));
    const rules = vm.runtime.targets.find(t => t.extensionStorage[RULES_KEY] && t.extensionStorage[RULES_KEY].role === 'rules');
    const back = readSetup(rules, vm.runtime);
    ok('reading turns the wire shape back into the sheet\'s', back.players[0].name === 'coins' &&
        back.boards[0].name === 'Best' && back.player === 'Hero', back);

    await openGameSetup(vm, answer(Object.assign({}, back, {player: 'Cat'})));
    ok('choosing another sprite moves the mark', !byName('Hero').extensionStorage[RULES_KEY] &&
        byName('Cat').extensionStorage[RULES_KEY].role === 'player');
    await openGameSetup(vm, answer(Object.assign({}, back, {player: 'Nobody'})));
    ok('an unknown sprite name clears the choice', !byName('Cat').extensionStorage[RULES_KEY]);

    const legacy = fromMark({role: 'rules', v: 1, players: [{name: 'old', default: 1}]});
    ok('a mark saved before playerValues still reads', legacy.players[0].name === 'old');
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
