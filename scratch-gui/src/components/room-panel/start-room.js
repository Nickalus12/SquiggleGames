import {createRoom, roomPageUrl} from '../../lib/collab/room-api.js';

const goTo = url => window.location.assign(url);

const startRoomFlow = ({title, inRoom, showRoom, fail, create = createRoom, go = goTo}) => {
    if (inRoom()) {
        showRoom();
        return Promise.resolve('shown');
    }
    const name = String(title || '').trim()
        .slice(0, 60);
    return create(name ? {title: name} : {})
        .then(room => {
            if (!room || !room.slug) throw new Error('no-room');
            go(roomPageUrl(room.slug));
            return 'started';
        })
        .catch(err => {
            const code = err && err.message;
            if (code === 'http-401') {
                go('/');
                return 'sign-in';
            }
            fail(code === 'http-429' ? 'roomLimit' : 'startFailed');
            return 'failed';
        });
};

export default startRoomFlow;
