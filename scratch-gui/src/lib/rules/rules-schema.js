export default {
    v: 1,
    opcodeSet: 1,
    limits: {
        spriteBytes: 262144,
        programBytes: 262144,
        stateBytes: 262144,
        opsPerHandler: 2000,
        opsPerTick: 20000,
        repeat: 100,
        string: 4096,
        vars: 64,
        events: 32,
        phases: 16,
        rulesPerEvent: 16,
        timers: 4,
        saveKeys: 4,
        playerValues: 32,
        inputNames: 32,
        lists: 16,
        teams: 4,
        boards: 4,
        everyMinSeconds: 0.1
    },
    core: {
        control_if: ['CONDITION', 'SUBSTACK'],
        control_if_else: ['CONDITION', 'SUBSTACK', 'SUBSTACK2'],
        control_repeat: ['TIMES', 'SUBSTACK'],
        control_repeat_until: ['CONDITION', 'SUBSTACK'],
        control_stop: ['STOP_OPTION'],
        operator_add: ['NUM1', 'NUM2'],
        operator_subtract: ['NUM1', 'NUM2'],
        operator_multiply: ['NUM1', 'NUM2'],
        operator_divide: ['NUM1', 'NUM2'],
        operator_random: ['FROM', 'TO'],
        operator_gt: ['OPERAND1', 'OPERAND2'],
        operator_lt: ['OPERAND1', 'OPERAND2'],
        operator_equals: ['OPERAND1', 'OPERAND2'],
        operator_and: ['OPERAND1', 'OPERAND2'],
        operator_or: ['OPERAND1', 'OPERAND2'],
        operator_not: ['OPERAND'],
        operator_join: ['STRING1', 'STRING2'],
        operator_letter_of: ['LETTER', 'STRING'],
        operator_length: ['STRING'],
        operator_contains: ['STRING1', 'STRING2'],
        operator_mod: ['NUM1', 'NUM2'],
        operator_round: ['NUM'],
        operator_mathop: ['OPERATOR', 'NUM'],
        data_variable: ['VARIABLE'],
        data_setvariableto: ['VARIABLE', 'VALUE'],
        data_changevariableby: ['VARIABLE', 'VALUE'],
        data_listcontents: ['LIST'],
        data_addtolist: ['LIST', 'ITEM'],
        data_deleteoflist: ['LIST', 'INDEX'],
        data_deletealloflist: ['LIST'],
        data_insertatlist: ['LIST', 'INDEX', 'ITEM'],
        data_replaceitemoflist: ['LIST', 'INDEX', 'ITEM'],
        data_itemoflist: ['LIST', 'INDEX'],
        data_itemnumoflist: ['LIST', 'ITEM'],
        data_lengthoflist: ['LIST'],
        data_listcontainsitem: ['LIST', 'ITEM'],
        procedures_definition: ['custom_block'],
        procedures_prototype: [],
        procedures_call: [],
        argument_reporter_string_number: ['VALUE'],
        argument_reporter_boolean: ['VALUE'],
        math_number: ['NUM'],
        math_whole_number: ['NUM'],
        math_positive_number: ['NUM'],
        math_integer: ['NUM'],
        text: ['TEXT']
    },
    fields: {control_stop: {STOP_OPTION: ['this script']}},
    menus: {
        gameValues: {source: 'variables'},
        playerValues: {source: 'players'},
        timers: {source: 'timers'},
        teams: {source: 'teams'},
        boards: {source: 'boards'},
        sendTo: {items: ['everyone']}
    },
    cards: {
        together: [
            {opcode: 'ruleWhenGameStarts', type: 'hat', text: 'when the game starts'},
            {opcode: 'ruleWhenPlayerJoins', type: 'hat', text: 'when a player joins'},
            {opcode: 'ruleWhenPlayerLeaves', type: 'hat', text: 'when a player leaves'},
            {
                opcode: 'ruleWhenPlayerSends',
                type: 'hat',
                text: 'when a player sends [NAME]',
                args: {NAME: {type: 'string', default: 'jump', name: 'input'}}
            },
            {
                opcode: 'ruleWhenTimerDone',
                type: 'hat',
                text: 'when timer [TIMER] is done',
                args: {TIMER: {type: 'string', menu: 'timers', default: 'timer'}}
            },
            {
                opcode: 'ruleEvery',
                type: 'hat',
                text: 'every [SECONDS] seconds',
                args: {SECONDS: {type: 'number', default: 1, min: 0.1}}
            },
            {
                opcode: 'ruleWhenValueChanges',
                type: 'hat',
                text: 'when [VALUE] changes',
                args: {VALUE: {type: 'string', menu: 'gameValues', default: ''}}
            },
            '---',
            {
                opcode: 'ruleSetPlayerValue',
                type: 'command',
                text: 'set [VALUE] of [PLAYER] to [TO]',
                args: {
                    VALUE: {type: 'string', menu: 'playerValues', default: ''},
                    PLAYER: {type: 'number', default: ''},
                    TO: {type: 'string', default: '0'}
                }
            },
            {
                opcode: 'ruleChangePlayerValue',
                type: 'command',
                text: 'change [VALUE] of [PLAYER] by [BY]',
                args: {
                    VALUE: {type: 'string', menu: 'playerValues', default: ''},
                    PLAYER: {type: 'number', default: ''},
                    BY: {type: 'number', default: 1}
                }
            },
            {opcode: 'ruleForEachPlayer', type: 'loop', text: 'for each player'},
            {
                opcode: 'ruleSend',
                type: 'command',
                text: 'send [NAME] with [VALUE] to [TO]',
                args: {
                    NAME: {type: 'string', default: 'hello', name: 'event'},
                    VALUE: {type: 'string', default: ''},
                    TO: {type: 'string', menu: 'sendTo', default: 'everyone'}
                }
            },
            {
                opcode: 'ruleStartTimer',
                type: 'command',
                text: 'start timer [TIMER] for [SECONDS] seconds',
                args: {
                    TIMER: {type: 'string', menu: 'timers', default: 'timer'},
                    SECONDS: {type: 'number', default: 60}
                }
            },
            {
                opcode: 'ruleStopTimer',
                type: 'command',
                text: 'stop timer [TIMER]',
                args: {TIMER: {type: 'string', menu: 'timers', default: 'timer'}}
            },
            {
                opcode: 'ruleRemovePlayer',
                type: 'command',
                text: 'remove [PLAYER] from the game',
                args: {PLAYER: {type: 'number', default: ''}}
            },
            {
                opcode: 'ruleEndGame',
                type: 'command',
                text: 'end the game, winner [WINNER]',
                args: {WINNER: {type: 'number', default: ''}}
            },
            '---',
            {opcode: 'ruleThePlayer', type: 'reporter', text: 'the player'},
            {opcode: 'ruleMessageValue', type: 'reporter', text: 'message value'},
            {
                opcode: 'ruleNameOf',
                type: 'reporter',
                text: 'name of [PLAYER]',
                args: {PLAYER: {type: 'number', default: ''}}
            },
            {
                opcode: 'rulePlayerValueOf',
                type: 'reporter',
                text: '[VALUE] of [PLAYER]',
                args: {
                    VALUE: {type: 'string', menu: 'playerValues', default: ''},
                    PLAYER: {type: 'number', default: ''}
                }
            },
            {opcode: 'ruleNumberOfPlayers', type: 'reporter', text: 'number of players'},
            {
                opcode: 'ruleTimeLeft',
                type: 'reporter',
                text: 'time left on [TIMER]',
                args: {TIMER: {type: 'string', menu: 'timers', default: 'timer'}}
            },
            {opcode: 'ruleGameTime', type: 'reporter', text: 'game time'},
            {opcode: 'ruleRandomPlayer', type: 'reporter', text: 'random player'}
        ],
        squigglescores: [
            {opcode: 'whenRoundStarts', type: 'hat', text: 'when a round starts'},
            {opcode: 'whenRoundEnds', type: 'hat', text: 'when a round ends'},
            {opcode: 'startRound', type: 'command', text: 'start a new round'},
            {opcode: 'endRound', type: 'command', text: 'end the round'},
            {opcode: 'round', type: 'reporter', text: 'round'},
            '---',
            {
                opcode: 'savePlayerValue',
                type: 'command',
                text: 'save [VALUE] for [PLAYER]',
                args: {
                    VALUE: {type: 'string', menu: 'playerValues', default: ''},
                    PLAYER: {type: 'number', default: ''}
                }
            },
            {
                opcode: 'postScore',
                type: 'command',
                text: 'post [SCORE] for [PLAYER] on [BOARD]',
                args: {
                    SCORE: {type: 'number', default: 0},
                    PLAYER: {type: 'number', default: ''},
                    BOARD: {type: 'string', menu: 'boards', default: ''}
                }
            },
            {
                opcode: 'playerWithMost',
                type: 'reporter',
                text: 'player with the most [VALUE]',
                args: {VALUE: {type: 'string', menu: 'playerValues', default: ''}}
            }
        ],
        squiggleteams: [
            {
                opcode: 'putOnTeam',
                type: 'command',
                text: 'put [PLAYER] on team [TEAM]',
                args: {PLAYER: {type: 'number', default: ''}, TEAM: {type: 'string', menu: 'teams', default: ''}}
            },
            {
                opcode: 'forEachOnTeam',
                type: 'loop',
                text: 'for each player on team [TEAM]',
                args: {TEAM: {type: 'string', menu: 'teams', default: ''}}
            },
            {
                opcode: 'sendToTeam',
                type: 'command',
                text: 'send [NAME] with [VALUE] to team [TEAM]',
                args: {
                    NAME: {type: 'string', default: 'hello', name: 'event'},
                    VALUE: {type: 'string', default: ''},
                    TEAM: {type: 'string', menu: 'teams', default: ''}
                }
            },
            {
                opcode: 'teamOf',
                type: 'reporter',
                text: 'team of [PLAYER]',
                args: {PLAYER: {type: 'number', default: ''}}
            },
            {
                opcode: 'playersOnTeam',
                type: 'reporter',
                text: 'players on team [TEAM]',
                args: {TEAM: {type: 'string', menu: 'teams', default: ''}}
            },
            '---',
            {
                opcode: 'giveItem',
                type: 'command',
                text: 'give [COUNT] [ITEM] to [PLAYER]',
                args: {
                    COUNT: {type: 'number', default: 1},
                    ITEM: {type: 'string', menu: 'playerValues', default: ''},
                    PLAYER: {type: 'number', default: ''}
                }
            },
            {
                opcode: 'takeItem',
                type: 'command',
                text: 'take [COUNT] [ITEM] from [PLAYER]',
                args: {
                    COUNT: {type: 'number', default: 1},
                    ITEM: {type: 'string', menu: 'playerValues', default: ''},
                    PLAYER: {type: 'number', default: ''}
                }
            },
            {
                opcode: 'countOfItem',
                type: 'reporter',
                text: 'count of [ITEM] for [PLAYER]',
                args: {
                    ITEM: {type: 'string', menu: 'playerValues', default: ''},
                    PLAYER: {type: 'number', default: ''}
                }
            }
        ],
        squigglearena: [
            {
                opcode: 'setSpeedLimit',
                type: 'command',
                text: 'players can move [STEPS] steps a second',
                args: {STEPS: {type: 'number', default: 200}}
            },
            {
                opcode: 'movePlayer',
                type: 'command',
                text: 'move [PLAYER] to x [X] y [Y]',
                args: {
                    PLAYER: {type: 'number', default: ''},
                    X: {type: 'number', default: 0},
                    Y: {type: 'number', default: 0}
                }
            },
            '---',
            {opcode: 'xOf', type: 'reporter', text: 'x of [PLAYER]', args: {PLAYER: {type: 'number', default: ''}}},
            {opcode: 'yOf', type: 'reporter', text: 'y of [PLAYER]', args: {PLAYER: {type: 'number', default: ''}}},
            {
                opcode: 'directionOf',
                type: 'reporter',
                text: 'direction of [PLAYER]',
                args: {PLAYER: {type: 'number', default: ''}}
            },
            {
                opcode: 'aimingAt',
                type: 'reporter',
                text: 'player [PLAYER] is aiming at within [STEPS] steps and [DEGREES] degrees',
                args: {
                    PLAYER: {type: 'number', default: ''},
                    STEPS: {type: 'number', default: 300},
                    DEGREES: {type: 'number', default: 10}
                }
            },
            {
                opcode: 'canSee',
                type: 'boolean',
                text: 'can [PLAYER] see [OTHER]?',
                args: {PLAYER: {type: 'number', default: ''}, OTHER: {type: 'number', default: ''}}
            }
        ]
    }
};
