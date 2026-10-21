import {OPEN_SETUP_FUNC} from './rule-blocks.js';
import {ensureRulesSprite} from './ensure-sprite.js';
import {readSetup, setupVariables, writeSetup} from './setup-model.js';

const opening = new WeakMap();

const loadSheet = () => import('./mount-setup.jsx').then(mod => mod.default);

const openGameSetup = (vm, load) => {
    if (opening.has(vm)) return opening.get(vm);
    const run = ensureRulesSprite(vm)
        .then(target => {
            if (vm.editingTarget !== target && typeof vm.setEditingTarget === 'function') {
                vm.setEditingTarget(target.id);
            }
            return (load || loadSheet)().then(mount => mount({
                setup: readSetup(target),
                variables: setupVariables(target)
            }))
                .then(result => (result ? writeSetup(vm, target, result) : null));
        })
        .then(
            mark => {
                opening.delete(vm);
                return mark;
            },
            error => {
                opening.delete(vm);
                throw error;
            }
        );
    opening.set(vm, run);
    return run;
};

export {
    OPEN_SETUP_FUNC,
    openGameSetup
};
