import {defineMessages} from 'react-intl';

const messages = defineMessages({
    multiplayer: {
        defaultMessage: 'Multiplayer',
        description: 'Extension library filter and card tag for extensions that play with other people',
        id: 'sq.library.tag.multiplayer'
    },
    world: {
        defaultMessage: 'Game World',
        description: 'Extension library filter and card tag for extensions that build levels and game worlds',
        id: 'sq.library.tag.world'
    },
    fx: {
        defaultMessage: 'FX',
        description: 'Extension library card tag for visual effects extensions',
        id: 'sq.library.tag.fx'
    },
    ui: {
        defaultMessage: 'UI',
        description: 'Extension library card tag for extensions that draw on-screen text, bars and menus',
        id: 'sq.library.tag.ui'
    },
    fxAndUi: {
        defaultMessage: 'FX and UI',
        description: 'Extension library filter for effects and on-screen interface extensions',
        id: 'sq.library.tag.fxAndUi'
    },
    classic: {
        defaultMessage: 'Classic',
        description: 'Extension library filter and card tag for the Scratch and TurboWarp extensions',
        id: 'sq.library.tag.classic'
    }
});

const TAG_IDS = Object.freeze(['multiplayer', 'world', 'fx', 'ui', 'classic']);

const CLASSIC_TAG = 'classic';

const tagLabels = Object.freeze({
    multiplayer: messages.multiplayer,
    world: messages.world,
    fx: messages.fx,
    ui: messages.ui,
    classic: messages.classic
});

const isSquiggleItem = item => !!(
    item &&
    typeof item === 'object' &&
    Array.isArray(item.tags) &&
    item.tags.length > 0 &&
    item.tags.indexOf(CLASSIC_TAG) === -1
);

export {
    CLASSIC_TAG,
    TAG_IDS,
    isSquiggleItem,
    tagLabels
};

export default [
    {tag: 'multiplayer', intlLabel: messages.multiplayer},
    {tag: 'world', intlLabel: messages.world},
    {tag: 'fx', intlLabel: messages.fxAndUi, matches: ['fx', 'ui']},
    {tag: 'classic', intlLabel: messages.classic}
];
