const ALLOWED_PARENT_HOSTS = new Set([
    'squigglegames.app',
    'beta.squigglegames.app',
    'localhost',
    '127.0.0.1'
]);

const extractHostname = rawValue => {
    if (typeof rawValue !== 'string') return '';
    const trimmed = rawValue.trim().toLowerCase();
    if (!trimmed || trimmed === 'null') return '';
    if (trimmed.includes('://')) {
        try {
            return new URL(trimmed).hostname.toLowerCase();
        } catch (e) {
            return '';
        }
    }
    const hostPort = trimmed.split('/')[0];
    return hostPort.split(':')[0];
};

const hasEmbedParam = rawSearch => {
    if (typeof rawSearch !== 'string' || !rawSearch) return false;
    const idx = rawSearch.indexOf('?');
    const query = idx === -1 ? rawSearch : rawSearch.slice(idx + 1);
    const clean = query.split('#')[0];
    try {
        return new URLSearchParams(clean).get('embed') === '1';
    } catch (e) {
        return false;
    }
};

const readParentOrigin = target => {
    if (!target || typeof target !== 'object') return '';
    if (typeof target.parentOrigin === 'string' && target.parentOrigin.trim()) {
        return target.parentOrigin.trim();
    }
    const loc = target.location;
    if (loc && loc.ancestorOrigins && loc.ancestorOrigins.length > 0 && loc.ancestorOrigins[0]) {
        return String(loc.ancestorOrigins[0]);
    }
    if (typeof target.referrer === 'string' && target.referrer.trim()) {
        return target.referrer.trim();
    }
    if (target.document && typeof target.document.referrer === 'string' && target.document.referrer.trim()) {
        return target.document.referrer.trim();
    }
    if (target.parent && target.parent !== target) {
        try {
            const parentLoc = target.parent.location;
            if (parentLoc && typeof parentLoc.origin === 'string' && parentLoc.origin) {
                return parentLoc.origin;
            }
            if (parentLoc && typeof parentLoc.href === 'string' && parentLoc.href) {
                return parentLoc.href;
            }
        } catch (e) {
            return '';
        }
    }
    return '';
};

const isFramed = target => {
    if (!target || typeof target !== 'object') return false;
    if (typeof target.inFrame === 'boolean') return target.inFrame;
    if ('parent' in target) {
        try {
            return Boolean(target.parent && target.parent !== target);
        } catch (e) {
            return true;
        }
    }
    return Boolean(
        typeof target.parentOrigin === 'string' ||
        typeof target.url === 'string' ||
        typeof target.search === 'string' ||
        typeof target.referrer === 'string' ||
        target.ancestorOrigins
    );
};

const isAllowedEmbed = target => {
    if (!isFramed(target)) return true;
    const loc = target && target.location ? target.location : null;
    const search = (typeof target.search === 'string' && target.search) ||
        (loc && typeof loc.search === 'string' && loc.search) ||
        '';
    const href = (typeof target.url === 'string' && target.url) ||
        (loc && typeof loc.href === 'string' && loc.href) ||
        '';
    if (hasEmbedParam(search) || hasEmbedParam(href)) {
        return true;
    }
    const directAncestors = target && target.ancestorOrigins;
    const originCandidate = (directAncestors && directAncestors.length > 0 && directAncestors[0]) ?
        String(directAncestors[0]) :
        readParentOrigin(target);
    const host = extractHostname(originCandidate);
    return ALLOWED_PARENT_HOSTS.has(host);
};

const isInvalidEmbed = target => !isAllowedEmbed(target);

export {
    ALLOWED_PARENT_HOSTS,
    extractHostname,
    hasEmbedParam,
    isAllowedEmbed,
    isInvalidEmbed
};
