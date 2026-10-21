import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';

import overlay from '../../lib/collab/overlay';
import {LAYOUT_MODES, PHONE_TABS} from '../../lib/layout-mode';
import {closeRoomPanel, openRoomPanel} from '../../reducers/room-panel';
import {setPhoneTab} from '../../reducers/layout-mode';
import {setStartRoomHandler} from '../squiggle-only-notice/index.js';
import KeepWorkSheet from './keep-work-sheet.jsx';
import RoomPanel from './room-panel.jsx';
import startRoomFlow from './start-room.js';
import messages from './room-panel-messages.js';
import styles from './room-panel-host.css';

const TITLE_ID = 'sq-room-panel-title';
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const openHistory = () => {
    window.dispatchEvent(new CustomEvent('sq:open-history'));
};

class RoomPanelHost extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClose', 'handleKeyDown', 'handleHistory', 'setRef', 'startRoom']);
        this.opener = null;
    }
    componentDidMount () {
        setStartRoomHandler(this.startRoom);
    }
    componentDidUpdate (prev) {
        if (this.props.open && this.props.isPhone) {
            this.props.onShowPhoneRoom();
            this.props.onClose();
            return;
        }
        if (this.props.open && !prev.open) {
            this.opener = document.activeElement;
            this.focusFirst();
        }
        if (!this.props.open && prev.open && this.opener && document.contains(this.opener)) {
            this.opener.focus();
            this.opener = null;
        }
    }
    componentWillUnmount () {
        setStartRoomHandler(null);
    }
    focusFirst () {
        const root = this.root;
        if (!root) return;
        const first = root.querySelector(FOCUSABLE);
        if (first) first.focus();
    }
    startRoom () {
        return startRoomFlow({
            title: this.props.projectTitle,
            inRoom: () => !!overlay.getState().self,
            showRoom: () => (this.props.isPhone ? this.props.onShowPhoneRoom() : this.props.onOpen()),
            fail: key => overlay.toast(this.props.intl.formatMessage(messages[key]), 'var(--sq-warn, #9a5b00)')
        });
    }
    handleClose () {
        this.props.onClose();
    }
    handleHistory () {
        this.props.onClose();
        openHistory();
    }
    handleKeyDown (e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.handleClose();
        }
    }
    setRef (el) {
        this.root = el;
    }
    renderSheet () {
        if (!this.props.open || this.props.isPhone || !overlay.getState().self) return null;
        return (
            <aside
                aria-labelledby={TITLE_ID}
                className={styles.sheet}
                data-room-panel-host
                ref={this.setRef}
                role="dialog"
                onKeyDown={this.handleKeyDown}
            >
                <RoomPanel
                    titleId={TITLE_ID}
                    variant="sheet"
                    onClose={this.handleClose}
                    onOpenHistory={this.handleHistory}
                />
            </aside>
        );
    }
    render () {
        return (
            <React.Fragment>
                {this.renderSheet()}
                <KeepWorkSheet />
            </React.Fragment>
        );
    }
}

RoomPanelHost.propTypes = {
    intl: intlShape.isRequired,
    isPhone: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    onOpen: PropTypes.func.isRequired,
    onShowPhoneRoom: PropTypes.func.isRequired,
    open: PropTypes.bool,
    projectTitle: PropTypes.string
};

const mapStateToProps = state => ({
    isPhone: state.scratchGui.layoutMode.mode === LAYOUT_MODES.phone,
    open: state.scratchGui.roomPanel.open,
    projectTitle: state.scratchGui.projectTitle
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeRoomPanel()),
    onOpen: () => dispatch(openRoomPanel()),
    onShowPhoneRoom: () => dispatch(setPhoneTab(PHONE_TABS.room))
});

const RoomPane = () => (
    <RoomPanel
        variant="pane"
        onOpenHistory={openHistory}
    />
);

export {RoomPane};
export default connect(mapStateToProps, mapDispatchToProps)(injectIntl(RoomPanelHost));
