import {NIGHT} from './tokens';

const ZOOM_FILTER_ID = 'sq-zoom-night';
const ZOOM_FILTER = `url(#${ZOOM_FILTER_ID})`;

const SOURCE_FACE = [255, 255, 255];
const SOURCE_GLYPH = [0x57, 0x5e, 0x75].map(c => (0.75 * c) + (0.25 * 255));

const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

const zoomFilterMatrix = (face, glyph) => {
    const to = channels(face);
    const from = channels(glyph);
    const rows = [0, 1, 2].map(i => {
        const slope = (to[i] - from[i]) / (SOURCE_FACE[i] - SOURCE_GLYPH[i]);
        const offset = (to[i] - (slope * SOURCE_FACE[i])) / 255;
        const row = [0, 0, 0, 0, offset];
        row[i] = slope;
        return row.map(n => Number(n.toFixed(4))).join(' ');
    });
    rows.push('0 0 0 1 0');
    return rows.join(' ');
};

const ensureZoomFilter = () => {
    if (typeof document === 'undefined' || document.getElementById(ZOOM_FILTER_ID)) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    const filter = document.createElementNS(ns, 'filter');
    filter.setAttribute('id', ZOOM_FILTER_ID);
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const matrix = document.createElementNS(ns, 'feColorMatrix');
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute('values', zoomFilterMatrix(NIGHT['sq-raised'], NIGHT['sq-text-muted']));
    filter.appendChild(matrix);
    svg.appendChild(filter);
    (document.body || document.documentElement).appendChild(svg);
};

export {
    ZOOM_FILTER,
    ensureZoomFilter,
    zoomFilterMatrix
};
