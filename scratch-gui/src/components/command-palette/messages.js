import {defineMessages} from 'react-intl';

const kindMessages = defineMessages({
    command: {id: 'sq.palette.kind.command', defaultMessage: 'Commands', description: 'Palette group'},
    checker: {id: 'sq.palette.kind.checker', defaultMessage: 'Checker', description: 'Palette group'},
    block: {id: 'sq.palette.kind.block', defaultMessage: 'Blocks', description: 'Palette group'},
    myblock: {id: 'sq.palette.kind.myblock', defaultMessage: 'My Blocks', description: 'Palette group'},
    variable: {id: 'sq.palette.kind.variable', defaultMessage: 'Variables', description: 'Palette group'},
    sprite: {id: 'sq.palette.kind.sprite', defaultMessage: 'Sprites', description: 'Palette group'},
    costume: {id: 'sq.palette.kind.costume', defaultMessage: 'Costumes', description: 'Palette group'},
    sound: {id: 'sq.palette.kind.sound', defaultMessage: 'Sounds', description: 'Palette group'},
    scene: {id: 'sq.palette.kind.scene', defaultMessage: 'Scenes', description: 'Palette group'},
    level: {id: 'sq.palette.kind.level', defaultMessage: 'Levels', description: 'Palette group'},
    peer: {id: 'sq.palette.kind.peer', defaultMessage: 'People here', description: 'Palette group'}
});

const commandMessages = defineMessages({
    greenFlag: {id: 'sq.palette.cmd.greenFlag', defaultMessage: 'Start (green flag)', description: 'Palette command'},
    stop: {id: 'sq.palette.cmd.stop', defaultMessage: 'Stop', description: 'Palette command'},
    cleanUp: {id: 'sq.palette.cmd.cleanUp', defaultMessage: 'Clean up blocks', description: 'Palette command'},
    undo: {id: 'sq.palette.cmd.undo', defaultMessage: 'Undo', description: 'Palette command'},
    redo: {id: 'sq.palette.cmd.redo', defaultMessage: 'Redo', description: 'Palette command'},
    zoomIn: {id: 'sq.palette.cmd.zoomIn', defaultMessage: 'Zoom in', description: 'Palette command'},
    zoomOut: {id: 'sq.palette.cmd.zoomOut', defaultMessage: 'Zoom out', description: 'Palette command'},
    zoomReset: {id: 'sq.palette.cmd.zoomReset', defaultMessage: 'Reset zoom', description: 'Palette command'},
    focus: {id: 'sq.palette.cmd.focus', defaultMessage: 'Focus mode', description: 'Palette command'},
    checker: {id: 'sq.palette.cmd.checker', defaultMessage: 'Open the checker', description: 'Palette command'},
    codeTab: {id: 'sq.palette.cmd.codeTab', defaultMessage: 'Go to Code', description: 'Palette command'},
    costumesTab: {id: 'sq.palette.cmd.costumesTab', defaultMessage: 'Go to Costumes', description: 'Palette command'},
    soundsTab: {id: 'sq.palette.cmd.soundsTab', defaultMessage: 'Go to Sounds', description: 'Palette command'},
    turbo: {id: 'sq.palette.cmd.turbo', defaultMessage: 'Turbo mode on or off', description: 'Palette command'}
});

const uiMessages = defineMessages({
    label: {
        id: 'sq.palette.label',
        defaultMessage: 'Search blocks, sprites and commands',
        description: 'Accessible name and placeholder of the command palette input'
    },
    empty: {
        id: 'sq.palette.empty',
        defaultMessage: 'Nothing matches "{query}".',
        description: 'Command palette text when nothing matches'
    },
    results: {
        id: 'sq.palette.results',
        defaultMessage: '{count, plural, =0 {No results} one {# result} other {# results}}',
        description: 'Spoken result count in the command palette'
    },
    insert: {
        id: 'sq.palette.insert',
        defaultMessage: 'Add block',
        description: 'Hint on a block result'
    },
    stage: {
        id: 'sq.palette.stage',
        defaultMessage: 'Stage',
        description: 'Name of the stage in palette results'
    },
    hint: {
        id: 'sq.palette.hint',
        defaultMessage: 'Enter to pick, Esc to close',
        description: 'Keyboard hint at the bottom of the command palette'
    }
});

export {kindMessages, commandMessages, uiMessages};
