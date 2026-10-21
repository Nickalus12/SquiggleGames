import {onStep} from './overlay.js';

const chains = new WeakMap();

const chainFor = runtime => {
    let chain = chains.get(runtime);
    if (!chain) {
        chain = {entries: [], dispose: null, run: null};
        chain.run = () => {
            const entries = chain.entries;
            for (let i = 0; i < entries.length; i++) entries[i].fn();
        };
        chains.set(runtime, chain);
    }
    return chain;
};

const onAfterStep = (runtime, fn, order) => {
    const chain = chainFor(runtime);
    const entry = {fn, order: Number(order) || 0};
    let at = chain.entries.length;
    while (at > 0 && chain.entries[at - 1].order > entry.order) at--;
    chain.entries.splice(at, 0, entry);
    if (!chain.dispose) chain.dispose = onStep(runtime, chain.run);
    return () => {
        const index = chain.entries.indexOf(entry);
        if (index === -1) return;
        chain.entries.splice(index, 1);
        if (chain.entries.length || !chain.dispose) return;
        chain.dispose();
        chain.dispose = null;
    };
};

const AFTER_STEP_ORDER = {animate: 0, punch: 10};

export {AFTER_STEP_ORDER, onAfterStep};
