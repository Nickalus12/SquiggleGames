import PropTypes from 'prop-types';
import React from 'react';
import ReactModal from 'react-modal';
import Box from '../box/box.jsx';
import {defineMessages, injectIntl, intlShape, FormattedMessage} from 'react-intl';
import {
    isRendererSupported,
    isNewFunctionSupported,
    findIncompatibleUserscripts
} from '../../lib/tw-environment-support-prober.js';
import {APP_NAME} from '../../lib/brand.js';

import styles from './browser-modal.css';
import unhappyBrowser from './unsupported-browser.svg';

const messages = defineMessages({
    browserNotSupported: {
        id: 'gui.unsupportedBrowser.label',
        defaultMessage: 'Browser is not supported',
        description: ''
    },
    systemNotSupported: {
        id: 'tw.browserModal.desktopTitle',
        defaultMessage: 'System is not supported',
        description: 'Title of error message in desktop app when system does not support required API, such as WebGL'
    },
    webglOff: {
        id: 'sq.browserModal.webglTitle',
        defaultMessage: '{APP_NAME} cannot draw your game yet',
        description: 'Title of the message shown when the browser has WebGL turned off'
    }
});

const HELP_URL = 'https://squigglegames.app/webgl';

const noop = () => {};

const webglReason = () => {
    try {
        const canvas = document.createElement('canvas');
        let reason = '';
        canvas.addEventListener('webglcontextcreationerror', e => {
            reason = e.statusMessage || '';
        });
        if (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) return '';
        return reason;
    } catch (e) {
        return '';
    }
};

const BrowserModal = ({intl, ...props}) => {
    const rendererSupported = isRendererSupported();
    const incompatibleUserscripts = findIncompatibleUserscripts();
    const webglOnly = !rendererSupported && isNewFunctionSupported() && incompatibleUserscripts.length === 0;
    let title = props.onClickDesktopSettings ? messages.systemNotSupported : messages.browserNotSupported;
    if (webglOnly && !props.onClickDesktopSettings) title = messages.webglOff;
    const reason = rendererSupported ? '' : webglReason();
    return (
        <ReactModal
            isOpen
            className={styles.modalContent}
            contentLabel={intl.formatMessage(title)}
            overlayClassName={styles.modalOverlay}
            onRequestClose={noop}
        >
            <div dir={props.isRtl ? 'rtl' : 'ltr'} >
                <Box className={styles.illustration}>
                    <img
                        src={unhappyBrowser}
                        draggable={false}
                    />
                </Box>

                <Box className={styles.body}>
                    <h2 className={styles.title}>
                        <FormattedMessage
                            {...title}
                            values={{APP_NAME}}
                        />
                    </h2>

                    {/* eslint-disable max-len */}
                    {isNewFunctionSupported() ? null : (
                        // This message should only be seen by website operators, so we don't need to translate it
                        <p>
                            {'Unable to compile JavaScript with new Function(). This is most likely caused by an overly-strict Content-Security-Policy. The CSP must include \'unsafe-eval\'.'}
                        </p>
                    )}

                    {incompatibleUserscripts.length > 0 && (
                        <React.Fragment>
                            {incompatibleUserscripts.map((message, index) => (
                                <p key={index}>
                                    {message}
                                </p>
                            ))}
                        </React.Fragment>
                    )}

                    {!rendererSupported && (
                        <React.Fragment>
                            <p>
                                <FormattedMessage
                                    defaultMessage="{APP_NAME} draws your sprites with a part of the browser called WebGL. This browser has it turned off right now, so nothing can be drawn."
                                    description="First line of the message shown when the browser has WebGL turned off"
                                    id="sq.browserModal.webglOff"
                                    values={{
                                        APP_NAME
                                    }}
                                />
                            </p>
                            <p>
                                <FormattedMessage
                                    defaultMessage="Try this first: close the browser all the way, then open it again. Your work is safe. If that does not help, the page below shows the switch for every browser."
                                    description="Second line of the message shown when the browser has WebGL turned off"
                                    id="sq.browserModal.webglTry"
                                />
                            </p>

                            {props.onClickDesktopSettings ? (
                                <React.Fragment>
                                    <p>
                                        <FormattedMessage
                                            defaultMessage={'You can also try toggling the "graphics acceleration" option in desktop settings:'}
                                            description="Error message when browser does not support WebGL (desktop app version). Consider seeing how Chrome translates 'graphics acceleration' into your language."
                                            id="tw.browserModal.webglDesktop"
                                        />
                                    </p>
                                    <div className={styles.desktopSettingsOuter}>
                                        <button
                                            onClick={props.onClickDesktopSettings}
                                            className={styles.desktopSettingsInner}
                                        >
                                            <FormattedMessage
                                                defaultMessage="Open Desktop Settings"
                                                description="Button in unsupported system modal to open desktop settings"
                                                id="tw.browserModal.desktopSettings"
                                            />
                                        </button>
                                    </div>
                                </React.Fragment>
                            ) : (
                                <div className={styles.buttonRow}>
                                    <a
                                        className={styles.primaryButton}
                                        href={HELP_URL}
                                    >
                                        <FormattedMessage
                                            defaultMessage="Show me how to turn it on"
                                            description="Button that opens the page explaining how to turn WebGL on in each browser"
                                            id="sq.browserModal.webglHelp"
                                        />
                                    </a>
                                    <a
                                        className={styles.ghostButton}
                                        href="/"
                                    >
                                        <FormattedMessage
                                            defaultMessage="Back to {APP_NAME}"
                                            description="Button that leaves the editor for the home page"
                                            id="sq.browserModal.webglBack"
                                            values={{
                                                APP_NAME
                                            }}
                                        />
                                    </a>
                                </div>
                            )}

                            {reason ? (
                                <p className={styles.reason}>
                                    <FormattedMessage
                                        defaultMessage="What the browser said: {reason}"
                                        description="Small grey line quoting the browser's own WebGL error for a grown-up or support"
                                        id="sq.browserModal.webglReason"
                                        values={{
                                            reason
                                        }}
                                    />
                                </p>
                            ) : null}
                        </React.Fragment>
                    )}

                    {/* eslint-enable max-len */}
                </Box>
            </div>
        </ReactModal>
    );
};

BrowserModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onClickDesktopSettings: PropTypes.func
};

const WrappedBrowserModal = injectIntl(BrowserModal);

WrappedBrowserModal.setAppElement = ReactModal.setAppElement;

export default WrappedBrowserModal;
