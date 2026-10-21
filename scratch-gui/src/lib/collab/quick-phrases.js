const PHRASE_EVERY_MS = 2000;
const PHRASE_BURST = 2;
const PHRASE_MAX = 63;

const TABLE = [
    ['ping', 'Over here!'],
    ['look', 'Look at this!'],
    ['nice', 'Nice work!'],
    ['help', 'Can you help me?'],
    ['myturn', 'My turn!'],
    ['turn', 'Your turn!'],
    ['wait', 'Wait a moment, please.'],
    ['try', 'Try it now!'],
    ['oops', 'Oops!'],
    ['hi', 'Hi!'],
    ['bye', 'Bye, see you next time!'],
    ['cool', 'That looks so cool!'],
    ['idea', 'I have an idea!'],
    ['fix', 'I can fix that.'],
    ['bug', 'I found a bug.'],
    ['ready', 'Ready?'],
    ['yes', 'Yes!'],
    ['no', 'No, thank you.'],
    ['thanks', 'Thank you!'],
    ['again', 'Let\'s play again!'],
    ['gg', 'Good game!'],
    ['smile', '😀'],
    ['laugh', '😂'],
    ['thumbs', '👍'],
    ['party', '🎉'],
    ['star', '⭐'],
    ['heart', '💜'],
    ['almost', 'Almost there!'],
    ['test', 'Let\'s test it!'],
    ['done', 'I\'m done!'],
    ['brb', 'Be right back!'],
    ['follow', 'Follow me!']
];

const CHAT_IDS = new Set([
    'hi', 'bye', 'nice', 'cool', 'look', 'try', 'idea', 'help', 'fix', 'bug', 'wait', 'ready',
    'yes', 'no', 'thanks', 'turn', 'again', 'gg', 'smile', 'laugh', 'thumbs', 'party', 'star', 'heart'
]);

const PHRASES = TABLE.map(([id, text], n) => ({
    n,
    id,
    chat: CHAT_IDS.has(id),
    message: {
        id: `sq.phrase.${id}`,
        defaultMessage: text,
        description: 'A quick phrase a player can send to everyone in the room'
    }
}));

const byId = new Map(PHRASES.map(p => [p.id, p]));

const findPhrase = id => {
    if (typeof id === 'number') return Number.isInteger(id) && id >= 0 ? (PHRASES[id] || null) : null;
    if (typeof id === 'string') return byId.get(id) || null;
    return null;
};

const phraseText = (id, formatMessage) => {
    const phrase = findPhrase(id);
    if (!phrase) return null;
    return typeof formatMessage === 'function' ? formatMessage(phrase.message) : phrase.message.defaultMessage;
};

const chatPhrases = allowed => {
    const list = PHRASES.filter(p => p.chat);
    if (!Array.isArray(allowed) || !allowed.length) return list;
    const ids = new Set(allowed.map(p => (p && typeof p === 'object' ? p.id : p)));
    return list.filter(p => ids.has(p.id));
};

const bubbleFrame = (id, place) => {
    const phrase = findPhrase(id);
    if (!phrase || phrase.n > PHRASE_MAX) return null;
    const frame = {type: 'phrase', id: phrase.n};
    if (place && typeof place.targetId === 'string' && place.targetId) frame.targetId = place.targetId.slice(0, 64);
    if (place && typeof place.blockId === 'string' && place.blockId) frame.blockId = place.blockId.slice(0, 64);
    if (place && Number.isFinite(place.x) && Number.isFinite(place.y)) {
        frame.x = Math.round(place.x);
        frame.y = Math.round(place.y);
    }
    return frame;
};

const createPhraseLimiter = ({now = () => Date.now(), every = PHRASE_EVERY_MS, burst = PHRASE_BURST} = {}) => {
    const buckets = new Map();
    const level = key => {
        const t = now();
        const bucket = buckets.get(key) || {tokens: burst, at: t};
        bucket.tokens = Math.min(burst, bucket.tokens + ((t - bucket.at) / every));
        bucket.at = t;
        buckets.set(key, bucket);
        return bucket;
    };
    return {
        allow (key) {
            const bucket = level(String(key));
            if (bucket.tokens < 1) return false;
            bucket.tokens -= 1;
            return true;
        },
        waitMs (key) {
            const bucket = level(String(key));
            return bucket.tokens >= 1 ? 0 : Math.ceil((1 - bucket.tokens) * every);
        },
        forget (key) {
            buckets.delete(String(key));
        }
    };
};

const freeTextAllowed = ({mode, locked, guest, childSafe} = {}) =>
    mode === 'free' && locked !== true && guest !== true && childSafe !== true;

export {
    CHAT_IDS,
    PHRASES,
    PHRASE_BURST,
    PHRASE_EVERY_MS,
    PHRASE_MAX,
    bubbleFrame,
    chatPhrases,
    createPhraseLimiter,
    findPhrase,
    freeTextAllowed,
    phraseText
};
