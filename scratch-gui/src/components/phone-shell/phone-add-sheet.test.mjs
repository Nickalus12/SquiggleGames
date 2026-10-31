process.removeAllListeners('warning');

import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {transformSync} = require('@babel/core');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');

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

const styles = new Proxy({}, {get: (unused, key) => (typeof key === 'string' && key !== '__esModule' ? key : undefined)});
const sqIcon = {__esModule: true, default: ({name}) => React.createElement('i', {'data-icon': name})};
const slots = load('./phone-slots.js', {});
const {addSheetItems, fileItems} = load('./add-sheet-items.js', {});
const sheet = load('./phone-add-sheet.jsx', {'./phone-shell.css': styles, '../sq-icon': sqIcon});
const {default: PhoneAddButton} = load('./phone-add-button.jsx', {
    './phone-shell.css': styles,
    '../action-menu/action-menu.css': styles,
    '../sq-icon': sqIcon,
    './add-sheet-items': {addSheetItems, fileItems},
    './phone-add-sheet.jsx': sheet,
    './phone-slots': slots
});

const choose = () => {};
const paint = () => {};
const surprise = () => {};
const upload = () => {};
const moreButtons = [
    {title: 'Upload Sprite', img: 'upload.svg', onClick: upload, fileAccept: '.png', fileChange: () => {}, fileInput: () => {}, fileMultiple: true},
    {title: 'Surprise', img: 'surprise.svg', onClick: surprise},
    {title: 'Paint', img: 'paint.svg', onClick: paint},
    {title: 'Choose a Sprite', img: 'search.svg', onClick: choose}
];

console.log('addSheetItems');
const items = addSheetItems({main: {title: 'Choose a Sprite', img: 'sprite.svg', onClick: choose}, moreButtons});
ok('main first, then the hover menu top to bottom', items.map(i => i.title).join('|') === 'Choose a Sprite|Paint|Surprise|Upload Sprite', items.map(i => i.title));
ok('the duplicate library button is folded into the main item', items.length === 4);
ok('the folded item takes the hover menu icon', items[0].img === 'search.svg', items[0].img);
ok('the caller main item is not mutated', moreButtons[3].img === 'search.svg');
ok('a main item without a handler is dropped', addSheetItems({main: {title: 'x'}, moreButtons}).length === 4);
ok('fileItems keeps only buttons that own a file input', fileItems(items).map(i => i.title).join() === 'Upload Sprite');
ok('empty input gives an empty list', addSheetItems({}).length === 0);

console.log('PhoneAddSheetBody');
const picked = [];
const body = renderToStaticMarkup(React.createElement(sheet.default, {
    items: items.concat([{title: 'Soon', img: 'soon.svg'}]),
    onPick: item => picked.push(item.title)
}));
ok('every item renders a labelled button', (body.match(/data-phone-add-item/g) || []).length === 5, body);
ok('labels are visible text, not tooltips', body.includes('>Choose a Sprite<') && body.includes('>Upload Sprite<'));
ok('an item without a handler is disabled', /disabled=""[^>]*>[\s\S]*soon\.svg/.test(body) || /<button[^>]*disabled[^>]*>(?:(?!<\/button>)[\s\S])*soon\.svg/.test(body));
ok('the order is the sheet order', body.indexOf('Choose a Sprite') < body.indexOf('Paint') && body.indexOf('Paint') < body.indexOf('Upload Sprite'));

console.log('PhoneAddButton');
const fab = renderToStaticMarkup(React.createElement(PhoneAddButton, {
    className: 'where',
    items,
    label: 'Add a sprite',
    sheetId: 'sq-add-sprite-sheet',
    sheetTitle: 'Add a sprite',
    withFileInputs: true
}));
ok('fab carries the caller position class', fab.includes('class="addFabWrap where"'), fab);
ok('fab is labelled for a screen reader', fab.includes('aria-label="Add a sprite"'));
ok('fab shows a plus, not the sprite silhouette', fab.includes('data-icon="plus"'));
ok('fab mounts the file input so a later upload has somewhere to land', fab.includes('type="file"') && fab.includes('accept=".png"') && fab.includes('multiple'));
const bar = renderToStaticMarkup(React.createElement(PhoneAddButton, {
    items,
    label: 'Add a sprite',
    sheetId: 'sq-add-sprite-sheet',
    sheetTitle: 'Add a sprite',
    variant: 'bar'
}));
ok('bar variant uses the top bar icon button', bar.includes('class="iconButton"') && bar.includes('data-phone-add-button="bar"'), bar);
ok('bar variant mounts no file input', !bar.includes('type="file"'));

console.log('sheet wiring');
const button = new PhoneAddButton({items, label: 'Add a sprite', sheetId: 'sq-add-sprite-sheet', sheetTitle: 'Add a sprite'});
button.handleOpen();
const open = slots.getState().sheet;
ok('tapping the button opens the sheet by id', open && open.id === 'sq-add-sprite-sheet' && open.title === 'Add a sprite', open);
ok('the sheet renders the items', renderToStaticMarkup(open.render()).includes('>Paint<'));
let called = 0;
button.handlePick({title: 'Paint', onClick: () => { called++; }}, {});
ok('picking closes the sheet and runs the action', called === 1 && slots.getState().sheet === null);
button.handleOpen();
button.handlePick({title: 'Soon'}, {});
ok('picking an item without a handler just closes', slots.getState().sheet === null);
button.handleOpen();
button.componentWillUnmount();
ok('unmounting the button closes its sheet', slots.getState().sheet === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
