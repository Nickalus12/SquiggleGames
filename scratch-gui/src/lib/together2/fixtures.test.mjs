process.removeAllListeners('warning');

const fs = await import('fs');
const JSZip = (await import('jszip')).default;
const {ok, section, done} = await import('./harness.test-util.mjs');
const {findPlayerSprite} = await import('./session.js');

const load = async name => {
    const zip = await JSZip.loadAsync(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
    const project = JSON.parse(await zip.file('project.json').async('string'));
    const missing = project.targets.flatMap(t => t.costumes.map(c => c.md5ext))
        .filter(md5ext => !zip.file(md5ext));
    return {project, missing};
};

const opcodes = target => Object.values(target.blocks).map(b => b.opcode);
const asRuntime = project => ({targets: project.targets.map(t => Object.assign({isOriginal: true}, t))});

section('the 1.8 relay project');
{
    const {project, missing} = await load('relay-1.8.sb3');
    const ball = project.targets.find(t => t.name === 'Ball');
    ok('every costume ships in the zip', missing.length === 0, missing);
    ok('it uses the 1.8 send and receive blocks', ['together_broadcastGameMessage', 'together_whenGameMessage']
        .every(op => opcodes(ball).includes(op)));
    ok('it has no Game Rules sprite, so it stays relay', project.targets.every(t => !t.extensionStorage));
}

section('the rules game project');
{
    const {project, missing} = await load('rules-game.sb3');
    const rules = project.targets.find(t => t.name === 'Game Rules');
    ok('every costume ships in the zip', missing.length === 0, missing);
    ok('the rules sprite carries the mark', rules.extensionStorage.together.role === 'rules' &&
        rules.extensionStorage.together.opcodeSet === 1);
    ok('the mark is in the PROTOCOL shape', JSON.stringify(rules.extensionStorage.together.playerValues) ===
        '[{"n":"score","d":0,"see":"all","save":false}]' && !('players' in rules.extensionStorage.together));
    ok('the mark carries one team and one board', JSON.stringify(rules.extensionStorage.together.teams) === '["Red"]' &&
        JSON.stringify(rules.extensionStorage.together.boards) === '[{"n":"score","order":"high","keep":"best"}]',
    rules.extensionStorage.together);
    ok('the player mark carries v 1', JSON.stringify(project.targets.find(t => t.name === 'Player').extensionStorage.together) ===
        '{"role":"player","v":1}');
    ok('the rules sprite holds blocks, so the game is authoritative', opcodes(rules).includes('together_ruleWhenPlayerSends'));
    ok('the player sprite is the one that streams', findPlayerSprite(asRuntime(project)).name === 'Player');
}

section('the 1.8 relay project runs between two clients');
{
    await import('../rules/json-hook.mjs');
    const {createRequire} = await import('node:module');
    const require = createRequire(import.meta.url);
    const VM = require('scratch-vm');
    const vmLog = require('scratch-vm/src/util/log.js');
    vmLog.warn = () => {};
    vmLog.info = () => {};
    const TogetherBlocks = (await import('../libraries/extensions/together/index.js')).default;
    const bytes = fs.readFileSync(new URL('./fixtures/relay-1.8.sb3', import.meta.url));
    const wire = [];
    const nets = [];
    const makeNet = slot => {
        const handlers = {};
        return {
            slot,
            peers: [],
            playerName: `p${slot}`,
            connected: true,
            sharedVars: null,
            send (msg) {
                wire.push({from: slot, msg});
                nets.filter(net => net !== this).forEach(net => net.fire('game', Object.assign({from: `p${slot}`}, msg)));
            },
            on (type, cb) {
                (handlers[type] = handlers[type] || []).push(cb);
                return () => {};
            },
            fire (type, msg) {
                (handlers[type] || []).forEach(cb => cb(msg));
            }
        };
    };
    global.window = {addEventListener: () => {}, removeEventListener: () => {}, SquiggleNet: null};
    const clients = [];
    for (const slot of [1, 2]) {
        const net = makeNet(slot);
        nets.push(net);
        global.window.SquiggleNet = net;
        const vm = new VM();
        vm.extensionManager.addBuiltinExtension('together', TogetherBlocks);
        await vm.loadProject(bytes);
        clients.push({vm, net});
    }
    const step = frames => {
        for (let i = 0; i < frames; i++) {
            clients.forEach(({vm, net}) => {
                global.window.SquiggleNet = net;
                vm.runtime._step();
            });
        }
    };
    const said = ({vm}) => {
        const ball = vm.runtime.targets.find(t => t.isOriginal && t.getName() === 'Ball');
        const bubble = ball.getCustomState('Scratch.looks');
        return bubble ? String(bubble.text) : '';
    };
    const [a, b] = clients;
    a.vm.postIOData('keyboard', {key: 'ArrowRight', isDown: true});
    step(1);
    a.vm.postIOData('keyboard', {key: 'ArrowRight', isDown: false});
    step(5);
    const sent = wire.filter(entry => entry.from === 1 && entry.msg.type === 'game');
    ok('the key press sends one game message', sent.length === 1 && sent[0].msg.action === 'msg' &&
        sent[0].msg.name === 'x' && String(sent[0].msg.value) === '10', wire);
    ok('the other client hears it and says the value', said(b) === '10', said(b));
    ok('the sender hears its own message too', said(a) === '10', said(a));
    ok('only the sender moved', a.vm.runtime.targets.find(t => t.getName() === 'Ball').x === 10 &&
        b.vm.runtime.targets.find(t => t.getName() === 'Ball').x === 0);
    ok('nothing comes back from the listener', wire.every(entry => entry.from === 1), wire);
    delete global.window;
}

done();
