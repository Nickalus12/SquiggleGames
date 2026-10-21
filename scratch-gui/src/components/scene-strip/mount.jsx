import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import {Provider, connect} from 'react-redux';
import {IntlProvider, defineMessages, injectIntl, intlShape} from 'react-intl';

import {LAYOUT_MODES, PHONE_TABS, detectLayoutMode, watchLayoutMode} from '../../lib/layout-mode';
import SqIcon from '../sq-icon';
import {addTopBarItem, closeSheet, openSheet} from '../phone-shell/phone-slots';
import SceneStrip from './scene-strip.jsx';
import ScenesButton from './scenes-button.jsx';
import styles from './scene-strip.css';

const SLOT_ID = 'sq-stage-header-slot';
const SHEET_ID = 'sq-scenes-sheet';
const TOP_BAR_ID = 'sq-scenes';
const KIT_ID = 'squigglescenes';

const messages = defineMessages({
    open: {
        id: 'sq.scenes.phone.open',
        defaultMessage: 'Scenes',
        description: 'Phone top bar button that opens the scene picker sheet'
    }
});

const mounts = new WeakMap();

class PhoneScenesButton extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick', 'handlePicked', 'renderSheet']);
    }
    handlePicked () {
        closeSheet(SHEET_ID);
    }
    renderSheet () {
        return (
            <SceneStrip
                compact
                controller={this.props.controller}
                onPicked={this.handlePicked}
            />
        );
    }
    handleClick () {
        openSheet({
            id: SHEET_ID,
            title: this.props.intl.formatMessage(messages.open),
            render: this.renderSheet,
            size: 'half'
        });
    }
    render () {
        if (!this.props.visible) return null;
        const label = this.props.intl.formatMessage(messages.open);
        return (
            <button
                aria-label={label}
                className={styles.phoneButton}
                title={label}
                onClick={this.handleClick}
            >
                <SqIcon name="scenes" />
            </button>
        );
    }
}

PhoneScenesButton.propTypes = {
    controller: PropTypes.shape({}).isRequired,
    intl: intlShape.isRequired,
    visible: PropTypes.bool
};

const ConnectedPhoneScenesButton = connect(state => ({
    visible: state.scratchGui.layoutMode.phoneTab === PHONE_TABS.stage
}))(injectIntl(PhoneScenesButton));

const ConnectedIntl = connect(state => ({
    locale: state.locales.locale,
    messages: state.locales.messages
}))(IntlProvider);

const withIntl = (store, child) => (store && store.getState().locales ? (
    <Provider store={store}>
        <ConnectedIntl>{child}</ConnectedIntl>
    </Provider>
) : <IntlProvider locale="en">{child}</IntlProvider>);

const kitLoaded = runtime => Array.isArray(runtime._blockInfo) &&
    runtime._blockInfo.some(info => info.id === KIT_ID);

const installSceneStrip = ({runtime, controller, win = window, store = win.ReduxStore}) => {
    if (mounts.has(runtime)) return mounts.get(runtime);
    const doc = win.document;
    const container = doc.createElement('div');
    container.setAttribute('data-sq-scene-strip', '');
    let mode = detectLayoutMode(win);
    let rendered = false;
    let removeTopBar = null;

    const renderTopBar = () => (
        <ConnectedPhoneScenesButton controller={controller} />
    );

    const sync = () => {
        const active = kitLoaded(runtime);
        const phone = mode === LAYOUT_MODES.phone;
        const slot = doc.getElementById(SLOT_ID);
        if (active && !phone && slot) {
            if (container.parentNode !== slot) slot.appendChild(container);
            if (!rendered) {
                ReactDOM.render(withIntl(store, <ScenesButton controller={controller} />), container);
                rendered = true;
            }
        } else if (rendered) {
            ReactDOM.unmountComponentAtNode(container);
            rendered = false;
            if (container.parentNode) container.parentNode.removeChild(container);
        }
        if (active && phone && !removeTopBar) {
            removeTopBar = addTopBarItem({id: TOP_BAR_ID, order: 20, render: renderTopBar});
        } else if ((!active || !phone) && removeTopBar) {
            removeTopBar();
            removeTopBar = null;
            closeSheet(SHEET_ID);
        }
    };

    const observer = new win.MutationObserver(() => {
        const slot = doc.getElementById(SLOT_ID);
        if ((slot && container.parentNode !== slot) || (!slot && rendered)) sync();
    });
    observer.observe(doc.body, {childList: true, subtree: true});
    const stopWatching = watchLayoutMode(win, next => {
        mode = next;
        sync();
    });
    runtime.on('EXTENSION_ADDED', sync);
    runtime.on('PROJECT_LOADED', sync);
    sync();

    const handle = {
        sync,
        dispose: () => {
            observer.disconnect();
            if (typeof stopWatching === 'function') stopWatching();
            runtime.removeListener('EXTENSION_ADDED', sync);
            runtime.removeListener('PROJECT_LOADED', sync);
            if (rendered) ReactDOM.unmountComponentAtNode(container);
            rendered = false;
            if (container.parentNode) container.parentNode.removeChild(container);
            if (removeTopBar) removeTopBar();
            removeTopBar = null;
            mounts.delete(runtime);
        }
    };
    mounts.set(runtime, handle);
    return handle;
};

export {SLOT_ID, installSceneStrip};
