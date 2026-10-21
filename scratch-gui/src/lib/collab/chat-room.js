import client from './client';
import chat from './chat';
import {apiBase, patchRoom} from './room-api.js';
import {phraseLabel} from './presence-dom.js';
import {collabRoomName} from '../../components/gui/collab-handle.js';

const storage = (() => {
    try {
        return window.localStorage;
    } catch (e) {
        return null;
    }
})();

const room = chat.createChatStore({
    send: msg => client.send(msg),
    storage,
    patchRoom: body => patchRoom(collabRoomName(), body),
    label: phraseLabel
});

client.on('welcome', msg => {
    const me = (msg && msg.me) || {};
    room.setSelf({
        handle: me.handle,
        guest: me.guest === true || (msg && msg.role === 'guest'),
        childSafe: me.isChild === true || me.childSafe === true
    });
});
client.on('room-chat-config', room.handleConfig);
client.on('room-chat-history', room.handleHistory);
client.on('room-chat', room.handleMessage);
client.on('room-chat-blocked', room.handleBlocked);
client.on('room-chat-removed', room.handleRemoved);

const reportMessage = (id, reason) => fetch(`${apiBase()}/api/chat/${encodeURIComponent(id)}/report`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {'content-type': 'application/json', 'x-squiggle': '1'},
    body: JSON.stringify({reason})
}).then(r => {
    if (!r.ok) throw new Error(`http-${r.status}`);
    room.markReported(id);
    return true;
});

export {reportMessage};
export default room;
