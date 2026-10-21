import {RULES_KEY, isRulesTarget} from '../collab/project-seam.js';

const guarded = new WeakSet();

const rulesTargets = runtime => runtime.targets.filter(target => target.isOriginal && isRulesTarget(target));

const settle = runtime => {
    const marked = rulesTargets(runtime);
    marked.slice(1).forEach(extra => {
        delete extra.extensionStorage[RULES_KEY];
    });
    const rules = marked[0];
    if (!rules) return null;
    rules.draggable = false;
    if (rules.visible && typeof rules.setVisible === 'function') rules.setVisible(false);
    for (const clone of rules.sprite ? rules.sprite.clones : [rules]) {
        if (runtime.executableTargets.indexOf(clone) !== -1) runtime.removeExecutable(clone);
    }
    return rules;
};

const installRulesGuard = vm => {
    const runtime = vm && vm.runtime;
    if (!runtime || guarded.has(runtime)) return vm;
    guarded.add(runtime);
    const run = () => {
        settle(runtime);
    };
    runtime.on('PROJECT_LOADED', run);
    runtime.on('targetWasCreated', run);
    if (typeof vm.on === 'function') vm.on('targetsUpdate', run);
    run();
    return vm;
};

export {
    installRulesGuard,
    rulesTargets,
    settle
};
