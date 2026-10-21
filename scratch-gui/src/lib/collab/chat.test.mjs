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
        console.log(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`);
    }
};

const src = fs.readFileSync(path.join(here, 'chat.js'), 'utf8')
    .replace(/^export default (\{[^}]*\});\s*$/m, 'return $1;');
const chat = new Function(src)();

const memoryStorage = () => {
    const data = new Map();
    return {
        getItem: k => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => data.set(k, String(v)),
        data
    };
};

const make = (opts = {}) => {
    const sent = [];
    const storage = opts.storage || memoryStorage();
    const store = chat.createChatStore({send: m => sent.push(m), storage});
    return {store, sent, storage};
};

const PHRASES = [{id: 'hi', text: 'Hi!'}, {id: 'cool', text: 'That is so cool!'}];
const config = extra => Object.assign({
    mode: 'free',
    on: true,
    muted: false,
    phrases: PHRASES,
    canModerate: false
}, extra);
const row = (id, extra) => Object.assign({
    id,
    userId: 2,
    handle: 'sam',
    name: 'Sam',
    color: '#22c55e',
    text: `m${id}`,
    ts: id
}, extra);

{
    const {store} = make();
    store.handleConfig(config({mode: 'weird', phrases: [{id: 'hi', text: 'Hi!'}, {id: 3}]}));
    const c = store.getState().config;
    ok('unknown mode falls back to quick', c.mode === 'quick', c.mode);
    ok('bad phrases are dropped', c.phrases.length === 1, c.phrases);
}

{
    const {store} = make();
    store.handleHistory({messages: [row(1), {text: 'no id'}, row(2)]});
    ok('history keeps rows with ids', store.getState().messages.map(m => m.id).join() === '1,2');
    store.handleMessage(row(3));
    store.handleMessage(row(3));
    ok('a repeated id is added once', store.getState().messages.length === 3);
    ok('lastAdded tracks the newest row', store.getState().lastAdded === 3);
    store.handleRemoved({id: 2});
    ok('removed ids drop out of history', store.getState().messages.map(m => m.id).join() === '1,3');
    store.handleHistory({messages: []});
    ok('a new history replaces the old one', store.getState().messages.length === 0);
}

{
    const {store} = make();
    store.handleHistory({messages: Array.from({length: 205}, (_, i) => row(i + 1))});
    ok('history is capped at 200', store.getState().messages.length === 200);
    store.handleMessage(row(999));
    const ids = store.getState().messages.map(m => m.id);
    ok('the cap drops the oldest row', ids.length === 200 && ids[0] === 7 && ids[199] === 999, ids.slice(0, 2));
}

{
    const {store, sent} = make();
    ok('nothing sends before config', store.sendText('hi') === false && sent.length === 0);
    store.handleConfig(config());
    ok('blank text is not sent', store.sendText('   ') === false);
    store.sendText(`  ${'a'.repeat(400)}  `);
    ok('free text is trimmed and cut to 300', sent[0].type === 'room-chat' && sent[0].text.length === 300, sent[0]);
    store.sendPhrase('hi');
    ok('a phrase sends its id', sent[1].phrase === 'hi' && !('text' in sent[1]), sent[1]);
    ok('an unknown phrase is not sent', store.sendPhrase('nope') === false && sent.length === 2);
    store.handleConfig(config({mode: 'quick'}));
    ok('quick mode refuses free text', store.sendText('hello') === false && sent.length === 2);
    store.handleConfig(config({on: false}));
    ok('chat off refuses phrases', store.sendPhrase('hi') === false);
    store.handleConfig(config({muted: true}));
    ok('muted refuses phrases', store.sendPhrase('hi') === false && sent.length === 2);
}

{
    const {store} = make();
    store.handleConfig(config());
    store.sendText('slow down text');
    store.handleBlocked({reason: 'rate', message: 'Wait a few seconds, then try again.'});
    ok('the server message is shown as is', store.getState().blocked.message === 'Wait a few seconds, then try again.');
    ok('a rate block gives the text back', store.takeRestoreText() === 'slow down text');
    ok('the restore text is taken once', store.takeRestoreText() === null);
    store.sendText('badword');
    store.handleBlocked({reason: 'filter'});
    ok('a filter block uses the built in copy', store.getState().blocked.message === chat.BLOCKED_TEXT.filter);
    ok('a filter block does not give the text back', store.takeRestoreText() === null);
    store.handleMessage(row(1, {mine: true}));
    ok('your own echo clears the block', store.getState().blocked === null);
    store.handleBlocked({reason: 'off'});
    store.handleConfig(config({on: true}));
    ok('chat coming back on clears an off block', store.getState().blocked === null);
    store.handleBlocked({});
    ok('a block with no reason reads as filter', store.getState().blocked.reason === 'filter');
}

{
    const {store} = make();
    store.setSelf({handle: 'robin'});
    store.handleMessage(row(1));
    store.handleMessage(row(2, {handle: 'robin', userId: 1}));
    ok('other people raise unread, you do not', store.getState().unread === 1, store.getState().unread);
    ok('a handle match counts as mine', store.isMine(store.getState().messages[1]));
    store.setVisible('panel', true);
    ok('opening a view clears unread', store.getState().unread === 0);
    store.handleMessage(row(3));
    ok('no unread while a view is open', store.getState().unread === 0);
    store.setVisible('panel', false);
    store.handleMessage(row(4));
    ok('unread counts again once closed', store.getState().unread === 1);
}

{
    const {store, storage} = make();
    store.setHidden(2, true);
    ok('hiding is saved', storage.getItem('sq_chat_hidden') === '[2]');
    store.handleMessage(row(1));
    ok('hidden people do not raise unread', store.getState().unread === 0);
    ok('isHidden matches by user id', store.isHidden(store.getState().messages[0]));
    const again = make({storage}).store;
    ok('a new store reads the saved list', again.getState().hidden.join() === '2');
    store.setHidden(2, false);
    ok('showing again removes the user', storage.getItem('sq_chat_hidden') === '[]');
    const broken = {
        getItem: () => '{bad',
        setItem: () => {
            throw new Error('full');
        }
    };
    const safe = chat.createChatStore({send: () => true, storage: broken});
    safe.setHidden(5, true);
    ok('broken storage still hides in memory', safe.getState().hidden.join() === '5');
}

{
    const {store, sent} = make();
    store.handleConfig(config());
    ok('members cannot change settings', store.setOn(false) === false && sent.length === 0);
    ok('members cannot mute', store.setMuted(2, true) === false && sent.length === 0);
    store.handleConfig(config({canModerate: true, mutedUserIds: [3, 'x']}));
    ok('owners get the muted list', store.isMuted(3) && store.getState().mutedUserIds.length === 1);
    store.setOn(false);
    ok('the switch sends room-chat-settings', sent[0].type === 'room-chat-settings' && sent[0].on === false);
    ok('the switch updates config right away', store.getState().config.on === false);
    store.setMuted(2, true);
    ok('mute sends room-chat-mute',
        sent[1].type === 'room-chat-mute' && sent[1].userId === 2 && sent[1].muted === true);
    ok('mute shows right away', store.isMuted(2));
    store.setMuted(2, false);
    ok('unmute clears it', !store.isMuted(2) && sent[2].muted === false);
    store.handleConfig(config({canModerate: false}));
    ok('losing owner rights clears the list', store.getState().mutedUserIds.length === 0);
}

{
    const {store} = make();
    store.handleConfig(config());
    store.handleMessage(row(1));
    store.markReported(1);
    store.markReported(1);
    ok('a report is stored once', store.getState().reported.join() === '1');
    store.reset();
    const s = store.getState();
    ok('reset clears room state', !s.config && !s.messages.length && !s.reported.length && s.unread === 0);
}

{
    let calls = 0;
    const store = chat.createChatStore({send: () => true, storage: null});
    store.subscribe(() => {
        calls++;
        throw new Error('view broke');
    });
    const quiet = console.error;
    console.error = () => {};
    store.handleConfig(config());
    console.error = quiet;
    ok('a broken view does not stop the store', calls === 1 && !!store.getState().config);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
