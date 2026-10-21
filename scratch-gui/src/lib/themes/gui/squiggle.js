import {NIGHT} from '../tokens';

const guiColors = {
    'color-scheme': 'dark',

    'ui-primary': NIGHT['sq-bg'],
    'ui-secondary': NIGHT['sq-panel'],
    'ui-tertiary': NIGHT['sq-raised'],

    'ui-modal-overlay': NIGHT['sq-scrim'],
    'ui-modal-background': '#131831',
    'ui-modal-foreground': NIGHT['sq-text'],
    'ui-modal-header-background': '#1c2342',
    'ui-modal-header-foreground': '#ffffff',

    'ui-white': '#131831',
    'ui-white-dim': 'rgba(19, 24, 49, 0.75)',
    'ui-white-transparent': 'rgba(255, 255, 255, 0.14)',

    'ui-black-transparent': 'rgba(255, 255, 255, 0.11)',

    'text-primary': NIGHT['sq-text'],
    'text-primary-transparent': 'rgba(242, 244, 251, 0.75)',

    'error-primary': NIGHT['sq-danger'],
    'error-light': '#fda4af',
    'error-transparent': 'rgba(251, 113, 133, 0.25)',

    'assets-background': NIGHT['sq-bg'],

    'input-background': '#0d1020',

    'popover-background': NIGHT['sq-panel'],

    'shadow': 'rgba(0, 0, 0, 0.55)',

    'badge-background': '#1c2347',
    'badge-border': '#3b3183',

    'fullscreen-background': '#0d1020',
    'fullscreen-accent': NIGHT['sq-panel'],

    'page-background': '#0d1020',
    'page-foreground': NIGHT['sq-text'],

    'project-title-inactive': 'rgba(255, 255, 255, 0.16)',
    'project-title-hover': 'rgba(255, 255, 255, 0.3)',

    'link-color': NIGHT['sq-link'],

    'filter-icon-black': 'invert(100%)',
    'filter-icon-gray': 'grayscale(100%) brightness(1.7)',
    'filter-icon-white': 'brightness(0) invert(100%)',

    'paint-filter-icon-gray': 'brightness(1.7)'
};

const blockColors = {
    insertionMarker: '#c7cce6',
    workspace: '#141a33',
    toolboxSelected: NIGHT['sq-raised'],
    toolboxText: '#c7cce6',
    toolbox: NIGHT['sq-bg'],
    flyout: NIGHT['sq-bg'],
    scrollbar: '#3a4370',
    valueReportBackground: NIGHT['sq-panel'],
    valueReportBorder: '#2c3560',
    valueReportForeground: NIGHT['sq-text'],
    contextMenuBackground: NIGHT['sq-panel'],
    contextMenuBorder: 'rgba(255, 255, 255, 0.12)',
    contextMenuForeground: NIGHT['sq-text'],
    contextMenuActiveBackground: '#252d52',
    contextMenuDisabledForeground: '#6d769a',
    flyoutLabelColor: '#c7cce6',
    checkboxInactiveBackground: '#1b2140',
    checkboxInactiveBorder: '#8f98bd',
    buttonBorder: '#8f98bd',
    buttonActiveBackground: NIGHT['sq-raised'],
    buttonForeground: '#dfe3f5',
    zoomIconFilter: 'invert(100%)',
    gridColor: '#242c4f'
};

export {
    guiColors,
    blockColors
};
