process.removeAllListeners('warning');

const {nextIndex, ownItems, nestedMenu, parentItem, ITEM_SELECTOR} = await import('./menu-keys.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

ok('down from nothing lands on the first item', nextIndex(4, -1, 'ArrowDown') === 0);
ok('up from nothing lands on the last item', nextIndex(4, -1, 'ArrowUp') === 3);
ok('down wraps from last to first', nextIndex(4, 3, 'ArrowDown') === 0);
ok('up wraps from first to last', nextIndex(4, 0, 'ArrowUp') === 3);
ok('Home and End jump to the ends', nextIndex(4, 2, 'Home') === 0 && nextIndex(4, 1, 'End') === 3);
ok('an empty menu has nowhere to go', nextIndex(0, -1, 'ArrowDown') === -1);
ok('other keys keep the place', nextIndex(4, 2, 'x') === 2);
ok('radio and checkbox items count as items', ITEM_SELECTOR.includes('menuitemradio') && ITEM_SELECTOR.includes('menuitemcheckbox'));

const el = (role, children = []) => {
    const node = {role, children, parentElement: null};
    children.forEach(child => {
        child.parentElement = node;
    });
    node.getAttribute = name => (name === 'role' ? node.role : null);
    node.closest = selector => {
        const roles = selector.match(/role="([a-z]+)"/g).map(part => part.slice(6, -1));
        let cursor = node;
        while (cursor) {
            if (roles.includes(cursor.role)) return cursor;
            cursor = cursor.parentElement;
        }
        return null;
    };
    node.querySelectorAll = selector => {
        const roles = selector.match(/role="([a-z]+)"/g).map(part => part.slice(6, -1));
        const out = [];
        const visit = n => n.children.forEach(child => {
            if (roles.includes(child.role)) out.push(child);
            visit(child);
        });
        visit(node);
        return out;
    };
    node.querySelector = selector => node.querySelectorAll(selector)[0] || null;
    return node;
};

const inner = [el('menuitemradio'), el('menuitemradio')];
const sub = el('menu', inner);
const wrapper = el('div', [sub]);
const opener = el('menuitem', [el('span'), wrapper]);
const plain = el('menuitem');
const top = el('menu', [plain, opener, el('none', [el('menuitem')])]);

ok('a menu only walks its own items, not a submenu\'s', ownItems(top).length === 3);
ok('a submenu walks its own items', ownItems(sub).length === 2);
ok('an item with a submenu finds it', nestedMenu(opener) === sub);
ok('a plain item has no submenu', nestedMenu(plain) === null);
ok('a submenu knows the item that opened it', parentItem(sub) === opener);
ok('the top menu has no parent item', parentItem(top) === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
