const STATUS_KEYS = Object.freeze({
    loading: 'loading',
    saving: 'saving',
    saved: 'saved',
    offline: 'offline',
    full: 'full'
});

const statusKey = snapshot => {
    if (!snapshot) return 'loading';
    if (STATUS_KEYS[snapshot.status]) return STATUS_KEYS[snapshot.status];
    if (!snapshot.signedIn) return 'signedOut';
    return snapshot.projectId ? 'device' : 'unsaved';
};

const valueText = value => (typeof value === 'number' ? String(value) : `"${value}"`);

const valueRows = snapshot => ((snapshot && snapshot.values) || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(row => ({name: row.name, text: valueText(row.value)}));

const boardRows = snapshot => ((snapshot && snapshot.boards) || [])
    .map(row => ({board: row.board, best: row.best, place: Number.isInteger(row.place) ? row.place : null}));

const usage = snapshot => ({
    used: ((snapshot && snapshot.values) || []).length,
    bytes: (snapshot && snapshot.bytes) || 0
});

export {
    boardRows,
    statusKey,
    usage,
    valueRows,
    valueText
};
