const RULES_KEY = 'together';
const RULES_ROLE = 'rules';
const RULES_VERSION = 1;

const preservedKeys = new Set([RULES_KEY]);
const seamed = new WeakSet();

const present = value => value !== null && typeof value !== 'undefined';

const preserveExtensionStorage = id => {
    if (typeof id !== 'string' || !id) throw new Error('preserveExtensionStorage needs an extension id');
    preservedKeys.add(id);
};

const isRulesTarget = target => {
    const storage = target && target.extensionStorage;
    const mark = storage && storage[RULES_KEY];
    return !!(mark && mark.role === RULES_ROLE);
};

const markRulesTarget = target => {
    const previous = target.extensionStorage[RULES_KEY];
    target.extensionStorage[RULES_KEY] = Object.assign({}, previous, {role: RULES_ROLE, v: RULES_VERSION});
    return target.extensionStorage[RULES_KEY];
};

const holdsPreserved = storage => {
    if (!storage) return false;
    for (const key of preservedKeys) {
        if (present(storage[key])) return true;
    }
    return false;
};

const withPreserved = (serialized, storage) => {
    if (!storage) return serialized;
    let result = serialized;
    for (const key of preservedKeys) {
        if (!present(storage[key])) continue;
        if (result && Object.prototype.hasOwnProperty.call(result, key)) continue;
        if (result === serialized) result = Object.assign({}, serialized);
        result[key] = storage[key];
    }
    return result;
};

const stringify = obj => JSON.stringify(obj, (key, value) => (
    typeof value === 'number' && !Number.isFinite(value) ? 0 : value
));

const restoreTarget = (serialized, target) => {
    if (!serialized || !target) return;
    const storage = withPreserved(serialized.extensionStorage, target.extensionStorage);
    if (storage) serialized.extensionStorage = storage;
};

const installProjectSeam = vm => {
    if (!vm || seamed.has(vm)) return vm;
    seamed.add(vm);
    const toJSON = vm.toJSON;
    vm.toJSON = function (optTargetId, serializationOptions) {
        const json = toJSON.call(this, optTargetId, serializationOptions);
        const runtime = this.runtime;
        const targets = optTargetId ?
            [runtime.getTargetById(optTargetId)] :
            runtime.targets.filter(target => target.isOriginal);
        const wholeProject = !optTargetId;
        if (!targets.some(target => target && holdsPreserved(target.extensionStorage)) &&
            !(wholeProject && holdsPreserved(runtime.extensionStorage))) {
            return json;
        }
        const obj = JSON.parse(json);
        if (wholeProject) {
            targets.forEach((target, index) => {
                const serialized = obj.targets[index];
                if (serialized && serialized.name === target.getName()) restoreTarget(serialized, target);
            });
            const storage = withPreserved(obj.extensionStorage, runtime.extensionStorage);
            if (storage) obj.extensionStorage = storage;
        } else {
            restoreTarget(obj, targets[0]);
        }
        return stringify(obj);
    };
    const addSprite = vm.addSprite;
    vm.addSprite = function (input) {
        const runtime = this.runtime;
        const before = runtime.extensionStorage;
        const restore = () => {
            if (runtime.extensionStorage !== before) runtime.extensionStorage = before;
        };
        return Promise.resolve(addSprite.call(this, input)).then(result => {
            restore();
            return result;
        }, error => {
            restore();
            throw error;
        });
    };
    return vm;
};

export {
    RULES_KEY,
    RULES_ROLE,
    RULES_VERSION,
    installProjectSeam,
    preserveExtensionStorage,
    isRulesTarget,
    markRulesTarget
};
