import React from 'react';
import ReactDOM from 'react-dom';
import {Provider, connect} from 'react-redux';
import {IntlProvider} from 'react-intl';

import {LAYOUT_MODES, detectLayoutMode, watchLayoutMode} from '../../lib/layout-mode';
import PresenceBar from './presence-bar.jsx';

const SLOT_ID = 'sq-stage-header-slot';

let installed = null;

const ConnectedIntl = connect(state => ({
    locale: state.locales.locale,
    messages: state.locales.messages
}))(IntlProvider);

const shouldShow = ({slot, phone, self}) => !!(slot && !phone && self);

const installPresenceBar = ({overlay, win = window, store = win.ReduxStore}) => {
    if (installed) return installed;
    if (!store || !store.getState().locales) return null;
    const doc = win.document;
    const container = doc.createElement('div');
    container.setAttribute('data-sq-presence-bar', '');
    let mode = detectLayoutMode(win);
    let rendered = false;

    const sync = () => {
        const slot = doc.getElementById(SLOT_ID);
        const show = shouldShow({slot, phone: mode === LAYOUT_MODES.phone, self: overlay.getState().self});
        if (show) {
            if (container.parentNode !== slot) slot.appendChild(container);
            if (!rendered) {
                ReactDOM.render((
                    <Provider store={store}>
                        <ConnectedIntl>
                            <PresenceBar overlay={overlay} />
                        </ConnectedIntl>
                    </Provider>
                ), container);
                rendered = true;
            }
        } else if (rendered) {
            ReactDOM.unmountComponentAtNode(container);
            rendered = false;
            if (container.parentNode) container.parentNode.removeChild(container);
        }
    };

    const observer = new win.MutationObserver(() => {
        const slot = doc.getElementById(SLOT_ID);
        if ((slot && rendered && container.parentNode !== slot) || (!slot && rendered) ||
            (slot && !rendered && mode !== LAYOUT_MODES.phone && overlay.getState().self)) sync();
    });
    observer.observe(doc.body, {childList: true, subtree: true});
    const stopWatching = watchLayoutMode(win, next => {
        mode = next;
        sync();
    });
    const unsubscribe = overlay.subscribe(() => {
        if (!!overlay.getState().self !== rendered) sync();
    });
    sync();

    installed = {
        sync,
        dispose: () => {
            observer.disconnect();
            if (typeof stopWatching === 'function') stopWatching();
            unsubscribe();
            if (rendered) ReactDOM.unmountComponentAtNode(container);
            rendered = false;
            if (container.parentNode) container.parentNode.removeChild(container);
            installed = null;
        }
    };
    return installed;
};

export {SLOT_ID, installPresenceBar, shouldShow};
