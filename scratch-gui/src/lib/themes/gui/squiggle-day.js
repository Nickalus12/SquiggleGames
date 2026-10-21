import {DAY} from '../tokens';

const guiColors = {
    'color-scheme': 'light',

    'ui-primary': DAY['sq-bg'],
    'ui-secondary': DAY['sq-panel'],
    'ui-tertiary': DAY['sq-raised'],

    'ui-modal-overlay': DAY['sq-scrim'],
    'ui-modal-background': DAY['sq-panel'],
    'ui-modal-foreground': DAY['sq-text'],
    'ui-modal-header-background': 'var(--looks-secondary)',
    'ui-modal-header-foreground': '#ffffff',

    'ui-white': DAY['sq-panel'],
    'ui-white-dim': 'rgba(255, 255, 255, 0.75)',
    'ui-white-transparent': 'rgba(255, 255, 255, 0.25)',

    'ui-black-transparent': 'rgba(27, 31, 58, 0.14)',

    'text-primary': DAY['sq-text'],
    'text-primary-transparent': 'rgba(27, 31, 58, 0.72)',

    'error-primary': DAY['sq-danger'],
    'error-light': '#f2a3ab',
    'error-transparent': 'rgba(198, 40, 57, 0.18)',

    'assets-background': DAY['sq-panel'],

    'input-background': DAY['sq-panel'],

    'popover-background': DAY['sq-panel'],

    'shadow': 'rgba(27, 31, 58, 0.16)',

    'badge-background': '#efecf9',
    'badge-border': '#d9d5ea',

    'fullscreen-background': DAY['sq-panel'],
    'fullscreen-accent': DAY['sq-raised'],

    'page-background': DAY['sq-bg'],
    'page-foreground': DAY['sq-text'],

    'link-color': DAY['sq-link'],

    'filter-icon-black': 'none',
    'filter-icon-gray': 'grayscale(100%)',
    'filter-icon-white': 'none'
};

const blockColors = {
    workspace: '#fbfaff',
    toolbox: DAY['sq-panel'],
    flyout: DAY['sq-bg'],
    toolboxSelected: DAY['sq-raised'],
    toolboxText: DAY['sq-text-muted'],
    flyoutLabelColor: DAY['sq-text-muted'],
    scrollbar: '#cfc9e6',
    scrollbarHover: '#b9b1db',
    gridColor: '#e4e0f3'
};

export {
    guiColors,
    blockColors
};
