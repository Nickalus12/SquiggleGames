process.removeAllListeners('warning');

const {ok, section, done} = await import('./harness.test-util.mjs');
const {avatarOf, blockedAt, createAvatarLayer, findPlayerSprite, outboundOp, renderedDirection} =
    await import('./session.js');

const sprite = (name, extra) => Object.assign({
    name, isOriginal: true, isStage: false, extensionStorage: {}, x: 0, y: 0, direction: 90, size: 100,
    visible: true, currentCostume: 0, rotationStyle: 'all around',
    sprite: {costumes: [{skinId: 11}, {skinId: 12}]}
}, extra);

section('the own sprite');
{
    const rules = sprite('Rules', {extensionStorage: {together: {role: 'rules', v: 1}}});
    const cat = sprite('Cat');
    const hero = sprite('Hero', {extensionStorage: {together: {role: 'player'}}});
    const stage = {isOriginal: true, isStage: true, extensionStorage: {}};
    ok('a sprite marked player wins', findPlayerSprite({targets: [stage, rules, cat, hero]}) === hero);
    ok('else the first sprite that is not Game Rules', findPlayerSprite({targets: [stage, rules, cat]}) === cat);
    ok('Game Rules alone is nobody', findPlayerSprite({targets: [stage, rules]}) === null);
}

section('outbound messages are cut');
{
    const op = outboundOp({type: 'game', action: 'msg', name: 'n'.repeat(150), value: 'v'.repeat(9000)});
    ok('the name is cut to 100 and the value to 4096', op.name.length === 100 && op.value.length === 4096,
        [op.name.length, op.value.length]);
    ok('a short message is untouched', JSON.stringify(outboundOp({type: 'game', action: 'msg', name: 'a', value: 1})) ===
        '{"action":"msg","name":"a","value":"1"}');
}

section('the avatar frame');
{
    const a = avatarOf(sprite('Cat', {x: 10.3, y: -4.8, direction: 44.6, currentCostume: 1, visible: false}), 2);
    ok('x and y at half pixels, direction in degrees, 1-based costume, flags, level', a.join() === '10.5,-5,45,2,0,2', a);
    const far = avatarOf(sprite('Cat', {x: 900, y: -700.2, direction: 270, currentCostume: 4000}), 300);
    ok('x, y, costume and level clamp to the PROTOCOL limits', far.join() === '480,-360,-90,1000,1,100', far);
    ok('direction 180 stays 180 and -180 turns to 180',
        avatarOf(sprite('Cat', {direction: 180}), 0)[2] === 180 && avatarOf(sprite('Cat', {direction: -180}), 0)[2] === 180);
}

section('others are drawn without clones');
{
    const calls = [];
    const renderer = new Proxy({}, {get: (target, key) => (...args) => {
        calls.push([key].concat(args));
        return key === 'createDrawable' ? 7 : undefined;
    }});
    const layer = createAvatarLayer({renderer});
    const source = sprite('Cat');
    layer.draw('3', [20, 30, -90, 2, 1, 0], source);
    ok('one drawable in the sprite layer', calls[0][0] === 'createDrawable' && calls[0][1] === 'sprite');
    ok('it wears the 1-based costume', calls.some(c => c[0] === 'updateDrawableSkinId' && c[2] === 12));
    ok('it stands where the tick says', calls.some(c => c[0] === 'updateDrawablePosition' && c[2].join() === '20,30'));
    layer.draw('3', [21, 30, -90, 9, 0, 0], source);
    ok('the drawable is reused', calls.filter(c => c[0] === 'createDrawable').length === 1);
    ok('a costume past the end clamps', calls.filter(c => c[0] === 'updateDrawableSkinId').pop()[2] === 12);
    ok('the visible flag hides it', calls.filter(c => c[0] === 'updateDrawableVisible').pop()[2] === false);
    layer.remove('3');
    ok('removing destroys it', calls.some(c => c[0] === 'destroyDrawable' && c[1] === 7) && layer.slots().length === 0);
    ok('no renderer draws nothing', (createAvatarLayer({}).draw('1', [0, 0, 90, 0, 1, 0], source), true));
}

section('walls come from the world kit');
ok('no world means no walls', blockedAt(5, 5) === false);
globalThis.window = {SquiggleWorld: {solidAt: (x, y) => x > 100 && y > 0}};
ok('a solid tile blocks the eased step', blockedAt(120, 4) === true);
ok('open ground does not', blockedAt(20, 4) === false);
delete globalThis.window;

section('rotation styles');
ok('all around turns', renderedDirection('all around', -45, 100).direction === -45);
ok('left-right flips', renderedDirection('left-right', -45, 100).scale[0] === -100 &&
    renderedDirection('left-right', -45, 100).direction === 90);
ok('don\'t rotate stays at 90', renderedDirection('don\'t rotate', 10, 50).direction === 90);

done();
