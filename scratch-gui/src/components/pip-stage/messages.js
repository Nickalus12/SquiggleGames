import {defineMessages} from 'react-intl';

export default defineMessages({
    region: {
        id: 'sq.focus.region',
        defaultMessage: 'Stage',
        description: 'Accessible name of the floating stage in focus mode'
    },
    move: {
        id: 'sq.focus.move',
        defaultMessage: 'Move the stage. Drag it, or use the arrow keys.',
        description: 'Accessible name of the drag handle on the floating stage'
    },
    exit: {
        id: 'sq.focus.exit',
        defaultMessage: 'Exit focus',
        description: 'Button that leaves focus mode'
    },
    entered: {
        id: 'sq.focus.entered',
        defaultMessage: 'Focus mode on. Press Control Shift F to leave.',
        description: 'Spoken when focus mode turns on'
    }
});
