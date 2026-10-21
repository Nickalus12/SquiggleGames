import {defineMessages} from 'react-intl';

export default defineMessages({
    title: {
        id: 'sq.rules.setup.title',
        defaultMessage: 'Game setup',
        description: 'Title of the sheet that sets up the Game Rules sprite'
    },
    intro: {
        id: 'sq.rules.setup.intro',
        defaultMessage: 'Game Rules run on the Squiggle server. Set up what the game keeps track of.',
        description: 'First line of the Game setup sheet'
    },
    values: {
        id: 'sq.rules.setup.values',
        defaultMessage: 'Game values',
        description: 'Heading for the Game Rules sprite variables and lists'
    },
    noValues: {
        id: 'sq.rules.setup.noValues',
        defaultMessage: 'Make a variable or list in Game Rules and it shows up here.',
        description: 'Shown when the Game Rules sprite has no variables or lists'
    },
    list: {
        id: 'sq.rules.setup.list',
        defaultMessage: 'list',
        description: 'Tag next to a list name in the Game setup sheet'
    },
    secret: {
        id: 'sq.rules.setup.secret',
        defaultMessage: 'Secret',
        description: 'Toggle: devices never see this game value'
    },
    saved: {
        id: 'sq.rules.setup.saved',
        defaultMessage: 'Saved',
        description: 'Toggle: this value is kept between games'
    },
    playerSprite: {
        id: 'sq.rules.setup.playerSprite',
        defaultMessage: 'Your player',
        description: 'Heading for the sprite each player moves in a game'
    },
    playerSpriteHelp: {
        id: 'sq.rules.setup.playerSpriteHelp',
        defaultMessage: 'This sprite moves for you in a game, and everyone sees it move.',
        description: 'Help under the player sprite picker'
    },
    playerSpriteFirst: {
        id: 'sq.rules.setup.playerSpriteFirst',
        defaultMessage: 'The first sprite',
        description: 'Option: use the first sprite as the player sprite'
    },
    players: {
        id: 'sq.rules.setup.players',
        defaultMessage: 'Player values',
        description: 'Heading for values each player has their own copy of'
    },
    playerName: {
        id: 'sq.rules.setup.playerName',
        defaultMessage: 'Name',
        description: 'Label for a player value name'
    },
    playerStart: {
        id: 'sq.rules.setup.playerStart',
        defaultMessage: 'Starts at',
        description: 'Label for the starting value of a player value'
    },
    seeAll: {
        id: 'sq.rules.setup.seeAll',
        defaultMessage: 'Everyone sees it',
        description: 'Option: every player can see this player value'
    },
    seeSelf: {
        id: 'sq.rules.setup.seeSelf',
        defaultMessage: 'Only that player sees it',
        description: 'Option: only the player who owns it can see this player value'
    },
    addPlayer: {
        id: 'sq.rules.setup.addPlayer',
        defaultMessage: 'Add a player value',
        description: 'Button that adds a player value row'
    },
    teams: {
        id: 'sq.rules.setup.teams',
        defaultMessage: 'Teams',
        description: 'Heading for the team list'
    },
    teamName: {
        id: 'sq.rules.setup.teamName',
        defaultMessage: 'Team name',
        description: 'Label for a team name'
    },
    addTeam: {
        id: 'sq.rules.setup.addTeam',
        defaultMessage: 'Add a team',
        description: 'Button that adds a team'
    },
    boards: {
        id: 'sq.rules.setup.boards',
        defaultMessage: 'Score boards',
        description: 'Heading for the score board list'
    },
    boardName: {
        id: 'sq.rules.setup.boardName',
        defaultMessage: 'Board name',
        description: 'Label for a score board name'
    },
    orderHigh: {
        id: 'sq.rules.setup.orderHigh',
        defaultMessage: 'Higher wins',
        description: 'Option: a higher score is better'
    },
    orderLow: {
        id: 'sq.rules.setup.orderLow',
        defaultMessage: 'Lower wins',
        description: 'Option: a lower score is better, like a time'
    },
    keepBest: {
        id: 'sq.rules.setup.keepBest',
        defaultMessage: 'Keep the best',
        description: 'Option: a board keeps each player\'s best score'
    },
    keepLast: {
        id: 'sq.rules.setup.keepLast',
        defaultMessage: 'Keep the last',
        description: 'Option: a board keeps each player\'s latest score'
    },
    addBoard: {
        id: 'sq.rules.setup.addBoard',
        defaultMessage: 'Add a score board',
        description: 'Button that adds a score board'
    },
    remove: {
        id: 'sq.rules.setup.remove',
        defaultMessage: 'Remove',
        description: 'Button that removes one row from the Game setup sheet'
    },
    limit: {
        id: 'sq.rules.setup.limit',
        defaultMessage: '{count} of {max}',
        description: 'How many rows are used out of the most allowed'
    },
    timersNote: {
        id: 'sq.rules.setup.timersNote',
        defaultMessage: 'Timers need no setup. Name them in the timer blocks.',
        description: 'Note that timers are made by naming them in blocks'
    },
    savesNote: {
        id: 'sq.rules.setup.savesNote',
        defaultMessage: 'Test games in a room forget saves when they end.',
        description: 'Note that saved values only last in published games'
    },
    cancel: {
        id: 'sq.rules.setup.cancel',
        defaultMessage: 'Cancel',
        description: 'Close the Game setup sheet without saving'
    },
    save: {
        id: 'sq.rules.setup.save',
        defaultMessage: 'Save',
        description: 'Save the Game setup sheet'
    }
});
