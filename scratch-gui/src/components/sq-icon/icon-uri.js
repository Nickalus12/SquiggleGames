import {GRID, ICONS, STROKE} from './icons';

const escapeAttr = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

const shapeMarkup = ([tag, attrs]) => {
    const parts = Object.keys(attrs)
        .filter(key => attrs[key] !== null && typeof attrs[key] !== 'undefined')
        .map(key => `${key}="${escapeAttr(attrs[key])}"`);
    return `<${tag} ${parts.join(' ')}/>`;
};

const sqIconSvg = (name, options = {}) => {
    const {color = '#ffffff', size = GRID, background = null, radius = 4} = options;
    const shapes = ICONS[name];
    if (!shapes) return null;
    const pad = background ? 4 : 0;
    const box = GRID + (pad * 2);
    const bg = background ?
        `<rect width="${box}" height="${box}" rx="${radius}" fill="${escapeAttr(background)}"/>` :
        '';
    const body = shapes.map(shapeMarkup).join('')
        .replace(/currentColor/g, escapeAttr(color));
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${box} ${box}">`,
        bg,
        `<g transform="translate(${pad} ${pad})" fill="none" stroke="${escapeAttr(color)}"`,
        ` stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">`,
        body,
        '</g></svg>'
    ].join('');
};

const sqIconDataUri = (name, options) => {
    const svg = sqIconSvg(name, options);
    if (!svg) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export {
    sqIconDataUri,
    sqIconSvg
};
