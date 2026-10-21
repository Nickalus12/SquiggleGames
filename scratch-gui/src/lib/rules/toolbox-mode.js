import {OPEN_RULES_FUNC, ruleCards, ruleOpcodeSet} from './rule-blocks.js';

const MODE_RULES = 'rules';
const MODE_DEVICE = 'device';

const ruleSet = ruleOpcodeSet();
const cardSet = new Set(ruleCards());

const attr = (tag, name) => {
    const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
    return match ? match[1] : null;
};

const closeOf = (body, name, from) => {
    const opener = new RegExp(`<${name}(?=[\\s/>])|</${name}>`, 'g');
    opener.lastIndex = from;
    let depth = 1;
    let match;
    while ((match = opener.exec(body))) {
        if (match[0].charAt(1) === '/') {
            depth--;
            if (depth === 0) return match.index + match[0].length;
        } else {
            const end = body.indexOf('>', match.index);
            if (end !== -1 && body.charAt(end - 1) !== '/') depth++;
        }
    }
    return body.length;
};

const tokenize = body => {
    const items = [];
    let i = 0;
    while (i < body.length) {
        const start = body.indexOf('<', i);
        if (start === -1) break;
        const nameMatch = body.slice(start).match(/^<([A-Za-z][\w-]*)/);
        if (!nameMatch) {
            i = start + 1;
            continue;
        }
        const name = nameMatch[1];
        const openEnd = body.indexOf('>', start);
        if (openEnd === -1) break;
        const openTag = body.slice(start, openEnd + 1);
        const end = body.charAt(openEnd - 1) === '/' ? openEnd + 1 : closeOf(body, name, openEnd + 1);
        items.push({name, openTag, xml: body.slice(start, end)});
        i = end;
    }
    return items;
};

const splitCategory = xml => {
    const openStart = xml.indexOf('<category');
    const openEnd = openStart === -1 ? -1 : xml.indexOf('>', openStart);
    const closeStart = xml.lastIndexOf('</category>');
    if (openEnd === -1 || closeStart === -1 || closeStart < openEnd) return null;
    return {
        head: xml.slice(0, openEnd + 1),
        items: tokenize(xml.slice(openEnd + 1, closeStart)),
        tail: xml.slice(closeStart)
    };
};

const isRuleItem = item => item.name === 'block' && ruleSet.has(attr(item.openTag, 'type'));

const isOpenRulesButton = item => {
    if (item.name !== 'button') return false;
    const data = attr(item.openTag, 'callbackData') || '';
    return data.endsWith(`_${OPEN_RULES_FUNC}`);
};

const tidy = items => {
    const out = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.name === 'sep') {
            if (!out.length || out[out.length - 1].name === 'sep') continue;
        } else if (item.name === 'label') {
            const next = items.slice(i + 1).find(other => other.name !== 'sep');
            if (!next || next.name === 'label') continue;
        }
        out.push(item);
    }
    while (out.length && out[out.length - 1].name === 'sep') out.pop();
    return out;
};

const keepFor = (mode, item) => {
    if (mode === MODE_RULES) return isRuleItem(item) || item.name === 'sep' || item.name === 'label';
    return !isRuleItem(item);
};

const filterCategory = (category, mode) => {
    const parts = splitCategory(category.xml);
    if (!parts) return mode === MODE_RULES ? null : category;
    const ruleCard = cardSet.has(category.id);
    if (mode === MODE_RULES && !ruleCard) return null;
    const kept = tidy(parts.items.filter(item => {
        if (isOpenRulesButton(item)) return mode !== MODE_RULES;
        return keepFor(mode, item);
    }));
    if (mode === MODE_RULES && !kept.some(isRuleItem)) return null;
    if (kept.length === parts.items.length) return category;
    return Object.assign({}, category, {xml: `${parts.head}${kept.map(item => item.xml).join('')}${parts.tail}`});
};

const filterCategories = (categories, mode) => categories
    .map(category => filterCategory(category, mode === MODE_RULES ? MODE_RULES : MODE_DEVICE))
    .filter(Boolean);

export {
    MODE_RULES,
    MODE_DEVICE,
    tokenize,
    splitCategory,
    filterCategory,
    filterCategories
};
