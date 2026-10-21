import schema from './rules-schema.json';
import {RULES_KEY} from '../collab/project-seam.js';
import {findRulesTarget} from './rule-blocks.js';
import {hashRules, hasRuleBlocks} from './hash.js';
import {rulesStatus} from './status.js';

const FORMAT = 1;
const EDIT_DELAY_MS = 500;
const MIN_GAP_MS = 500;

const byteLength = text => new TextEncoder().encode(text).length;

const stampProject = (runtime, hash) => {
    const previous = runtime.extensionStorage[RULES_KEY];
    runtime.extensionStorage[RULES_KEY] = Object.assign({}, previous, {
        format: FORMAT,
        rulesHash: hash,
        opcodeSet: schema.opcodeSet
    });
    return runtime.extensionStorage[RULES_KEY];
};

const buildRulesUpload = vm => {
    const target = findRulesTarget(vm.runtime);
    if (!target) return Promise.resolve(null);
    const text = vm.toJSON(target.id);
    const sprite = JSON.parse(text);
    if (!hasRuleBlocks(sprite)) return Promise.resolve(null);
    return hashRules(sprite).then(hash => {
        if (byteLength(text) > schema.limits.spriteBytes) {
            rulesStatus.local([{code: 'too-big', detail: {bytes: byteLength(text)}}], hash);
            return {tooBig: true, hash};
        }
        stampProject(vm.runtime, hash);
        return {format: FORMAT, opcodeSet: schema.opcodeSet, hash, sprite};
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

const uploadRules = ({vm, slug, base, fetchImpl}) => buildRulesUpload(vm).then(body => {
    if (!body || body.tooBig) return body;
    return putRules({slug, body, base, fetchImpl}).then(reply => ({hash: body.hash, reply}));
});

const createRulesUploader = ({vm, slug, base, fetchImpl, now, setTimer, clearTimer}) => {
    const clock = now || Date.now;
    const later = setTimer || setTimeout;
    const cancel = clearTimer || clearTimeout;
    let timer = null;
    let lastAt = -Infinity;
    let lastHash = '';
    let inFlight = null;
    const send = () => {
        timer = null;
        if (inFlight) {
            timer = later(send, MIN_GAP_MS);
            return inFlight;
        }
        const wait = lastAt + MIN_GAP_MS - clock();
        if (wait > 0) {
            timer = later(send, wait);
            return null;
        }
        lastAt = clock();
        inFlight = buildRulesUpload(vm).then(body => {
            if (!body || body.tooBig || body.hash === lastHash) return body;
            return putRules({slug, body, base, fetchImpl}).then(reply => {
                lastHash = body.hash;
                return {hash: body.hash, reply};
            });
        });
        const settle = () => {
            inFlight = null;
        };
        inFlight.then(settle, settle);
        return inFlight;
    };
    return {
        sendNow () {
            if (timer) cancel(timer);
            timer = null;
            lastHash = '';
            return send();
        },
        edited () {
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
    FORMAT,
    EDIT_DELAY_MS,
    stampProject,
    buildRulesUpload,
    rulesUrl,
    putRules,
    uploadRules,
    createRulesUploader
};
