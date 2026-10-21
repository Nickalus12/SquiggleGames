const MINE = 'mine';
const THEIRS = 'theirs';

const createKeepWork = () => {
    let handler = null;
    let asking = null;

    const ask = (details = {}) => {
        if (asking) return asking;
        if (typeof handler !== 'function') return Promise.resolve(THEIRS);
        const pending = Math.max(0, Math.floor(Number(details.pending)) || 0);
        let choice;
        try {
            choice = Promise.resolve(handler({pending}));
        } catch (e) {
            choice = Promise.reject(e);
        }
        asking = choice
            .then(c => (c === MINE ? MINE : THEIRS), () => THEIRS)
            .then(c => {
                asking = null;
                return c;
            });
        return asking;
    };

    return {
        ask,
        isAsking: () => asking !== null,
        setHandler (fn) {
            handler = typeof fn === 'function' ? fn : null;
        }
    };
};

const keepWork = createKeepWork();

const askKeepWork = details => keepWork.ask(details);
const setKeepWorkHandler = fn => keepWork.setHandler(fn);

export {MINE, THEIRS, askKeepWork, createKeepWork, setKeepWorkHandler};
