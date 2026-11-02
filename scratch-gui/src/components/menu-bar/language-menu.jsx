import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import {connect} from 'react-redux';
import locales from '@turbowarp/scratch-l10n';

import {MenuItem, Submenu} from '../menu/menu.jsx';
import {languageMenuOpen, openLanguageMenu} from '../../reducers/menus.js';
import {selectLocale} from '../../reducers/locales.js';

import styles from './settings-menu.css';

import SqIcon from '../sq-icon';

class LanguageMenu extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'setRef',
            'handleMouseOver'
        ]);
    }

    componentDidUpdate (prevProps) {
        if (!prevProps.menuOpen && this.props.menuOpen && this.selectedRef) {
            this.scrollSelectedIntoView();
        }
    }

    setRef (component) {
        this.selectedRef = component;
    }

    handleMouseOver () {
        if (!this.props.menuOpen && this.selectedRef) {
            this.scrollSelectedIntoView();
        }
    }

    scrollSelectedIntoView () {
        const menuItem = this.selectedRef.parentNode;
        const scrollContainer = menuItem.parentNode;

        const itemHeight = menuItem.offsetHeight;
        const selectedItemPosition = menuItem.offsetTop;
        const visibleHeight = scrollContainer.offsetHeight;

        scrollContainer.scrollTop = selectedItemPosition - (visibleHeight / 2) + (itemHeight / 2);
    }

    render () {
        return (
            <MenuItem
                expanded={this.props.menuOpen}
            >
                <div
                    className={styles.option}
                    onClick={this.props.onRequestOpen}
                    onMouseOver={this.handleMouseOver}
                >
                    <SqIcon
                        className={styles.icon}
                        name="language"
                        size={20}
                    />
                    <span className={styles.submenuLabel}>
                        <FormattedMessage
                            defaultMessage="Language"
                            description="Language sub-menu"
                            id="gui.menuBar.language"
                        />
                    </span>
                    <SqIcon
                        className={styles.expandCaret}
                        name="chevronRight"
                        size={16}
                    />
                </div>
                <Submenu
                    className={styles.languageSubmenu}
                    place={this.props.isRtl ? 'right' : 'left'}
                >
                    {
                        Object.keys(locales)
                            .map(locale => (
                                <MenuItem
                                    key={locale}
                                    className={styles.languageMenuItem}
                                    // eslint-disable-next-line react/jsx-no-bind
                                    onClick={() => this.props.onChangeLanguage(locale)}
                                >
                                    <span
                                        className={classNames(styles.check, {
                                            [styles.selected]: this.props.currentLocale === locale
                                        })}
                                        {...(this.props.currentLocale === locale && {ref: this.setRef})}
                                    >
                                        <SqIcon
                                            name="check"
                                            size={16}
                                        />
                                    </span>
                                    {locales[locale].name}
                                </MenuItem>
                            ))
                    }
                </Submenu>
            </MenuItem>
        );
    }
}

LanguageMenu.propTypes = {
    currentLocale: PropTypes.string,
    isRtl: PropTypes.bool,
    label: PropTypes.string,
    menuOpen: PropTypes.bool,
    onChangeLanguage: PropTypes.func,
    onRequestCloseSettings: PropTypes.func,
    onRequestOpen: PropTypes.func
};

const mapStateToProps = state => ({
    currentLocale: state.locales.locale,
    isRtl: state.locales.isRtl,
    menuOpen: languageMenuOpen(state),
    messagesByLocale: state.locales.messagesByLocale
});

const mapDispatchToProps = (dispatch, ownProps) => ({
    onChangeLanguage: locale => {
        dispatch(selectLocale(locale));
        ownProps.onRequestCloseSettings();
    },
    onRequestOpen: () => dispatch(openLanguageMenu())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(LanguageMenu);
