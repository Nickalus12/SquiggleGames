const mountPlan = ({active, phone, slot}) => {
    const desktop = !!(active && !phone && slot);
    const onPhone = !!(active && phone);
    return {desktop, topBar: onPhone, overlay: desktop || onPhone, docked: !!phone};
};

const needsSync = ({slot, phone, inSlot, rendered}) => !!((slot && !phone && !inSlot) || (!slot && rendered));

const openStep = (wasOpen, {open, phone, onStage}) => {
    if (open && phone && !onStage) return {wasOpen, action: 'close'};
    if (open === wasOpen) return {wasOpen, action: null};
    if (phone) return {wasOpen: open, action: open ? 'openSheet' : 'closeSheet'};
    return {wasOpen: open, action: open ? null : 'focusToggle'};
};

const shouldFocusToggle = ({button, open, active, body, overlay}) =>
    !!(button && !open && (!active || active === body || (overlay && overlay.contains(active))));

const releasePointer = (pointers, gesture, pointerId) => {
    pointers.delete(pointerId);
    if (!gesture) return {gesture: null, stroke: true};
    const mine = gesture.kind === 'pan' ? gesture.id === pointerId : gesture.ids.indexOf(pointerId) !== -1;
    return {gesture: mine ? null : gesture, stroke: false};
};

const createTrayFocus = () => {
    let tray = null;
    let wanted = false;
    const focusFirst = () => {
        if (!tray || !wanted) return false;
        wanted = false;
        const first = tray.querySelector('button:not([disabled])');
        if (first) first.focus();
        return !!first;
    };
    return {
        start (docked) {
            wanted = !docked;
            return focusFirst();
        },
        stop () {
            wanted = false;
        },
        setTray (el) {
            tray = el;
            return focusFirst();
        },
        tray: () => tray
    };
};

export {createTrayFocus, mountPlan, needsSync, openStep, releasePointer, shouldFocusToggle};
