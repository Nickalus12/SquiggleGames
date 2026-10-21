const apiBase = () => {
    try {
        return location.port === '8601' ? `http://${location.hostname}:4455` : '';
    } catch (e) {
        return '';
    }
};

const request = (path, {method = 'GET', body, fetcher} = {}) => {
    const run = fetcher || (typeof fetch === 'function' ? fetch : null);
    if (!run) return Promise.reject(new Error('no-fetch'));
    const init = {method, credentials: 'same-origin', headers: {'x-squiggle': '1'}};
    if (typeof body !== 'undefined') {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    return Promise.resolve(run(`${apiBase()}${path}`, init)).then(r => {
        if (r && r.ok) return r.json();
        const err = new Error(`http-${r ? r.status : 0}`);
        const parsed = r && typeof r.json === 'function' ? Promise.resolve(r.json()).catch(() => null) : null;
        return Promise.resolve(parsed).then(d => {
            if (d && typeof d.error === 'string') err.code = d.error;
            if (d && typeof d.message === 'string') err.friendly = d.message;
            throw err;
        });
    });
};

const patchRoom = (slug, body, fetcher) => {
    if (!slug) return Promise.reject(new Error('no-room'));
    return request(`/api/rooms/${encodeURIComponent(slug)}`, {method: 'PATCH', body, fetcher});
};

const listProjects = fetcher => request('/api/projects', {fetcher})
    .then(out => (out && Array.isArray(out.mine) ? out.mine : []));

const createRoom = (body, fetcher) =>
    request('/api/rooms', {method: 'POST', body: body || {}, fetcher}).then(out => (out && out.room) || null);

const createInvite = (slug, body, fetcher) =>
    request(`/api/rooms/${encodeURIComponent(slug)}/invites`, {method: 'POST', body: body || {}, fetcher});

const roomPageUrl = slug => `/editor.html?room=${encodeURIComponent(slug)}`;

const roomHistory = (slug, fetcher) =>
    request(`/api/rooms/${encodeURIComponent(slug)}/history`, {fetcher});

const historySummary = (slug, v, fetcher) =>
    request(`/api/rooms/${encodeURIComponent(slug)}/history/${encodeURIComponent(v)}`, {fetcher});

const restoreVersion = (slug, row, fetcher) => {
    const body = row && typeof row.v === 'number' ? {v: row.v} : {file: row && row.file};
    return request(`/api/rooms/${encodeURIComponent(slug)}/history/restore`, {method: 'POST', body, fetcher});
};

export {
    apiBase,
    createInvite,
    createRoom,
    historySummary,
    listProjects,
    patchRoom,
    request,
    restoreVersion,
    roomHistory,
    roomPageUrl
};
