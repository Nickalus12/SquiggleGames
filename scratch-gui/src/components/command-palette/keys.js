const PALETTE_EVENT = 'sq-command-palette';

const isPaletteKey = event => (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
    (event.key === 'k' || event.key === 'K');

const paletteEventAction = (event, open) => {
    const detail = event && event.detail;
    if (detail && detail.open === false) return open ? 'close' : null;
    return open ? null : 'open';
};

const listenForPaletteEvent = (win, isOpen, act) => {
    if (!win || typeof win.addEventListener !== 'function') return () => {};
    const handle = event => {
        event.preventDefault();
        const action = paletteEventAction(event, isOpen());
        if (action) act(action);
    };
    win.addEventListener(PALETTE_EVENT, handle);
    return () => win.removeEventListener(PALETTE_EVENT, handle);
};

export {
    PALETTE_EVENT,
    isPaletteKey,
    listenForPaletteEvent,
    paletteEventAction
};
