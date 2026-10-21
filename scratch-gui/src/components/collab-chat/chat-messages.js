import {defineMessages} from 'react-intl';

export default defineMessages({
    title: {
        id: 'gui.collabChat.title',
        defaultMessage: 'Chat',
        description: 'Heading of the chat in a shared room'
    },
    open: {
        id: 'gui.collabChat.open',
        defaultMessage: 'Open chat',
        description: 'Menu bar button that opens the room chat'
    },
    openUnread: {
        id: 'gui.collabChat.openUnread',
        defaultMessage: 'Open chat, {n, plural, one {1 new message} other {# new messages}}',
        description: 'Menu bar button that opens the room chat when there are new messages'
    },
    close: {
        id: 'gui.collabChat.close',
        defaultMessage: 'Close chat',
        description: 'Button that closes the room chat'
    },
    switchLabel: {
        id: 'gui.collabChat.switchLabel',
        defaultMessage: 'Chat for everyone in this room',
        description: 'Accessible name of the switch the room owner uses to turn chat on or off'
    },
    on: {
        id: 'gui.collabChat.on',
        defaultMessage: 'On',
        description: 'Shown on the chat switch when chat is on'
    },
    off: {
        id: 'gui.collabChat.off',
        defaultMessage: 'Off',
        description: 'Shown on the chat switch when chat is off'
    },
    list: {
        id: 'gui.collabChat.list',
        defaultMessage: 'Chat messages',
        description: 'Accessible name of the list of chat messages'
    },
    empty: {
        id: 'gui.collabChat.empty',
        defaultMessage: 'No messages yet. Say hi!',
        description: 'Shown when nobody has chatted in the room yet'
    },
    you: {
        id: 'gui.collabChat.you',
        defaultMessage: 'You',
        description: 'Name shown above your own chat messages'
    },
    now: {
        id: 'gui.collabChat.now',
        defaultMessage: 'just now',
        description: 'Time of a chat message sent less than a minute ago'
    },
    minAgo: {
        id: 'gui.collabChat.minAgo',
        defaultMessage: '{n} min ago',
        description: 'Time of a chat message sent some minutes ago'
    },
    hrAgo: {
        id: 'gui.collabChat.hrAgo',
        defaultMessage: '{n} hr ago',
        description: 'Time of a chat message sent some hours ago'
    },
    dayAgo: {
        id: 'gui.collabChat.dayAgo',
        defaultMessage: '{n, plural, one {yesterday} other {# days ago}}',
        description: 'Time of a chat message sent some days ago'
    },
    more: {
        id: 'gui.collabChat.more',
        defaultMessage: 'More for this message from {name}',
        description: 'Button that shows report, hide and mute for one chat message'
    },
    report: {
        id: 'gui.collabChat.report',
        defaultMessage: 'Report',
        description: 'Button that reports a chat message'
    },
    hide: {
        id: 'gui.collabChat.hide',
        defaultMessage: 'Hide {name}',
        description: 'Button that hides chat messages from one person, only for you'
    },
    mute: {
        id: 'gui.collabChat.mute',
        defaultMessage: 'Mute {name}',
        description: 'Button the room owner uses to stop one person chatting in the room'
    },
    unmute: {
        id: 'gui.collabChat.unmute',
        defaultMessage: 'Unmute {name}',
        description: 'Button the room owner uses to let a muted person chat again'
    },
    reportedNote: {
        id: 'gui.collabChat.reportedNote',
        defaultMessage: 'You reported this message. Thanks for telling us.',
        description: 'Shown in place of a chat message you reported'
    },
    newMessages: {
        id: 'gui.collabChat.newMessages',
        defaultMessage: 'New messages',
        description: 'Button that jumps down to new chat messages'
    },
    placeholder: {
        id: 'gui.collabChat.placeholder',
        defaultMessage: 'Say something nice',
        description: 'Placeholder in the chat text box'
    },
    inputLabel: {
        id: 'gui.collabChat.inputLabel',
        defaultMessage: 'Chat message',
        description: 'Accessible name of the chat text box'
    },
    send: {
        id: 'gui.collabChat.send',
        defaultMessage: 'Send',
        description: 'Button that sends a chat message'
    },
    charsLeft: {
        id: 'gui.collabChat.charsLeft',
        defaultMessage: '{n} left',
        description: 'How many more letters fit in a chat message'
    },
    phrases: {
        id: 'gui.collabChat.phrases',
        defaultMessage: 'Quick phrases',
        description: 'Accessible name of the row or grid of ready-made chat phrases'
    },
    quickHint: {
        id: 'gui.collabChat.quickHint',
        defaultMessage: 'Tap something to say it',
        description: 'Hint above the phrase picker for accounts that chat with phrases only'
    },
    offEveryone: {
        id: 'gui.collabChat.offEveryone',
        defaultMessage: 'Chat is off right now. You can still read old messages.',
        description: 'Shown to room members when the owner has turned chat off'
    },
    offOwner: {
        id: 'gui.collabChat.offOwner',
        defaultMessage: 'Chat is off for everyone. Turn it on so people can talk.',
        description: 'Shown to the room owner when chat is off'
    },
    muted: {
        id: 'gui.collabChat.muted',
        defaultMessage: 'The owner turned off chat for you in this room. You can still read messages.',
        description: 'Shown to someone the room owner has muted'
    },
    reconnecting: {
        id: 'gui.collabChat.reconnecting',
        defaultMessage: 'Reconnecting. You can chat again in a moment.',
        description: 'Shown in the chat while the connection to the room is coming back'
    },
    announce: {
        id: 'gui.collabChat.announce',
        defaultMessage: '{name} says: {text}',
        description: 'Read out by screen readers when a new chat message arrives'
    },
    hidAnnounce: {
        id: 'gui.collabChat.hidAnnounce',
        defaultMessage: 'Messages from {name} are hidden. You can show them again in the people list.',
        description: 'Read out after hiding a person in chat'
    },
    reportTitle: {
        id: 'gui.collabChat.reportTitle',
        defaultMessage: 'Report this message?',
        description: 'Heading of the sheet for reporting a chat message'
    },
    reportWhy: {
        id: 'gui.collabChat.reportWhy',
        defaultMessage: 'What is wrong with it?',
        description: 'Question above the list of reasons for reporting a chat message'
    },
    reasonMean: {
        id: 'gui.collabChat.reasonMean',
        defaultMessage: 'It is mean or rude',
        description: 'Reason for reporting a chat message'
    },
    reasonNotForKids: {
        id: 'gui.collabChat.reasonNotForKids',
        defaultMessage: 'It is not OK for kids',
        description: 'Reason for reporting a chat message'
    },
    reasonPrivate: {
        id: 'gui.collabChat.reasonPrivate',
        defaultMessage: 'It shares private stuff, like where someone lives',
        description: 'Reason for reporting a chat message'
    },
    reasonSpam: {
        id: 'gui.collabChat.reasonSpam',
        defaultMessage: 'It is spam or keeps repeating',
        description: 'Reason for reporting a chat message'
    },
    reportSend: {
        id: 'gui.collabChat.reportSend',
        defaultMessage: 'Send report',
        description: 'Button that sends a chat report'
    },
    reportSending: {
        id: 'gui.collabChat.reportSending',
        defaultMessage: 'Sending',
        description: 'Shown on the report button while the report is on its way'
    },
    cancel: {
        id: 'gui.collabChat.cancel',
        defaultMessage: 'Cancel',
        description: 'Button that closes the report sheet without reporting'
    },
    reportError: {
        id: 'gui.collabChat.reportError',
        defaultMessage: 'We could not send that report. Try again in a bit.',
        description: 'Shown when a chat report did not go through'
    },
    reportDone: {
        id: 'gui.collabChat.reportDone',
        defaultMessage: 'Thanks for telling us. The Squiggle team will take a look.',
        description: 'Shown after a chat report went through'
    },
    ok: {
        id: 'gui.collabChat.ok',
        defaultMessage: 'OK',
        description: 'Button that closes the report sheet after reporting'
    },
    done: {
        id: 'gui.collabChat.done',
        defaultMessage: 'Done',
        description: 'Button that closes the keyboard and goes back to the room on phones'
    },
    messages: {
        id: 'gui.collabChat.messages',
        defaultMessage: 'Messages',
        description: 'Button that opens the Squiggle messages page'
    },
    messagesUnread: {
        id: 'gui.collabChat.messagesUnread',
        defaultMessage: 'Messages, {n} unread',
        description: 'Accessible name of the Messages button when there are unread messages'
    }
});
