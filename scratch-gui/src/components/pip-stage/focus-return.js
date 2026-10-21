const FOCUS_BUTTON = '[data-sq-focus-button]';

const idle = (doc, panel) => {
    const active = doc.activeElement;
    return !active || active === doc.body || !!(panel && panel.contains(active));
};

const returnFocus = (doc, saved, panel, raf) => {
    if (!idle(doc, panel)) return;
    if (saved && typeof saved.focus === 'function' && doc.contains(saved)) {
        saved.focus();
        return;
    }
    if (typeof raf !== 'function') return;
    raf(() => {
        const button = doc.querySelector(FOCUS_BUTTON);
        if (button && idle(doc, null)) button.focus();
    });
};

export {FOCUS_BUTTON, returnFocus};
