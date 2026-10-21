import React from 'react';
import ReactDOM from 'react-dom';
import {FormattedMessage, IntlProvider} from 'react-intl';

import extensionLibraryContent from '../../lib/libraries/extensions/index.jsx';
import {isSquiggleItem} from '../../lib/libraries/tw-extension-tags';
import {listKits, TOGETHER_ID} from '../../lib/kits/registry.js';
import {closeSheet, getState, isSheetHostMounted, openSheet} from '../phone-shell/phone-slots';
import SquiggleOnlyNotice, {messages, TogetherSheetBody} from './squiggle-only-notice.jsx';

const TOGETHER_SEEN_KEY = 'sq:notice:together-seen';
const PORTABILITY_SEEN_KEY = 'sq:notice:portability-seen';
const TOGETHER_SHEET_ID = 'sq-together';

const defaultStartRoom = () => {
    window.location.assign('/');
};

let startRoomHandler = defaultStartRoom;
let host = null;
let showing = null;

const storageGet = (storage, key) => {
    try {
        return window[storage].getItem(key);
    } catch (error) {
        return null;
    }
};

const storageSet = (storage, key) => {
    try {
        window[storage].setItem(key, '1');
        return true;
    } catch (error) {
        return false;
    }
};

const close = () => {
    if (!host) return;
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    host = null;
    showing = null;
};

const intlConfig = intl => ({
    locale: (intl && intl.locale) || 'en',
    messages: (intl && intl.messages) || {}
});

const mount = (kind, {intl, onStartRoom} = {}) => {
    close();
    host = document.createElement('div');
    host.setAttribute('data-sq-notice', kind);
    document.body.appendChild(host);
    showing = kind;
    ReactDOM.render(React.createElement(
        IntlProvider,
        intlConfig(intl),
        React.createElement(SquiggleOnlyNotice, {kind, onClose: close, onStartRoom})
    ), host);
};

const setStartRoomHandler = handler => {
    startRoomHandler = typeof handler === 'function' ? handler : defaultStartRoom;
};

const openPhoneTogetherSheet = () => {
    const closeTogether = () => closeSheet(TOGETHER_SHEET_ID);
    openSheet({
        id: TOGETHER_SHEET_ID,
        title: React.createElement(FormattedMessage, messages.togetherTitle),
        render: () => React.createElement(TogetherSheetBody, {
            onClose: closeTogether,
            onStartRoom: () => {
                closeTogether();
                startRoomHandler();
            }
        })
    });
};

const showTogetherSheet = ({force, intl} = {}) => {
    if (!force && storageGet('localStorage', TOGETHER_SEEN_KEY)) return false;
    storageSet('localStorage', TOGETHER_SEEN_KEY);
    if (isSheetHostMounted()) {
        close();
        openPhoneTogetherSheet();
        return true;
    }
    mount('together', {
        intl,
        onStartRoom: () => {
            close();
            startRoomHandler();
        }
    });
    return true;
};

const squiggleExtensionIds = () => {
    const ids = new Set([TOGETHER_ID]);
    extensionLibraryContent.forEach(item => {
        if (isSquiggleItem(item) && item.extensionId) ids.add(item.extensionId);
    });
    listKits().forEach(kit => ids.add(kit.id));
    return ids;
};

const usesSquiggleBlocks = vm => {
    const manager = vm && vm.extensionManager;
    if (!manager || typeof manager.isExtensionLoaded !== 'function') return false;
    return Array.from(squiggleExtensionIds()).some(id => manager.isExtensionLoaded(id));
};

const showPortabilityNote = (vm, {force, intl} = {}) => {
    if (!force && storageGet('sessionStorage', PORTABILITY_SEEN_KEY)) return false;
    if (!force && !usesSquiggleBlocks(vm)) return false;
    storageSet('sessionStorage', PORTABILITY_SEEN_KEY);
    mount('portability', {intl});
    return true;
};

const showLoadError = ({intl} = {}) => {
    mount('loadError', {intl});
    return true;
};

const closeNotice = () => {
    close();
    closeSheet(TOGETHER_SHEET_ID);
};

const currentNotice = () => {
    if (showing) return showing;
    const sheet = getState().sheet;
    return sheet && sheet.id === TOGETHER_SHEET_ID ? 'together' : null;
};

export {
    closeNotice,
    currentNotice,
    setStartRoomHandler,
    showLoadError,
    showPortabilityNote,
    showTogetherSheet,
    usesSquiggleBlocks
};
