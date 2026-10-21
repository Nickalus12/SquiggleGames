import {defineMessages} from 'react-intl';

const itemMessages = defineMessages({
    'message-not-received': {
        id: 'sq.checker.item.messageNotReceived',
        defaultMessage: 'Nobody hears the message "{message}". Add a "when I receive" block.',
        description: 'Checker item: a broadcast that no script receives'
    },
    'message-not-sent': {
        id: 'sq.checker.item.messageNotSent',
        defaultMessage: 'Nothing sends the message "{message}", so this script never runs.',
        description: 'Checker item: a "when I receive" hat whose message is never broadcast'
    },
    'custom-block-missing': {
        id: 'sq.checker.item.customBlockMissing',
        defaultMessage: 'The block "{name}" has no "define" block in {sprite}.',
        description: 'Checker item: a My Blocks call whose definition is missing'
    },
    'variable-unused': {
        id: 'sq.checker.item.variableUnused',
        defaultMessage: 'The variable "{name}" is never used.',
        description: 'Checker item: a variable no block uses'
    },
    'variable-unused-set': {
        id: 'sq.checker.item.variableUnusedSet',
        defaultMessage: 'The variable "{name}" is set but never read.',
        description: 'Checker item: a variable that blocks change but never read'
    },
    'loose-blocks': {
        id: 'sq.checker.item.looseBlocks',
        defaultMessage: '{count, plural, one {# stack} other {# stacks}} in {sprite} ' +
            '{count, plural, one {has} other {have}} no hat block, ' +
            'so {count, plural, one {it never runs} other {they never run}}.',
        description: 'Checker item: block stacks without a hat block'
    },
    'clone-runaway': {
        id: 'sq.checker.item.cloneRunaway',
        defaultMessage: 'This keeps making clones of {sprite}, and no clone ever deletes itself.',
        description: 'Checker item: create clone inside a loop when the clone never runs delete this clone'
    },
    'together-flood': {
        id: 'sq.checker.item.togetherFlood',
        defaultMessage: 'This sends a Together message in a loop with no wait. Add a short wait.',
        description: 'Checker item: a Together send repeated with no wait'
    },
    'together-shared-loop': {
        id: 'sq.checker.item.togetherSharedLoop',
        defaultMessage: 'This changes the shared variable "{name}" every frame. Change it only when something happens.',
        description: 'Checker item: a shared variable set in a loop with no condition or wait'
    },
    'rules-outside': {
        id: 'sq.checker.item.rulesOutside',
        defaultMessage: 'This gold block only works inside Game Rules.',
        description: 'Checker item: a Game Rules block placed in a normal sprite'
    },
    'pen-with-camera': {
        id: 'sq.checker.item.penWithCamera',
        defaultMessage: 'Pen and stamp draw on the screen, not the world, so they will not follow the camera.',
        description: 'Checker item: pen or stamp blocks in a world project'
    },
    'scene-missing': {
        id: 'sq.checker.item.sceneMissing',
        defaultMessage: 'There is no scene called "{name}".',
        description: 'Checker item: a scene name that does not exist'
    },
    'tile-missing': {
        id: 'sq.checker.item.tileMissing',
        defaultMessage: 'There is no tile called "{name}".',
        description: 'Checker item: a tile name that does not exist'
    },
    'tile-missing-level': {
        id: 'sq.checker.item.tileMissingLevel',
        defaultMessage: 'There is no level called "{name}".',
        description: 'Checker item: a level name that does not exist'
    },
    'big-asset-costume': {
        id: 'sq.checker.item.bigAssetCostume',
        defaultMessage: 'The costume "{name}" is {kb} KB. Costumes over {budgetKb} KB make the game slow to load.',
        description: 'Checker item: a costume file over the size budget'
    },
    'big-asset-sound': {
        id: 'sq.checker.item.bigAssetSound',
        defaultMessage: 'The sound "{name}" is {kb} KB. Sounds over {budgetKb} KB make the game slow to load.',
        description: 'Checker item: a sound file over the size budget'
    },
    'squiggle-only': {
        id: 'sq.checker.item.squiggleOnly',
        defaultMessage: '{count, plural, one {# {kit} block} other {# {kit} blocks}} in {sprite} only work in ' +
            'Squiggle. Scratch and TurboWarp cannot load them.',
        description: 'Checker item: blocks from a Squiggle-only extension'
    },
    'fallback': {
        id: 'sq.checker.item.fallback',
        defaultMessage: 'Something here needs a look.',
        description: 'Checker item with a code the editor has no words for'
    }
});

const rulesErrorMessages = defineMessages({
    'unsupported': {
        id: 'sq.rules.err.unsupported',
        defaultMessage: 'This block can\'t run on the server. Move it to a normal sprite.',
        description: 'Game Rules error: a block the server cannot run'
    },
    'arg': {
        id: 'sq.rules.err.arg',
        defaultMessage: 'Check what you typed in this block.',
        description: 'Game Rules error: a block input the server rejected'
    },
    'name': {
        id: 'sq.rules.err.name',
        defaultMessage: 'This name isn\'t set up. Check the spelling or add it in Game setup.',
        description: 'Game Rules error: a name that is not declared'
    },
    'global-var': {
        id: 'sq.rules.err.global-var',
        defaultMessage: 'Game Rules can only use their own variables.',
        description: 'Game Rules error: a variable owned by another sprite or the stage'
    },
    'cycle': {
        id: 'sq.rules.err.cycle',
        defaultMessage: 'These custom blocks call each other in a circle.',
        description: 'Game Rules error: custom blocks that call each other'
    },
    'limit': {
        id: 'sq.rules.err.limit',
        defaultMessage: 'Game Rules can have at most {max} {limit}. Remove some.',
        description: 'Game Rules error: over a server limit; limit is a word from sq.rules.limit'
    },
    'too-big': {
        id: 'sq.rules.err.too-big',
        defaultMessage: 'These Game Rules are too big for the server. Make them smaller.',
        description: 'Game Rules error: the rules sprite is over the upload size'
    },
    'screened': {
        id: 'sq.rules.err.screened',
        defaultMessage: 'Some words here aren\'t allowed. Try different words.',
        description: 'Game Rules error: text the word filter rejected'
    },
    'opcode-set': {
        id: 'sq.rules.err.opcode-set',
        defaultMessage: 'Reload the editor to get the newest blocks.',
        description: 'Game Rules error: the editor block set is older than the server'
    },
    'upload-failed': {
        id: 'sq.rules.err.upload-failed',
        defaultMessage: 'Game Rules did not reach the server. Try again in a moment.',
        description: 'Game Rules error: the upload did not complete'
    },
    'too-much': {
        id: 'sq.rules.err.too-much',
        defaultMessage: 'This rule did too much at once, so its changes were undone.',
        description: 'Game Rules run error: a rule went over its step budget'
    },
    'deferred': {
        id: 'sq.rules.err.deferred',
        defaultMessage: 'The game was busy, so this rule ran a moment late.',
        description: 'Game Rules run error: a rule ran on a later tick'
    },
    'paused': {
        id: 'sq.rules.err.paused',
        defaultMessage: 'This rule kept the game too busy, so it rests for 5 seconds.',
        description: 'Game Rules run error: a rule paused for overusing the server'
    },
    'loop-cap': {
        id: 'sq.rules.err.loop-cap',
        defaultMessage: 'This repeat stopped at 100 times.',
        description: 'Game Rules run error: a repeat hit its cap'
    },
    'cut': {
        id: 'sq.rules.err.cut',
        defaultMessage: 'Some text was too long, so the end was cut off.',
        description: 'Game Rules run error: text over the length cap'
    },
    'state-full': {
        id: 'sq.rules.err.state-full',
        defaultMessage: 'The game ran out of room for values, so this change was not kept.',
        description: 'Game Rules run error: game state is full'
    },
    'dropped': {
        id: 'sq.rules.err.dropped',
        defaultMessage: 'This rule sent too many messages at once, so some were not sent.',
        description: 'Game Rules run error: messages dropped for rate'
    },
    'fallback': {
        id: 'sq.rules.err.fallback',
        defaultMessage: 'Something in Game Rules needs a look.',
        description: 'Game Rules error with a code the editor has no words for'
    }
});

const limitMessages = defineMessages({
    vars: {id: 'sq.rules.limit.vars', defaultMessage: 'game values', description: 'Game Rules limit name'},
    events: {id: 'sq.rules.limit.events', defaultMessage: 'events', description: 'Game Rules limit name'},
    phases: {id: 'sq.rules.limit.phases', defaultMessage: 'phases', description: 'Game Rules limit name'},
    rulesPerEvent: {
        id: 'sq.rules.limit.rulesPerEvent',
        defaultMessage: 'rules for one event',
        description: 'Game Rules limit name'
    },
    timers: {id: 'sq.rules.limit.timers', defaultMessage: 'timers', description: 'Game Rules limit name'},
    saveKeys: {id: 'sq.rules.limit.saveKeys', defaultMessage: 'saved values', description: 'Game Rules limit name'},
    playerValues: {
        id: 'sq.rules.limit.playerValues',
        defaultMessage: 'player values',
        description: 'Game Rules limit name'
    },
    inputNames: {
        id: 'sq.rules.limit.inputNames',
        defaultMessage: 'input names',
        description: 'Game Rules limit name'
    },
    lists: {id: 'sq.rules.limit.lists', defaultMessage: 'lists', description: 'Game Rules limit name'},
    teams: {id: 'sq.rules.limit.teams', defaultMessage: 'teams', description: 'Game Rules limit name'},
    boards: {id: 'sq.rules.limit.boards', defaultMessage: 'boards', description: 'Game Rules limit name'},
    repeat: {id: 'sq.rules.limit.repeat', defaultMessage: 'repeats', description: 'Game Rules limit name'},
    string: {id: 'sq.rules.limit.string', defaultMessage: 'letters', description: 'Game Rules limit name'},
    listItems: {
        id: 'sq.rules.limit.listItems',
        defaultMessage: 'items in one list',
        description: 'Game Rules limit name'
    },
    levels: {id: 'sq.rules.limit.levels', defaultMessage: 'levels', description: 'Game Rules limit name'},
    levelSide: {
        id: 'sq.rules.limit.levelSide',
        defaultMessage: 'tiles across one level',
        description: 'Game Rules limit name'
    },
    nameLength: {
        id: 'sq.rules.limit.nameLength',
        defaultMessage: 'letters in one name',
        description: 'Game Rules limit name'
    },
    depth: {
        id: 'sq.rules.limit.depth',
        defaultMessage: 'blocks inside each other',
        description: 'Game Rules limit name'
    }
});

const otherMessages = defineMessages({
    repeats: {
        id: 'sq.rules.repeats',
        defaultMessage: 'Happened {n} times.',
        description: 'Added after a Game Rules error that happened more than once'
    },
    limitFallback: {
        id: 'sq.rules.limitFallback',
        defaultMessage: 'This is more than the server allows. Make it smaller.',
        description: 'Game Rules limit error when the limit name is unknown'
    }
});

const fixMessages = defineMessages({
    'add-receiver': {id: 'sq.checker.fix.addReceiver', defaultMessage: 'Add a receiver', description: 'Fix it label'},
    'remove-calls': {id: 'sq.checker.fix.removeCalls', defaultMessage: 'Remove the calls', description: 'Fix it label'},
    'delete-variable': {id: 'sq.checker.fix.deleteVariable', defaultMessage: 'Delete it', description: 'Fix it label'},
    'delete-loose': {
        id: 'sq.checker.fix.deleteLoose',
        defaultMessage: 'Delete loose blocks',
        description: 'Fix it label'
    },
    'add-wait': {id: 'sq.checker.fix.addWait', defaultMessage: 'Add wait 0.1', description: 'Fix it label'},
    'move-to-rules': {id: 'sq.checker.fix.moveToRules', defaultMessage: 'Move it', description: 'Fix it label'},
    'move-out': {id: 'sq.checker.fix.moveOut', defaultMessage: 'Move it', description: 'Fix it label'},
    'create-scene': {id: 'sq.checker.fix.createScene', defaultMessage: 'Create it', description: 'Fix it label'},
    'create-level': {id: 'sq.checker.fix.createLevel', defaultMessage: 'Create it', description: 'Fix it label'},
    'create-tile': {id: 'sq.checker.fix.createTile', defaultMessage: 'Create it', description: 'Fix it label'}
});

const RULES_PREFIX = 'rules-';

const has = (table, key) => Object.prototype.hasOwnProperty.call(table, key);

const rulesCode = item => {
    if (item.rule !== 'rules-wrong-place' && item.rule !== 'rules-status') return null;
    if (item.code === 'rules-outside') return null;
    return item.code.indexOf(RULES_PREFIX) === 0 ? item.code.slice(RULES_PREFIX.length) : item.code;
};

const descriptorFor = item => {
    const code = rulesCode(item);
    if (code !== null) return has(rulesErrorMessages, code) ? rulesErrorMessages[code] : rulesErrorMessages.fallback;
    return has(itemMessages, item.code) ? itemMessages[item.code] : itemMessages.fallback;
};

const itemText = (intl, item) => {
    const values = Object.assign({}, item.values);
    const code = rulesCode(item);
    if (code === 'limit') {
        if (!has(limitMessages, values.limit) || !Number.isFinite(values.max)) {
            return intl.formatMessage(otherMessages.limitFallback);
        }
        values.limit = intl.formatMessage(limitMessages[values.limit]);
    }
    const text = intl.formatMessage(descriptorFor(item), values);
    if (code !== null && values.n > 1) return `${text} ${intl.formatMessage(otherMessages.repeats, {n: values.n})}`;
    return text;
};

const fixLabel = (intl, item) => (item.fix && has(fixMessages, item.fix) ?
    intl.formatMessage(fixMessages[item.fix]) :
    null);

export {
    itemMessages,
    rulesErrorMessages,
    limitMessages,
    otherMessages,
    fixMessages,
    descriptorFor,
    itemText,
    fixLabel
};
