import schema from './rules-schema.js';
import {RULES_KEY} from '../collab/project-seam.js';
import {findRulesTarget} from './rule-blocks.js';
import {hashRules, hasRuleBlocks} from './hash.js';
import {rulesStatus} from './status.js';
import {announceKitSet} from '../collab/kit-set.js';

const OPCODE_SET = schema.opcodeSet;
const EDIT_DELAY_MS = 500;
const MIN_GAP_MS = 500;

const LEVEL_OPCODES = new Set(Object.keys(schema.cards || {}).reduce((all, ext) => all.concat(
    schema.cards[ext].filter(card => card.needsLevels).map(card => `${ext}_${card.opcode}`)
), []));

const byteLength = text => new TextEncoder().encode(text).length;

const markOpcodeSet = mark => (mark && Number.isInteger(mark.opcodeSet) ? mark.opcodeSet : 0);

const raiseOpcodeSet = (target, runtime) => {
    const mark = target.extensionStorage[RULES_KEY];
    if (markOpcodeSet(mark) >= OPCODE_SET) return mark;
    const after = Object.assign({}, mark, {opcodeSet: OPCODE_SET});
    target.extensionStorage[RULES_KEY] = after;
    announceKitSet(runtime, {scope: 'target', target, ext: RULES_KEY, before: mark, after});
    return after;
};

const markIsNewer = runtime => {
    const target = findRulesTarget(runtime);
    return !!target && markOpcodeSet(target.extensionStorage[RULES_KEY]) > OPCODE_SET;
};

const checkOpcodeSet = runtime => {
    if (!markIsNewer(runtime)) return false;
    rulesStatus.local([{code: 'opcode-set'}]);
    return true;
};

const stampProject = (runtime, hash, opcodeSet) => {
    const previous = runtime.extensionStorage[RULES_KEY];
    runtime.extensionStorage[RULES_KEY] = Object.assign({}, previous, {rulesHash: hash, opcodeSet});
    return runtime.extensionStorage[RULES_KEY];
};

const needsLevels = sprite => Object.keys(sprite.blocks || {})
    .some(id => sprite.blocks[id] && LEVEL_OPCODES.has(sprite.blocks[id].opcode));

const usesWorld = vm => {
    const ids = vm.extensionManager && vm.extensionManager._loadedExtensions;
    return !!(ids && typeof ids.has === 'function' && ids.has('squiggleworld'));
};

const uploadLevels = (vm, sprite) => {
    const world = typeof window === 'undefined' ? null : window.SquiggleWorld;
    if (!usesWorld(vm) || !world || typeof world.levelsForUpload !== 'function') return [];
    const withSolid = needsLevels(sprite);
    const levels = world.levelsForUpload() || [];
    return levels.map(level => {
        const out = {
            id: level.id,
            cols: level.cols,
            rows: level.rows,
            tile: level.tile,
            origin: [level.origin[0], level.origin[1]]
        };
        if (withSolid && typeof level.solid === 'string') out.solid = level.solid;
        return out;
    });
};

const buildRulesUpload = (vm, {raise} = {}) => {
    const target = findRulesTarget(vm.runtime);
    if (!target) return Promise.resolve(null);
    if (checkOpcodeSet(vm.runtime)) return Promise.resolve({newer: true});
    if (raise || !markOpcodeSet(target.extensionStorage[RULES_KEY])) raiseOpcodeSet(target, vm.runtime);
    const text = vm.toJSON(target.id);
    const sprite = JSON.parse(text);
    if (!hasRuleBlocks(sprite)) return Promise.resolve(null);
    const opcodeSet = markOpcodeSet(target.extensionStorage[RULES_KEY]);
    const levels = uploadLevels(vm, sprite);
    return hashRules(sprite, opcodeSet, levels).then(hash => {
        if (byteLength(text) > schema.limits.spriteBytes) {
            rulesStatus.local([{code: 'too-big', detail: {bytes: byteLength(text)}}], hash);
            return {tooBig: true, hash};
        }
        return {opcodeSet, hash, sprite, levels};
    });
};

const rulesUrl = (base, slug) => `${base || ''}/api/rooms/${encodeURIComponent(slug)}/rules`;

const readReply = response => {
    if (!response.ok) {
        const error = new Error(`rules upload failed with ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return response.json().catch(() => null);
};

const applyReply = reply => {
    if (reply && typeof reply.ok === 'boolean') rulesStatus.apply(reply);
    return reply;
};

const putRules = ({slug, body, base, fetchImpl}) => {
    const run = fetchImpl || fetch;
    return run(rulesUrl(base, slug), {
        method: 'PUT',
        credentials: 'include',
        headers: {'content-type': 'application/json', 'x-squiggle': '1'},
        body: JSON.stringify(body)
    })
        .then(readReply)
        .then(applyReply);
};

const showFailure = (error, hash) => {
    const status = error && typeof error.status === 'number' ? error.status : 0;
    const code = status === 413 ? 'too-big' : 'upload-failed';
    rulesStatus.local([{code, detail: {status}}], hash);
};

const sendRules = ({vm, slug, base, fetchImpl}, body) => putRules({slug, body, base, fetchImpl}).then(reply => {
    stampProject(vm.runtime, body.hash, body.opcodeSet);
    return {hash: body.hash, reply};
}, error => {
    showFailure(error, body.hash);
    throw error;
});

const uploadRules = options => buildRulesUpload(options.vm, {raise: options.raise}).then(body => {
    if (!body || body.tooBig || body.newer) return body;
    return sendRules(options, body);
});

const createRulesUploader = ({vm, slug, base, fetchImpl, canEdit, now, setTimer, clearTimer}) => {
    const clock = now || Date.now;
    const later = setTimer || setTimeout;
    const cancel = clearTimer || clearTimeout;
    const mayEdit = canEdit || (() => true);
    let timer = null;
    let lastAt = -Infinity;
    let lastHash = '';
    let inFlight = null;
    let raiseNext = false;
    const send = () => {
        timer = null;
        if (!mayEdit()) return Promise.resolve(null);
        if (inFlight) {
            timer = later(send, MIN_GAP_MS);
            return inFlight;
        }
        const wait = lastAt + MIN_GAP_MS - clock();
        if (wait > 0) {
            timer = later(send, wait);
            return Promise.resolve(null);
        }
        lastAt = clock();
        const raise = raiseNext;
        raiseNext = false;
        inFlight = buildRulesUpload(vm, {raise}).then(body => {
            if (!body || body.tooBig || body.newer || body.hash === lastHash) return body;
            return sendRules({vm, slug, base, fetchImpl}, body).then(result => {
                lastHash = body.hash;
                return result;
            });
        });
        const settle = () => {
            inFlight = null;
        };
        const running = inFlight.catch(() => null);
        running.then(settle);
        return running;
    };
    return {
        sendNow () {
            if (timer) cancel(timer);
            timer = null;
            lastHash = '';
            return send();
        },
        edited () {
            raiseNext = true;
            if (timer) cancel(timer);
            timer = later(send, EDIT_DELAY_MS);
        },
        dispose () {
            if (timer) cancel(timer);
            timer = null;
        },
        lastHash () {
            return lastHash;
        }
    };
};

export {
    OPCODE_SET,
    EDIT_DELAY_MS,
    MIN_GAP_MS,
    markIsNewer,
    markOpcodeSet,
    checkOpcodeSet,
    raiseOpcodeSet,
    stampProject,
    buildRulesUpload,
    rulesUrl,
    putRules,
    uploadRules,
    createRulesUploader
};
