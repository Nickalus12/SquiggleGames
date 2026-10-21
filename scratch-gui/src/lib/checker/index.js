import RULES from './rules/index.js';
import {sortItems} from './model.js';
import {isRulesTarget, RULES_KEY} from '../collab/project-seam.js';
import {listKits, TOGETHER_ID} from '../kits/registry.js';
import {LAYOUT_MODES, detectLayoutMode} from '../layout-mode.js';

const SLICE_MS = 8;
const DELAY_MS = 1500;
const PHONE_DELAY_MS = 3000;
const THUNDERBOLT_IDS = Object.freeze([
    'thunderboltcooldowns',
    'thunderbolthealthbars',
    'thunderbolttext',
    'thunderboltvfx',
    'thunderboltparticlesystem'
]);

const assetBytes = asset => {
    const data = asset && asset.data;
    if (!data) return 0;
    return typeof data.byteLength === 'number' ? data.byteLength : (data.length || 0);
};

const snapshotTarget = target => {
    const storage = target.extensionStorage || {};
    const rules = isRulesTarget(target);
    return {
        id: target.id,
        name: target.isStage ? 'Stage' : (target.sprite ? target.sprite.name : target.getName()),
        isStage: !!target.isStage,
        isRules: rules,
        mark: rules ? storage[RULES_KEY] : null,
        blocks: target.blocks ? target.blocks._blocks : {},
        variables: target.variables || {},
        costumes: (target.getCostumes ? target.getCostumes() : []).map(costume => ({
            name: costume.name,
            assetId: costume.assetId,
            bytes: assetBytes(costume.asset)
        })),
        sounds: (target.getSounds ? target.getSounds() : []).map(sound => ({
            name: sound.name,
            assetId: sound.assetId,
            bytes: assetBytes(sound.asset)
        }))
    };
};

const opcodeSets = runtime => {
    const hatOpcodes = new Set(Object.keys(runtime._hats || {}));
    const reporterOpcodes = new Set();
    (runtime._blockInfo || []).forEach(category => {
        (category.blocks || []).forEach(entry => {
            const info = entry && entry.info;
            if (!info || !info.opcode) return;
            const opcode = `${category.id}_${info.opcode}`;
            if (info.blockType === 'hat' || info.blockType === 'event') hatOpcodes.add(opcode);
            if (info.blockType === 'reporter' || info.blockType === 'Boolean') reporterOpcodes.add(opcode);
        });
    });
    return {hatOpcodes, reporterOpcodes};
};

const monitoredIds = runtime => {
    const ids = new Set();
    const state = runtime._monitorState;
    if (state && typeof state.forEach === 'function') {
        state.forEach(monitor => {
            const visible = monitor && (typeof monitor.get === 'function' ? monitor.get('visible') : monitor.visible);
            const id = monitor && (typeof monitor.get === 'function' ? monitor.get('id') : monitor.id);
            if (visible && id) ids.add(id);
        });
    }
    return ids;
};

const call = (fn, fallback) => {
    try {
        return typeof fn === 'function' ? fn() : fallback;
    } catch (e) {
        return fallback;
    }
};

const worldContext = win => {
    const seam = win && win.SquiggleWorld;
    if (!seam) return {worldMode: false, world: null};
    const levels = call(seam.levels, null);
    return {
        worldMode: !!call(seam.isWorldMode, false),
        world: {
            scenes: call(seam.scenes, null),
            levels: Array.isArray(levels) ? levels.map(level => level.name) : null,
            tiles: call(seam.tileNames, null),
            tilesets: call(seam.tilesets, []),
            canCreateScene: typeof seam.createScene === 'function',
            canCreateLevel: typeof seam.createLevel === 'function',
            canCreateTile: typeof seam.createTile === 'function'
        }
    };
};

const squiggleOnly = () => {
    const ids = new Set([TOGETHER_ID].concat(THUNDERBOLT_IDS));
    const kitNames = {};
    listKits().forEach(kit => {
        ids.add(kit.id);
        kitNames[kit.id] = kit.name;
    });
    return {squiggleOnlyIds: ids, kitNames};
};

const buildContext = (runtime, options) => Object.assign(
    {},
    opcodeSets(runtime),
    {monitored: monitoredIds(runtime)},
    worldContext(options.win),
    squiggleOnly(),
    {
        rules: call(options.getRulesSchema, null) ? {schema: options.getRulesSchema()} : null,
        rulesStatus: call(options.getRulesStatus, null)
    }
);

const runChecks = model => {
    const items = [];
    RULES.forEach(rule => {
        items.push(...rule(model));
    });
    return sortItems(items);
};

const scheduler = win => {
    if (win && typeof win.requestIdleCallback === 'function') {
        return {
            next: fn => {
                const id = win.requestIdleCallback(fn, {timeout: 1000});
                return () => win.cancelIdleCallback(id);
            }
        };
    }
    return {
        next: fn => {
            const id = setTimeout(() => fn(null), 0);
            return () => clearTimeout(id);
        }
    };
};

const createChecker = options => {
    const vm = options.vm;
    const win = typeof options.win === 'undefined' ? (typeof window === 'undefined' ? null : window) : options.win;
    const opts = Object.assign({}, options, {win});
    const now = options.now || (() => Date.now());
    const sched = options.scheduler || scheduler(win);
    const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = options.clearTimer || (id => clearTimeout(id));
    const isPhone = options.isPhone || (() => detectLayoutMode(win) === LAYOUT_MODES.phone);
    let timer = null;
    let cancelSlice = null;
    let generation = 0;
    let started = false;
    let last = [];

    const cancel = () => {
        if (timer !== null) clearTimer(timer);
        timer = null;
        if (cancelSlice) cancelSlice();
        cancelSlice = null;
        generation++;
    };

    const run = () => {
        cancel();
        const mine = generation;
        const runtime = vm.runtime;
        const targets = runtime.targets.filter(target => target.isOriginal !== false);
        const model = Object.assign(buildContext(runtime, opts), {targets: []});
        const units = targets.map(target => () => {
            model.targets.push(snapshotTarget(target));
        });
        const items = [];
        RULES.forEach(rule => units.push(() => {
            items.push(...rule(model));
        }));
        let at = 0;
        const slice = deadline => {
            cancelSlice = null;
            if (mine !== generation) return;
            const start = now();
            while (at < units.length) {
                units[at++]();
                if (now() - start >= SLICE_MS) break;
                if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() <= 0) break;
            }
            if (at < units.length) {
                cancelSlice = sched.next(slice);
                return;
            }
            last = sortItems(items);
            if (options.onResult) options.onResult(last);
        };
        cancelSlice = sched.next(slice);
    };

    const schedule = () => {
        if (timer !== null) clearTimer(timer);
        if (cancelSlice) {
            cancelSlice();
            cancelSlice = null;
            generation++;
        }
        timer = setTimer(() => {
            timer = null;
            run();
        }, isPhone() ? PHONE_DELAY_MS : DELAY_MS);
    };

    const start = () => {
        if (started) return;
        started = true;
        vm.on('PROJECT_CHANGED', schedule);
        vm.runtime.on('PROJECT_LOADED', schedule);
        schedule();
    };

    const stop = () => {
        if (!started) return;
        started = false;
        vm.off('PROJECT_CHANGED', schedule);
        vm.runtime.off('PROJECT_LOADED', schedule);
        cancel();
    };

    return {
        start,
        stop,
        schedule,
        runNow: run,
        items: () => last
    };
};

export {
    SLICE_MS,
    DELAY_MS,
    PHONE_DELAY_MS,
    THUNDERBOLT_IDS,
    snapshotTarget,
    buildContext,
    runChecks,
    createChecker
};
