const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relativeTime = (ts, now) => {
    const diff = Math.max(0, now - ts);
    if (diff < 45 * 1000) return {unit: 'now', n: 0};
    if (diff < HOUR) return {unit: 'min', n: Math.min(59, Math.max(1, Math.round(diff / MINUTE)))};
    if (diff < DAY) return {unit: 'hr', n: Math.floor(diff / HOUR)};
    return {unit: 'day', n: Math.floor(diff / DAY)};
};

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const splitMentions = (text, handle) => {
    const source = String(text || '');
    if (!handle) return [{text: source, mention: false}];
    const re = new RegExp(`(^|[^\\w@])(@${escapeRegExp(handle)})(?![\\w-])`, 'gi');
    const parts = [];
    let at = 0;
    let match;
    while ((match = re.exec(source))) {
        const start = match.index + match[1].length;
        if (start > at) parts.push({text: source.slice(at, start), mention: false});
        parts.push({text: match[2], mention: true});
        at = start + match[2].length;
    }
    if (at < source.length || !parts.length) parts.push({text: source.slice(at), mention: false});
    return parts;
};

const mentions = (text, handle) => splitMentions(text, handle).some(p => p.mention);

const parseHex = hex => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].split('').map(c => c + c)
        .join('') : m[1];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};

const luminance = rgb => {
    const [r, g, b] = rgb.map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
};

const contrast = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const toHex = rgb => `#${rgb.map(v => Math.round(v).toString(16)
    .padStart(2, '0')).join('')}`;

const readableColor = (color, background, minimum) => {
    const bg = parseHex(background) || [22, 28, 54];
    const fg = parseHex(color);
    const target = minimum || 4.5;
    if (!fg) return '#f2f4fb';
    for (let mix = 0; mix <= 1.0001; mix += 0.05) {
        const rgb = fg.map(v => v + ((255 - v) * mix));
        if (contrast(rgb, bg) >= target) return toHex(rgb);
    }
    return '#ffffff';
};

const badgeCount = n => {
    if (!n || n < 1) return '';
    return n > 99 ? '99+' : String(n);
};

export default {relativeTime, splitMentions, mentions, readableColor, contrast, parseHex, badgeCount};
