import React from 'react';
import ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';

import extensionLibraryContent from '../../lib/libraries/extensions/index.jsx';
import {isSquiggleItem} from '../../lib/libraries/tw-extension-tags';
import {listKits, TOGETHER_ID} from '../../lib/kits/registry.js';
import SquiggleOnlyNotice from './squiggle-only-notice.jsx';

const TOGETHER_SEEN_KEY = 'sq:notice:together-seen';
const PORTABILITY_SEEN_KEY = 'sq:notice:portability-seen';

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

const mount = (kind, onStartRoom) => {
    close();
    host = document.createElement('div');
    host.setAttribute('data-sq-notice', kind);
    document.body.appendChild(host);
    showing = kind;
    ReactDOM.render(React.createElement(
        IntlProvider,
        {locale: 'en', messages: {}},
        React.createElement(SquiggleOnlyNotice, {kind, onClose: close, onStartRoom})
    ), host);
};

const setStartRoomHandler = handler => {
    startRoomHandler = typeof handler === 'function' ? handler : defaultStartRoom;
};

const showTogetherSheet = ({force} = {}) => {
    if (!force && storageGet('localStorage', TOGETHER_SEEN_KEY)) return false;
    storageSet('localStorage', TOGETHER_SEEN_KEY);
    mount('together', () => {
        close();
        startRoomHandler();
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
    if (!manager || !manager._loadedExtensions) return false;
    const ids = squiggleExtensionIds();
    return Array.from(manager._loadedExtensions.keys()).some(id => ids.has(id));
};

const showPortabilityNote = (vm, {force} = {}) => {
    if (!force && storageGet('sessionStorage', PORTABILITY_SEEN_KEY)) return false;
    if (!force && !usesSquiggleBlocks(vm)) return false;
    storageSet('sessionStorage', PORTABILITY_SEEN_KEY);
    mount('portability');
    return true;
};

const closeNotice = close;

const currentNotice = () => showing;

export {
    closeNotice,
    currentNotice,
    setStartRoomHandler,
    showPortabilityNote,
    showTogetherSheet,
    usesSquiggleBlocks
};
