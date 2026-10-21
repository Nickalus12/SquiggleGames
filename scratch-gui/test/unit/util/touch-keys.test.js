import {
    TOUCH_KEYS,
    keyboardData,
    listenedTouchKeys,
    projectWantsTouchKeys,
    touchKeyByName
} from '../../../src/lib/touch-keys';

const target = (blocks, extra) => Object.assign({isOriginal: true, blocks: {_blocks: blocks}}, extra);

const whenKey = key => ({
    opcode: 'event_whenkeypressed',
    fields: {KEY_OPTION: {name: 'KEY_OPTION', value: key}}
});

test('key names match the play page', () => {
    expect(TOUCH_KEYS.map(k => k.name)).toEqual(['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'space']);
});

describe('keyboardData', () => {
    test('arrow keys post their key and code', () => {
        expect(keyboardData('ArrowLeft', true)).toEqual({key: 'ArrowLeft', keyCode: 37, isDown: true});
        expect(keyboardData('ArrowUp', false)).toEqual({key: 'ArrowUp', keyCode: 38, isDown: false});
    });

    test('space posts a space character', () => {
        expect(keyboardData('space', true)).toEqual({key: ' ', keyCode: 32, isDown: true});
    });

    test('unknown names give null', () => {
        expect(keyboardData('Enter', true)).toBeNull();
        expect(touchKeyByName('Enter')).toBeNull();
    });
});

describe('listenedTouchKeys', () => {
    test('hat blocks for touch keys are found', () => {
        const keys = listenedTouchKeys([target({a: whenKey('space'), b: whenKey('left arrow')})]);
        expect(Array.from(keys).sort()).toEqual(['left arrow', 'space']);
    });

    test('keys the controls do not have are ignored', () => {
        expect(listenedTouchKeys([target({a: whenKey('a')})]).size).toBe(0);
    });

    test('"any" listens for every touch key', () => {
        expect(listenedTouchKeys([target({a: whenKey('any')})]).size).toBe(TOUCH_KEYS.length);
    });

    test('key pressed sensing reads its menu', () => {
        const blocks = {
            s: {opcode: 'sensing_keypressed', inputs: {KEY_OPTION: {block: 'm'}}},
            m: {opcode: 'sensing_keyoptions', fields: {KEY_OPTION: {value: 'up arrow'}}}
        };
        expect(Array.from(listenedTouchKeys([target(blocks)]))).toEqual(['up arrow']);
    });

    test('key pressed sensing with a reporter counts as any key', () => {
        const blocks = {
            s: {opcode: 'sensing_keypressed', inputs: {KEY_OPTION: {block: 'r'}}},
            r: {opcode: 'operator_join', fields: {}}
        };
        expect(listenedTouchKeys([target(blocks)]).size).toBe(TOUCH_KEYS.length);
    });

    test('clones are skipped', () => {
        expect(listenedTouchKeys([target({a: whenKey('space')}, {isOriginal: false})]).size).toBe(0);
    });

    test('handles missing targets', () => {
        expect(listenedTouchKeys(null).size).toBe(0);
        expect(listenedTouchKeys([{}]).size).toBe(0);
    });
});

test('projectWantsTouchKeys', () => {
    expect(projectWantsTouchKeys([target({a: whenKey('space')})])).toBe(true);
    expect(projectWantsTouchKeys([target({})])).toBe(false);
});
