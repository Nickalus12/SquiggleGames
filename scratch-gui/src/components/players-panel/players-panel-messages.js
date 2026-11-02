import {defineMessages} from 'react-intl';
import {PEER_COLORS, PEER_SHAPES} from '../../lib/themes/peers.js';

const messages = defineMessages({
    button: {
        id: 'sq.players.button',
        defaultMessage: 'Players ({count})',
        description: 'Button in the player chrome that opens the players list'
    },
    heading: {
        id: 'sq.players.heading',
        defaultMessage: 'Players ({count})',
        description: 'Heading of the players panel'
    },
    close: {
        id: 'sq.players.close',
        defaultMessage: 'Close players list',
        description: 'Close button of the players panel'
    },
    you: {
        id: 'sq.players.you',
        defaultMessage: 'you',
        description: 'Badge marking your own row in the players list'
    },
    empty: {
        id: 'sq.players.empty',
        defaultMessage: 'Waiting for players to join.',
        description: 'Shown when no player rows are present yet'
    },
    pingGood: {
        id: 'sq.players.ping.good',
        defaultMessage: 'Good',
        description: 'Good connection ping bucket label'
    },
    pingOk: {
        id: 'sq.players.ping.ok',
        defaultMessage: 'OK',
        description: 'OK connection ping bucket label'
    },
    pingWeak: {
        id: 'sq.players.ping.weak',
        defaultMessage: 'Weak',
        description: 'Weak connection ping bucket label'
    },
    weakConnection: {
        id: 'sq.players.weakConnection',
        defaultMessage: 'Weak connection',
        description: 'Shown when RTT, jitter, or packet gaps cross the weak connection threshold'
    },
    reconnecting: {
        id: 'sq.players.reconnecting',
        defaultMessage: 'Reconnecting',
        description: 'Shown while the game socket is reconnecting inside the grace window'
    },
    connectionLost: {
        id: 'sq.players.connectionLost',
        defaultMessage: 'Connection lost',
        description: 'Shown when the socket drop passed the resume grace window'
    },
    joinAgain: {
        id: 'sq.players.joinAgain',
        defaultMessage: 'Join again',
        description: 'Button that rejoins the game without reloading the page'
    },
    oneJoined: {
        id: 'sq.players.toast.oneJoined',
        defaultMessage: '{name} joined',
        description: 'Toast when one player joins'
    },
    manyJoined: {
        id: 'sq.players.toast.manyJoined',
        defaultMessage: '{count} players joined',
        description: 'Toast when a burst of players joins'
    },
    oneLeft: {
        id: 'sq.players.toast.oneLeft',
        defaultMessage: '{name} left',
        description: 'Toast when one player leaves'
    },
    manyLeft: {
        id: 'sq.players.toast.manyLeft',
        defaultMessage: '{count} players left',
        description: 'Toast when a burst of players leaves'
    },
    reconnectedToast: {
        id: 'sq.players.toast.reconnected',
        defaultMessage: 'Back in the game',
        description: 'Toast shown after silent resume inside the grace window'
    },
    serverTick: {
        id: 'sq.players.health.serverTick',
        defaultMessage: 'Tick p95 {ms} ms · {status}',
        description: 'Host health indicator showing server tick p95 and budget status'
    },
    tickP50Ok: {
        id: 'sq.players.health.tickP50Ok',
        defaultMessage: 'p50 ok (≤ 5 ms)',
        description: 'Tick p95 inside the 5 ms p50 standard budget'
    },
    tickP95Ok: {
        id: 'sq.players.health.tickP95Ok',
        defaultMessage: 'p95 ok (≤ 12 ms)',
        description: 'Tick p95 inside the 12 ms p95 standard budget'
    },
    tickNearCeiling: {
        id: 'sq.players.health.tickNearCeiling',
        defaultMessage: 'near ceiling (≤ 25 ms)',
        description: 'Tick p95 between 12 ms and the 25 ms ceiling'
    },
    tickOverCeiling: {
        id: 'sq.players.health.tickOverCeiling',
        defaultMessage: 'over 25 ms',
        description: 'Tick p95 above the 25 ms ceiling'
    }
});

const colorMessages = Object.fromEntries(PEER_COLORS.map(c => [c.id, {
    id: `sq.peer.color.${c.id}`,
    defaultMessage: c.name,
    description: 'Name of a peer colour'
}]));

const shapeMessages = Object.fromEntries(PEER_SHAPES.map(s => [s.id, {
    id: `sq.peer.shape.${s.id}`,
    defaultMessage: s.name,
    description: 'Name of a peer shape'
}]));

export {colorMessages, messages as default, shapeMessages};
