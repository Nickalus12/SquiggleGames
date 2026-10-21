import client from './client';
import chat from './chat';

const storage = (() => {
    try {
        return window.localStorage;
    } catch (e) {
        return null;
    }
})();

const room = chat.createChatStore({
    send: msg => client.send(msg),
    storage
});

client.on('welcome', msg => room.setSelf({handle: msg && msg.me && msg.me.handle}));
client.on('room-chat-config', room.handleConfig);
client.on('room-chat-history', room.handleHistory);
client.on('room-chat', room.handleMessage);
client.on('room-chat-blocked', room.handleBlocked);
client.on('room-chat-removed', room.handleRemoved);

const reportMessage = (id, reason) => {
    const base = location.port === '8601' ? `http://${location.hostname}:4455` : '';
    return fetch(`${base}/api/chat/${encodeURIComponent(id)}/report`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'content-type': 'application/json', 'x-squiggle': '1'},
        body: JSON.stringify({reason})
    }).then(r => {
        if (!r.ok) throw new Error(`http-${r.status}`);
        room.markReported(id);
        return true;
    });
};

export {reportMessage};
export default room;
