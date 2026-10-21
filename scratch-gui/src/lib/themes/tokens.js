const FONT_STACK = 'Nunito, ui-rounded, "SF Pro Rounded", "Segoe UI Variable", system-ui, sans-serif';

const BRAND = {
    500: '#9966ff',
    600: '#855cd6',
    700: '#774dcb',
    800: '#5b3aa0'
};

const MENU_BAR_FROM = '#6d4ae0';
const MENU_BAR_TO = '#8a4fd8';
const MENU_BAR_GRADIENT = `linear-gradient(135deg, ${MENU_BAR_FROM} 0%, ${MENU_BAR_TO} 100%)`;
const MENU_BAR_CONTROL = '#4a2fa6';
const MENU_BAR_CONTROL_ACTIVE = '#3f2890';

const RULES_COLORS = {
    color1: '#6d4ae0',
    color2: '#5b3aa0',
    color3: '#ffc53d'
};

const KIT_COLORS = {
    squiggleworld: {color1: '#8cc63f', color2: '#78ab33', color3: '#5f8a26'},
    squigglescenes: {color1: '#5b6ee1', color2: '#4a5cc7', color3: '#3a49a6'},
    squiggleanimate: {color1: '#16b3c7', color2: '#129aac', color3: '#0e7e8d'},
    squiggletools: {color1: '#b07a4f', color2: '#966641', color3: '#7a5234'},
    squiggle3d: {color1: '#5f7690', color2: '#50657c', color3: '#405165'},
    squigglescores: {color1: '#f25f5c', color2: '#d94e4b', color3: '#b83d3a'},
    squiggleteams: {color1: '#2a9d8f', color2: '#23877b', color3: '#1c6e64'},
    squigglearena: {color1: '#b8336a', color2: '#9e2b5b', color3: '#82234b'},
    together: {color1: BRAND[500], color2: BRAND[600], color3: BRAND[700]}
};

const EXPANSION_IDS = ['squigglescores', 'squiggleteams', 'squigglearena'];

const SCALE = {
    'sq-font': FONT_STACK,

    'sq-text-xs': '12px',
    'sq-text-sm': '14px',
    'sq-text-md': '16px',
    'sq-text-lg': '20px',
    'sq-text-xl': '24px',
    'sq-text-2xl': '32px',
    'sq-weight-regular': '500',
    'sq-weight-bold': '700',
    'sq-weight-heavy': '800',

    'sq-space-1': '4px',
    'sq-space-2': '8px',
    'sq-space-3': '12px',
    'sq-space-4': '16px',
    'sq-space-5': '20px',
    'sq-space-6': '24px',
    'sq-space-8': '32px',

    'sq-radius-chip': '4px',
    'sq-radius-panel': '10px',
    'sq-radius-card': '16px',
    'sq-radius-pill': '999px',

    'sq-target': '36px',
    'sq-target-touch': '44px',

    'sq-ease': 'cubic-bezier(0, 0, 0.2, 1)',

    'sq-brand-500': BRAND[500],
    'sq-brand-600': BRAND[600],
    'sq-brand-700': BRAND[700],
    'sq-brand-800': BRAND[800],
    'sq-on-brand': '#ffffff',

    'sq-menu-bar': MENU_BAR_GRADIENT,
    'sq-menu-bar-from': MENU_BAR_FROM,
    'sq-menu-bar-to': MENU_BAR_TO,
    'sq-menu-bar-text': '#ffffff',
    'sq-menu-bar-control': MENU_BAR_CONTROL,
    'sq-menu-bar-control-active': MENU_BAR_CONTROL_ACTIVE,
    'sq-menu-bar-focus': '#ffffff',
    'sq-peer-outline-bar': '#ffffff',
    'sq-stage-surface': '#ffffff',

    'sq-rules-fill': RULES_COLORS.color1,
    'sq-rules-edge': RULES_COLORS.color3
};

const MOTION = {
    'sq-motion-fast': '140ms',
    'sq-motion-sheet': '240ms',
    'sq-motion-shift': '1'
};

const MOTION_REDUCED = {
    'sq-motion-fast': '80ms',
    'sq-motion-sheet': '80ms',
    'sq-motion-shift': '0'
};

const NIGHT = {
    'sq-bg': '#10142a',
    'sq-panel': '#161c36',
    'sq-raised': '#232b4d',
    'sq-line': '#2e3760',
    'sq-text': '#f2f4fb',
    'sq-text-muted': '#b8bfd9',
    'sq-link': '#22d3ee',
    'sq-focus': '#22d3ee',
    'sq-accent-text': '#b9a0ff',
    'sq-success': '#2fbf71',
    'sq-warn': '#ffb020',
    'sq-danger': '#ff5a6e',
    'sq-info': '#22d3ee',
    'sq-elevation-1': '0 0 0 1px #2e3760',
    'sq-elevation-2': '0 0 0 1px #3a4573',
    'sq-elevation-3': '0 0 0 1px #46528a, 0 8px 24px rgba(0, 0, 0, 0.45)',
    'sq-scrim': 'rgba(6, 8, 18, 0.72)',
    'sq-tint-card': 'rgba(255, 255, 255, 0.055)',
    'sq-tint-line': 'rgba(255, 255, 255, 0.11)',
    'sq-tint-line-hi': 'rgba(255, 255, 255, 0.22)',
    'sq-tint-well': 'rgba(0, 0, 0, 0.3)'
};

const DAY = {
    'sq-bg': '#f7f6fc',
    'sq-panel': '#ffffff',
    'sq-raised': '#efecf9',
    'sq-line': '#d9d5ea',
    'sq-text': '#1b1f3a',
    'sq-text-muted': '#4f5677',
    'sq-link': '#5b3aa0',
    'sq-focus': '#5b3aa0',
    'sq-accent-text': '#5b3aa0',
    'sq-success': '#167443',
    'sq-warn': '#9a5b00',
    'sq-danger': '#c62839',
    'sq-info': '#0a7089',
    'sq-elevation-1': '0 1px 2px rgba(27, 31, 58, 0.08)',
    'sq-elevation-2': '0 2px 8px rgba(27, 31, 58, 0.12)',
    'sq-elevation-3': '0 8px 24px rgba(27, 31, 58, 0.18)',
    'sq-scrim': 'rgba(27, 31, 58, 0.45)',
    'sq-tint-card': 'rgba(27, 31, 58, 0.05)',
    'sq-tint-line': 'rgba(27, 31, 58, 0.12)',
    'sq-tint-line-hi': 'rgba(27, 31, 58, 0.24)',
    'sq-tint-well': 'rgba(27, 31, 58, 0.06)'
};

const sqTokens = ({dark, reducedMotion}) => Object.assign(
    {},
    SCALE,
    reducedMotion ? MOTION_REDUCED : MOTION,
    dark ? NIGHT : DAY
);

export {
    BRAND,
    DAY,
    EXPANSION_IDS,
    FONT_STACK,
    KIT_COLORS,
    MENU_BAR_CONTROL,
    MENU_BAR_CONTROL_ACTIVE,
    MENU_BAR_FROM,
    MENU_BAR_GRADIENT,
    MENU_BAR_TO,
    MOTION,
    MOTION_REDUCED,
    NIGHT,
    RULES_COLORS,
    SCALE,
    sqTokens
};
