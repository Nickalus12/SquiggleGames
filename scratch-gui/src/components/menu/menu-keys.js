const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

const nextIndex = (count, index, key) => {
    if (count <= 0) return -1;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    if (key === 'ArrowDown') return index < 0 ? 0 : (index + 1) % count;
    if (key === 'ArrowUp') return index < 0 ? count - 1 : (index - 1 + count) % count;
    return index;
};

const ownItems = list => Array.from(list.querySelectorAll(ITEM_SELECTOR))
    .filter(item => item.closest('[role="menu"]') === list);

const moveFocus = (list, current, key) => {
    const items = ownItems(list);
    const target = items[nextIndex(items.length, items.indexOf(current), key)];
    if (target) target.focus();
};

const focusFirstIn = list => {
    if (!list) return;
    const items = ownItems(list);
    if (items.length) items[0].focus();
};

const nestedMenu = item => {
    const menu = item.querySelector('[role="menu"]');
    return menu && menu.closest(ITEM_SELECTOR) === item ? menu : null;
};

const parentItem = list => {
    const owner = list.parentElement && list.parentElement.closest(ITEM_SELECTOR);
    return owner || null;
};

const activateItem = item => {
    const target = item.firstElementChild || item;
    target.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
};

export {
    ITEM_SELECTOR,
    activateItem,
    focusFirstIn,
    moveFocus,
    nestedMenu,
    nextIndex,
    ownItems,
    parentItem
};
