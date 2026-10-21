process.removeAllListeners('warning');

import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {transformSync} = require('@babel/core');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {IntlProvider} = require('react-intl');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

const load = (name, stubs) => {
    const file = fileURLToPath(new URL(name, import.meta.url));
    const {code} = transformSync(readFileSync(file, 'utf8'), {
        babelrc: false,
        configFile: false,
        filename: file,
        presets: [[require.resolve('@babel/preset-env'), {targets: {node: 'current'}, ignoreBrowserslistConfig: true}], require.resolve('@babel/preset-react')]
    });
    const module = {exports: {}};
    const local = id => (Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : require(id));
    new Function('require', 'module', 'exports', code)(local, module, module.exports);
    return module.exports;
};

const messages = load('./messages.js', {});
const styles = new Proxy({}, {get: (unused, key) => (typeof key === 'string' && key !== '__esModule' ? key : undefined)});
const {default: CheckerPill} = load('./checker-pill.jsx', {
    './messages': messages,
    './checker-pill.css': styles,
    '../sq-icon/sq-icon.jsx': {__esModule: true, default: () => null}
});

const render = props => renderToStaticMarkup(React.createElement(IntlProvider, {locale: 'en'},
    React.createElement(CheckerPill, Object.assign({count: 3, onToggle: () => {}, panelId: 'panel'}, props))));

const markup = render({});
const button = markup.slice(markup.indexOf('<button'), markup.indexOf('</button>') + '</button>'.length);
const after = markup.slice(markup.indexOf('</button>'));
ok('the live region is not inside the pill button', button.length > 0 && button.indexOf('aria-live') === -1, markup);
ok('the live region sits beside the button and speaks the count', /<\/button><span aria-live="polite"[^>]*>3 things to check<\/span>/
    .test(after), after);
ok('the button still has the count as its name', button.indexOf('3 things to check') !== -1);
const sheet = render({sheet: true, count: 1});
ok('the phone sheet keeps its visible label in the name', sheet.indexOf('>Checker<') !== -1 &&
    sheet.indexOf('1 thing to check') !== -1);

const {default: CheckerPanel} = load('./checker-panel.jsx', {
    './messages': messages,
    './checker-pill.css': styles,
    '../sq-icon/sq-icon.jsx': {__esModule: true, default: () => null},
    '../../lib/checker/messages': load('../../lib/checker/messages.js', {})
});
const panel = props => renderToStaticMarkup(React.createElement(IntlProvider, {locale: 'en'},
    React.createElement(CheckerPanel, Object.assign({
        canFix: () => false,
        checked: true,
        id: 'panel',
        items: [],
        onClose: () => {},
        onFix: () => {},
        onShowMe: () => {},
        targetName: () => ''
    }, props))));
const moved = panel({notice: 'Moved.', onUndo: () => {}});
ok('after a move the panel offers Undo beside the notice, outside the live region',
    /<p aria-live="polite" class="notice" role="status">Moved\.<\/p><button class="action" type="button">Undo<\/button>/
        .test(moved), moved);
ok('no Undo without an undo to run', panel({notice: 'Fixed.'}).indexOf('>Undo<') === -1 &&
    panel({notice: '', onUndo: () => {}}).indexOf('>Undo<') === -1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
