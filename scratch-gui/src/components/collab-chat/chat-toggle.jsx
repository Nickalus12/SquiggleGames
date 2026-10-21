import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';

import chatRoom from '../../lib/collab/chat-room';
import format from '../../lib/collab/chat-format';
import messages from './chat-messages';
import ChatPanel from './chat-panel.jsx';

import styles from './collab-chat.css';

class ChatToggle extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleStore',
            'handleToggle',
            'handleClose',
            'setButton'
        ]);
        const {config, unread} = chatRoom.getState();
        this.state = {ready: !!config, unread, open: false};
    }
    componentDidMount () {
        this.unsubscribe = chatRoom.subscribe(this.handleStore);
    }
    componentWillUnmount () {
        if (this.unsubscribe) this.unsubscribe();
    }
    setButton (el) {
        this.button = el;
    }
    handleStore () {
        const {config, unread} = chatRoom.getState();
        if (!!config !== this.state.ready || unread !== this.state.unread) {
            this.setState({ready: !!config, unread, open: config ? this.state.open : false});
        }
    }
    handleToggle () {
        this.setState(s => ({open: !s.open}));
    }
    handleClose () {
        this.setState({open: false}, () => {
            if (this.button) this.button.focus();
        });
    }
    render () {
        const {intl} = this.props;
        const {ready, unread, open} = this.state;
        if (!ready) return null;
        const count = format.badgeCount(unread);
        return (
            <React.Fragment>
                <button
                    aria-expanded={open}
                    aria-label={unread ?
                        intl.formatMessage(messages.openUnread, {n: unread}) :
                        intl.formatMessage(open ? messages.close : messages.open)}
                    className={classNames(styles.toggle, {[styles.toggleOpen]: open})}
                    data-chat-toggle
                    ref={this.setButton}
                    title={intl.formatMessage(open ? messages.close : messages.open)}
                    type="button"
                    onClick={this.handleToggle}
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                    >
                        <path
                            d="M4 5h16v11H9l-5 4z"
                            fill="none"
                            stroke="currentColor"
                            strokeLinejoin="round"
                            strokeWidth="2"
                        />
                    </svg>
                    {count ? (
                        <span
                            aria-hidden="true"
                            className={styles.count}
                        >
                            {count}
                        </span>
                    ) : null}
                </button>
                {open ? (
                    <ChatPanel
                        variant="desktop"
                        onClose={this.handleClose}
                    />
                ) : null}
            </React.Fragment>
        );
    }
}

ChatToggle.propTypes = {
    intl: intlShape.isRequired
};

export default injectIntl(ChatToggle);
