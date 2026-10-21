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

import SqIcon from '../sq-icon';
import {getState as getSlots, subscribe as subscribeSlots} from './phone-slots';
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
