import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import classNames from 'classnames';

import MenuBarMenu from './menu-bar-menu.jsx';
import {focusFirstIn} from '../menu/menu-keys.js';
import styles from './menu-bar.css';

const OPEN_KEYS = ['Enter', ' ', 'ArrowDown'];

class MenuLabel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClick',
            'handleKeyDown',
            'handleMouseUp',
            'handleTriggerKeyDown',
            'menuRef',
            'triggerRef'
        ]);
        this.fromKeyboard = false;
    }
    componentDidMount () {
        if (this.props.open) this.addListeners();
    }
    componentDidUpdate (prevProps) {
        if (this.props.open && !prevProps.open) {
            this.addListeners();
            if (this.fromKeyboard) this.focusMenu();
        }
        if (!this.props.open && prevProps.open) {
            this.removeListeners();
            const active = document.activeElement;
            if (this.fromKeyboard && (!active || active === document.body || this.menuEl.contains(active))) {
                if (this.trigger) this.trigger.focus();
            }
            this.fromKeyboard = false;
        }
    }
    componentWillUnmount () {
        this.removeListeners();
    }
    addListeners () {
        document.addEventListener('mouseup', this.handleMouseUp);
    }
    removeListeners () {
        document.removeEventListener('mouseup', this.handleMouseUp);
    }
    focusMenu () {
        if (!this.menuEl) return;
        focusFirstIn(this.menuEl.querySelector('[role="menu"]'));
    }
    handleClick (e) {
        if (this.trigger && this.trigger.contains(e.target)) {
            if (this.props.open) {
                this.props.onClose();
            } else {
                this.props.onOpen();
            }
        }
    }
    handleTriggerKeyDown (e) {
        if (!OPEN_KEYS.includes(e.key)) return;
        this.fromKeyboard = true;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.props.open) this.focusMenu();
            else this.props.onOpen();
        }
    }
    handleKeyDown (e) {
        if (!this.props.open) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.fromKeyboard = true;
            this.props.onClose();
        } else if (e.key === 'Tab') {
            this.fromKeyboard = false;
            this.props.onClose();
        }
    }
    handleMouseUp (e) {
        if (this.props.open && !this.menuEl.contains(e.target)) {
            this.props.onClose();
        }
    }
    menuRef (c) {
        this.menuEl = c;
    }
    triggerRef (c) {
        this.trigger = c;
    }
    render () {
        const all = React.Children.toArray(this.props.children);
        const isMenu = child => child && child.type === MenuBarMenu;
        const label = all.filter(child => !isMenu(child));
        const menus = all.filter(isMenu);
        return (
            <div
                className={classNames(styles.menuBarItem, styles.hoverable, styles.menuLabel, {
                    [styles.active]: this.props.open
                })}
                data-sq-bar={this.props.barId}
                ref={this.menuRef}
                onClick={this.handleClick}
                onKeyDown={this.handleKeyDown}
            >
                <button
                    aria-expanded={!!this.props.open}
                    aria-haspopup="menu"
                    aria-label={this.props.label}
                    className={styles.menuTrigger}
                    ref={this.triggerRef}
                    type="button"
                    onKeyDown={this.handleTriggerKeyDown}
                >
                    {label}
                </button>
                {menus}
            </div>
        );
    }
}

MenuLabel.propTypes = {
    barId: PropTypes.string,
    children: PropTypes.node,
    label: PropTypes.string,
    open: PropTypes.bool,
    onOpen: PropTypes.func,
    onClose: PropTypes.func
};

export default MenuLabel;
