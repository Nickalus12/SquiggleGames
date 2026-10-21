import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import overlay from '../../lib/collab/overlay';
import {PHONE_TABS} from '../../lib/layout-mode';
import {setPhoneTab} from '../../reducers/layout-mode';
import {activateTab, BLOCKS_TAB_INDEX, COSTUMES_TAB_INDEX} from '../../reducers/editor-tab';

import styles from './phone-shell.css';

const messages = defineMessages({
    tabs: {
        id: 'gui.phone.tabs',
        defaultMessage: 'Editor sections',
        description: 'Label for the bottom tab bar on phones'
    },
    code: {
        id: 'gui.phone.tab.code',
        defaultMessage: 'Code',
        description: 'Phone tab that shows the code area'
    },
    stage: {
        id: 'gui.phone.tab.stage',
        defaultMessage: 'Stage',
        description: 'Phone tab that shows the stage'
    },
    sprites: {
        id: 'gui.phone.tab.sprites',
        defaultMessage: 'Sprites',
        description: 'Phone tab that shows the sprite list'
    },
    costumes: {
        id: 'gui.phone.tab.costumes',
        defaultMessage: 'Costumes',
        description: 'Phone tab that shows costumes and sounds'
    },
    backdrops: {
        id: 'gui.phone.tab.backdrops',
        defaultMessage: 'Backdrops',
        description: 'Phone tab that shows backdrops and sounds when the stage is selected'
    },
    room: {
        id: 'gui.phone.tab.room',
        defaultMessage: 'Room',
        description: 'Phone tab that shows the people in a shared room'
    }
});

const iconPath = {
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    stage: 'M4 5h16v11H4zM9 20h6M12 16v4M10 8.5v4l3.5-2z',
    sprites: 'M7 7a2 2 0 1 0 0.01 0M17 7a2 2 0 1 0 0.01 0M5 20c0-4 3-7 7-7s7 3 7 7M9 9.5c1.8 1.4 4.2 1.4 6 0',
    media: 'M4 18l5-6 4 4 3-3 4 5M4 5h16v14H4zM15 9a1 1 0 1 0 0.01 0',
    room: [
        'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6',
        'M16 11a2.5 2.5 0 1 0 0-5M18 14c1.8.6 3 2.4 3 4.5'
    ].join('')
};

const TabIcon = ({name}) => (
    <span className={styles.tabIcon}>
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
        >
            <path
                d={iconPath[name]}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
            />
        </svg>
    </span>
);

TabIcon.propTypes = {
    name: PropTypes.string.isRequired
};

class PhoneTabBar extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleOverlayChange',
            'handleClick'
        ]);
        const {self, peers} = overlay.getState();
        this.state = {self, peerCount: peers.length};
        this.landed = false;
    }
    componentDidMount () {
        this.unsubscribe = overlay.subscribe(this.handleOverlayChange);
        this.handleOverlayChange();
    }
    componentDidUpdate (prevProps) {
        const {activeTabIndex, phoneTab} = this.props;
        if (activeTabIndex === prevProps.activeTabIndex) return;
        if (activeTabIndex !== BLOCKS_TAB_INDEX && phoneTab !== PHONE_TABS.media) {
            this.props.onSelectTab(PHONE_TABS.media);
        }
    }
    componentWillUnmount () {
        if (this.unsubscribe) this.unsubscribe();
    }
    handleOverlayChange () {
        const {self, peers} = overlay.getState();
        this.setState({self, peerCount: peers.length});
        if (self && !this.landed) {
            this.landed = true;
            if (self.canEdit === false) this.props.onSelectTab(PHONE_TABS.stage);
        }
        if (!self && this.props.phoneTab === PHONE_TABS.room) {
            this.props.onSelectTab(PHONE_TABS.stage);
        }
    }
    handleClick (e) {
        const tab = e.currentTarget.getAttribute('data-phone-tab-button');
        if (tab === PHONE_TABS.code) {
            this.props.onActivateEditorTab(BLOCKS_TAB_INDEX);
        } else if (tab === PHONE_TABS.media && this.props.activeTabIndex === BLOCKS_TAB_INDEX) {
            this.props.onActivateEditorTab(COSTUMES_TAB_INDEX);
        }
        this.props.onSelectTab(tab);
    }
    renderTab (tab, label, badge) {
        const active = this.props.phoneTab === tab;
        return (
            <button
                aria-current={active ? 'page' : null}
                aria-label={badge ? `${label} (${badge})` : null}
                className={classNames(styles.tabButton, {[styles.isActive]: active})}
                data-phone-tab-button={tab}
                key={tab}
                type="button"
                onClick={this.handleClick}
            >
                <TabIcon name={tab} />
                <span className={styles.tabLabel}>{label}</span>
                {badge ? (
                    <span
                        aria-hidden="true"
                        className={styles.badge}
                    >
                        {badge}
                    </span>
                ) : null}
            </button>
        );
    }
    render () {
        const {intl, targetIsStage} = this.props;
        const {self, peerCount} = this.state;
        return (
            <nav
                aria-label={intl.formatMessage(messages.tabs)}
                className={styles.tabBar}
                data-phone-tab-bar
            >
                {this.renderTab(PHONE_TABS.code, intl.formatMessage(messages.code))}
                {this.renderTab(PHONE_TABS.stage, intl.formatMessage(messages.stage))}
                {this.renderTab(PHONE_TABS.sprites, intl.formatMessage(messages.sprites))}
                {this.renderTab(
                    PHONE_TABS.media,
                    intl.formatMessage(targetIsStage ? messages.backdrops : messages.costumes)
                )}
                {self ? this.renderTab(
                    PHONE_TABS.room,
                    intl.formatMessage(messages.room),
                    peerCount + 1
                ) : null}
            </nav>
        );
    }
}

PhoneTabBar.propTypes = {
    activeTabIndex: PropTypes.number,
    intl: intlShape.isRequired,
    onActivateEditorTab: PropTypes.func.isRequired,
    onSelectTab: PropTypes.func.isRequired,
    phoneTab: PropTypes.oneOf(Object.keys(PHONE_TABS)),
    targetIsStage: PropTypes.bool
};

const mapStateToProps = state => ({
    activeTabIndex: state.scratchGui.editorTab.activeTabIndex,
    phoneTab: state.scratchGui.layoutMode.phoneTab,
    targetIsStage: !!(
        state.scratchGui.targets.stage &&
        state.scratchGui.targets.stage.id === state.scratchGui.targets.editingTarget
    )
});

const mapDispatchToProps = dispatch => ({
    onActivateEditorTab: index => dispatch(activateTab(index)),
    onSelectTab: tab => dispatch(setPhoneTab(tab))
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(PhoneTabBar));
