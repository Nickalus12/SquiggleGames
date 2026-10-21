const MARKS = /[̀-ͯ]/g;
const SPLIT = /\s+/;

const normalize = text => String(text || '')
    .normalize('NFKD')
    .replace(MARKS, '')
    .toLowerCase();

const isWordChar = code => (code >= 48 && code <= 57) || (code >= 97 && code <= 122) || code > 127;

const wordStart = (hay, at) => at === 0 || !isWordChar(hay.charCodeAt(at - 1));

const scoreToken = (hay, token) => {
    const found = hay.indexOf(token);
    if (found !== -1) {
        let score = 100 + (token.length * 4) - Math.min(found, 40);
        if (wordStart(hay, found)) score += 40;
        if (found === 0) score += 30;
        return score;
    }
    let score = 0;
    let at = 0;
    let run = 0;
    for (let i = 0; i < token.length; i++) {
        const next = hay.indexOf(token[i], at);
        if (next === -1) return -1;
        if (next === at && i > 0) {
            run++;
            score += 2 + run;
        } else {
            run = 0;
            score -= Math.min(next - at, 8);
        }
        if (wordStart(hay, next)) score += 6;
        at = next + 1;
    }
    return score + token.length;
};

const prepare = items => items.map(entry => Object.assign({}, entry, {
    hay: normalize([entry.label].concat(entry.keywords || []).join(' '))
}));

const search = (prepared, query, limit) => {
    const max = limit || 50;
    const tokens = normalize(query).trim()
        .split(SPLIT)
        .filter(Boolean);
    if (!tokens.length) return prepared.slice(0, max);
    const hits = [];
    for (let i = 0; i < prepared.length; i++) {
        const entry = prepared[i];
        let total = 0;
        for (let t = 0; t < tokens.length; t++) {
            const score = scoreToken(entry.hay, tokens[t]);
            if (score < 0) {
                total = -1;
                break;
            }
            total += score;
        }
        if (total >= 0) hits.push({entry, score: total - (entry.hay.length / 100) + (entry.boost || 0), i});
    }
    hits.sort((a, b) => (b.score - a.score) || (a.i - b.i));
    const out = [];
    for (let i = 0; i < hits.length && i < max; i++) out.push(hits[i].entry);
    return out;
};

export {normalize, prepare, scoreToken, search};
