import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import VM from 'scratch-vm';

import ProjectTitleInput from '../menu-bar/project-title-input.jsx';
import {setPhoneMenuOpen} from '../../reducers/layout-mode';
import greenFlagIcon from '../green-flag/icon--green-flag.svg';
import stopAllIcon from '../stop-all/icon--stop-all.svg';

import styles from './phone-shell.css';

const SHEET_ID = 'phone-menu-sheet';
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const messages = defineMessages({
    menu: {
        id: 'gui.phone.menu',
        defaultMessage: 'Menu',
        description: 'Button that opens the main menu on phones'
    },
    go: {
        id: 'gui.controls.go',
        defaultMessage: 'Go',
        description: 'Green flag button title'
    },
    stop: {
        id: 'gui.controls.stop',
        defaultMessage: 'Stop',
        description: 'Stop button title'
    }
});

class PhoneTopBar extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleGreenFlag',
            'handleStop',
            'handleToggleMenu',
            'handleContextMenu',
            'handleKeyDown',
            'setMenuButton'
        ]);
    }
    componentDidUpdate (prevProps) {
        if (this.props.menuOpen === prevProps.menuOpen) return;
        const sheet = document.getElementById(SHEET_ID);
        if (this.props.menuOpen) {
            document.addEventListener('keydown', this.handleKeyDown);
            const first = sheet && Array.from(sheet.querySelectorAll(FOCUSABLE))
                .find(el => el.offsetWidth > 0 && el.offsetHeight > 0);
            if (first) first.focus();
            return;
        }
        document.removeEventListener('keydown', this.handleKeyDown);
        const active = document.activeElement;
        const focusLost = !active || active === document.body || (sheet && sheet.contains(active));
        if (focusLost && this.menuButton) this.menuButton.focus();
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown);
    }
    setMenuButton (el) {
        this.menuButton = el;
    }
    handleKeyDown (e) {
        if (e.key === 'Escape') this.props.onSetMenuOpen(false);
    }
    handleGreenFlag () {
        if (!this.props.isStarted) this.props.vm.start();
        this.props.vm.greenFlag();
    }
    handleStop () {
        this.props.vm.stopAll();
    }
    handleToggleMenu () {
        this.props.onSetMenuOpen(!this.props.menuOpen);
    }
    handleContextMenu (e) {
        e.preventDefault();
    }
    render () {
        const {canEditTitle, intl, menuOpen, projectRunning, projectTitle} = this.props;
        return (
            <div className={styles.topBar}>
                <button
                    aria-controls={SHEET_ID}
                    aria-expanded={menuOpen}
                    aria-label={intl.formatMessage(messages.menu)}
                    className={styles.iconButton}
                    data-phone-menu-button
                    ref={this.setMenuButton}
                    type="button"
                    onClick={this.handleToggleMenu}
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                    >
                        {menuOpen ? (
                            <path
                                d="M6 6l12 12M18 6L6 18"
                                fill="none"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeWidth="2.4"
                            />
                        ) : (
                            <path
                                d="M4 7h16M4 12h16M4 17h16"
                                fill="none"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeWidth="2.4"
                            />
                        )}
                    </svg>
                </button>
                <div className={styles.title}>
                    {canEditTitle ? (
                        <ProjectTitleInput />
                    ) : (
                        <span className={styles.titleText}>{projectTitle}</span>
                    )}
                </div>
                <div
                    className={styles.controls}
                    onContextMenu={this.handleContextMenu}
                >
                    <button
                        aria-label={intl.formatMessage(messages.go)}
                        className={classNames(styles.iconButton, {
                            [styles.isRunning]: projectRunning
                        })}
                        data-phone-green-flag
                        title={intl.formatMessage(messages.go)}
                        type="button"
                        onClick={this.handleGreenFlag}
                    >
                        <img
                            alt=""
                            draggable={false}
                            src={greenFlagIcon}
                        />
                    </button>
                    <button
                        aria-label={intl.formatMessage(messages.stop)}
                        className={classNames(styles.iconButton, {
                            [styles.isRunning]: projectRunning
                        })}
                        data-phone-stop
                        title={intl.formatMessage(messages.stop)}
                        type="button"
                        onClick={this.handleStop}
                    >
                        <img
                            alt=""
                            draggable={false}
                            src={stopAllIcon}
                        />
                    </button>
                </div>
            </div>
        );
    }
}

PhoneTopBar.propTypes = {
    canEditTitle: PropTypes.bool,
    intl: intlShape.isRequired,
    isStarted: PropTypes.bool,
    menuOpen: PropTypes.bool,
    onSetMenuOpen: PropTypes.func.isRequired,
    projectRunning: PropTypes.bool,
    projectTitle: PropTypes.string,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    isStarted: state.scratchGui.vmStatus.started,
    menuOpen: state.scratchGui.layoutMode.phoneMenuOpen,
    projectRunning: state.scratchGui.vmStatus.running,
    projectTitle: state.scratchGui.projectTitle
});

const mapDispatchToProps = dispatch => ({
    onSetMenuOpen: open => dispatch(setPhoneMenuOpen(open))
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(PhoneTopBar));
