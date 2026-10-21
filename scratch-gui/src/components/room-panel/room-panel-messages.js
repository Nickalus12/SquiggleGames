import {defineMessages} from 'react-intl';
import {PEER_COLORS, PEER_SHAPES} from '../../lib/themes/peers.js';

const messages = defineMessages({
    title: {id: 'sq.room.title', defaultMessage: 'Room', description: 'Heading of the room panel'},
    close: {id: 'sq.room.close', defaultMessage: 'Close room panel', description: 'Close button of the room panel'},
    live: {id: 'sq.room.status.live', defaultMessage: 'Live', description: 'Room status when connected'},
    reconnecting: {
        id: 'sq.room.status.reconnecting',
        defaultMessage: 'Reconnecting',
        description: 'Room status while the connection comes back'
    },
    offline: {id: 'sq.room.status.offline', defaultMessage: 'Offline', description: 'Room status with no network'},
    lockChip: {
        id: 'sq.room.lockChip',
        defaultMessage: 'Quick phrases only',
        description: 'Chip shown while a guest or younger player is in the room'
    },
    lockHelp: {
        id: 'sq.room.lockHelp',
        defaultMessage: 'A guest or younger player is here, so everyone chats with quick phrases.',
        description: 'Explains the quick phrases only chip'
    },
    copyLink: {id: 'sq.room.copyLink', defaultMessage: 'Copy room link', description: 'Copies the room address'},
    copied: {
        id: 'sq.room.copied',
        defaultMessage: 'Copied! Send it to your partner.',
        description: 'Shown after a link is copied'
    },
    makeInvite: {
        id: 'sq.room.makeInvite',
        defaultMessage: 'Make an invite link',
        description: 'Owner button that makes a new invite link and copies it'
    },
    inviteFailed: {
        id: 'sq.room.inviteFailed',
        defaultMessage: 'That invite did not work. Try again in a moment.',
        description: 'Shown when making an invite link fails'
    },
    copyPrompt: {id: 'sq.room.copyPrompt', defaultMessage: 'Copy this link:', description: 'Fallback copy prompt'},
    people: {id: 'sq.room.people', defaultMessage: 'In here: {count}', description: 'Heading of the people list'},
    you: {id: 'sq.room.you', defaultMessage: 'you', description: 'Marks your own row in the people list'},
    alone: {
        id: 'sq.room.alone',
        defaultMessage: 'Just you so far. Send the room link and build together.',
        description: 'Shown when nobody else is in the room'
    },
    follow: {id: 'sq.room.follow', defaultMessage: 'Follow', description: 'Button to follow a peer'},
    following: {id: 'sq.room.following', defaultMessage: 'Following', description: 'Button state while following'},
    followLabel: {id: 'sq.room.followLabel', defaultMessage: 'Follow {name}', description: 'Follow button label'},
    stopFollowLabel: {
        id: 'sq.room.stopFollowLabel',
        defaultMessage: 'Stop following {name}',
        description: 'Follow button label while following'
    },
    mute: {id: 'sq.room.mute', defaultMessage: 'Mute', description: 'Owner button that stops a peer chatting'},
    unmute: {id: 'sq.room.unmute', defaultMessage: 'Unmute', description: 'Owner button that lets a peer chat again'},
    muteLabel: {id: 'sq.room.muteLabel', defaultMessage: 'Mute {name} in chat', description: 'Mute button label'},
    unmuteLabel: {
        id: 'sq.room.unmuteLabel',
        defaultMessage: 'Unmute {name} in chat',
        description: 'Unmute button label'
    },
    hide: {id: 'sq.room.hide', defaultMessage: 'Hide', description: 'Button that hides a peer chat for you'},
    show: {id: 'sq.room.show', defaultMessage: 'Show', description: 'Button that shows a hidden peer chat again'},
    hideLabel: {id: 'sq.room.hideLabel', defaultMessage: 'Hide chat from {name}', description: 'Hide button label'},
    showLabel: {id: 'sq.room.showLabel', defaultMessage: 'Show chat from {name}', description: 'Show button label'},
    history: {id: 'sq.room.history', defaultMessage: 'Room history', description: 'Opens the room history panel'},
    library: {id: 'sq.room.library', defaultMessage: 'Save to library', description: 'Heading of the save section'},
    saveName: {id: 'sq.room.saveName', defaultMessage: 'Name this copy', description: 'Save copy name field'},
    save: {id: 'sq.room.save', defaultMessage: 'Save', description: 'Save a named copy'},
    saveHelp: {
        id: 'sq.room.saveHelp',
        defaultMessage: 'The room saves itself as you go. This keeps a named copy.',
        description: 'Explains the save section'
    },
    open: {id: 'sq.room.open', defaultMessage: 'Open', description: 'Open a library project in the room'},
    openConfirm: {
        id: 'sq.room.openConfirm',
        defaultMessage: 'Replace for everyone?',
        description: 'Second click confirm to open a project for the whole room'
    },
    openHelp: {
        id: 'sq.room.openHelp',
        defaultMessage: 'Opening replaces what everyone in this room is looking at',
        description: 'Tooltip on the open button'
    },
    roleOwner: {id: 'sq.room.role.owner', defaultMessage: 'Owner', description: 'Room role'},
    roleEditor: {id: 'sq.room.role.editor', defaultMessage: 'Builder', description: 'Room role'},
    roleViewer: {id: 'sq.room.role.viewer', defaultMessage: 'Watcher', description: 'Room role'},
    roleGuest: {id: 'sq.room.role.guest', defaultMessage: 'Guest', description: 'Room role'},
    startFailed: {
        id: 'sq.room.startFailed',
        defaultMessage: 'The room did not start. Try again in a moment.',
        description: 'Shown when starting a room fails'
    },
    roomLimit: {
        id: 'sq.room.roomLimit',
        defaultMessage: 'You have all the rooms you can have. Close one on the home page first.',
        description: 'Shown when the room limit is reached'
    }
});

const capital = id => id.charAt(0).toUpperCase() + id.slice(1);

const colorMessages = Object.fromEntries(PEER_COLORS.map(c => [c.id, {
    id: `sq.peer.color.${c.id}`,
    defaultMessage: capital(c.id),
    description: 'Name of a peer colour'
}]));

const shapeMessages = Object.fromEntries(PEER_SHAPES.map(s => [s.id, {
    id: `sq.peer.shape.${s.id}`,
    defaultMessage: s.id,
    description: 'Name of a peer shape'
}]));

export {colorMessages, messages as default, shapeMessages};
