import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import VM from 'scratch-vm';

import ProjectTitleInput from '../menu-bar/project-title-input.jsx';
import {PHONE_TABS} from '../../lib/layout-mode';
import {setPhoneMenuOpen, setPhonePaletteOpen} from '../../reducers/layout-mode';
import greenFlagIcon from '../green-flag/icon--green-flag.svg';
import stopAllIcon from '../stop-all/icon--stop-all.svg';

import SqIcon from '../sq-icon';
import {getState as getSlots, subscribe as subscribeSlots} from './phone-slots';
import styles from './phone-shell.css';

const SHEET_ID = 'phone-menu-sheet';
const PALETTE_EVENT = 'sq-command-palette';
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const messages = defineMessages({
    menu: {
        id: 'gui.phone.menu',
        defaultMessage: 'Menu',
        description: 'Button that opens the main menu on phones'
    },
    findBlocks: {
        id: 'sq.phone.findBlocks',
        defaultMessage: 'Find blocks',
        description: 'Top bar button on phones that opens or closes block search'
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
            'handleTogglePalette',
            'handleContextMenu',
            'handleKeyDown',
            'handleSlotsChange',
            'setMenuButton'
        ]);
        this.state = {topBarItems: getSlots().topBar};
    }
    componentDidMount () {
        this.unsubscribeSlots = subscribeSlots(this.handleSlotsChange);
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
        if (this.unsubscribeSlots) this.unsubscribeSlots();
    }
    handleSlotsChange (slots) {
        if (slots.topBar !== this.state.topBarItems) this.setState({topBarItems: slots.topBar});
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
    handleTogglePalette () {
        const open = !this.props.paletteOpen;
        const event = new CustomEvent(PALETTE_EVENT, {cancelable: true, detail: {open, source: 'phone'}});
        if (!window.dispatchEvent(event)) return;
        this.props.onSetPaletteOpen(open);
    }
    handleContextMenu (e) {
        e.preventDefault();
    }
    render () {
        const {canEditTitle, intl, menuOpen, paletteOpen, phoneTab, projectRunning, projectTitle} = this.props;
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
                    <SqIcon name={menuOpen ? 'close' : 'menu'} />
                </button>
                <div className={styles.title}>
                    {canEditTitle ? (
                        <ProjectTitleInput />
                    ) : (
                        <span className={styles.titleText}>{projectTitle}</span>
                    )}
                </div>
                {this.state.topBarItems.length ? (
                    <div
                        className={styles.slots}
                        data-phone-top-bar-slots
                    >
                        {this.state.topBarItems.map(item => (
                            <React.Fragment key={item.id}>{item.render()}</React.Fragment>
                        ))}
                    </div>
                ) : null}
                {phoneTab === PHONE_TABS.code ? (
                    <button
                        aria-expanded={paletteOpen}
                        aria-label={intl.formatMessage(messages.findBlocks)}
                        className={styles.iconButton}
                        data-phone-palette-button
                        title={intl.formatMessage(messages.findBlocks)}
                        type="button"
                        onClick={this.handleTogglePalette}
                    >
                        <SqIcon name={paletteOpen ? 'close' : 'search'} />
                    </button>
                ) : null}
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
    onSetPaletteOpen: PropTypes.func.isRequired,
    paletteOpen: PropTypes.bool,
    phoneTab: PropTypes.string,
    projectRunning: PropTypes.bool,
    projectTitle: PropTypes.string,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    isStarted: state.scratchGui.vmStatus.started,
    menuOpen: state.scratchGui.layoutMode.phoneMenuOpen,
    paletteOpen: !!(state.scratchGui.commandPalette && state.scratchGui.commandPalette.open) ||
        state.scratchGui.layoutMode.phonePaletteOpen,
    phoneTab: state.scratchGui.layoutMode.phoneTab,
    projectRunning: state.scratchGui.vmStatus.running,
    projectTitle: state.scratchGui.projectTitle
});

const mapDispatchToProps = dispatch => ({
    onSetMenuOpen: open => dispatch(setPhoneMenuOpen(open)),
    onSetPaletteOpen: open => dispatch(setPhonePaletteOpen(open))
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(PhoneTopBar));
