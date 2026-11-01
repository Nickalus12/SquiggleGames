import {apiBase} from '../collab/room-api.js';

const TIMEOUT_MS = 12000;

let inFlight = false;

const failed = reason => ({ok: false, summary: '', issue: '', suggestion: '', reason});

const shape = data => {
    if (!data || typeof data !== 'object') return failed('error');
    if (data.ok !== true) return failed(typeof data.reason === 'string' ? data.reason : 'error');
    const pick = k => (typeof data[k] === 'string' ? data[k] : '');
    const out = {ok: true, summary: pick('summary'), issue: pick('issue'), suggestion: pick('suggestion'), reason: ''};
    return out.summary && out.issue && out.suggestion ? out : failed('error');
};

const isBusy = () => inFlight;

const explainSprite = ({name, kind = 'sprite', script, question}, {fetcher, timeoutMs = TIMEOUT_MS} = {}) => {
    if (inFlight) return Promise.resolve(failed('pending'));
    const run = fetcher || (typeof fetch === 'function' ? fetch : null);
    if (!run) return Promise.resolve(failed('error'));
    inFlight = true;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    const late = new Promise(resolve => {
        timer = setTimeout(() => {
            if (controller) controller.abort();
            resolve(failed('timeout'));
        }, timeoutMs);
    });
    const body = {spriteName: String(name || ''), kind, script: String(script || '')};
    if (question) body.question = String(question);
    const call = Promise.resolve()
        .then(() => run(`${apiBase()}/api/ai/explain`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'x-squiggle': '1', 'content-type': 'application/json'},
            body: JSON.stringify(body),
            signal: controller ? controller.signal : void 0
        }))
        .then(res => {
            if (!res) return failed('error');
            if (res.status === 429) return failed('busy');
            return Promise.resolve(res.json()).then(shape, () => failed('error'));
        })
        .catch(() => failed('error'));
    return Promise.race([call, late]).then(out => {
        clearTimeout(timer);
        inFlight = false;
        return out;
    });
};

export {
    TIMEOUT_MS,
    explainSprite,
    isBusy
};
