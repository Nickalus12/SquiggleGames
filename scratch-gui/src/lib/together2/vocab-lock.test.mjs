process.removeAllListeners('warning');

const {ok, section, done} = await import('./harness.test-util.mjs');
const {VOCAB_LOCK} = await import('./net.js');
const {lockReason, lockedNames} = await import('./vocab-lock.js');

section('the numbers match the room');
ok('32 letters and a run of 5 digits', VOCAB_LOCK.text === 32 && VOCAB_LOCK.digitRun === 5, VOCAB_LOCK);

section('lockReason');
ok('32 letters pass', lockReason('a'.repeat(32)) === null);
ok('33 letters are long', lockReason('a'.repeat(33)) === 'long');
ok('4 digits in a row pass', lockReason('lap1234') === null);
ok('5 digits in a row are refused', lockReason('lap12345') === 'digits');
ok('digits split up pass', lockReason('1234-5678') === null);
ok('a non-string passes', lockReason(12345678) === null && lockReason(null) === null);

section('lockedNames');
{
    const text = (id, value, parent) => ({id, opcode: 'text', shadow: true, parent, fields: {TEXT: {name: 'TEXT', value}}});
    const sender = (id, opcode, nameId, plugged) => ({id, opcode, shadow: false,
        inputs: {NAME: {name: 'NAME', block: plugged || nameId, shadow: nameId}}});
    const target = (name, blocks, isOriginal = true) => ({isOriginal, getName: () => name,
        blocks: {_blocks: Object.fromEntries(blocks.map(b => [b.id, b]))}});
    const runtime = {targets: [
        target('Stage', []),
        target('Cat', [
            sender('b1', 'together_broadcastGameMessage', 's1'),
            text('s1', 'score', 'b1'),
            sender('b2', 'together_setSharedVariable', 's2'),
            text('s2', 'the very long shared variable name!', 'b2'),
            sender('b3', 'together_tellGame', 's3'),
            text('s3', 'call 55512345', 'b3'),
            sender('b4', 'together_changeSharedVariable', 's4', 'r4'),
            text('s4', 'x'.repeat(40), 'b4'),
            {id: 'r4', opcode: 'operator_join', shadow: false, inputs: {}},
            sender('b5', 'looks_say', 's5'),
            text('s5', 'y'.repeat(40), 'b5')
        ]),
        target('Dog', [
            sender('d1', 'together_setSharedVariable', 'd2'),
            text('d2', 'the very long shared variable name!', 'd1')
        ]),
        target('Clone', [sender('c1', 'together_tellGame', 'c2'), text('c2', 'z'.repeat(40), 'c1')], false)
    ]};
    const found = lockedNames(runtime);
    const names = found.map(f => f.name);
    ok('a long name is found', found.some(f => f.reason === 'long' && f.target === 'Cat' && f.blockId === 'b2'), found);
    ok('a digit run is found', found.some(f => f.reason === 'digits' && f.name === 'call 55512345'), found);
    ok('a short name is fine', !names.includes('score'));
    ok('a reporter plugged over the name is skipped', !names.includes('x'.repeat(40)));
    ok('other blocks are not checked', !names.includes('y'.repeat(40)));
    ok('clones are not checked', !names.includes('z'.repeat(40)));
    ok('each name once', found.length === 2, names);
    ok('no runtime finds nothing', lockedNames(null).length === 0);
}

done();
