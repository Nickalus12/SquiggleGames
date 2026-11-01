import {MORE, spriteScriptText} from '../../../src/lib/ai/script-text.js';

const num = (id, parent, value) => ({id, opcode: 'math_number', shadow: true, parent, topLevel: false, inputs: {}, fields: {NUM: {name: 'NUM', value}}});

const jumper = () => ({
    isStage: false,
    visible: true,
    x: 12.4,
    y: -40,
    size: 100,
    sprite: {costumes: [{}, {}]},
    variables: {v1: {name: 'score', type: ''}, l1: {name: 'bag', type: 'list'}},
    blocks: {_blocks: {
        hat: {id: 'hat', opcode: 'event_whenflagclicked', topLevel: true, x: 0, y: 0, next: 'loop', inputs: {}, fields: {}},
        loop: {id: 'loop', opcode: 'control_forever', parent: 'hat', next: null, inputs: {SUBSTACK: {name: 'SUBSTACK', block: 'cond'}}, fields: {}},
        cond: {id: 'cond', opcode: 'control_if', parent: 'loop', next: null,
            inputs: {CONDITION: {name: 'CONDITION', block: 'key'}, SUBSTACK: {name: 'SUBSTACK', block: 'jump'}}, fields: {}},
        key: {id: 'key', opcode: 'sensing_keypressed', parent: 'cond', inputs: {KEY_OPTION: {name: 'KEY_OPTION', block: 'keymenu', shadow: 'keymenu'}}, fields: {}},
        keymenu: {id: 'keymenu', opcode: 'sensing_keyoptions', shadow: true, parent: 'key', inputs: {}, fields: {KEY_OPTION: {name: 'KEY_OPTION', value: 'space'}}},
        jump: {id: 'jump', opcode: 'motion_changeyby', parent: 'cond', next: 'set', inputs: {DY: {name: 'DY', block: 'n10', shadow: 'n10'}}, fields: {}},
        n10: num('n10', 'jump', 10),
        set: {id: 'set', opcode: 'data_setvariableto', parent: 'jump', next: null,
            inputs: {VALUE: {name: 'VALUE', block: 'sum', shadow: 'txt'}}, fields: {VARIABLE: {name: 'VARIABLE', value: 'score'}}},
        txt: {id: 'txt', opcode: 'text', shadow: true, parent: 'set', inputs: {}, fields: {TEXT: {name: 'TEXT', value: '0'}}},
        sum: {id: 'sum', opcode: 'operator_add', parent: 'set',
            inputs: {NUM1: {name: 'NUM1', block: 'var', shadow: 'n1'}, NUM2: {name: 'NUM2', block: 'n2', shadow: 'n2'}}, fields: {}},
        var: {id: 'var', opcode: 'data_variable', parent: 'sum', inputs: {}, fields: {VARIABLE: {name: 'VARIABLE', value: 'score'}}},
        n1: num('n1', 'sum', ''),
        n2: num('n2', 'sum', 1),
        orphan: {id: 'orphan', opcode: 'math_number', shadow: true, topLevel: true, inputs: {}, fields: {NUM: {name: 'NUM', value: 5}}},
        loose: {id: 'loose', opcode: 'motion_movesteps', topLevel: true, x: 0, y: 300, next: null,
            inputs: {STEPS: {name: 'STEPS', block: 'n0', shadow: 'n0'}}, fields: {}},
        n0: num('n0', 'loose', 0)
    }}
});

describe('spriteScriptText', () => {
    test('renders stacks as indented pseudo blocks with a facts line', () => {
        expect(spriteScriptText(jumper())).toBe([
            'facts: visible: yes, x: 12, y: -40, size: 100%, costumes: 2, variables: score, lists: bag',
            '',
            'when green flag clicked',
            'forever',
            '  if <key [space] pressed?> then',
            '    change y by (10)',
            '    set [score] to ((score) + (1))',
            '',
            '(loose blocks with no hat block on top)',
            'move (0) steps'
        ].join('\n'));
    });

    test('marks empty C blocks, else branches, custom blocks, unknown opcodes and messages', () => {
        const blocks = {
            def: {id: 'def', opcode: 'procedures_definition', topLevel: true, y: 0, next: 'ifelse',
                inputs: {custom_block: {name: 'custom_block', block: 'proto', shadow: 'proto'}}, fields: {}},
            proto: {id: 'proto', opcode: 'procedures_prototype', shadow: true, parent: 'def', inputs: {}, fields: {},
                mutation: {proccode: 'jump %s high %b', argumentnames: '["height","fast"]', argumentids: '["a1","a2"]'}},
            ifelse: {id: 'ifelse', opcode: 'control_if_else', parent: 'def', next: 'say',
                inputs: {SUBSTACK: {name: 'SUBSTACK', block: 'call'}}, fields: {}},
            call: {id: 'call', opcode: 'procedures_call', parent: 'ifelse', next: 'pen', fields: {},
                mutation: {proccode: 'jump %s high %b', argumentids: '["a1","a2"]'},
                inputs: {a1: {name: 'a1', block: 'arg', shadow: 'arg'}}},
            arg: {id: 'arg', opcode: 'text', shadow: true, parent: 'call', inputs: {}, fields: {TEXT: {name: 'TEXT', value: '20'}}},
            pen: {id: 'pen', opcode: 'music_playDrumForBeats', parent: 'call', next: null, fields: {},
                inputs: {BEATS: {name: 'BEATS', block: 'b', shadow: 'b'}}},
            b: {id: 'b', opcode: 'math_number', shadow: true, parent: 'pen', inputs: {}, fields: {NUM: {name: 'NUM', value: 0.25}}},
            say: {id: 'say', opcode: 'event_broadcast', parent: 'ifelse', next: null,
                inputs: {BROADCAST_INPUT: {name: 'BROADCAST_INPUT', block: 'msg', shadow: 'msg'}}, fields: {}},
            msg: {id: 'msg', opcode: 'event_broadcast_menu', shadow: true, parent: 'say', inputs: {},
                fields: {BROADCAST_OPTION: {name: 'BROADCAST_OPTION', value: 'start'}}},
            hear: {id: 'hear', opcode: 'event_whenbroadcastreceived', topLevel: true, y: 200, next: 'forever', inputs: {},
                fields: {BROADCAST_OPTION: {name: 'BROADCAST_OPTION', value: 'go'}}},
            forever: {id: 'forever', opcode: 'control_forever', parent: 'hear', next: null, inputs: {}, fields: {}}
        };
        const me = {visible: false, x: 0, y: 0, size: 50, variables: {}, blocks: {_blocks: blocks}, getCostumes: () => [{}]};
        const other = {blocks: {_blocks: {}}};
        expect(spriteScriptText(me, {others: [me, other]})).toBe([
            'facts: visible: no, x: 0, y: 0, size: 50%, costumes: 1, variables: none',
            'messages: broadcast but no script receives: [start]; received but never broadcast: [go]',
            '',
            'define jump (height) high <fast>',
            'if <> then',
            '  jump (20) high ()',
            '  music_playDrumForBeats BEATS: (0.25)',
            'else',
            '  (nothing inside)',
            'broadcast [start]',
            '',
            'when I receive [go]',
            'forever',
            '  (nothing inside)'
        ].join('\n'));
    });

    test('describes the stage, an empty target, and truncates long scripts', () => {
        expect(spriteScriptText({isStage: true, sprite: {costumes: [{}, {}, {}]}, variables: {}, blocks: {_blocks: {}}}))
            .toBe('facts: stage, backdrops: 3, variables: none\n\n(no blocks yet)');
        const blocks = {hat: {id: 'hat', opcode: 'event_whenflagclicked', topLevel: true, next: 's0', inputs: {}, fields: {}}};
        for (let i = 0; i < 400; i++) {
            blocks[`s${i}`] = {id: `s${i}`, opcode: 'looks_nextcostume', parent: i ? `s${i - 1}` : 'hat', next: `s${i + 1}`, inputs: {}, fields: {}};
        }
        const out = spriteScriptText({variables: {}, blocks: {_blocks: blocks}}, {max: 500});
        expect(out.length).toBeLessThanOrEqual(500);
        expect(out.endsWith(`\n${MORE}`)).toBe(true);
    });
});
