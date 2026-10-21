import {defineMessages} from 'react-intl';

const messages = defineMessages({
    title: {
        id: 'sq.checker.title',
        defaultMessage: 'Checker',
        description: 'Title of the project checker panel and its menu bar button'
    },
    count: {
        id: 'sq.checker.count',
        defaultMessage: '{count, plural, =0 {Nothing to check} one {# thing to check} other {# things to check}}',
        description: 'Spoken and tooltip text for the checker button'
    },
    checking: {
        id: 'sq.checker.checking',
        defaultMessage: 'Checking your project',
        description: 'Checker panel text before the first check finishes'
    },
    empty: {
        id: 'sq.checker.empty',
        defaultMessage: 'Nothing to fix. Nice work!',
        description: 'Checker panel text when no items were found'
    },
    error: {
        id: 'sq.checker.group.error',
        defaultMessage: 'Needs fixing',
        description: 'Checker panel heading for error items'
    },
    warn: {
        id: 'sq.checker.group.warn',
        defaultMessage: 'Worth a look',
        description: 'Checker panel heading for warning items'
    },
    info: {
        id: 'sq.checker.group.info',
        defaultMessage: 'Tips',
        description: 'Checker panel heading for tip items'
    },
    showMe: {
        id: 'sq.checker.showMe',
        defaultMessage: 'Show me',
        description: 'Checker button that switches to the sprite and highlights the block'
    },
    fixed: {
        id: 'sq.checker.fixed',
        defaultMessage: 'Fixed. You can undo it with Ctrl+Z.',
        description: 'Announced after a checker fix worked'
    },
    fixedLoose: {
        id: 'sq.checker.fixedLoose',
        defaultMessage: 'Deleted. Undo brings them back.',
        description: 'Announced after the checker deleted loose blocks'
    },
    moved: {
        id: 'sq.checker.moved',
        defaultMessage: 'Moved.',
        description: 'Announced after the checker moved blocks to another sprite'
    },
    movedHatless: {
        id: 'sq.checker.movedHatless',
        defaultMessage: 'Moved. Attach it to a hat block in Game Rules.',
        description: 'Announced after the checker moved a block out of a script into Game Rules'
    },
    undo: {
        id: 'sq.checker.undo',
        defaultMessage: 'Undo',
        description: 'Button that puts moved blocks back'
    },
    undone: {
        id: 'sq.checker.undone',
        defaultMessage: 'Put back.',
        description: 'Announced after Undo put moved blocks back'
    },
    undoFailed: {
        id: 'sq.checker.undoFailed',
        defaultMessage: 'That could not be put back.',
        description: 'Announced when Undo could not put moved blocks back'
    },
    fixFailed: {
        id: 'sq.checker.fixFailed',
        defaultMessage: 'That one could not be fixed here. Try Show me.',
        description: 'Announced when a checker fix could not run'
    },
    notFound: {
        id: 'sq.checker.notFound',
        defaultMessage: 'That block has moved. The list will update in a moment.',
        description: 'Announced when Show me cannot find the block'
    },
    close: {
        id: 'sq.checker.close',
        defaultMessage: 'Close',
        description: 'Close button on the checker panel'
    },
    stage: {
        id: 'sq.checker.stage',
        defaultMessage: 'Stage',
        description: 'Name shown for items on the stage'
    }
});

const FIXED = Object.freeze({'delete-loose': 'fixedLoose'});
const NOTICES = Object.freeze({'moved': 'moved', 'moved-hatless': 'movedHatless'});

const fixedMessage = (fix, result) => {
    const notice = result && NOTICES[result.notice];
    return messages[notice || (fix && FIXED[fix]) || 'fixed'];
};

export {fixedMessage};
export default messages;
