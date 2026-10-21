import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import styles from './squiggle-only-notice.css';

const messages = defineMessages({
    togetherTitle: {
        defaultMessage: 'Made for playing together.',
        description: 'Title of the sheet shown once when a Together expansion is added with no room open',
        id: 'sq.notice.together.title'
    },
    togetherBody: {
        defaultMessage: 'These blocks talk to everyone in your room. ' +
            'With no room open, messages come back to you and shared variables stay on this device, ' +
            'so you can test alone.',
        description: 'Body of the sheet shown once when a Together expansion is added with no room open',
        id: 'sq.notice.together.body'
    },
    startRoom: {
        defaultMessage: 'Start a room',
        description: 'Button on the Together sheet that starts a room to play with friends',
        id: 'sq.notice.together.startRoom'
    },
    gotIt: {
        defaultMessage: 'Got it',
        description: 'Button that closes a one-time notice',
        id: 'sq.notice.gotIt'
    },
    portability: {
        defaultMessage: 'This file opens in Squiggle. Scratch and TurboWarp cannot run Squiggle blocks.',
        description: 'Note shown once per session when a project with Squiggle blocks is saved to the computer',
        id: 'sq.notice.portability'
    }
});

const FOCUSABLE = 'button:not([disabled])';

class SquiggleOnlyNotice extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleKeyDown',
            'handleScrimClick',
            'setDialogRef',
            'setInitialFocusRef'
        ]);
    }
    componentDidMount () {
        if (this.props.kind !== 'together') return;
        this.returnFocusTo = document.activeElement;
        if (this.initialFocusRef) this.initialFocusRef.focus();
    }
    componentWillUnmount () {
        const target = this.returnFocusTo;
        if (target && typeof target.focus === 'function' && document.body.contains(target)) {
            target.focus();
        }
    }
    handleKeyDown (event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.props.onClose();
            return;
        }
        if (event.key !== 'Tab' || !this.dialogRef) return;
        const focusable = Array.from(this.dialogRef.querySelectorAll(FOCUSABLE));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
    handleScrimClick (event) {
        if (event.target === event.currentTarget) this.props.onClose();
    }
    setDialogRef (ref) {
        this.dialogRef = ref;
    }
    setInitialFocusRef (ref) {
        this.initialFocusRef = ref;
    }
    render () {
        const {intl, kind, onClose, onStartRoom} = this.props;
        if (kind === 'portability') {
            return (
                <div
                    className={styles.note}
                    role="status"
                    aria-live="polite"
                >
                    <p className={styles.noteText}>{intl.formatMessage(messages.portability)}</p>
                    <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={onClose}
                    >
                        {intl.formatMessage(messages.gotIt)}
                    </button>
                </div>
            );
        }
        return (
            <div
                className={styles.scrim}
                onClick={this.handleScrimClick}
            >
                <div
                    aria-describedby="sq-notice-together-body"
                    aria-labelledby="sq-notice-together-title"
                    aria-modal="true"
                    className={styles.sheet}
                    ref={this.setDialogRef}
                    role="dialog"
                    onKeyDown={this.handleKeyDown}
                >
                    <h2
                        className={styles.title}
                        id="sq-notice-together-title"
                    >
                        {intl.formatMessage(messages.togetherTitle)}
                    </h2>
                    <p
                        className={styles.body}
                        id="sq-notice-together-body"
                    >
                        {intl.formatMessage(messages.togetherBody)}
                    </p>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={onStartRoom}
                        >
                            {intl.formatMessage(messages.startRoom)}
                        </button>
                        <button
                            type="button"
                            className={styles.secondaryButton}
                            ref={this.setInitialFocusRef}
                            onClick={onClose}
                        >
                            {intl.formatMessage(messages.gotIt)}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

SquiggleOnlyNotice.propTypes = {
    intl: intlShape.isRequired,
    kind: PropTypes.oneOf(['together', 'portability']).isRequired,
    onClose: PropTypes.func.isRequired,
    onStartRoom: PropTypes.func
};

export {messages};

export default injectIntl(SquiggleOnlyNotice);
