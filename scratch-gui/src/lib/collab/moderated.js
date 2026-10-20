const MODERATED_TEXT = 'Some words were hidden because they are not allowed here.';

const moderatedText = msg => (msg && typeof msg.message === 'string' && msg.message ? msg.message : MODERATED_TEXT);

const maskedFieldChanges = m => {
    let doc;
    try {
        doc = new DOMParser().parseFromString(m.event.xml, 'text/xml');
    } catch (e) {
        return [];
    }
    const out = [];
    for (const el of doc.querySelectorAll('block, shadow')) {
        const blockId = el.getAttribute('id');
        if (!blockId) continue;
        for (const f of el.children) {
            if (f.tagName === 'comment' && f.getAttribute('id')) {
                const contents = {text: f.textContent};
                out.push(Object.assign({}, m, {event: {
                    type: 'comment_change',
                    commentId: f.getAttribute('id'),
                    newContents: contents,
                    newContents_: contents
                }}));
                continue;
            }
            if (f.tagName !== 'field' || !f.getAttribute('name') || f.getAttribute('id')) continue;
            out.push(Object.assign({}, m, {event: {
                type: 'change', blockId, element: 'field', name: f.getAttribute('name'), newValue: f.textContent
            }}));
        }
    }
    return out;
};

const maskedBlockEvents = m => {
    const e = m && m.event;
    if (!e || typeof e !== 'object') return [];
    if (e.type === 'create' && typeof e.xml === 'string') return maskedFieldChanges(m);
    if (e.type === 'var_create' && e.varId) {
        return [Object.assign({}, m, {event: {type: 'var_rename', varId: e.varId, newName: e.varName}})];
    }
    if (e.type === 'comment_create' && e.commentId) {
        const contents = {text: e.text};
        return [Object.assign({}, m, {event: {
            type: 'comment_change', commentId: e.commentId, newContents: contents, newContents_: contents
        }})];
    }
    return [m];
};

const inverseBlockEvent = e => {
    if (!e || typeof e !== 'object') return null;
    if (e.type === 'create' && e.blockId) return {type: 'delete', blockId: e.blockId, ids: e.ids};
    if (e.type === 'change' && e.blockId) {
        return Object.assign({}, e, {newValue: e.oldValue, oldValue: e.newValue});
    }
    if (e.type === 'var_create' && e.varId) return Object.assign({}, e, {type: 'var_delete'});
    if (e.type === 'var_rename' && e.varId) {
        return {type: 'var_rename', varId: e.varId, newName: e.oldName, oldName: e.newName};
    }
    if (e.type === 'comment_create' && e.commentId) return {type: 'comment_delete', commentId: e.commentId};
    return null;
};

export default {MODERATED_TEXT, moderatedText, maskedBlockEvents, inverseBlockEvent};
