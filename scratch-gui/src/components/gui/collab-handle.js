let collab = null;
let pending = null;

const loadCollab = () => {
    if (!pending) {
        pending = import('../../lib/collab').then(mod => {
            collab = mod.default;
            return collab;
        });
    }
    return pending;
};

const loadedCollab = () => collab;

const mayReplaceProject = () => (collab ? collab.mayReplaceProject() : true);

const collabRoomName = () => (collab ? collab.roomName : '');

export {
    collabRoomName,
    loadCollab,
    loadedCollab,
    mayReplaceProject
};
