process.removeAllListeners('warning');

import {readFileSync} from 'node:fs';

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const bar = read('./menu-bar.jsx');
const settings = read('./settings-menu.jsx');
const label = read('./tw-menu-label.jsx');
const shellFiles = {
    'menu-bar.jsx': bar,
    'settings-menu.jsx': settings,
    'community-button.jsx': read('./community-button.jsx'),
    'tw-see-inside.jsx': read('./tw-see-inside.jsx'),
    'tw-theme-gui.jsx': read('./tw-theme-gui.jsx'),
    'tw-theme-blocks.jsx': read('./tw-theme-blocks.jsx'),
    'tw-theme-accent.jsx': read('./tw-theme-accent.jsx'),
    'language-menu.jsx': read('./language-menu.jsx')
};

const order = ['brand', 'file', 'edit', 'title', 'preview', 'help'];
const landmark = id => Math.max(bar.indexOf(`data-sq-bar="${id}"`), bar.indexOf(`barId="${id}"`));
const positions = order.map(landmark);
ok('every bar landmark is present', positions.every(at => at >= 0), order.filter((id, i) => positions[i] < 0));
ok('the bar reads logo, File, Edit, name, Preview, Help', positions.every((at, i) => i === 0 || at > positions[i - 1]));
ok('Settings is last in the bar', bar.indexOf('<SettingsMenu') > positions[positions.length - 1] &&
    settings.includes('barId="settings"'));
ok('the logo links home', /data-sq-bar="brand"[\s\S]{0,40}href="\/"/.test(bar));
ok('Help opens the help page in a new tab', /data-sq-bar="help"[\s\S]{0,40}href="\/#help"[\s\S]{0,80}target="_blank"/.test(bar));

const gone = {
    'Addons button': 'tw.menuBar.addons',
    'Help and bugs button': 'tw.feedbackButton',
    'packager item': 'tw.menuBar.package',
    '60 FPS item': 'tw.menuBar.60on',
    'TurboWarp news banner': '<TWNews',
    'links to the TurboWarp author': 'GarboMuffin',
    'Scratch caret image': 'dropdown-caret.svg',
    'addon colour link copy': 'Customize in Addon Settings',
    'See Project Page': 'See Project Page'
};
for (const [name, needle] of Object.entries(gone)) {
    const where = Object.keys(shellFiles).filter(file => shellFiles[file].includes(needle));
    ok(`no ${name}`, where.length === 0, where);
}

const ids = Object.entries(shellFiles).flatMap(([file, text]) => [...text.matchAll(/id[=:] ?["']((?:tw|gui|sq)\.[\w.]+)["']/g)]
    .map(m => ({file, id: m[1]})));
const twIds = ids.filter(({id}) => id.startsWith('tw.'));
const allowedTw = ['tw.menuBar.compileError', 'tw.saveTo', 'tw.menuBar.newWindow', 'tw.menuBar.accent',
    'tw.accent.', 'tw.guiTheme.', 'tw.blockColors.three'];
const strayTw = twIds.filter(({id}) => !allowedTw.some(prefix => id.startsWith(prefix)));
ok('changed strings use sq ids, not old TurboWarp ids', strayTw.length === 0, strayTw);

const messages = Object.values(shellFiles).flatMap(text => [...text.matchAll(/defaultMessage[=:] ?["']([^"']+)["']/g)]
    .map(m => m[1]));
const titleCase = messages.filter(text => /\b[A-Z][a-z]+ [A-Z][a-z]+/.test(text) && !/^(Squiggle|Turbo|Night|Day)/.test(text));
ok('menu copy is sentence case', titleCase.length === 0, titleCase);
ok('no all caps labels', messages.every(text => text !== text.toUpperCase() || !/[A-Z]{3}/.test(text)));
ok('no em dashes in menu copy', messages.every(text => !/[–—]/.test(text)));

ok('menu buttons are real buttons with popup state', /<button[\s\S]{0,80}aria-expanded=\{!!this\.props\.open\}[\s\S]{0,40}aria-haspopup="menu"/.test(label));
ok('Escape closes and Tab leaves', label.includes("e.key === 'Escape'") && label.includes("e.key === 'Tab'"));
ok('Down arrow opens the menu', label.includes("'ArrowDown'"));

const menu = read('../menu/menu.jsx');
ok('menus have the menu role', /role="menu"/.test(menu));
ok('items have the menuitem role and roving focus', /role = 'menuitem'/.test(menu) && /tabIndex=\{isItem \? -1 : null\}/.test(menu));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
