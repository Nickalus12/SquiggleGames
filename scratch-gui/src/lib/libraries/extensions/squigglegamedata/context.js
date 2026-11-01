const ROOM_KEY = 'sq_room';
const PROJECT_URL = /^(?:https?:\/\/[^/]+)?\/api\/projects\/([^/?#]+)\/sb3(?:[?#].*)?$/;

const projectFromSearch = search => {
    const url = new URLSearchParams(search || '').get('project_url') || '';
    const match = PROJECT_URL.exec(url);
    if (!match) return null;
    try {
        return decodeURIComponent(match[1]);
    } catch (e) {
        return null;
    }
};

const roomFrom = (where, session) => {
    const fromPath = (String((where && where.pathname) || '').match(/^\/r\/([A-Za-z0-9_-]+)/) || [])[1];
    const fromQuery = (new URLSearchParams((where && where.search) || '').get('room') || '').trim();
    if (fromPath || fromQuery) return fromPath || fromQuery;
    try {
        return (session && session.getItem(ROOM_KEY)) || '';
    } catch (e) {
        return '';
    }
};

const readJson = (fetchImpl, url) => fetchImpl(url, {credentials: 'include', headers: {accept: 'application/json'}})
    .then(res => (res.ok ? res.json() : null))
    .catch(() => null);

const createContext = ({where, session, fetchImpl, base = ''}) => {
    const startSearch = where ? where.search : '';
    const startPath = where ? where.pathname : '';
    return () => {
        const projectId = projectFromSearch(startSearch);
        const room = projectId ? '' : roomFrom({pathname: startPath, search: startSearch}, session);
        const me = readJson(fetchImpl, `${base}/api/me`).then(data => !!(data && data.user));
        const project = projectId ? Promise.resolve(projectId) : room ?
            readJson(fetchImpl, `${base}/api/rooms/${encodeURIComponent(room)}/game`)
                .then(data => (data && typeof data.projectId === 'string' ? data.projectId : null)) :
            Promise.resolve(null);
        return Promise.all([project, me]).then(([id, signedIn]) => ({projectId: id, signedIn}));
    };
};

export {
    createContext,
    projectFromSearch,
    roomFrom
};
