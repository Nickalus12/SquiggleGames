import {BRAND, MENU_BAR_FROM, MENU_BAR_GRADIENT} from '../tokens';

const guiColors = {
    'motion-primary': BRAND[600],
    'motion-primary-transparent': 'rgba(133, 92, 214, 0.9)',
    'motion-tertiary': BRAND[800],

    'looks-secondary': BRAND[600],
    'looks-transparent': 'rgba(133, 92, 214, 0.35)',
    'looks-light-transparent': 'rgba(133, 92, 214, 0.15)',
    'looks-secondary-dark': BRAND[800],

    'extensions-primary': '#22d3ee',
    'extensions-tertiary': '#0e94ab',
    'extensions-transparent': 'rgba(34, 211, 238, 0.35)',
    'extensions-light': 'rgba(34, 211, 238, 0.22)',

    'drop-highlight': BRAND[500],

    'library-tag-active': BRAND[500],

    'menu-bar-background': MENU_BAR_FROM,
    'menu-bar-background-image': MENU_BAR_GRADIENT
};

const blockColors = {
    checkboxActiveBackground: BRAND[600],
    checkboxActiveBorder: BRAND[800]
};

export {
    guiColors,
    blockColors
};
