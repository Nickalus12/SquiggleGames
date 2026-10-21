const KID_TEXT = Object.freeze({
    'unsupported': 'This block can\'t run on the server. Move it to a normal sprite.',
    'arg': 'Check what you typed in this block.',
    'name': 'This name isn\'t set up. Check the spelling or add it in Game setup.',
    'global-var': 'Game Rules can only use their own variables.',
    'cycle': 'These custom blocks call each other in a circle.',
    'limit': 'Game Rules can have at most {max} {limit}. Remove some.',
    'too-big': 'These Game Rules are too big for the server. Make them smaller.',
    'screened': 'Some words here aren\'t allowed. Try different words.',
    'opcode-set': 'Reload the editor to get the newest blocks.',
    'upload-failed': 'Game Rules did not reach the server. Try again in a moment.',
    'too-much': 'This rule did too much at once, so its changes were undone.',
    'deferred': 'The game was busy, so this rule ran a moment late.',
    'paused': 'This rule kept the game too busy, so it rests for 5 seconds.',
    'loop-cap': 'This repeat stopped at 100 times.',
    'cut': 'Some text was too long, so the end was cut off.',
    'state-full': 'The game ran out of room for values, so this change was not kept.',
    'dropped': 'This rule sent too many messages at once, so some were not sent.'
});

const LIMIT_WORDS = Object.freeze({
    vars: 'game values',
    events: 'events',
    phases: 'phases',
    rulesPerEvent: 'rules for one event',
    timers: 'timers',
    saveKeys: 'saved values',
    playerValues: 'player values',
    inputNames: 'input names',
    lists: 'lists',
    teams: 'teams',
    boards: 'boards',
    repeat: 'repeats',
    string: 'letters'
});

const REPEAT_TEXT = 'Happened {n} times.';
const LIMIT_FALLBACK = 'This is more than the server allows. Make it smaller.';

const FALLBACK_TEXT = 'Something in Game Rules needs a look.';
const LOCAL_CODES = Object.freeze(['unsupported', 'global-var', 'cycle', 'limit', 'too-big', 'name']);

const messageId = code => `sq.rules.err.${code}`;

const kidText = code => KID_TEXT[code] || FALLBACK_TEXT;

const withStatus = (text, detail) => (detail && Number.isInteger(detail.status) && detail.status > 0 ?
    `${text} (${detail.status})` :
    text);

const limitMessageId = key => `sq.rules.limit.${key}`;

const fillLimit = (text, detail) => {
    if (!text.includes('{max}')) return text;
    const words = detail && LIMIT_WORDS[detail.limit];
    if (!words || !Number.isFinite(detail.max)) return LIMIT_FALLBACK;
    return text.replace('{max}', String(detail.max)).replace('{limit}', words);
};

const withRepeats = (text, n) => (n > 1 ? `${text} ${REPEAT_TEXT.replace('{n}', String(n))}` : text);

const errorText = (code, detail, n) => withRepeats(withStatus(fillLimit(kidText(code), detail), detail), n);

const normalizeError = error => {
    const code = error && typeof error.code === 'string' ? error.code : 'unknown';
    const detail = error && typeof error.detail !== 'undefined' ? error.detail : null;
    const n = error && Number.isFinite(error.n) ? error.n : 1;
    return {
        blockId: error && typeof error.blockId === 'string' ? error.blockId : null,
        code,
        detail,
        n,
        id: messageId(code),
        text: errorText(code, detail, n)
    };
};

const parseRulesStatus = msg => {
    if (!msg || typeof msg !== 'object') return null;
    const errors = Array.isArray(msg.errors) ? msg.errors.map(normalizeError) : [];
    return {
        hash: typeof msg.hash === 'string' ? msg.hash : '',
        ok: msg.ok === true,
        phase: msg.phase === 'run' ? 'run' : 'compile',
        errors
    };
};

const createRulesStatus = () => {
    let compile = null;
    let run = null;
    const listeners = new Set();
    const emit = () => {
        const snapshot = {compile, run};
        listeners.forEach(fn => {
            try {
                fn(snapshot);
            } catch (e) {
                listeners.delete(fn);
            }
        });
    };
    return {
        apply (msg) {
            const status = parseRulesStatus(msg);
            if (!status) return null;
            if (status.phase === 'run') run = status;
            else {
                compile = status;
                run = null;
            }
            emit();
            return status;
        },
        local (errors, hash) {
            compile = {hash: hash || '', ok: !errors.length, phase: 'local', errors: errors.map(normalizeError)};
            emit();
            return compile;
        },
        get () {
            return {compile, run};
        },
        blocking () {
            return !!(compile && !compile.ok);
        },
        reset () {
            compile = null;
            run = null;
            emit();
        },
        subscribe (fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        }
    };
};

const rulesStatus = createRulesStatus();

export {
    KID_TEXT,
    LIMIT_WORDS,
    errorText,
    limitMessageId,
    LOCAL_CODES,
    messageId,
    kidText,
    parseRulesStatus,
    createRulesStatus,
    rulesStatus
};
