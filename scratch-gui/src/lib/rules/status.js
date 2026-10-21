const KID_TEXT = Object.freeze({
    'unsupported': 'This block can\'t run on the server. Move it to a normal sprite.',
    'arg': 'Check what you typed in this block.',
    'name': 'This name isn\'t set up. Check the spelling or add it in Game setup.',
    'global-var': 'Game Rules can only use their own variables.',
    'cycle': 'These custom blocks call each other in a circle.',
    'limit': 'This is more than the server allows. Make it smaller.',
    'too-big': 'This is more than the server allows. Make it smaller.',
    'screened': 'Some words here aren\'t allowed. Try different words.',
    'opcode-set': 'Reload the editor to get the newest blocks.',
    'too-much': 'A rule did too much at once and was stopped.',
    'cut': 'A rule did too much at once and was stopped.',
    'loop-cap': 'A rule did too much at once and was stopped.',
    'deferred': 'The game was busy and skipped or delayed something.',
    'dropped': 'The game was busy and skipped or delayed something.',
    'paused': 'The game paused, or ran out of room for values.',
    'state-full': 'The game paused, or ran out of room for values.'
});

const FALLBACK_TEXT = 'Something in Game Rules needs a look.';
const LOCAL_CODES = Object.freeze(['unsupported', 'global-var', 'cycle', 'limit', 'too-big', 'name']);

const messageId = code => `sq.rules.err.${code}`;

const kidText = code => KID_TEXT[code] || FALLBACK_TEXT;

const normalizeError = error => {
    const code = error && typeof error.code === 'string' ? error.code : 'unknown';
    return {
        blockId: error && typeof error.blockId === 'string' ? error.blockId : null,
        code,
        detail: error && typeof error.detail !== 'undefined' ? error.detail : null,
        n: error && Number.isFinite(error.n) ? error.n : 1,
        id: messageId(code),
        text: kidText(code)
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
    LOCAL_CODES,
    messageId,
    kidText,
    parseRulesStatus,
    createRulesStatus,
    rulesStatus
};
