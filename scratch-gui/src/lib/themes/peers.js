const PEER_COLORS = [
    {id: 'coral', hex: '#e8505b'},
    {id: 'orange', hex: '#d9700a'},
    {id: 'amber', hex: '#b88700'},
    {id: 'lime', hex: '#5f9e1b'},
    {id: 'green', hex: '#1f9d55'},
    {id: 'teal', hex: '#0f9488'},
    {id: 'cyan', hex: '#0e8fb3'},
    {id: 'blue', hex: '#3b7ddd'},
    {id: 'indigo', hex: '#6366f1'},
    {id: 'violet', hex: '#9b5de5'},
    {id: 'magenta', hex: '#c94fb5'},
    {id: 'rose', hex: '#e0457b'}
];

const PEER_SHAPES = [
    {id: 'circle', d: 'M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z', fillRule: 'nonzero'},
    {id: 'square', d: 'M5 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', fillRule: 'nonzero'},
    {id: 'triangle', d: 'M10 2.5l8 14.5H2z', fillRule: 'nonzero'},
    {id: 'diamond', d: 'M10 2l8 8-8 8-8-8z', fillRule: 'nonzero'},
    {
        id: 'star',
        d: 'M10 2.2L12.12 7.69L17.99 8L13.42 11.71L14.94 17.4L10 14.2L5.06 17.4L6.58 11.71L2.01 8L7.88 7.69z',
        fillRule: 'nonzero'
    },
    {
        id: 'ring',
        d: 'M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15zM10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z',
        fillRule: 'evenodd'
    }
];

const PEER_INK = '#ffffff';
const PEER_SLOTS = PEER_COLORS.length * PEER_SHAPES.length;

const hashPeerId = id => {
    const text = String(id);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
};

const styleForSlot = slot => {
    const color = PEER_COLORS[slot % PEER_COLORS.length];
    const shape = PEER_SHAPES[Math.floor(slot / PEER_COLORS.length) % PEER_SHAPES.length];
    return {
        slot,
        color: color.id,
        hex: color.hex,
        ink: PEER_INK,
        shape: shape.id,
        d: shape.d,
        fillRule: shape.fillRule
    };
};

const peerSlot = id => hashPeerId(id) % PEER_SLOTS;

const peerStyle = id => styleForSlot(peerSlot(id));

const assignPeerStyles = ids => {
    const unique = Array.from(new Set(ids.map(String)));
    const ordered = unique
        .map(id => ({id, slot: peerSlot(id)}))
        .sort((a, b) => (a.slot - b.slot) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));
    const usedSlots = new Set();
    const usedColors = new Set();
    const result = {};
    for (const {id, slot} of ordered) {
        let chosen = -1;
        if (usedColors.size < PEER_COLORS.length) {
            for (let step = 0; step < PEER_SLOTS; step++) {
                const candidate = (slot + step) % PEER_SLOTS;
                if (!usedSlots.has(candidate) && !usedColors.has(candidate % PEER_COLORS.length)) {
                    chosen = candidate;
                    break;
                }
            }
        }
        if (chosen < 0) {
            for (let step = 0; step < PEER_SLOTS; step++) {
                const candidate = (slot + step) % PEER_SLOTS;
                if (!usedSlots.has(candidate)) {
                    chosen = candidate;
                    break;
                }
            }
        }
        if (chosen < 0) chosen = slot;
        usedSlots.add(chosen);
        usedColors.add(chosen % PEER_COLORS.length);
        result[id] = styleForSlot(chosen);
    }
    return result;
};

export {
    PEER_COLORS,
    PEER_INK,
    PEER_SHAPES,
    PEER_SLOTS,
    assignPeerStyles,
    hashPeerId,
    peerSlot,
    peerStyle,
    styleForSlot
};
