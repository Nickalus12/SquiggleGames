import {harness} from './fixtures/load.mjs';

const {
    createFixer, copyStack, outOfRulesTarget, spotBelow, escapeXml, receiverXml, waitXml, GLOW_MS
} = await import('./fixes.js');
const {ok, done} = harness();

const makeWorld = () => {
    const log = [];
    const groups = [];
    let group = false;
    const blocks = new Map();
    const variables = new Set(['v1']);
    const block = (id, extra) => {
        const made = Object.assign({
            id,
            xy: {x: 0, y: 0},
            getRelativeToSurfaceXY () {
                return this.xy;
            },
            moveBy (dx, dy) {
                this.xy = {x: this.xy.x + dx, y: this.xy.y + dy};
            },
            dispose (heal) {
                log.push(['dispose', id, heal, group]);
                blocks.delete(id);
            },
            getParent: () => null,
            getNextBlock: () => null,
            inputList: [],
            getInput: () => null,
            outputConnection: null,
            previousConnection: {id},
            nextConnection: {connect: other => log.push(['connect', id, other.id, group])}
        }, extra);
        blocks.set(id, made);
        return made;
    };
    const workspace = {
        getBlockById: id => blocks.get(id) || null,
        getVariableById: id => (variables.has(id) ? {id} : null),
        deleteVariableById: id => {
            log.push(['deleteVariable', id]);
            variables.delete(id);
        },
        centerOnBlock: id => log.push(['center', id]),
        glowBlock: (id, on) => log.push(['glow', id, on]),
        cleanUp: () => log.push(['cleanUp']),
        getBlocksBoundingBox: () => ({x: 10, y: 20, width: 100, height: 200})
    };
    let made = 0;
    const ScratchBlocks = {
        Events: {setGroup: on => {
            group = on;
            groups.push(on);
        }},
        Xml: {
            textToDom: text => ({firstChild: {text}}),
            domToBlock: dom => {
                if (dom.saved) {
                    const restored = block(dom.id);
                    log.push(['restore', dom.id, dom.childNodes.map(child => child.nodeName).join(), group]);
                    return restored;
                }
                const created = block(`new${++made}`);
                log.push(['create', created.id, dom.text, group]);
                return created;
            },
            blockToDom: from => ({
                saved: true,
                id: from.id,
                childNodes: [{nodeName: 'value'}, {nodeName: 'NEXT'}],
                removeChild (child) {
                    this.childNodes = this.childNodes.filter(entry => entry !== child);
                }
            })
        }
    };
    const vmBlocks = (targetId, map) => ({
        _blocks: map,
        getScripts: () => Object.keys(map).filter(id => map[id].topLevel),
        getBlock: id => map[id],
        deleteBlock: id => {
            log.push(['deleteCopy', targetId, id]);
            delete map[id];
        }
    });
    const targets = {
        cat: {id: 'cat', blocks: vmBlocks('cat', {
            top: {id: 'top', opcode: 'together_setRule', next: 'n2', parent: null, inputs: {}, fields: {},
                topLevel: true, x: 5, y: 6},
            n2: {id: 'n2', opcode: 'motion_movesteps', next: null, parent: 'top', inputs: {}, fields: {}, topLevel: false},
            other: {id: 'other', opcode: 'motion_turnright', next: null, parent: null, inputs: {}, fields: {},
                topLevel: true}
        })},
        rules: {id: 'rules', isOriginal: true, blocks: vmBlocks('rules', {
            ruleHat: {id: 'ruleHat', opcode: 'together_ruleWhenGameStarts', next: 'say', parent: null, inputs: {},
                fields: {}, topLevel: true, x: 1, y: 2},
            say: {id: 'say', opcode: 'looks_say', next: 'tail', parent: 'ruleHat', inputs: {
                MESSAGE: {name: 'MESSAGE', block: 'text', shadow: 'text'}
            }, fields: {}, topLevel: false},
            text: {id: 'text', opcode: 'text', next: null, parent: 'say', inputs: {}, fields: {}, shadow: true,
                topLevel: false},
            tail: {id: 'tail', opcode: 'together_setRule', next: null, parent: 'say', inputs: {}, fields: {},
                topLevel: false}
        })},
        stage: {id: 'stage', isStage: true, blocks: vmBlocks('stage', {})}
    };
    targets.cat.isOriginal = true;
    const vm = {
        editingTarget: targets.stage,
        runtime: {
            getTargetById: id => targets[id] || null,
            targets: [targets.stage, targets.rules, targets.cat]
        },
        setEditingTarget: id => {
            log.push(['edit', id]);
            setImmediate(() => {
                vm.editingTarget = targets[id];
            });
        },
        shareBlocksToTarget: (list, to, from) => {
            shared.push(list);
            list.forEach(entry => {
                targets[to].blocks._blocks[`copy-${entry.id}`] = Object.assign({}, entry, {id: `copy-${entry.id}`});
            });
            log.push(['share', list.map(entry => entry.id), to, from]);
            return Promise.resolve();
        }
    };
    const timers = [];
    const shared = [];
    let clock = 0;
    const win = {SquiggleWorld: {createScene: name => log.push(['createScene', name])}};
    const fixer = createFixer({
        vm,
        win,
        getWorkspace: () => workspace,
        getScratchBlocks: () => ScratchBlocks,
        now: () => clock,
        nextFrame: fn => setImmediate(() => {
            clock += 16;
            fn();
        }),
        setTimer: (fn, ms) => timers.push({fn, ms})
    });
    return {log, groups, block, blocks, variables, vm, timers, fixer, win, shared, targets};
};

const has = (log, entry) => log.some(row => JSON.stringify(row) === JSON.stringify(entry));

let world = makeWorld();
world.block('b1');
let result = await world.fixer.showMe({targetId: 'cat', blockId: 'b1'});
ok('Show me switches sprite, centres and glows', result && has(world.log, ['edit', 'cat']) &&
    has(world.log, ['center', 'b1']) && has(world.log, ['glow', 'b1', true]));
ok('the glow turns off after a moment', world.timers.length === 1 && world.timers[0].ms === GLOW_MS &&
    (world.timers[0].fn(), has(world.log, ['glow', 'b1', false])));

world = makeWorld();
result = await world.fixer.showMe({targetId: 'cat', blockId: 'missing'});
ok('Show me gives up when the block never appears', result === false);
result = await world.fixer.showMe({targetId: 'ghost', blockId: 'b1'});
ok('Show me gives up when the sprite is gone', result === false);

world = makeWorld();
world.vm.editingTarget = world.vm.runtime.getTargetById('cat');
result = await world.fixer.applyFix({fix: 'add-receiver', fixData: {targetId: 'cat', name: 'win & <go>', broadcastId: 'b"1'}});
const created = world.log.find(row => row[0] === 'create');
ok('add a receiver builds the hat in one undo group', result && created && created[3] === true &&
    world.groups.join() === 'true,false');
ok('the receiver keeps the broadcast id and escapes the name', created[2].indexOf('id="b&quot;1"') !== -1 &&
    created[2].indexOf('win &amp; &lt;go&gt;') !== -1 && created[2].indexOf('event_whenbroadcastreceived') !== -1);
ok('the receiver lands below the scripts', world.blocks.get('new1').xy.x === 10 &&
    world.blocks.get('new1').xy.y === 268 && has(world.log, ['center', 'new1']));

world = makeWorld();
world.block('send');
result = await world.fixer.applyFix({fix: 'add-wait', fixData: {targetId: 'cat', afterBlockId: 'send', seconds: 0.1}});
ok('add wait builds a wait 0.1 and plugs it in after the send', result &&
    world.log.find(row => row[0] === 'create')[2].indexOf('<field name="NUM">0.1</field>') !== -1 &&
    has(world.log, ['connect', 'send', 'new1', true]));

world = makeWorld();
world.block('c1');
world.block('c2');
result = await world.fixer.applyFix({fix: 'remove-calls', fixData: {targetId: 'cat', blockIds: ['c1', 'c2']}});
ok('remove the calls heals the stacks in one group', result && has(world.log, ['dispose', 'c1', true, true]) &&
    has(world.log, ['dispose', 'c2', true, true]));

world = makeWorld();
world.block('loose');
world.block('loose2');
result = await world.fixer.applyFix({fix: 'delete-loose', fixData: {targetId: 'cat', blockIds: ['loose', 'loose2', 'gone']}});
ok('delete loose blocks disposes every stack whole in one group', result &&
    has(world.log, ['dispose', 'loose', false, true]) && has(world.log, ['dispose', 'loose2', false, true]) &&
    !has(world.log, ['cleanUp']) && world.groups.join() === 'true,false');

world = makeWorld();
world.block('snapped', {getParent: () => ({id: 'hat'})});
world.block('still');
result = await world.fixer.applyFix({fix: 'delete-loose', fixData: {targetId: 'cat', blockIds: ['snapped', 'still']}});
ok('a stack snapped into a script since the check is left alone', result &&
    !world.log.some(row => row[0] === 'dispose' && row[1] === 'snapped') && has(world.log, ['dispose', 'still', false, true]));

world = makeWorld();
result = await world.fixer.applyFix({fix: 'delete-variable', fixData: {targetId: 'stage', variableId: 'v1'}});
ok('delete it removes the variable through the workspace', result && has(world.log, ['deleteVariable', 'v1']) &&
    !world.log.some(row => row[0] === 'edit'));

world = makeWorld();
world.block('top');
result = await world.fixer.applyFix({fix: 'move-to-rules',
    fixData: {targetId: 'cat', blockId: 'top', rulesTargetId: 'rules'}});
ok('move it copies the whole stack to Game Rules, then deletes the original', result &&
    has(world.log, ['share', ['top', 'n2'], 'rules', 'cat']) && has(world.log, ['dispose', 'top', false, true]) &&
    world.log.findIndex(row => row[0] === 'share') < world.log.findIndex(row => row[0] === 'dispose'));
ok('the moved stack lands below the lowest script in Game Rules', world.shared[0][0].x === 1 &&
    world.shared[0][0].y === 2 + (3 * 56) + 48, world.shared[0][0]);
ok('a top stack move says Moved and offers Undo', result.notice === 'moved' && typeof result.undo === 'function');
let undone = await result.undo();
ok('Undo deletes the copy in Game Rules and puts the stack back where it was', undone === true &&
    has(world.log, ['deleteCopy', 'rules', 'copy-top']) && has(world.log, ['restore', 'top', 'value,NEXT', true]) &&
    !world.targets.rules.blocks._blocks['copy-top']);

world = makeWorld();
world.block('top', {xy: {x: 30, y: 40}});
result = await world.fixer.applyFix({fix: 'move-to-rules',
    fixData: {targetId: 'cat', blockId: 'top', rulesTargetId: 'rules'}});
await result.undo();
ok('a restored top stack goes back to its spot', world.blocks.get('top').xy.x === 30 && world.blocks.get('top').xy.y === 40);

world = makeWorld();
world.block('top');
result = await world.fixer.applyFix({fix: 'move-to-rules',
    fixData: {targetId: 'cat', blockId: 'top', rulesTargetId: 'rules'}});
world.block('top');
undone = await result.undo();
ok('Undo after Ctrl+Z already put it back only removes the copy', undone === true &&
    has(world.log, ['deleteCopy', 'rules', 'copy-top']) && !world.log.some(row => row[0] === 'restore'));

world = makeWorld();
world.block('top', {dispose () {
    throw new Error('stuck');
}});
result = await world.fixer.applyFix({fix: 'move-to-rules',
    fixData: {targetId: 'cat', blockId: 'top', rulesTargetId: 'rules'}});
ok('a delete that throws removes the copy so the script is not doubled', result === false &&
    has(world.log, ['deleteCopy', 'rules', 'copy-top']) && world.groups.join() === 'true,false');

world = makeWorld();
const parentTop = world.block('top', {getNextBlock: () => world.blocks.get('n2')});
world.block('n2', {getParent: () => parentTop});
result = await world.fixer.applyFix({fix: 'move-to-rules',
    fixData: {targetId: 'cat', blockId: 'n2', rulesTargetId: 'rules'}});
ok('move it unplugs a nested gold block and heals the stack it sat in', result &&
    has(world.log, ['share', ['n2'], 'rules', 'cat']) && has(world.log, ['dispose', 'n2', true, true]) &&
    world.shared[0][0].topLevel === true && world.shared[0][0].parent === null && world.shared[0][0].next === null);
ok('the source blocks are not touched by the copy', world.targets.cat.blocks._blocks.n2.parent === 'top' &&
    world.targets.cat.blocks._blocks.n2.topLevel === false);
ok('a nested block lands hatless, so the toast says to attach it', result.notice === 'moved-hatless');
undone = await result.undo();
ok('Undo plugs a nested block back under the block it sat below, without the blocks after it', undone === true &&
    has(world.log, ['deleteCopy', 'rules', 'copy-n2']) && has(world.log, ['restore', 'n2', 'value', true]) &&
    has(world.log, ['connect', 'top', 'n2', true]));

world = makeWorld();
const holder = world.block('ruleHat', {
    inputList: [{name: 'SUBSTACK', connection: {targetBlock: () => world.blocks.get('say')}}],
    getInput: name => ({connection: {connect: other => world.log.push(['connectInput', name, other.id])}})
});
world.block('say', {getParent: () => holder});
world.vm.editingTarget = world.targets.cat;
result = await world.fixer.applyFix({fix: 'move-out', fixData: {targetId: 'rules', blockId: 'say'}});
ok('move it takes a device-only block out of Game Rules to the sprite you were editing', result &&
    has(world.log, ['edit', 'rules']) && has(world.log, ['share', ['say', 'text'], 'cat', 'rules']) &&
    has(world.log, ['dispose', 'say', true, true]));
ok('move out says Moved and offers Undo', result.notice === 'moved' && typeof result.undo === 'function');
undone = await result.undo();
ok('Undo removes the copy from the sprite and plugs the block back into its input in Game Rules', undone === true &&
    has(world.log, ['deleteCopy', 'cat', 'copy-say']) && has(world.log, ['connectInput', 'SUBSTACK', 'say']));

world = makeWorld();
world.block('say');
world.vm.editingTarget = world.targets.rules;
result = await world.fixer.applyFix({fix: 'move-out', fixData: {targetId: 'rules', blockId: 'say'}});
ok('editing Game Rules sends it to the first other sprite', result &&
    has(world.log, ['share', ['say', 'text'], 'cat', 'rules']));

world = makeWorld();
world.block('say');
world.vm.editingTarget = world.targets.rules;
world.vm.runtime.targets = [world.targets.rules];
result = await world.fixer.applyFix({fix: 'move-out', fixData: {targetId: 'rules', blockId: 'say'}});
ok('with nowhere to go it is not fixed', result === false && !world.log.some(row => row[0] === 'dispose'));

const rulesBlocks = makeWorld().targets.rules.blocks._blocks;
ok('a top stack copies whole', copyStack(rulesBlocks, 'ruleHat').map(entry => entry.id).sort().join() ===
    'ruleHat,say,tail,text');
const nestedCopy = copyStack(rulesBlocks, 'say');
ok('a nested block copies with its inputs and without the blocks under it',
    nestedCopy.map(entry => entry.id).join() === 'say,text' && nestedCopy[0].x === 0 && nestedCopy[0].topLevel);
ok('a missing block copies nothing', copyStack(rulesBlocks, 'nope').length === 0);
const looped = {
    p: {id: 'p', next: 'rep', parent: null, inputs: {}, topLevel: true, x: 10, y: 20},
    rep: {id: 'rep', opcode: 'control_repeat', next: 'after', parent: 'p', topLevel: false, inputs: {
        TIMES: {block: 'num', shadow: 'num'}, SUBSTACK: {block: 'a', shadow: null}
    }},
    num: {id: 'num', next: null, parent: 'rep', inputs: {}, shadow: true, topLevel: false},
    a: {id: 'a', next: 'b', parent: 'rep', inputs: {}, topLevel: false},
    b: {id: 'b', next: null, parent: 'a', inputs: {}, topLevel: false},
    after: {id: 'after', next: null, parent: 'rep', inputs: {}, topLevel: false}
};
ok('a nested repeat copies its whole substack chain and not the block below it',
    copyStack(looped, 'rep').map(entry => entry.id).sort()
        .join() === 'a,b,num,rep');
ok('rows count the substack and its arm', spotBelow(looped).y === 20 + (6 * 56) + 48 && spotBelow(looped).x === 10);
ok('an empty sprite takes the move at the top left', spotBelow({}).x === 0 && spotBelow({}).y === 0);

const sprites = {
    stage: {id: 'stage', isStage: true},
    rules: {id: 'rules'},
    cat: {id: 'cat'},
    clone: {id: 'clone', isOriginal: false},
    dog: {id: 'dog'}
};
const order = [sprites.stage, sprites.rules, sprites.clone, sprites.cat, sprites.dog];
ok('move out goes to the sprite you were editing', outOfRulesTarget(order, sprites.dog, 'rules') === 'dog');
ok('editing the Stage sends it to the first other sprite, not the Stage', outOfRulesTarget(order, sprites.stage, 'rules') ===
    'cat');
ok('editing Game Rules skips it and clones', outOfRulesTarget(order, sprites.rules, 'rules') === 'cat');
ok('with only the Stage and Game Rules there is nowhere to go',
    outOfRulesTarget([sprites.stage, sprites.rules], sprites.stage, 'rules') === null);

world = makeWorld();
result = await world.fixer.applyFix({fix: 'create-scene', fixData: {name: 'Boss'}});
ok('create it calls the world seam', result && has(world.log, ['createScene', 'Boss']));
result = await world.fixer.applyFix({fix: 'create-tile', fixData: {name: 'lava'}});
ok('a world fix the seam lacks reports false', result === false);

ok('no fix, no action', !world.fixer.canFix({fix: null}) && !world.fixer.canFix({fix: 'nuke', fixData: {}}) &&
    world.fixer.canFix({fix: 'delete-loose', fixData: {blockIds: []}}) &&
    !world.fixer.canFix({fix: 'clean-up', fixData: {blockIds: []}}));
ok('xml escaping covers every special', escapeXml('<a b="c" d=\'e\'>&') ===
    '&lt;a b=&quot;c&quot; d=&apos;e&apos;&gt;&amp;');
ok('the xml helpers are well formed', receiverXml('x', 'y').endsWith('</block></xml>') &&
    waitXml(0.1).indexOf('math_positive_number') !== -1);
done();
