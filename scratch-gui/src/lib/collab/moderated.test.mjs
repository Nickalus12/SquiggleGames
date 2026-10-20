import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
    }
};

const el = (tagName, attrs, children = [], textContent = '') => ({
    tagName,
    children,
    textContent,
    getAttribute: k => (k in attrs ? attrs[k] : null)
});

const parse = xml => {
    const root = el('xml', {});
    const stack = [root];
    const re = /<(\/?)(\w+)([^>]*?)(\/?)>|([^<]+)/g;
    let match;
    while ((match = re.exec(xml))) {
        const [, closing, tag, attrText, selfClosing, text] = match;
        const top = stack[stack.length - 1];
        if (text) {
            top.textContent += text;
            continue;
        }
        if (closing) {
            stack.pop();
            continue;
        }
        const attrs = {};
        attrText.replace(/(\w+)="([^"]*)"/g, (m, k, v) => {
            attrs[k] = v;
        });
        const node = el(tag, attrs);
        top.children.push(node);
        if (!selfClosing) stack.push(node);
    }
    const all = [];
    const walk = n => {
        for (const c of n.children) {
            if (c.tagName === 'block' || c.tagName === 'shadow') all.push(c);
            walk(c);
        }
    };
    walk(root);
    return {querySelectorAll: () => all};
};

let parserThrows = false;
const DOMParser = class {
    parseFromString (xml) {
        if (parserThrows) throw new Error('bad xml');
        return parse(xml);
    }
};

const src = fs.readFileSync(path.join(here, 'moderated.js'), 'utf8')
    .replace(/^export default (\{[^}]*\});\s*$/m, 'return $1;');
const moderated = new Function('DOMParser', src)(DOMParser);

ok('the server message wins when it sends one',
    moderated.moderatedText({message: 'That word is not allowed.'}) === 'That word is not allowed.');
ok('a missing message falls back to the kind default',
    moderated.moderatedText({}) === moderated.MODERATED_TEXT);
ok('a non-string message falls back to the kind default',
    moderated.moderatedText({message: {html: '<b>x</b>'}}) === moderated.MODERATED_TEXT);

const create = {
    type: 'block-event',
    target: 'Sprite1',
    event: {
        type: 'create',
        blockId: 'b1',
        xml: '<block type="looks_sayforsecs" id="b1"><value name="MESSAGE"><shadow type="text" id="s1">' +
            '<field name="TEXT">*****</field></shadow></value><field name="VARIABLE" id="v1">score</field></block>'
    }
};
const changes = moderated.maskedBlockEvents(create);
ok('a masked create is replayed as field changes, never a delete',
    changes.length === 1 && changes.every(c => c.event.type === 'change'), changes.map(c => c.event));
ok('the masked text lands on the shadow that held it',
    changes[0].event.blockId === 's1' && changes[0].event.name === 'TEXT' && changes[0].event.newValue === '*****',
    changes[0] && changes[0].event);
ok('variable fields with an id are left alone', !changes.some(c => c.event.name === 'VARIABLE'));
ok('the target rides along on each change', changes.every(c => c.target === 'Sprite1'));

const guardShape = {
    type: 'moderated',
    of: 'block-event',
    target: 'Sprite1',
    message: 'Some words were hidden.',
    category: 'profanity',
    event: {type: 'create', blockId: 'b3', xml: '<block id="b3"><field name="TEXT">raw words</field></block>'},
    masked: {
        type: 'block-event',
        target: 'Sprite1',
        from: 'u2',
        fromName: 'Kid',
        color: '#fff',
        event: {
            type: 'create',
            blockId: 'b3',
            xml: '<block type="looks_say" id="b3"><field name="TEXT">***</field>' +
                '<comment id="c7" pinned="false">****</comment></block>'
        }
    }
};
const fromGuard = moderated.maskedBlockEvents(guardShape.masked);
ok('the guard\'s masked copy replays the masked field, not the original text',
    fromGuard.some(c => c.event.type === 'change' && c.event.blockId === 'b3' && c.event.newValue === '***') &&
    !fromGuard.some(c => JSON.stringify(c).includes('raw words')), fromGuard.map(c => c.event));
ok('a block comment inside the masked xml is masked too',
    fromGuard.some(c => c.event.type === 'comment_change' && c.event.commentId === 'c7' &&
        c.event.newContents_.text === '****'), fromGuard.map(c => c.event));
ok('the replayed events keep the sprite they belong to', fromGuard.every(c => c.target === 'Sprite1'));

parserThrows = true;
ok('unparseable xml applies nothing instead of crashing', moderated.maskedBlockEvents(create).length === 0);
parserThrows = false;

const varCreate = moderated.maskedBlockEvents({
    type: 'block-event', target: 'Stage', event: {type: 'var_create', varId: 'v9', varName: '****'}
});
ok('a masked new variable becomes a rename of the one already made',
    varCreate.length === 1 && varCreate[0].event.type === 'var_rename' &&
    varCreate[0].event.varId === 'v9' && varCreate[0].event.newName === '****', varCreate);

const comment = moderated.maskedBlockEvents({
    type: 'block-event', target: 'Sprite1', event: {type: 'comment_create', commentId: 'c1', text: '***'}
});
ok('a masked new comment becomes a text change on that comment',
    comment.length === 1 && comment[0].event.type === 'comment_change' &&
    comment[0].event.newContents.text === '***' && comment[0].event.newContents_.text === '***', comment);

const change = {type: 'block-event', target: 'Sprite1', event: {type: 'change', blockId: 'b2', newValue: '***'}};
ok('a masked field change applies as sent', moderated.maskedBlockEvents(change)[0] === change);
ok('a masked message with no event applies nothing', moderated.maskedBlockEvents({type: 'block-event'}).length === 0);

ok('a refused create is undone by deleting that block',
    JSON.stringify(moderated.inverseBlockEvent({type: 'create', blockId: 'b1', ids: ['b1']})) ===
    JSON.stringify({type: 'delete', blockId: 'b1', ids: ['b1']}));
const undone = moderated.inverseBlockEvent({
    type: 'change', blockId: 'b2', name: 'TEXT', oldValue: 'hi', newValue: 'bad'
});
ok('a refused field change puts the old text back', undone.newValue === 'hi' && undone.oldValue === 'bad', undone);
ok('a refused rename puts the old name back',
    moderated.inverseBlockEvent({type: 'var_rename', varId: 'v1', oldName: 'a', newName: 'bad'}).newName === 'a');
ok('a refused new variable is removed',
    moderated.inverseBlockEvent({type: 'var_create', varId: 'v1', varName: 'bad'}).type === 'var_delete');
ok('a refused new comment is removed',
    moderated.inverseBlockEvent({type: 'comment_create', commentId: 'c1'}).type === 'comment_delete');
ok('an event it cannot undo is left alone', moderated.inverseBlockEvent({type: 'move', blockId: 'b1'}) === null);
ok('a malformed event is left alone', moderated.inverseBlockEvent(null) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
