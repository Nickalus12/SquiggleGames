process.removeAllListeners('warning');

const {DRIFT_REPAIR_MAX, planDriftRepair} = await import('./drift.js');

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

const block = opcode => ({a: {opcode, next: null, parent: null, inputs: {}, fields: {}, topLevel: true, x: 0, y: 0}});
const target = (name, extra) => Object.assign({
    isStage: false,
    name,
    layerOrder: 1,
    blocks: block('motion_movesteps'),
    costumes: [],
    sounds: [],
    variables: {},
    lists: {},
    broadcasts: {},
    x: 0,
    y: 0,
    currentCostume: 0
}, extra);
const project = targets => ({targets: [target('Stage', {isStage: true, layerOrder: 0})].concat(targets)});

const local = project([target('Cat'), target('Fox')]);

ok('nothing drifted plans nothing', planDriftRepair([], local, local).length === 0);
{
    const remote = project([target('Cat', {blocks: block('looks_show')}), target('Fox')]);
    const steps = planDriftRepair(['Cat'], local, remote);
    ok('a blocks-only change swaps the blocks', steps.length === 1 && steps[0].kind === 'blocks' &&
        steps[0].remote.blocks.a.opcode === 'looks_show', steps);
}
{
    const remote = project([target('Cat', {variables: {v: ['score', 1]}}), target('Fox')]);
    const steps = planDriftRepair(['Cat'], local, remote);
    ok('a wider change replaces the target', steps.length === 1 && steps[0].kind === 'target', steps);
}
{
    const costume = {assetId: 'c'.repeat(32), md5ext: `${'c'.repeat(32)}.svg`, dataFormat: 'svg', name: 'one'};
    const remote = project([target('Cat', {costumes: [costume]}), target('Fox')]);
    ok('a new costume replaces the target', planDriftRepair(['Cat'], local, remote)[0].kind === 'target');
}
{
    const remote = project([target('Fox')]);
    ok('a target missing from the head resyncs', planDriftRepair(['Cat'], local, remote) === null);
}
{
    const remote = {targets: [target('Stage', {isStage: true, layerOrder: 0, variables: {v: ['g', 1]}}),
        target('Cat'), target('Fox')]};
    ok('a stage beyond its blocks resyncs', planDriftRepair(['Stage'], local, remote) === null);
}
{
    const remote = {targets: [target('Stage', {isStage: true, layerOrder: 0, blocks: block('event_whenflagclicked')}),
        target('Cat'), target('Fox')]};
    const steps = planDriftRepair(['Stage'], local, remote);
    ok('a stage with only new blocks swaps them', steps && steps[0].kind === 'blocks', steps);
}
ok('more than the cap resyncs',
    planDriftRepair(Array.from({length: DRIFT_REPAIR_MAX + 1}, (_, i) => `S${i}`), local, local) === null);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
