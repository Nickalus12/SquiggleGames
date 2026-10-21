import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import {Provider, connect} from 'react-redux';
import {IntlProvider, defineMessages, injectIntl, intlShape} from 'react-intl';

import {LAYOUT_MODES, PHONE_TABS, detectLayoutMode, watchLayoutMode} from '../../lib/layout-mode';
import kitLoaded from '../../lib/world/kit-loaded.js';
import {setPainterOpen} from '../../reducers/world-ui';
import SqIcon from '../sq-icon';
import {addTopBarItem, closeSheet, openSheet, subscribe as watchSlots} from '../phone-shell/phone-slots';
import SheetHost from './sheet-host.jsx';
import TilePainter from './tile-painter.jsx';
import styles from './tile-painter.css';

const SLOT_ID = 'sq-stage-header-slot';
const SHEET_ID = 'sq-tiles-sheet';
const TOP_BAR_ID = 'sq-tiles';
const KIT_ID = 'squiggleworld';

const messages = defineMessages({
    toggle: {
        id: 'sq.painter.toggle',
        defaultMessage: 'Tiles',
        description: 'Stage header button that opens the tile painter'
    }
});

const mounts = new WeakMap();

class PainterToggle extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick']);
    }
    handleClick () {
        this.props.onToggle(!this.props.open);
    }
    render () {
        if (!this.props.visible) return null;
        const label = this.props.intl.formatMessage(messages.toggle);
        return (
            <button
                aria-label={label}
                aria-pressed={this.props.open}
                className={this.props.phone ? styles.phoneToggle : styles.toggle}
                title={label}
                onClick={this.handleClick}
            >
                <SqIcon name="world" />
                {this.props.phone ? null : (
                    <span
                        aria-hidden="true"
                        className={styles.toggleLabel}
                    >{label}</span>
                )}
            </button>
        );
    }
}

PainterToggle.propTypes = {
    intl: intlShape.isRequired,
    onToggle: PropTypes.func.isRequired,
    open: PropTypes.bool.isRequired,
    phone: PropTypes.bool,
    visible: PropTypes.bool
};

PainterToggle.defaultProps = {
    phone: false,
    visible: true
};

const onStageTab = state => state.scratchGui.layoutMode.phoneTab === PHONE_TABS.stage;

const ConnectedToggle = connect(
    (state, props) => ({
        open: state.scratchGui.worldUi.painterOpen,
        visible: !props.phone || onStageTab(state)
    }),
    dispatch => ({onToggle: open => dispatch(setPainterOpen(open))})
)(injectIntl(PainterToggle));

const ConnectedIntl = connect(state => ({
    locale: state.locales.locale,
    messages: state.locales.messages
}))(IntlProvider);

const hasWorldUi = store => !!(store && store.getState().scratchGui && store.getState().scratchGui.worldUi);

const installTilePainter = ({runtime, world, win = window, store = win.ReduxStore}) => {
    if (mounts.has(runtime)) return mounts.get(runtime);
    if (!hasWorldUi(store)) return null;
    const doc = win.document;
    const toggleHost = doc.createElement('div');
    toggleHost.setAttribute('data-sq-tile-painter', '');
    const overlayHost = doc.createElement('div');
    overlayHost.setAttribute('data-sq-tile-painter-overlay', '');
    let mode = detectLayoutMode(win);
    let toggleRendered = false;
    let overlayRendered = false;
    let docked = false;
    let toolbarHost = null;
    let removeTopBar = null;

    const isOpen = () => store.getState().scratchGui.worldUi.painterOpen;
    const sheetTitle = () => {
        const locales = store.getState().locales;
        const text = locales && locales.messages ? locales.messages[messages.toggle.id] : null;
        return text || messages.toggle.defaultMessage;
    };
    const isPhone = () => mode === LAYOUT_MODES.phone;

    const wrap = child => (
        <Provider store={store}>
            <ConnectedIntl>
                {child}
            </ConnectedIntl>
        </Provider>
    );

    const close = () => {
        if (isOpen()) store.dispatch(setPainterOpen(false));
    };

    const renderOverlay = () => {
        ReactDOM.render(wrap(
            <TilePainter
                canvas={runtime.renderer ? runtime.renderer.canvas : null}
                docked={docked}
                runtime={runtime}
                toolbarHost={toolbarHost}
                win={win}
                world={world}
            />
        ), overlayHost);
        overlayRendered = true;
    };

    const sheet = {
        attach (el) {
            toolbarHost = el;
            if (overlayRendered) renderOverlay();
        }
    };

    const renderSheet = () => <SheetHost sheet={sheet} />;

    const renderTopBar = () => <ConnectedToggle phone />;

    const unmountToggle = () => {
        if (toggleRendered) ReactDOM.unmountComponentAtNode(toggleHost);
        toggleRendered = false;
        if (toggleHost.parentNode) toggleHost.parentNode.removeChild(toggleHost);
    };

    const unmountOverlay = () => {
        if (overlayRendered) ReactDOM.unmountComponentAtNode(overlayHost);
        overlayRendered = false;
        if (overlayHost.parentNode) overlayHost.parentNode.removeChild(overlayHost);
    };

    const sync = () => {
        const active = kitLoaded(runtime, KIT_ID);
        const phone = isPhone();
        const slot = doc.getElementById(SLOT_ID);
        const desktop = active && !phone && !!slot;
        if (desktop) {
            if (toggleHost.parentNode !== slot) slot.appendChild(toggleHost);
            if (!toggleRendered) {
                ReactDOM.render(wrap(<ConnectedToggle />), toggleHost);
                toggleRendered = true;
            }
        } else if (toggleRendered) {
            unmountToggle();
        }
        if (active && phone && !removeTopBar) {
            removeTopBar = addTopBarItem({id: TOP_BAR_ID, order: 30, render: renderTopBar});
        } else if ((!active || !phone) && removeTopBar) {
            removeTopBar();
            removeTopBar = null;
            closeSheet(SHEET_ID);
        }
        if (desktop || (active && phone)) {
            if (docked !== phone) {
                close();
                docked = phone;
            }
            if (!overlayHost.parentNode) doc.body.appendChild(overlayHost);
            renderOverlay();
        } else if (overlayRendered) {
            close();
            unmountOverlay();
        }
    };

    const focusToggle = () => {
        win.setTimeout(() => {
            const button = toggleHost.querySelector('button');
            const now = doc.activeElement;
            if (!button || isOpen()) return;
            if (!now || now === doc.body || overlayHost.contains(now)) button.focus();
        }, 0);
    };

    let wasOpen = isOpen();
    const stopStore = store.subscribe(() => {
        const open = isOpen();
        if (open && isPhone() && !onStageTab(store.getState())) {
            close();
            return;
        }
        if (open === wasOpen) return;
        wasOpen = open;
        if (isPhone()) {
            if (open) {
                openSheet({
                    id: SHEET_ID,
                    title: sheetTitle(),
                    render: renderSheet,
                    size: 'half'
                });
            } else {
                closeSheet(SHEET_ID);
            }
        } else if (!open) {
            focusToggle();
        }
    });

    const stopSlots = watchSlots(next => {
        const ours = next.sheet && next.sheet.id === SHEET_ID;
        if (!ours && isOpen() && isPhone()) close();
    });

    const observer = new win.MutationObserver(() => {
        const slot = doc.getElementById(SLOT_ID);
        if ((slot && toggleHost.parentNode !== slot) || (!slot && toggleRendered)) sync();
    });
    observer.observe(doc.body, {childList: true, subtree: true});
    const stopWatching = watchLayoutMode(win, next => {
        mode = next;
        sync();
    });
    runtime.on('EXTENSION_ADDED', sync);
    runtime.on('PROJECT_LOADED', close);
    runtime.on('PROJECT_LOADED', sync);
    sync();

    const handle = {
        sync,
        dispose: () => {
            observer.disconnect();
            if (typeof stopWatching === 'function') stopWatching();
            stopStore();
            stopSlots();
            runtime.removeListener('EXTENSION_ADDED', sync);
            runtime.removeListener('PROJECT_LOADED', close);
            runtime.removeListener('PROJECT_LOADED', sync);
            close();
            if (removeTopBar) removeTopBar();
            removeTopBar = null;
            closeSheet(SHEET_ID);
            unmountToggle();
            unmountOverlay();
            mounts.delete(runtime);
        }
    };
    mounts.set(runtime, handle);
    return handle;
};

export {SLOT_ID, installTilePainter};
