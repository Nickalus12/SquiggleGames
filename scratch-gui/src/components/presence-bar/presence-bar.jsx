import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import chatRoom from '../../lib/collab/chat-room';
import {PHRASES} from '../../lib/collab/quick-phrases.js';
import {openRoomPanel} from '../../reducers/room-panel';
import {PeerMark} from '../room-panel/room-panel.jsx';
import roomMessages from '../room-panel/room-panel-messages.js';
import styles from './presence-bar.css';

const SHOWN = 4;

const messages = defineMessages({
    bar: {id: 'sq.presenceBar.label', defaultMessage: 'People in this room', description: 'Presence bar label'},
    count: {
        id: 'sq.presenceBar.count',
        defaultMessage: '{count, plural, one {# person} other {# people}} here. Open the room panel.',
        description: 'Presence bar count button label'
    },
    more: {id: 'sq.presenceBar.more', defaultMessage: '+{count}', description: 'More peers than shown'},
    phrases: {id: 'sq.presenceBar.phrases', defaultMessage: 'Say something', description: 'Quick phrase button'},
    wait: {
        id: 'sq.presenceBar.wait',
        defaultMessage: 'Wait a moment, then send another.',
        description: 'Shown when quick phrases are sent too fast'
    }
});

class PresenceBar extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChange', 'handleChat', 'handleFollow', 'handlePhrasesToggle', 'handlePhrase',
            'handleKeyDown', 'handleDocumentDown', 'setRoot', 'setToggle'
        ]);
        this.state = Object.assign({}, props.overlay.getState(), {
            locked: this.isLocked(),
            picking: false,
            waiting: false
        });
    }
    componentDidMount () {
        this.unsubscribe = this.props.overlay.subscribe(this.handleChange);
        this.unsubscribeChat = chatRoom.subscribe(this.handleChat);
        document.addEventListener('mousedown', this.handleDocumentDown, true);
    }
    componentWillUnmount () {
        if (this.unsubscribe) this.unsubscribe();
        if (this.unsubscribeChat) this.unsubscribeChat();
        document.removeEventListener('mousedown', this.handleDocumentDown, true);
        clearTimeout(this.waitTimer);
    }
    isLocked () {
        const config = chatRoom.getState().config;
        return !!(config && config.locked);
    }
    handleChange () {
        this.setState(this.props.overlay.getState());
    }
    handleChat () {
        const locked = this.isLocked();
        if (locked && !this.state.locked) {
            this.props.overlay.toast(this.props.intl.formatMessage(roomMessages.lockHelp), 'var(--sq-info, #0a7089)');
        }
        if (locked !== this.state.locked) this.setState({locked});
    }
    handleFollow (e) {
        const id = e.currentTarget.getAttribute('data-peer-id');
        const peer = this.state.peers.find(p => String(p.id) === id);
        if (!peer) return;
        if (peer.following) this.props.overlay.stopFollowing();
        else this.props.overlay.startFollowing(peer.id);
    }
    handlePhrasesToggle () {
        this.setState(s => ({picking: !s.picking, waiting: false}));
    }
    handlePhrase (e) {
        const id = e.currentTarget.getAttribute('data-phrase');
        if (this.props.overlay.sendPhrase(id)) {
            this.setState({picking: false, waiting: false});
            if (this.toggle) this.toggle.focus();
            return;
        }
        this.setState({waiting: true});
        clearTimeout(this.waitTimer);
        this.waitTimer = setTimeout(() => this.setState({waiting: false}),
            Math.max(800, this.props.overlay.phraseWaitMs()));
    }
    handleKeyDown (e) {
        if (e.key === 'Escape' && this.state.picking) {
            e.stopPropagation();
            this.setState({picking: false});
            if (this.toggle) this.toggle.focus();
        }
    }
    handleDocumentDown (e) {
        if (this.state.picking && this.root && !this.root.contains(e.target)) this.setState({picking: false});
    }
    setRoot (el) {
        this.root = el;
    }
    setToggle (el) {
        this.toggle = el;
    }
    renderPicker () {
        const {intl} = this.props;
        return (
            <div
                className={styles.picker}
                id="sq-presence-phrases"
                role="group"
                aria-label={intl.formatMessage(messages.phrases)}
            >
                {this.state.waiting ? (
                    <p
                        className={styles.wait}
                        role="status"
                    >
                        {intl.formatMessage(messages.wait)}
                    </p>
                ) : null}
                <div className={styles.grid}>
                    {PHRASES.map(p => (
                        <button
                            className={styles.phrase}
                            data-phrase={p.id}
                            key={p.id}
                            type="button"
                            onClick={this.handlePhrase}
                        >
                            {intl.formatMessage(p.message)}
                        </button>
                    ))}
                </div>
            </div>
        );
    }
    render () {
        const {self, peers, selfStyle} = this.state;
        if (!self) return null;
        const {intl} = this.props;
        const shown = peers.slice(0, SHOWN);
        const extra = peers.length - shown.length;
        return (
            <div
                aria-label={intl.formatMessage(messages.bar)}
                className={styles.bar}
                data-presence-bar
                ref={this.setRoot}
                role="toolbar"
                onKeyDown={this.handleKeyDown}
            >
                <ul className={styles.avatars}>
                    {shown.map(p => (
                        <li key={p.id}>
                            <button
                                aria-label={intl.formatMessage(p.following ?
                                    roomMessages.stopFollowLabel : roomMessages.followLabel, {name: p.name})}
                                aria-pressed={p.following}
                                className={classNames(styles.avatar, {[styles.following]: p.following})}
                                data-peer-id={p.id}
                                style={p.style ? {background: p.style.hex, color: p.style.ink} : null}
                                title={p.name}
                                type="button"
                                onClick={this.handleFollow}
                            >
                                <span aria-hidden="true">{p.initials}</span>
                                <span className={styles.badge}>
                                    <PeerMark
                                        size={10}
                                        style={p.style}
                                    />
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
                <button
                    aria-label={intl.formatMessage(messages.count, {count: 1 + peers.length})}
                    className={styles.count}
                    data-presence-count
                    type="button"
                    onClick={this.props.onOpenRoom}
                >
                    <PeerMark
                        size={12}
                        style={selfStyle}
                    />
                    <span aria-hidden="true">
                        {extra > 0 ? intl.formatMessage(messages.more, {count: extra}) : 1 + peers.length}
                    </span>
                </button>
                {this.state.locked ? (
                    <span
                        className={styles.lock}
                        data-presence-lock
                        title={intl.formatMessage(roomMessages.lockHelp)}
                    >
                        {intl.formatMessage(roomMessages.lockChip)}
                    </span>
                ) : null}
                <span className={styles.phraseWrap}>
                    <button
                        aria-controls="sq-presence-phrases"
                        aria-expanded={this.state.picking}
                        className={classNames(styles.count, {[styles.active]: this.state.picking})}
                        data-presence-phrases
                        ref={this.setToggle}
                        type="button"
                        onClick={this.handlePhrasesToggle}
                    >
                        {intl.formatMessage(messages.phrases)}
                    </button>
                    {this.state.picking ? this.renderPicker() : null}
                </span>
            </div>
        );
    }
}

PresenceBar.propTypes = {
    intl: intlShape.isRequired,
    onOpenRoom: PropTypes.func.isRequired,
    overlay: PropTypes.shape({
        getState: PropTypes.func,
        phraseWaitMs: PropTypes.func,
        sendPhrase: PropTypes.func,
        startFollowing: PropTypes.func,
        stopFollowing: PropTypes.func,
        subscribe: PropTypes.func,
        toast: PropTypes.func
    }).isRequired
};

const mapDispatchToProps = dispatch => ({
    onOpenRoom: () => dispatch(openRoomPanel())
});

export default connect(null, mapDispatchToProps)(injectIntl(PresenceBar));
