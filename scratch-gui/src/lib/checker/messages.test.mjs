import {createRequire} from 'node:module';
import {harness} from './fixtures/load.mjs';

const require = createRequire(import.meta.url);
const IntlMessageFormat = require('intl-messageformat');
const {
    itemMessages, rulesErrorMessages, limitMessages, fixMessages, descriptorFor, itemText, fixLabel
} = await import('./messages.js');
const {default: pillMessages, fixedMessage} = await import('../../components/checker-pill/messages.js');
const {ok, done} = harness();

const intl = {
    formatMessage: (descriptor, values) => new IntlMessageFormat(descriptor.defaultMessage, 'en').format(values)
};

const ITEM_CODES = [
    'message-not-received', 'message-not-sent', 'custom-block-missing', 'variable-unused', 'variable-unused-set',
    'loose-blocks', 'clone-runaway', 'together-flood', 'together-shared-loop', 'pen-with-camera', 'scene-missing',
    'tile-missing', 'tile-missing-level', 'big-asset-costume', 'big-asset-sound', 'squiggle-only'
];
const RULES_CODES = ['unsupported', 'global-var', 'name', 'cycle', 'limit', 'too-big'];
const SERVER_CODES = [
    'unsupported', 'arg', 'name', 'global-var', 'cycle', 'limit', 'too-big', 'screened', 'opcode-set',
    'upload-failed', 'too-much', 'deferred', 'paused', 'loop-cap', 'cut', 'state-full', 'dropped'
];
const FIXES = [
    'add-receiver', 'remove-calls', 'delete-variable', 'delete-loose', 'add-wait', 'move-to-rules', 'move-out',
    'create-scene',
    'create-level', 'create-tile'
];

const item = (rule, code, values, fix) => ({rule, code, values: values || {}, fix: fix || null});

ok('every checker code has its own words', ITEM_CODES.every(code => {
    const rule = code.replace(/-(set|costume|sound|level)$/, '');
    return descriptorFor(item(rule, code)) === itemMessages[code];
}));
ok('rules-outside has its own words', descriptorFor(item('rules-wrong-place', 'rules-outside')) ===
    itemMessages['rules-outside']);
ok('local rules codes use the sq.rules.err ids', RULES_CODES.every(code =>
    descriptorFor(item('rules-wrong-place', `rules-${code}`)).id === `sq.rules.err.${code}`));
ok('every server code in rev 3 7.7 has words', SERVER_CODES.every(code =>
    descriptorFor(item('rules-status', `rules-${code}`)) === rulesErrorMessages[code]));
ok('an unknown server code falls back', descriptorFor(item('rules-status', 'rules-zzz')).id === 'sq.rules.err.fallback');
ok('an unknown checker code falls back', descriptorFor(item('loose-blocks', 'nope')).id === 'sq.checker.item.fallback');
ok('message ids are unique', (() => {
    const ids = [itemMessages, rulesErrorMessages, limitMessages]
        .reduce((all, table) => all.concat(Object.keys(table).map(key => table[key].id)), []);
    return new Set(ids).size === ids.length;
})());

ok('a broadcast name is filled in', itemText(intl, item('message-not-received', 'message-not-received',
    {message: 'win'})) === 'Nobody hears the message "win". Add a "when I receive" block.');
ok('loose blocks pluralise', itemText(intl, item('loose-blocks', 'loose-blocks', {count: 1, sprite: 'Cat'})) ===
    '1 stack in Cat has no hat block, so it never runs.' &&
    itemText(intl, item('loose-blocks', 'loose-blocks', {count: 3, sprite: 'Cat'})) ===
    '3 stacks in Cat have no hat block, so they never run.');
ok('the limit word comes from sq.rules.limit', itemText(intl, item('rules-wrong-place', 'rules-limit',
    {limit: 'teams', max: 8})) === 'Game Rules can have at most 8 teams. Remove some.');
ok('an unknown limit key uses the fallback', itemText(intl, item('rules-status', 'rules-limit',
    {limit: 'zz', max: 3, n: 1})) === 'This is more than the server allows. Make it smaller.');
ok('a repeated server error says how often', itemText(intl, item('rules-status', 'rules-loop-cap', {n: 4})) ===
    'This repeat stopped at 100 times. Happened 4 times.');
ok('one occurrence adds nothing', itemText(intl, item('rules-status', 'rules-cut', {n: 1})) ===
    'Some text was too long, so the end was cut off.');
ok('apostrophes survive formatting', itemText(intl, item('rules-status', 'rules-name', {n: 1})).indexOf('isn\'t') !== -1);
ok('squiggle-only names the kit', itemText(intl, item('squiggle-only', 'squiggle-only',
    {count: 2, kit: 'Together', sprite: 'Stage'})) ===
    '2 Together blocks in Stage only work in Squiggle. Scratch and TurboWarp cannot load them.');
ok('every fix has a label', FIXES.every(fix => fixLabel(intl, item('x', 'x', {}, fix)) === intl.formatMessage(
    fixMessages[fix])));
ok('no fix, no label', fixLabel(intl, item('x', 'x')) === null);
ok('delete loose blocks says undo brings them back', fixLabel(intl, item('x', 'x', {}, 'delete-loose')) ===
    'Delete loose blocks' && intl.formatMessage(fixedMessage('delete-loose')) === 'Deleted. Undo brings them back.');
ok('other fixes use the plain fixed words', fixedMessage('add-wait') === pillMessages.fixed &&
    fixedMessage(null) === pillMessages.fixed);
ok('no em dashes in any words', [itemMessages, rulesErrorMessages, limitMessages, fixMessages, pillMessages].every(table =>
    Object.keys(table).every(key => table[key].defaultMessage.indexOf(String.fromCharCode(0x2014)) === -1)));
done();
