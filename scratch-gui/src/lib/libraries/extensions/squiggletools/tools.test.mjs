process.removeAllListeners('warning');

const {default: SquiggleToolsBlocks, clamp, wrap, directionBetween, THREAD_DATA} = await import('./index.js');
const {getKit, builtinKits} = await import('../../../kits/registry.js');
const {KIT_COLORS} = await import('../../../themes/tokens.js');

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
const near = (a, b) => Math.abs(a - b) < 1e-9;
const section = name => console.log(`\n${name}`);

const makeStage = names => {
    const variables = {};
    names.forEach((name, i) => {
        variables[`b${i}`] = {id: `b${i}`, name, type: 'broadcast_msg'};
    });
    variables.v0 = {id: 'v0', name: 'score', type: ''};
    return {isStage: true, x: 0, y: 0, variables};
};

const makeRuntime = names => {
    const stage = makeStage(names || []);
    const hats = [];
    return {
        hats,
        stage,
        getTargetForStage: () => stage,
        startHats (opcode, fields) {
            const thread = {opcode, fields};
            hats.push(thread);
            return [thread, {opcode, fields, second: true}];
        }
    };
};

const makeSprite = (x, y, direction) => ({
    isStage: false,
    x,
    y,
    direction: typeof direction === 'number' ? direction : 90,
    setXY (nx, ny) {
        this.x = nx;
        this.y = ny;
    }
});

const makeUtil = (runtime, target, thread) => ({
    target,
    thread: thread || {},
    startHats: (opcode, fields) => runtime.startHats(opcode, fields)
});

section('registration');
{
    const kit = getKit('squiggletools');
    ok('registered with registerKit', !!kit && kit.extension === SquiggleToolsBlocks);
    ok('reserved name and colour kept', kit.name === 'Game Tools' && kit.color === KIT_COLORS.squiggletools.color1);
    ok('not a Together expansion', kit.togetherRequired === false);
    ok('listed as a builtin kit', builtinKits().some(entry => entry.id === 'squiggletools'));
    const info = new SquiggleToolsBlocks(makeRuntime()).getInfo();
    ok('getInfo id is squiggletools', info.id === 'squiggletools');
    ok('colours come from the shell theme', info.color1 === KIT_COLORS.squiggletools.color1 &&
        info.color2 === KIT_COLORS.squiggletools.color2 && info.color3 === KIT_COLORS.squiggletools.color3);
    const opcodes = info.blocks.filter(block => typeof block === 'object').map(block => block.opcode);
    ok('eight blocks in design order', JSON.stringify(opcodes) === JSON.stringify([
        'moveToward', 'distanceTo', 'directionTo', 'clamp', 'wrap', 'chance', 'broadcastWithData', 'broadcastData'
    ]), opcodes);
    ok('every opcode has a method', opcodes.every(op => typeof SquiggleToolsBlocks.prototype[op] === 'function'));
    ok('chance is a boolean', info.blocks.find(block => block.opcode === 'chance').blockType === 'Boolean');
    ok('no block is async or a hat', info.blocks.every(block => typeof block !== 'object' ||
        (block.blockType !== 'hat' && !block.isEdgeActivated)));
}

section('movement and geometry');
{
    const tools = new SquiggleToolsBlocks(makeRuntime());
    const sprite = makeSprite(0, 0);
    tools.moveToward({N: 5, X: 30, Y: 40}, makeUtil(null, sprite));
    ok('moves N steps along the line', near(sprite.x, 3) && near(sprite.y, 4), [sprite.x, sprite.y]);
    tools.moveToward({N: 500, X: 30, Y: 40}, makeUtil(null, sprite));
    ok('never overshoots the point', sprite.x === 30 && sprite.y === 40, [sprite.x, sprite.y]);
    tools.moveToward({N: 10, X: 30, Y: 40}, makeUtil(null, sprite));
    ok('standing on the point stays put', sprite.x === 30 && sprite.y === 40);
    const away = makeSprite(3, 4);
    tools.moveToward({N: -5, X: 0, Y: 0}, makeUtil(null, away));
    ok('negative steps move away', near(away.x, 6) && near(away.y, 8), [away.x, away.y]);
    tools.moveToward({N: 'abc', X: 0, Y: 0}, makeUtil(null, away));
    ok('text steps count as zero', near(away.x, 6) && near(away.y, 8));
    ok('distance to x y', tools.distanceTo({X: 3, Y: 4}, makeUtil(null, makeSprite(0, 0))) === 5);
    ok('direction up is 0', near(tools.directionTo({X: 0, Y: 10}, makeUtil(null, makeSprite(0, 0))), 0));
    ok('direction right is 90', near(tools.directionTo({X: 10, Y: 0}, makeUtil(null, makeSprite(0, 0))), 90));
    ok('direction left is -90', near(tools.directionTo({X: -10, Y: 0}, makeUtil(null, makeSprite(0, 0))), -90));
    ok('direction down is 180', near(directionBetween(0, 0, 0, -10), 180));
    const still = tools.directionTo({X: 2, Y: 2}, makeUtil(null, makeSprite(2, 2, 45)));
    ok('same point keeps the sprite direction', still === 45);
}

section('clamp, wrap, chance');
{
    ok('clamp inside', clamp(5, 0, 10) === 5);
    ok('clamp low and high', clamp(-3, 0, 10) === 0 && clamp(30, 0, 10) === 10);
    ok('clamp with swapped bounds', clamp(30, 10, 0) === 10);
    ok('integer wrap is inclusive like costume numbers',
        wrap(6, 1, 5) === 1 && wrap(0, 1, 5) === 5 && wrap(5, 1, 5) === 5);
    ok('integer wrap far out', wrap(-11, -10, 6) === 6 && wrap(7, 1, 5) === 2);
    ok('decimal wrap is half open', near(wrap(370.5, 0, 360), 10.5) && near(wrap(-0.5, 0, 360), 359.5));
    ok('equal bounds give that bound', wrap(42, 3, 3) === 3);
    const tools = new SquiggleToolsBlocks(makeRuntime());
    ok('0 % never', Array.from({length: 200}).every(() => tools.chance({P: 0}) === false));
    ok('100 % always', Array.from({length: 200}).every(() => tools.chance({P: 100}) === true));
    const real = Math.random;
    Math.random = () => 0.49;
    const hit = tools.chance({P: 50});
    Math.random = () => 0.5;
    const miss = tools.chance({P: 50});
    Math.random = real;
    ok('50 % compares against the roll', hit === true && miss === false);
}

section('broadcast with data');
{
    const runtime = makeRuntime(['win', 'go']);
    const tools = new SquiggleToolsBlocks(runtime);
    const caller = {};
    tools.broadcastWithData({MESSAGE: 'win', DATA: 42}, makeUtil(runtime, makeSprite(0, 0), caller));
    ok('starts the core when I receive hat', runtime.hats.length === 1 &&
        runtime.hats[0].opcode === 'event_whenbroadcastreceived' &&
        runtime.hats[0].fields.BROADCAST_OPTION === 'win', runtime.hats);
    ok('every started thread carries the data as text', runtime.hats[0][THREAD_DATA] === '42');
    ok('the calling thread is not tagged', !(THREAD_DATA in caller));
    const started = runtime.hats[0];
    ok('broadcast data reads its own thread', tools.broadcastData({}, {thread: started}) === '42');
    tools.broadcastWithData({MESSAGE: 'go', DATA: 'second'}, makeUtil(runtime, makeSprite(0, 0)));
    ok('two broadcasts in one frame keep their own data', tools.broadcastData({}, {thread: started}) === '42' &&
        tools.broadcastData({}, {thread: runtime.hats[1]}) === 'second');
    ok('a plain broadcast thread reads empty', tools.broadcastData({}, {thread: {}}) === '');
    ok('no thread reads empty', tools.broadcastData({}, {}) === '' && tools.broadcastData({}) === '');
    tools.broadcastWithData({MESSAGE: '', DATA: 'x'}, makeUtil(runtime, makeSprite(0, 0)));
    ok('an empty message starts nothing', runtime.hats.length === 2);
    const quiet = {startHats: () => null, target: makeSprite(0, 0)};
    let threw = false;
    try {
        tools.broadcastWithData({MESSAGE: 'win', DATA: 'x'}, quiet);
    } catch (e) {
        threw = true;
    }
    ok('a runtime that starts no threads is fine', !threw);
    ok('message menu lists stage broadcasts sorted',
        JSON.stringify(tools.messageMenu()) === JSON.stringify(['go', 'win']));
    ok('default message is the first broadcast', tools.firstMessage() === 'go');
    const empty = new SquiggleToolsBlocks(makeRuntime());
    ok('a project with no broadcasts offers message1', JSON.stringify(empty.messageMenu()) === '["message1"]');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
