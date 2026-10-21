import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';

import messages from './chat-messages';
import styles from './collab-chat.css';

const REASONS = [
    {id: 'mean', label: messages.reasonMean},
    {id: 'personal', label: messages.reasonPersonal},
    {id: 'unsafe', label: messages.reasonUnsafe},
    {id: 'other', label: messages.reasonOther}
];

const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

class ReportSheet extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleReason',
            'handleSend',
            'handleKeyDown',
            'setSheet'
        ]);
        this.state = {reason: null};
    }
    componentDidMount () {
        this.focusFirst();
    }
    componentDidUpdate (prevProps) {
        if (prevProps.status !== this.props.status && this.props.status === 'done') this.focusFirst();
    }
    setSheet (el) {
        this.sheet = el;
    }
    focusFirst () {
        const first = this.sheet && this.sheet.querySelector(FOCUSABLE);
        if (first) first.focus();
    }
    handleReason (e) {
        this.setState({reason: e.target.value});
    }
    handleSend () {
        if (this.state.reason) this.props.onSend(this.state.reason);
    }
    handleKeyDown (e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.props.onClose();
            return;
        }
        if (e.key !== 'Tab' || !this.sheet) return;
        const items = Array.from(this.sheet.querySelectorAll(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
    render () {
        const {intl, message, status, variant, onClose} = this.props;
        const done = status === 'done';
        return (
            <div
                className={classNames(styles.sheetBackdrop, styles[`sheet-${variant}`])}
                data-chat-report-sheet
                onKeyDown={this.handleKeyDown}
            >
                <div
                    aria-labelledby="collab-chat-report-title"
                    aria-modal="true"
                    className={styles.sheet}
                    ref={this.setSheet}
                    role="dialog"
                >
                    <h3
                        className={styles.sheetTitle}
                        id="collab-chat-report-title"
                    >
                        {intl.formatMessage(messages.reportTitle)}
                    </h3>
                    <blockquote className={styles.quote}>
                        <span className={styles.quoteName}>{message.name}</span>
                        <span className={styles.quoteText}>{message.text}</span>
                    </blockquote>
                    {done ? (
                        <React.Fragment>
                            <p
                                className={styles.sheetDone}
                                role="status"
                            >
                                {intl.formatMessage(messages.reportDone)}
                            </p>
                            <div className={styles.sheetButtons}>
                                <button
                                    className={styles.primary}
                                    type="button"
                                    onClick={onClose}
                                >
                                    {intl.formatMessage(messages.ok)}
                                </button>
                            </div>
                        </React.Fragment>
                    ) : (
                        <React.Fragment>
                            <fieldset className={styles.reasons}>
                                <legend className={styles.legend}>{intl.formatMessage(messages.reportWhy)}</legend>
                                {REASONS.map(r => (
                                    <label
                                        className={classNames(styles.reason, {
                                            [styles.reasonPicked]: this.state.reason === r.id
                                        })}
                                        key={r.id}
                                    >
                                        <input
                                            checked={this.state.reason === r.id}
                                            className={styles.radio}
                                            name="collab-chat-report-reason"
                                            type="radio"
                                            value={r.id}
                                            onChange={this.handleReason}
                                        />
                                        <span>{intl.formatMessage(r.label)}</span>
                                    </label>
                                ))}
                            </fieldset>
                            {status === 'error' ? (
                                <p
                                    className={styles.blocked}
                                    role="alert"
                                >
                                    {intl.formatMessage(messages.reportError)}
                                </p>
                            ) : null}
                            <div className={styles.sheetButtons}>
                                <button
                                    className={styles.secondary}
                                    type="button"
                                    onClick={onClose}
                                >
                                    {intl.formatMessage(messages.cancel)}
                                </button>
                                <button
                                    className={styles.primary}
                                    data-chat-report-send
                                    disabled={!this.state.reason || status === 'sending'}
                                    type="button"
                                    onClick={this.handleSend}
                                >
                                    {intl.formatMessage(status === 'sending' ?
                                        messages.reportSending : messages.reportSend)}
                                </button>
                            </div>
                        </React.Fragment>
                    )}
                </div>
            </div>
        );
    }
}

ReportSheet.propTypes = {
    intl: intlShape.isRequired,
    message: PropTypes.shape({
        name: PropTypes.string,
        text: PropTypes.string
    }).isRequired,
    onClose: PropTypes.func.isRequired,
    onSend: PropTypes.func.isRequired,
    status: PropTypes.oneOf(['idle', 'sending', 'error', 'done']),
    variant: PropTypes.oneOf(['desktop', 'pane'])
};

export default injectIntl(ReportSheet);
