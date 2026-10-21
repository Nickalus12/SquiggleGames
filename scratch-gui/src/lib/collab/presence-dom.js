import {findPhrase, phraseText} from './quick-phrases.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MESSAGES = {
    moving: {id: 'sq.presence.moving', defaultMessage: '{name} is moving this'},
    typing: {id: 'sq.presence.typing', defaultMessage: '{name} is typing'},
    editing: {id: 'sq.presence.editing', defaultMessage: '{name} is editing this'},
    following: {id: 'sq.presence.following', defaultMessage: 'Following {name}. Press Esc to stop.'},
    stop: {id: 'sq.presence.stopFollowing', defaultMessage: 'Stop'},
    here: {id: 'sq.presence.here', defaultMessage: '{name} is here'},
    says: {id: 'sq.presence.says', defaultMessage: '{name}: {text}'},
    phrases: {id: 'sq.presence.phrases', defaultMessage: 'Quick phrases'}
};

const say = (key, values) => {
    const message = MESSAGES[key];
    let text = message.defaultMessage;
    try {
        const store = window.ReduxStore;
        const locales = store && store.getState().locales;
        if (locales && locales.messages && typeof locales.messages[message.id] === 'string') {
            text = locales.messages[message.id];
        }
    } catch (e) {
        text = message.defaultMessage;
    }
    return text.replace(/\{(\w+)\}/g, (all, name) => (values && name in values ? String(values[name]) : all));
};

const phraseLabel = id => {
    const phrase = findPhrase(id);
    if (!phrase) return null;
    return phraseText(id, message => {
        try {
            const locales = window.ReduxStore.getState().locales;
            return (locales && locales.messages && locales.messages[message.id]) || message.defaultMessage;
        } catch (e) {
            return message.defaultMessage;
        }
    });
};

const shapeSvg = (style, size) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'block';
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', style.d);
    path.setAttribute('fill', style.hex);
    path.setAttribute('fill-rule', style.fillRule);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '1.2');
    svg.appendChild(path);
    return svg;
};

const CURSOR_SHAPES = {
    arrow: {w: 18,
        h: 22,
        box: '0 0 18 22',
        stroke: 1.2,
        d: 'M1 1 L1 16 L5.5 12.5 L8.5 20 L11.5 18.5 L8.5 11.5 L14 11 Z'},
    hand: {w: 20,
        h: 22,
        box: '0 0 20 22',
        stroke: 1.1,
        d: 'M4 1 C4 0 6 0 6 1 L6 8 L7 8 L7 2 C7 1 9 1 9 2 L9 8 L10 8 L10 3 C10 2 12 2 12 3 ' +
           'L12 9 L13 9 L13 6 C13 5 15 5 15 6 L15 14 C15 19 12 21 9 21 C5 21 4 18 3 15 ' +
           'L1 10 C1 9 3 8 4 10 Z'},
    pencil: {w: 20,
        h: 20,
        box: '0 0 20 20',
        stroke: 1.1,
        d: 'M1 19 L2 14 L14 2 L18 6 L6 18 Z M12 4 L16 8'},
    star: {w: 22,
        h: 22,
        box: '0 0 22 22',
        stroke: 1.1,
        d: 'M11 1 L13.5 7.6 L20.5 7.9 L15 12.3 L16.9 19.1 L11 15.2 ' +
           'L5.1 19.1 L7 12.3 L1.5 7.9 L8.5 7.6 Z'},
    rocket: {w: 22,
        h: 22,
        box: '0 0 22 22',
        stroke: 1.1,
        d: 'M11 1 C14 4 15.5 8 15.5 12 L15.5 15 L12.5 13.5 L12.5 17 L11 20.5 ' +
           'L9.5 17 L9.5 13.5 L6.5 15 L6.5 12 C6.5 8 8 4 11 1 Z'},
    heart: {w: 22,
        h: 22,
        box: '0 0 22 22',
        stroke: 1.1,
        d: 'M11 19.5 C4 14.5 1.5 11 1.5 7.5 C1.5 4.5 3.8 2.5 6.4 2.5 ' +
           'C8.3 2.5 9.9 3.5 11 5.2 C12.1 3.5 13.7 2.5 15.6 2.5 ' +
           'C18.2 2.5 20.5 4.5 20.5 7.5 C20.5 11 18 14.5 11 19.5 Z'},
    sparkle: {w: 22,
        h: 22,
        box: '0 0 22 22',
        stroke: 1,
        d: 'M11 1 C12 6.5 15.5 10 21 11 C15.5 12 12 15.5 11 21 ' +
           'C10 15.5 6.5 12 1 11 C6.5 10 10 6.5 11 1 Z'},
    cat: {w: 22,
        h: 22,
        box: '0 0 22 22',
        stroke: 1.1,
        d: 'M4 2 L7.5 6.5 L14.5 6.5 L18 2 L18 8 C20 10 20 14.5 16.5 17 ' +
           'C13.5 19.5 8.5 19.5 5.5 17 C2 14.5 2 10 4 8 Z'}
};

const ringElement = (kind, name, style) => {
    const el = document.createElement('div');
    el.dataset.slot = String(style.slot);
    el.dataset.ring = kind;
    el.style.cssText = [
        'position:absolute', 'left:0', 'top:0', 'box-sizing:border-box', 'border-radius:12px',
        `border:3px ${kind === 'typing' ? 'dashed' : 'solid'} ${style.hex}`,
        'box-shadow:0 0 0 2px rgba(255,255,255,.75)', 'will-change:transform'
    ].join(';');
    const label = document.createElement('div');
    label.style.cssText = [
        'position:absolute', 'left:-3px', 'bottom:100%', 'margin-bottom:4px', 'display:flex',
        'align-items:center', 'gap:4px', `background:${style.hex}`, `color:${style.ink}`,
        'font:700 12px ui-rounded,"Segoe UI",Helvetica,Arial,sans-serif', 'padding:2px 8px 2px 4px',
        'border-radius:8px', 'white-space:nowrap'
    ].join(';');
    label.appendChild(shapeSvg(style, 12));
    label.appendChild(document.createTextNode(say(kind, {name})));
    el.appendChild(label);
    return el;
};

const cursorElement = (id, cursorShape, name, style) => {
    const el = document.createElement('div');
    el.dataset.peer = String(id);
    el.style.cssText = 'position:absolute;left:0;top:0;will-change:transform;display:none';
    const shape = CURSOR_SHAPES[cursorShape] || CURSOR_SHAPES.arrow;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(shape.w));
    svg.setAttribute('height', String(shape.h));
    svg.setAttribute('viewBox', shape.box);
    svg.style.cssText = 'display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))';
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', shape.d);
    path.setAttribute('fill', style.hex);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', String(shape.stroke));
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    el.appendChild(svg);
    const label = document.createElement('div');
    label.style.cssText = [
        'display:flex', 'align-items:center', 'gap:4px', `background:${style.hex}`, `color:${style.ink}`,
        'font:700 11px ui-rounded,"Segoe UI",Helvetica,Arial,sans-serif', 'border-radius:6px',
        'padding:2px 6px 2px 3px', 'margin:-2px 0 0 10px', 'white-space:nowrap', 'width:max-content'
    ].join(';');
    label.appendChild(shapeSvg(style, 11));
    label.appendChild(document.createTextNode(name || ''));
    el.appendChild(label);
    return el;
};

const FONT = 'ui-rounded,"Segoe UI",Helvetica,Arial,sans-serif';

const followPill = ({name, style, top, onStop}) => {
    const pill = document.createElement('div');
    pill.setAttribute('role', 'status');
    pill.setAttribute('data-sq-follow', '');
    pill.style.cssText = [
        'position:fixed', `top:calc(${top}px + env(safe-area-inset-top, 0px))`,
        'left:50%', 'transform:translateX(-50%)', 'z-index:99997', 'display:flex', 'align-items:center',
        'gap:10px', 'background:#161c36', 'color:#f2f4fb', 'padding:8px 10px 8px 14px', 'border-radius:999px',
        `border:2px solid ${style ? style.hex : '#7c5cff'}`, 'max-width:calc(100vw - 32px)',
        `font:600 13px ${FONT}`, 'box-shadow:0 12px 32px -10px rgba(0,0,0,.6)'
    ].join(';');
    if (style) pill.appendChild(shapeSvg(style, 16));
    pill.appendChild(document.createTextNode(say('following', {name})));
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.textContent = say('stop');
    stop.style.cssText = [
        'background:#ffffff', 'color:#10142a', 'border:0', 'border-radius:999px', 'padding:4px 12px',
        `font:700 12px ${FONT}`, 'cursor:pointer', 'min-height:28px'
    ].join(';');
    stop.addEventListener('click', onStop);
    pill.appendChild(stop);
    return pill;
};

const bubbleElement = ({name, text, style, x, y}) => {
    const bubble = document.createElement('div');
    bubble.setAttribute('data-sq-phrase', '');
    bubble.style.cssText = [
        'position:absolute', 'left:0', 'top:0', `transform:translate(${Math.round(x)}px, ${Math.round(y)}px)`,
        'display:flex', 'align-items:center', 'gap:6px', 'background:#ffffff', 'color:#10142a',
        `border:2px solid ${style.hex}`, 'border-radius:14px', 'padding:6px 10px', 'max-width:240px',
        `font:600 13px ${FONT}`, 'box-shadow:0 8px 24px -8px rgba(0,0,0,.45)', 'opacity:0', 'transition:opacity .2s'
    ].join(';');
    bubble.appendChild(shapeSvg(style, 14));
    const who = document.createElement('strong');
    who.textContent = name;
    bubble.appendChild(who);
    bubble.appendChild(document.createTextNode(text));
    return bubble;
};

const liveRegion = () => {
    const live = document.createElement('div');
    live.setAttribute('aria-live', 'polite');
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
    return live;
};

export {
    CURSOR_SHAPES,
    MESSAGES,
    bubbleElement,
    cursorElement,
    followPill,
    liveRegion,
    phraseLabel,
    ringElement,
    say,
    shapeSvg
};
