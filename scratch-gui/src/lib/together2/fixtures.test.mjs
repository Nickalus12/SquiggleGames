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
    ok('the player mark carries v 1', JSON.stringify(project.targets.find(t => t.name === 'Player').extensionStorage.together) ===
        '{"role":"player","v":1}');
    ok('the rules sprite holds blocks, so the game is authoritative', opcodes(rules).includes('together_ruleWhenPlayerSends'));
    ok('the player sprite is the one that streams', findPlayerSprite(asRuntime(project)).name === 'Player');
}

done();
