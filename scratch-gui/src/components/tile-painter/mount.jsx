import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import {Provider, connect} from 'react-redux';
import {IntlProvider, defineMessages, injectIntl, intlShape} from 'react-intl';

import {LAYOUT_MODES, detectLayoutMode, watchLayoutMode} from '../../lib/layout-mode';
import {setPainterOpen} from '../../reducers/world-ui';
import SqIcon from '../sq-icon';
import TilePainter from './tile-painter.jsx';
import styles from './tile-painter.css';

const SLOT_ID = 'sq-stage-header-slot';
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
        const label = this.props.intl.formatMessage(messages.toggle);
        return (
            <button
                aria-label={label}
                aria-pressed={this.props.open}
                className={styles.toggle}
                title={label}
                onClick={this.handleClick}
            >
                <SqIcon name="world" />
                <span
                    aria-hidden="true"
                    className={styles.toggleLabel}
                >{label}</span>
            </button>
        );
    }
}

PainterToggle.propTypes = {
    intl: intlShape.isRequired,
    onToggle: PropTypes.func.isRequired,
    open: PropTypes.bool.isRequired
};

const ConnectedToggle = connect(
    state => ({open: state.scratchGui.worldUi.painterOpen}),
    dispatch => ({onToggle: open => dispatch(setPainterOpen(open))})
)(injectIntl(PainterToggle));

const ConnectedIntl = connect(state => ({
    locale: state.locales.locale,
    messages: state.locales.messages
}))(IntlProvider);

const kitLoaded = runtime => Array.isArray(runtime._blockInfo) &&
    runtime._blockInfo.some(info => info.id === KIT_ID);

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
    let rendered = false;

    const wrap = child => (
        <Provider store={store}>
            <ConnectedIntl>
                {child}
            </ConnectedIntl>
        </Provider>
    );

    const close = () => {
        if (store.getState().scratchGui.worldUi.painterOpen) store.dispatch(setPainterOpen(false));
    };

    const sync = () => {
        const active = kitLoaded(runtime) && mode !== LAYOUT_MODES.phone;
        const slot = doc.getElementById(SLOT_ID);
        if (active && slot) {
            if (toggleHost.parentNode !== slot) slot.appendChild(toggleHost);
            if (!overlayHost.parentNode) doc.body.appendChild(overlayHost);
            if (!rendered) {
                ReactDOM.render(wrap(<ConnectedToggle />), toggleHost);
                ReactDOM.render(wrap(
                    <TilePainter
                        canvas={runtime.renderer ? runtime.renderer.canvas : null}
                        runtime={runtime}
                        win={win}
                        world={world}
                    />
                ), overlayHost);
                rendered = true;
            }
        } else if (rendered) {
            close();
            ReactDOM.unmountComponentAtNode(toggleHost);
            ReactDOM.unmountComponentAtNode(overlayHost);
            rendered = false;
            [toggleHost, overlayHost].forEach(host => host.parentNode && host.parentNode.removeChild(host));
        }
    };

    const observer = new win.MutationObserver(() => {
        const slot = doc.getElementById(SLOT_ID);
        if ((slot && toggleHost.parentNode !== slot) || (!slot && rendered)) sync();
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
            runtime.removeListener('EXTENSION_ADDED', sync);
            runtime.removeListener('PROJECT_LOADED', close);
            runtime.removeListener('PROJECT_LOADED', sync);
            close();
            if (rendered) {
                ReactDOM.unmountComponentAtNode(toggleHost);
                ReactDOM.unmountComponentAtNode(overlayHost);
            }
            rendered = false;
            [toggleHost, overlayHost].forEach(host => host.parentNode && host.parentNode.removeChild(host));
            mounts.delete(runtime);
        }
    };
    mounts.set(runtime, handle);
    return handle;
};

export {SLOT_ID, installTilePainter};
