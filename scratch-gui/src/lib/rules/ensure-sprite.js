import {RULES_KEY, RULES_ROLE, RULES_VERSION, installProjectSeam} from '../collab/project-seam.js';
import {findRulesTarget} from './rule-blocks.js';
import {installRulesGuard, settle} from './guard.js';

const RULES_NAME = 'Game Rules';
const EMPTY_SVG = 'cd21514d0531fdffb22204e0ec5ed84a';

const pending = new WeakMap();

const freeName = runtime => {
    const taken = new Set(runtime.targets.filter(target => target.isOriginal).map(target => target.getName()));
    if (!taken.has(RULES_NAME)) return RULES_NAME;
    let n = 2;
    while (taken.has(`${RULES_NAME}${n}`)) n++;
    return `${RULES_NAME}${n}`;
};

const rulesSpriteJSON = name => ({
    isStage: false,
    name,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [{
        name: 'rules',
        bitmapResolution: 1,
        dataFormat: 'svg',
        assetId: EMPTY_SVG,
        md5ext: `${EMPTY_SVG}.svg`,
        rotationCenterX: 0,
        rotationCenterY: 0
    }],
    sounds: [],
    volume: 100,
    visible: false,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around',
    extensionStorage: {[RULES_KEY]: {role: RULES_ROLE, v: RULES_VERSION}}
});

const pinAfterStage = (vm, target) => {
    const index = vm.runtime.targets.indexOf(target);
    const stageFirst = vm.runtime.targets[0] && vm.runtime.targets[0].isStage;
    const want = stageFirst ? 1 : 0;
    if (index > want && typeof vm.reorderTarget === 'function') vm.reorderTarget(index, want);
};

const ensureRulesSprite = vm => {
    installProjectSeam(vm);
    installRulesGuard(vm);
    const existing = findRulesTarget(vm.runtime);
    if (existing) return Promise.resolve(existing);
    if (pending.has(vm)) return pending.get(vm);
    const name = freeName(vm.runtime);
    const job = Promise.resolve()
        .then(() => vm.addSprite(JSON.stringify(rulesSpriteJSON(name))))
        .then(() => {
            const target = findRulesTarget(vm.runtime);
            if (!target) throw new Error('ensureRulesSprite: the new sprite lost its rules mark');
            settle(vm.runtime);
            pinAfterStage(vm, target);
            return target;
        });
    const done = () => pending.delete(vm);
    pending.set(vm, job);
    job.then(done, done);
    return job;
};

export {
    RULES_NAME,
    ensureRulesSprite,
    rulesSpriteJSON
};
