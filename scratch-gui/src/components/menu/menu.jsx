import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import styles from './menu.css';
import {
    ITEM_SELECTOR,
    activateItem,
    focusFirstIn,
    moveFocus,
    nestedMenu,
    parentItem
} from './menu-keys.js';

const handleMenuKeyDown = e => {
    const list = e.currentTarget;
    const rtl = !!list.closest('[dir="rtl"]');
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const item = e.target.closest(ITEM_SELECTOR);
    if (!item || !list.contains(item)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        moveFocus(list, item, e.key);
    } else if (e.key === forward && nestedMenu(item)) {
        activateItem(item);
        setTimeout(() => focusFirstIn(nestedMenu(item)), 0);
    } else if (e.key === back && parentItem(list)) {
        const owner = parentItem(list);
        if (owner.getAttribute('aria-expanded') === 'true') activateItem(owner);
        owner.focus();
    } else {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
};

const MenuComponent = ({
    className = '',
    children,
    componentRef,
    place = 'right'
}) => (
    <ul
        className={classNames(
            styles.menu,
            className,
            {
                [styles.left]: place === 'left',
                [styles.right]: place === 'right'
            }
        )}
        ref={componentRef}
        role="menu"
        onKeyDown={handleMenuKeyDown}
    >
        {children}
    </ul>
);

MenuComponent.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    componentRef: PropTypes.func,
    place: PropTypes.oneOf(['left', 'right'])
};


const Submenu = ({children, className, place, ...props}) => (
    <div
        className={classNames(
            styles.submenu,
            className,
            {
                [styles.left]: place === 'left',
                [styles.right]: place === 'right'
            }
        )}
    >
        <MenuComponent
            place={place}
            {...props}
        >
            {children}
        </MenuComponent>
    </div>
);

Submenu.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    place: PropTypes.oneOf(['left', 'right'])
};

const handleItemKeyDown = e => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    activateItem(e.currentTarget);
};

const MenuItem = ({
    children,
    className,
    expanded,
    onClick,
    role = 'menuitem'
}) => {
    const isItem = role === 'menuitem';
    const hasSubmenu = typeof expanded === 'boolean';
    return (
        <li
            aria-expanded={isItem && hasSubmenu ? expanded : null}
            aria-haspopup={isItem && hasSubmenu ? 'menu' : null}
            className={classNames(
                styles.menuItem,
                styles.hoverable,
                className,
                {[styles.expanded]: expanded}
            )}
            role={role}
            tabIndex={isItem ? -1 : null}
            onClick={onClick}
            onKeyDown={isItem ? handleItemKeyDown : null}
        >
            {children}
        </li>
    );
};

MenuItem.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    expanded: PropTypes.bool,
    onClick: PropTypes.func,
    role: PropTypes.oneOf(['menuitem', 'none'])
};


const addDividerClassToFirstChild = (child, id) => (
    child && React.cloneElement(child, {
        className: classNames(
            child.props.className,
            {[styles.menuSection]: id === 0}
        ),
        key: id
    })
);

const MenuSection = ({children}) => (
    <React.Fragment>{
        React.Children.map(children, addDividerClassToFirstChild)
    }</React.Fragment>
);

MenuSection.propTypes = {
    children: PropTypes.node
};

export {
    MenuComponent as default,
    MenuItem,
    MenuSection,
    Submenu
};
