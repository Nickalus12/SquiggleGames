import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';

import poller, {messagesUrl} from '../../lib/messages-unread';
import format from '../../lib/collab/chat-format';
import messages from './chat-messages';

import styles from './collab-chat.css';

class MessagesButton extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handlePoll'
        ]);
        this.state = poller ? poller.getState() : {available: false, unread: 0};
    }
    componentDidMount () {
        if (!poller) return;
        this.unsubscribe = poller.subscribe(this.handlePoll);
        poller.start();
    }
    componentWillUnmount () {
        if (!poller) return;
        if (this.unsubscribe) this.unsubscribe();
        poller.stop();
    }
    handlePoll () {
        this.setState(poller.getState());
    }
    render () {
        const {intl, sheet} = this.props;
        const {available, unread} = this.state;
        if (!available) return null;
        const count = format.badgeCount(unread);
        const label = intl.formatMessage(messages.messages);
        return (
            <div
                className={classNames(styles.messagesItem, {[styles.messagesSheet]: sheet})}
            >
                <a
                    aria-label={unread ? intl.formatMessage(messages.messagesUnread, {n: unread}) : label}
                    className={styles.messagesLink}
                    data-messages-button
                    href={messagesUrl()}
                    rel="noopener noreferrer"
                    target="_blank"
                    title={label}
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                    >
                        <path
                            d="M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                        />
                    </svg>
                    {sheet ? <span>{label}</span> : null}
                    {count ? (
                        <span
                            aria-hidden="true"
                            className={styles.count}
                        >
                            {count}
                        </span>
                    ) : null}
                </a>
            </div>
        );
    }
}

MessagesButton.propTypes = {
    intl: intlShape.isRequired,
    sheet: PropTypes.bool
};

export default injectIntl(MessagesButton);
