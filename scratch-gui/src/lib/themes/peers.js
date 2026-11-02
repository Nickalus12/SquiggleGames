const PEER_INK_LIGHT = '#ffffff';
const PEER_INK_DARK = '#10142a';
const PEER_OUTLINE_BAR = '#ffffff';
const MAX_PEERS = 20;

const PEER_COLORS = [
    {id: 'coral', name: 'Coral', hex: '#e8505b', ink: PEER_INK_DARK},
    {id: 'orange', name: 'Orange', hex: '#d9700a', ink: PEER_INK_DARK},
    {id: 'amber', name: 'Amber', hex: '#b88700', ink: PEER_INK_DARK},
    {id: 'lime', name: 'Lime', hex: '#5f9e1b', ink: PEER_INK_DARK},
    {id: 'green', name: 'Green', hex: '#1f9d55', ink: PEER_INK_DARK},
    {id: 'teal', name: 'Teal', hex: '#0f9488', ink: PEER_INK_DARK},
    {id: 'cyan', name: 'Cyan', hex: '#0e8fb3', ink: PEER_INK_DARK},
    {id: 'blue', name: 'Blue', hex: '#3f82e3', ink: PEER_INK_DARK},
    {id: 'indigo', name: 'Indigo', hex: '#5b5fe8', ink: PEER_INK_LIGHT},
    {id: 'violet', name: 'Violet', hex: '#9152e0', ink: PEER_INK_LIGHT},
    {id: 'magenta', name: 'Magenta', hex: '#c94fb5', ink: PEER_INK_DARK},
    {id: 'rose', name: 'Rose', hex: '#e0457b', ink: PEER_INK_DARK}
];

const PEER_SHAPES = [
    {id: 'circle', name: 'circle', d: 'M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z', fillRule: 'nonzero'},
    {
        id: 'square',
        name: 'square',
        d: 'M5 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
        fillRule: 'nonzero'
    },
    {id: 'triangle', name: 'triangle', d: 'M10 2.5l8 14.5H2z', fillRule: 'nonzero'},
    {id: 'diamond', name: 'diamond', d: 'M10 2l8 8-8 8-8-8z', fillRule: 'nonzero'},
    {
        id: 'star',
        name: 'star',
        d: 'M10 2.2L12.12 7.69L17.99 8L13.42 11.71L14.94 17.4L10 14.2L5.06 17.4L6.58 11.71L2.01 8L7.88 7.69z',
        fillRule: 'nonzero'
    },
    {
        id: 'ring',
        name: 'ring',
        d: 'M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15zM10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z',
        fillRule: 'evenodd'
    }
];

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
    const normalized = (((slot | 0) % PEER_SLOTS) + PEER_SLOTS) % PEER_SLOTS;
    const color = PEER_COLORS[normalized % PEER_COLORS.length];
    const shape = PEER_SHAPES[Math.floor(normalized / PEER_COLORS.length) % PEER_SHAPES.length];
    return {
        slot: normalized,
        color: color.id,
        hex: color.hex,
        ink: color.ink,
        outlineOnBar: PEER_OUTLINE_BAR,
        shape: shape.id,
        name: `${color.name} ${shape.name}`,
        d: shape.d,
        fillRule: shape.fillRule
    };
};

const PEER_PALETTE = Object.freeze(Array.from({length: MAX_PEERS}, (_, index) => {
    const colorIndex = index % PEER_COLORS.length;
    const shapeIndex = (index < PEER_COLORS.length ? index : index + 1) % PEER_SHAPES.length;
    const slot = (shapeIndex * PEER_COLORS.length) + colorIndex;
    return Object.freeze(Object.assign({index, playerSlot: index + 1}, styleForSlot(slot)));
}));

const playerPeerStyle = slot => {
    const n = Number(slot);
    const index = Number.isFinite(n) && n >= 1 ?
        (Math.floor(n) - 1) % PEER_PALETTE.length :
        Math.abs(n | 0) % PEER_PALETTE.length;
    return PEER_PALETTE[index];
};

const peerSlot = id => hashPeerId(id) % PEER_SLOTS;

const peerStyle = id => styleForSlot(peerSlot(id));

const assignPeerStyles = ids => {
    const unique = Array.from(new Set(ids.map(String)));
    const ordered = unique
        .map(id => ({id, slot: peerSlot(id)}))
        .sort((a, b) => (a.slot - b.slot) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));
    const usedSlots = new Set();
    const colorCount = new Array(PEER_COLORS.length).fill(0);
    const shapeCount = new Array(PEER_SHAPES.length).fill(0);
    const result = {};
    for (let i = 0; i < ordered.length; i++) {
        const {id, slot} = ordered[i];
        const stepCount = ordered.length <= 8 ? ordered.length : Math.max(8, i + 1);
        const colorCap = Math.max(1, Math.ceil(stepCount / PEER_COLORS.length));
        const shapeCap = Math.max(1, Math.ceil(stepCount / PEER_SHAPES.length));
        let chosen = -1;
        for (let step = 0; step < PEER_SLOTS && chosen < 0; step++) {
            const candidate = (slot + step) % PEER_SLOTS;
            const color = candidate % PEER_COLORS.length;
            const shape = Math.floor(candidate / PEER_COLORS.length);
            if (!usedSlots.has(candidate) && colorCount[color] < colorCap && shapeCount[shape] < shapeCap) {
                chosen = candidate;
            }
        }
        for (let step = 0; step < PEER_SLOTS && chosen < 0; step++) {
            const candidate = (slot + step) % PEER_SLOTS;
            if (!usedSlots.has(candidate)) chosen = candidate;
        }
        if (chosen < 0) chosen = slot;
        usedSlots.add(chosen);
        colorCount[chosen % PEER_COLORS.length]++;
        shapeCount[Math.floor(chosen / PEER_COLORS.length)]++;
        result[id] = styleForSlot(chosen);
    }
    return result;
};

export {
    MAX_PEERS,
    PEER_COLORS,
    PEER_INK_DARK,
    PEER_INK_LIGHT,
    PEER_OUTLINE_BAR,
    PEER_PALETTE,
    PEER_SHAPES,
    PEER_SLOTS,
    assignPeerStyles,
    hashPeerId,
    peerSlot,
    peerStyle,
    playerPeerStyle,
    styleForSlot
};
