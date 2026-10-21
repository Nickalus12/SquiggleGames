import sb3 from 'scratch-vm/src/serialization/sb3.js';
import {RUNTIME_ENTRY, canonical, targetPayload} from './hash.js';

const DRIFT_REPAIR_MAX = 3;

const withoutBlocks = target => canonical(Object.assign(targetPayload(target), {blocks: null}));

const byName = (project, name) => ((project && project.targets) || []).find(t => t && t.name === name) || null;

const planDriftRepair = (off, localProject, remoteProject) => {
    if (!off.length) return [];
    if (off.length > DRIFT_REPAIR_MAX || off.includes(RUNTIME_ENTRY)) return null;
    const steps = [];
    for (const name of off) {
        const local = byName(localProject, name);
        const remote = byName(remoteProject, name);
        if (!local || !remote || (local.isStage === true) !== (remote.isStage === true)) return null;
        if (withoutBlocks(local) === withoutBlocks(remote)) {
            steps.push({name, kind: 'blocks', remote});
        } else if (remote.isStage) {
            return null;
        } else {
            steps.push({name, kind: 'target', remote});
        }
    }
    return steps;
};

const replaceBlocks = (target, remoteBlocks) => {
    const blocks = sb3.deserializeBlocks(JSON.parse(JSON.stringify(remoteBlocks || {})));
    target.blocks.deleteAllBlocks();
    Object.keys(blocks).forEach(id => target.blocks.createBlock(blocks[id]));
    target.blocks.updateTargetSpecificBlocks(target.isStage);
    target.blocks.resetCache();
};

export {
    DRIFT_REPAIR_MAX,
    planDriftRepair,
    replaceBlocks
};
