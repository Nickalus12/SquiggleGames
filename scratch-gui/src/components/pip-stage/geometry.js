const MARGIN = 16;
const KEY_STEP = 16;
const KEY_STEP_BIG = 64;

const clampPip = (pos, size, viewport) => {
    const maxX = Math.max(MARGIN, viewport.width - size.width - MARGIN);
    const maxY = Math.max(MARGIN, viewport.height - size.height - MARGIN);
    return {
        x: Math.round(Math.min(maxX, Math.max(MARGIN, pos.x))),
        y: Math.round(Math.min(maxY, Math.max(MARGIN, pos.y)))
    };
};

const defaultPip = (size, viewport) => clampPip({
    x: viewport.width - size.width - MARGIN,
    y: viewport.height - size.height - MARGIN
}, size, viewport);

const resolvePip = (saved, size, viewport) => (saved ? clampPip(saved, size, viewport) : defaultPip(size, viewport));

const nudge = (pos, key, big) => {
    const step = big ? KEY_STEP_BIG : KEY_STEP;
    switch (key) {
    case 'ArrowLeft':
        return {x: pos.x - step, y: pos.y};
    case 'ArrowRight':
        return {x: pos.x + step, y: pos.y};
    case 'ArrowUp':
        return {x: pos.x, y: pos.y - step};
    case 'ArrowDown':
        return {x: pos.x, y: pos.y + step};
    default:
        return null;
    }
};

const isFocusKey = event => (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey &&
    (event.key === 'f' || event.key === 'F');

export {MARGIN, clampPip, defaultPip, resolvePip, nudge, isFocusKey};
