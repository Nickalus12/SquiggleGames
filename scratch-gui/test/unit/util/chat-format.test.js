import format from '../../../src/lib/collab/chat-format';

const MIN = 60 * 1000;

describe('relativeTime', () => {
    test('recent messages read as now', () => {
        expect(format.relativeTime(1000, 1000 + (30 * 1000))).toEqual({unit: 'now', n: 0});
    });
    test('minutes stay under an hour', () => {
        expect(format.relativeTime(0, 5 * MIN)).toEqual({unit: 'min', n: 5});
        expect(format.relativeTime(0, (59 * MIN) + (50 * 1000))).toEqual({unit: 'min', n: 59});
    });
    test('hours and days', () => {
        expect(format.relativeTime(0, 3 * 60 * MIN)).toEqual({unit: 'hr', n: 3});
        expect(format.relativeTime(0, 2 * 24 * 60 * MIN)).toEqual({unit: 'day', n: 2});
    });
    test('a clock in the future reads as now', () => {
        expect(format.relativeTime(5000, 1000)).toEqual({unit: 'now', n: 0});
    });
});

describe('splitMentions', () => {
    test('marks your handle', () => {
        expect(format.splitMentions('hey @robin look', 'robin')).toEqual([
            {text: 'hey ', mention: false},
            {text: '@robin', mention: true},
            {text: ' look', mention: false}
        ]);
    });
    test('ignores longer handles and emails', () => {
        expect(format.mentions('@robinhood hi', 'robin')).toBe(false);
        expect(format.mentions('me@robin', 'robin')).toBe(false);
        expect(format.mentions('@robin-2 hi', 'robin')).toBe(false);
    });
    test('matches any case and at the start', () => {
        expect(format.mentions('@Robin!', 'robin')).toBe(true);
    });
    test('handles with regex characters are safe', () => {
        expect(format.mentions('hi @a.b', 'a.b')).toBe(true);
        expect(format.mentions('hi @axb', 'a.b')).toBe(false);
    });
    test('no handle leaves the text alone', () => {
        expect(format.splitMentions('@robin', '')).toEqual([{text: '@robin', mention: false}]);
    });
});

describe('readableColor', () => {
    const bg = '#161c36';
    test('keeps colours that already pass AA', () => {
        expect(format.readableColor('#ffffff', bg)).toBe('#ffffff');
    });
    test('lightens dark colours until they pass AA', () => {
        const out = format.readableColor('#3311aa', bg);
        expect(format.contrast(format.parseHex(out), format.parseHex(bg))).toBeGreaterThanOrEqual(4.5);
    });
    test('bad colours fall back to the ink colour', () => {
        expect(format.readableColor('red', bg)).toBe('#f2f4fb');
    });
    test('short hex works', () => {
        expect(format.parseHex('#fff')).toEqual([255, 255, 255]);
    });
});

describe('badgeCount', () => {
    test('empty for zero', () => {
        expect(format.badgeCount(0)).toBe('');
    });
    test('caps at 99+', () => {
        expect(format.badgeCount(7)).toBe('7');
        expect(format.badgeCount(120)).toBe('99+');
    });
});
