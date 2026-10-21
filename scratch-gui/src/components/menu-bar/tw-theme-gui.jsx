import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, defineMessages} from 'react-intl';
import {connect} from 'react-redux';

import check from './check.svg';
import dropdownCaret from './dropdown-caret.svg';
import {MenuItem, Submenu} from '../menu/menu.jsx';
import {GUI_AUTO, GUI_SQUIGGLE, GUI_SQUIGGLE_DAY, Theme} from '../../lib/themes/index.js';
import {openGuiThemeMenu, closeGuiThemeMenu, guiThemeMenuOpen, closeSettingsMenu} from '../../reducers/menus.js';
import {setTheme} from '../../reducers/theme.js';
import {persistTheme} from '../../lib/themes/themePersistance.js';
import {sqIconDataUri} from '../sq-icon';
import styles from './settings-menu.css';

const options = defineMessages({
    [GUI_SQUIGGLE]: {
        defaultMessage: 'Night',
        description: 'Name of the default dark color scheme.',
        id: 'sq.guiTheme.night'
    },
    [GUI_SQUIGGLE_DAY]: {
        defaultMessage: 'Day',
        description: 'Name of the light color scheme.',
        id: 'sq.guiTheme.day'
    },
    [GUI_AUTO]: {
        defaultMessage: 'Auto',
        description: 'Name of the color scheme that follows the device setting for light or dark.',
        id: 'sq.guiTheme.auto'
    }
});

const MENU_ICON = {color: '#ffffff', size: 24};
const icons = {
    [GUI_SQUIGGLE]: sqIconDataUri('night', MENU_ICON),
    [GUI_SQUIGGLE_DAY]: sqIconDataUri('day', MENU_ICON),
    [GUI_AUTO]: sqIconDataUri('auto', MENU_ICON)
};

const ThemeIcon = ({id}) => (
    <img
        src={icons[id] || icons[GUI_AUTO]}
        draggable={false}
        width={24}
        height={24}
        alt=""
    />
);

ThemeIcon.propTypes = {
    id: PropTypes.string
};

const ITEM_SELECTOR = '[data-sq-theme-item]';

const focusItem = (list, index) => {
    if (!list) return;
    const items = Array.from(list.querySelectorAll(ITEM_SELECTOR));
    if (!items.length) return;
    items[(index + items.length) % items.length].focus();
};

const GuiThemeMenuItem = ({id, isSelected, onClick, onKeyDown}) => (
    <MenuItem>
        <button
            aria-checked={isSelected}
            className={classNames(styles.option, styles.optionButton)}
            data-sq-theme-item={id}
            role="menuitemradio"
            tabIndex={-1}
            type="button"
            onClick={onClick}
            onKeyDown={onKeyDown}
        >
            <img
                alt=""
                className={classNames(styles.check, {[styles.selected]: isSelected})}
                width={15}
                height={12}
                src={check}
                draggable={false}
            />
            <ThemeIcon id={id} />
            <FormattedMessage {...options[id]} />
        </button>
    </MenuItem>
);

GuiThemeMenuItem.propTypes = {
    id: PropTypes.string,
    isSelected: PropTypes.bool,
    onClick: PropTypes.func,
    onKeyDown: PropTypes.func
};

class GuiThemeMenu extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemKeyDown',
            'handleOpenerKeyDown',
            'setList',
            'setOpener'
        ]);
    }
    componentDidUpdate (prevProps) {
        if (this.props.isOpen && !prevProps.isOpen && this.focusOnOpen) {
            this.focusOnOpen = false;
            focusItem(this.list, Math.max(0, Object.keys(options).indexOf(this.props.theme.gui)));
        }
    }
    setList (el) {
        this.list = el;
        if (el) el.setAttribute('role', 'menu');
    }
    setOpener (el) {
        this.opener = el;
    }
    handleOpenerKeyDown (e) {
        const forward = this.props.isRtl ? 'ArrowLeft' : 'ArrowRight';
        if (e.key !== forward && e.key !== 'ArrowDown' && e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        if (this.props.isOpen) {
            focusItem(this.list, Math.max(0, Object.keys(options).indexOf(this.props.theme.gui)));
        } else {
            this.focusOnOpen = true;
            this.props.onOpenMenu();
        }
    }
    handleItemKeyDown (e) {
        const items = this.list ? Array.from(this.list.querySelectorAll(ITEM_SELECTOR)) : [];
        const index = items.indexOf(e.currentTarget);
        const back = this.props.isRtl ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === 'ArrowDown') focusItem(this.list, index + 1);
        else if (e.key === 'ArrowUp') focusItem(this.list, index - 1);
        else if (e.key === 'Home') focusItem(this.list, 0);
        else if (e.key === 'End') focusItem(this.list, items.length - 1);
        else if (e.key === 'Escape' || e.key === back) {
            this.props.onCloseMenu();
            if (this.opener) this.opener.focus();
        } else return;
        e.preventDefault();
        e.stopPropagation();
    }
    render () {
        const {isOpen, isRtl, onChangeTheme, onOpenMenu, theme} = this.props;
        return (
            <MenuItem expanded={isOpen}>
                <button
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                    className={classNames(styles.option, styles.optionButton)}
                    ref={this.setOpener}
                    type="button"
                    onClick={onOpenMenu}
                    onKeyDown={this.handleOpenerKeyDown}
                >
                    <ThemeIcon id={theme.gui} />
                    <span className={styles.submenuLabel}>
                        <FormattedMessage
                            defaultMessage="Appearance"
                            description="Label for the menu that chooses the editor's color scheme"
                            id="sq.menuBar.appearance"
                        />
                    </span>
                    <img
                        alt=""
                        className={styles.expandCaret}
                        src={dropdownCaret}
                        draggable={false}
                    />
                </button>
                <Submenu
                    componentRef={this.setList}
                    place={isRtl ? 'left' : 'right'}
                >
                    {Object.keys(options).map(id => (
                        <GuiThemeMenuItem
                            key={id}
                            id={id}
                            isSelected={theme.gui === id}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => onChangeTheme(theme.set('gui', id))}
                            onKeyDown={this.handleItemKeyDown}
                        />
                    ))}
                </Submenu>
            </MenuItem>
        );
    }
}

GuiThemeMenu.propTypes = {
    isOpen: PropTypes.bool,
    isRtl: PropTypes.bool,
    onChangeTheme: PropTypes.func,
    onCloseMenu: PropTypes.func,
    onOpenMenu: PropTypes.func,
    theme: PropTypes.instanceOf(Theme)
};

const mapStateToProps = state => ({
    isOpen: guiThemeMenuOpen(state),
    isRtl: state.locales.isRtl,
    theme: state.scratchGui.theme.theme
});

const mapDispatchToProps = dispatch => ({
    onChangeTheme: theme => {
        dispatch(setTheme(theme));
        dispatch(closeSettingsMenu());
        persistTheme(theme);
    },
    onCloseMenu: () => dispatch(closeGuiThemeMenu()),
    onOpenMenu: () => dispatch(openGuiThemeMenu())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(GuiThemeMenu);
