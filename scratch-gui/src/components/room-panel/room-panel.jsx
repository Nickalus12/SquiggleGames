import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';

import overlay from '../../lib/collab/overlay';
import client from '../../lib/collab/client';
import chatRoom from '../../lib/collab/chat-room';
import syncRoom from '../../lib/collab/sync-room.js';
import {createInvite, listProjects} from '../../lib/collab/room-api.js';
import ChatPanel from '../collab-chat/chat-panel.jsx';
import messages, {colorMessages, shapeMessages} from './room-panel-messages.js';
import styles from './room-panel.css';

const ROLES = {
    owner: messages.roleOwner,
    editor: messages.roleEditor,
    viewer: messages.roleViewer,
    guest: messages.roleGuest
};

const PeerMark = ({style, size}) => (style ? (
    <svg
        aria-hidden="true"
        className={styles.mark}
        height={size}
        viewBox="0 0 20 20"
        width={size}
    >
        <path
            d={style.d}
            fill={style.hex}
            fillRule={style.fillRule}
            stroke="var(--sq-panel, #ffffff)"
            strokeWidth="1.2"
        />
    </svg>
) : <span className={styles.markEmpty} />);

PeerMark.propTypes = {
    size: PropTypes.number,
    style: PropTypes.shape({d: PropTypes.string, fillRule: PropTypes.string, hex: PropTypes.string})
};

PeerMark.defaultProps = {size: 18};

const STATUS_KEYS = {synced: 'live', syncing: 'syncing', reconnecting: 'reconnecting', offline: 'offline'};

class RoomPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChange', 'handleChat', 'handleCopy', 'handleInvite', 'handleFollow', 'handleMute',
            'handleHide', 'handleSave', 'handleSaveName', 'handleSaveKey', 'handleOpenProject', 'handleSync',
            'handleFallbackFocus'
        ]);
        this.state = Object.assign({}, overlay.getState(), {
            chat: chatRoom.getState(),
            sync: syncRoom.getState(),
            copied: null,
            fallback: null,
            inviteError: false,
            saveName: '',
            confirmOpenId: null
        });
    }
    componentDidMount () {
        this.unsubscribe = overlay.subscribe(this.handleChange);
        this.unsubscribeChat = chatRoom.subscribe(this.handleChat);
        this.unsubscribeSync = syncRoom.subscribe(this.handleSync);
        this.handleChange();
        listProjects().then(list => overlay.setProjects(list))
            .catch(() => {});
    }
    componentWillUnmount () {
        if (this.unsubscribe) this.unsubscribe();
        if (this.unsubscribeChat) this.unsubscribeChat();
        if (this.unsubscribeSync) this.unsubscribeSync();
        clearTimeout(this.copiedTimer);
    }
    handleChange () {
        this.setState(overlay.getState());
    }
    handleChat () {
        this.setState({chat: chatRoom.getState()});
    }
    handleSync (sync) {
        this.setState({sync});
    }
    copy (link, which) {
        const done = () => {
            this.setState({copied: which});
            clearTimeout(this.copiedTimer);
            this.copiedTimer = setTimeout(() => this.setState({copied: null}), 1800);
        };
        const ask = () => this.setState({fallback: link});
        try {
            navigator.clipboard.writeText(link).then(done, ask);
        } catch (e) {
            ask();
        }
    }
    handleFallbackFocus (e) {
        e.target.select();
    }
    handleCopy () {
        const self = this.state.self;
        if (self) this.copy(`${location.origin}/editor.html?room=${encodeURIComponent(self.room)}`, 'room');
    }
    handleInvite () {
        const self = this.state.self;
        if (!self) return;
        this.setState({inviteError: false});
        createInvite(self.room, {})
            .then(out => {
                if (!out || typeof out.url !== 'string') throw new Error('no-url');
                this.copy(`${location.origin}${out.url}`, 'invite');
            })
            .catch(() => this.setState({inviteError: true}));
    }
    handleFollow (e) {
        const id = e.currentTarget.getAttribute('data-peer-id');
        const peer = this.state.peers.find(p => String(p.id) === id);
        if (!peer) return;
        if (peer.following) overlay.stopFollowing();
        else overlay.startFollowing(peer.id);
    }
    handleMute (e) {
        const userId = Number(e.currentTarget.getAttribute('data-user-id'));
        chatRoom.setMuted(userId, !chatRoom.isMuted(userId));
    }
    handleHide (e) {
        const userId = Number(e.currentTarget.getAttribute('data-user-id'));
        chatRoom.setHidden(userId, this.state.chat.hidden.indexOf(userId) === -1);
    }
    handleSaveName (e) {
        this.setState({saveName: e.target.value});
    }
    handleSaveKey (e) {
        if (e.key === 'Enter') this.handleSave();
    }
    handleSave () {
        const name = this.state.saveName.trim();
        if (!name) return;
        client.send({type: 'save-project', name});
        this.setState({saveName: ''});
    }
    handleOpenProject (e) {
        const id = e.currentTarget.getAttribute('data-project-id');
        if (this.state.confirmOpenId === id) {
            client.send({type: 'load-project', id});
            this.setState({confirmOpenId: null});
            if (this.props.onClose) this.props.onClose();
        } else {
            this.setState({confirmOpenId: id});
        }
    }
    say (descriptor, values) {
        return this.props.intl.formatMessage(descriptor, values);
    }
    styleName (style) {
        if (!style) return '';
        return `${this.say(colorMessages[style.color])} ${this.say(shapeMessages[style.shape])}`;
    }
    roleName (role) {
        return this.say(ROLES[role] || ROLES.editor);
    }
    renderStatus () {
        const {sync} = this.state;
        const key = STATUS_KEYS[sync.kind] || 'reconnecting';
        return (
            <span
                className={classNames(styles.status, styles[key])}
                data-room-status={key}
                role="status"
            >
                <span className={styles.statusDot} />
                {this.say(messages[key], {count: sync.pending})}
            </span>
        );
    }
    renderChatControls (peer) {
        const {config, hidden, mutedUserIds} = this.state.chat;
        if (!config || typeof peer.userId !== 'number') return null;
        const muted = mutedUserIds.indexOf(peer.userId) !== -1;
        const isHidden = hidden.indexOf(peer.userId) !== -1;
        return (
            <React.Fragment>
                {config.canModerate ? (
                    <button
                        aria-label={this.say(muted ? messages.unmuteLabel : messages.muteLabel, {name: peer.name})}
                        aria-pressed={muted}
                        className={classNames(styles.chip, {[styles.chipOn]: muted})}
                        data-chat-mute={peer.userId}
                        data-user-id={peer.userId}
                        type="button"
                        onClick={this.handleMute}
                    >
                        {this.say(muted ? messages.unmute : messages.mute)}
                    </button>
                ) : null}
                <button
                    aria-label={this.say(isHidden ? messages.showLabel : messages.hideLabel, {name: peer.name})}
                    aria-pressed={isHidden}
                    className={classNames(styles.chip, {[styles.chipOn]: isHidden})}
                    data-chat-hide={peer.userId}
                    data-user-id={peer.userId}
                    type="button"
                    onClick={this.handleHide}
                >
                    {this.say(isHidden ? messages.show : messages.hide)}
                </button>
            </React.Fragment>
        );
    }
    renderPeer (p) {
        return (
            <li
                className={styles.person}
                data-room-peer={p.id}
                key={p.id}
            >
                <PeerMark style={p.style} />
                <span className={styles.personText}>
                    <span className={styles.name}>{p.name}</span>
                    <span className={styles.meta}>
                        {[this.roleName(p.role), this.styleName(p.style), p.sprite].filter(Boolean).join(' · ')}
                    </span>
                </span>
                <span className={styles.actions}>
                    <button
                        aria-label={this.say(p.following ? messages.stopFollowLabel : messages.followLabel,
                            {name: p.name})}
                        aria-pressed={p.following}
                        className={classNames(styles.chip, {[styles.chipOn]: p.following})}
                        data-peer-id={p.id}
                        data-room-follow={p.id}
                        type="button"
                        onClick={this.handleFollow}
                    >
                        {this.say(p.following ? messages.following : messages.follow)}
                    </button>
                    {this.renderChatControls(p)}
                </span>
            </li>
        );
    }
    renderLibrary () {
        const projects = this.state.projects || [];
        const name = this.state.saveName.trim();
        return (
            <section className={styles.section}>
                <h3 className={styles.label}>{this.say(messages.library)}</h3>
                <div className={styles.saveRow}>
                    <input
                        aria-label={this.say(messages.saveName)}
                        className={styles.input}
                        placeholder={this.say(messages.saveName)}
                        type="text"
                        value={this.state.saveName}
                        onChange={this.handleSaveName}
                        onKeyDown={this.handleSaveKey}
                    />
                    <button
                        className={styles.button}
                        disabled={!name}
                        type="button"
                        onClick={this.handleSave}
                    >
                        {this.say(messages.save)}
                    </button>
                </div>
                {projects.length ? (
                    <ul className={styles.projects}>
                        {projects.map(p => {
                            const confirming = this.state.confirmOpenId === String(p.id);
                            return (
                                <li
                                    className={styles.project}
                                    key={p.id}
                                >
                                    <span className={styles.personText}>
                                        <span className={styles.name}>{p.name}</span>
                                        <span className={styles.meta}>
                                            {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : ''}
                                        </span>
                                    </span>
                                    <button
                                        className={classNames(styles.chip, {[styles.chipWarn]: confirming})}
                                        data-project-id={String(p.id)}
                                        title={this.say(messages.openHelp)}
                                        type="button"
                                        onClick={this.handleOpenProject}
                                    >
                                        {this.say(confirming ? messages.openConfirm : messages.open)}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : <p className={styles.help}>{this.say(messages.saveHelp)}</p>}
            </section>
        );
    }
    render () {
        const {self, selfStyle, peers, chat, copied, inviteError} = this.state;
        if (!self) return null;
        const pane = this.props.variant === 'pane';
        const locked = !!(chat.config && chat.config.locked);
        const owner = self.role === 'owner';
        return (
            <div
                className={classNames(styles.panel, {[styles.pane]: pane})}
                data-room-panel={this.props.variant}
            >
                <header className={styles.header}>
                    <div className={styles.headRow}>
                        <h2
                            className={styles.title}
                            id={this.props.titleId}
                            title={self.title || self.room}
                        >
                            {self.title || self.room}
                        </h2>
                        {this.renderStatus()}
                        {this.props.onClose ? (
                            <button
                                aria-label={this.say(messages.close)}
                                className={styles.close}
                                type="button"
                                onClick={this.props.onClose}
                            >
                                <svg
                                    aria-hidden="true"
                                    height="16"
                                    viewBox="0 0 16 16"
                                    width="16"
                                >
                                    <path
                                        d="M4 4l8 8M12 4l-8 8"
                                        stroke="currentColor"
                                        strokeLinecap="round"
                                        strokeWidth="2"
                                    />
                                </svg>
                            </button>
                        ) : null}
                    </div>
                    {locked ? (
                        <span
                            className={styles.lockChip}
                            data-room-lock
                            title={this.say(messages.lockHelp)}
                        >
                            {this.say(messages.lockChip)}
                            <span className={styles.srOnly}>{`. ${this.say(messages.lockHelp)}`}</span>
                        </span>
                    ) : null}
                    <div className={styles.inviteRow}>
                        <button
                            className={classNames(styles.button, styles.primary)}
                            data-room-copy
                            type="button"
                            onClick={this.handleCopy}
                        >
                            {this.say(copied === 'room' ? messages.copied : messages.copyLink)}
                        </button>
                        {owner ? (
                            <button
                                className={styles.button}
                                data-room-invite
                                type="button"
                                onClick={this.handleInvite}
                            >
                                {this.say(copied === 'invite' ? messages.copied : messages.makeInvite)}
                            </button>
                        ) : null}
                    </div>
                    {this.state.fallback ? (
                        <label className={styles.fallback}>
                            <span>{this.say(messages.copyPrompt)}</span>
                            <input
                                autoFocus
                                readOnly
                                className={styles.input}
                                type="text"
                                value={this.state.fallback}
                                onFocus={this.handleFallbackFocus}
                            />
                        </label>
                    ) : null}
                    {inviteError ? <p
                        className={styles.error}
                        role="alert"
                    >{this.say(messages.inviteFailed)}</p> : null}
                </header>
                {pane ? <ChatPanel variant="pane" /> : null}
                <section
                    className={styles.section}
                    data-room-people
                >
                    <h3 className={styles.label}>{this.say(messages.people, {count: 1 + peers.length})}</h3>
                    <ul className={styles.people}>
                        <li className={styles.person}>
                            <PeerMark style={selfStyle} />
                            <span className={styles.personText}>
                                <span className={styles.name}>
                                    {self.name}
                                    <span className={styles.you}>{` (${this.say(messages.you)})`}</span>
                                </span>
                                <span className={styles.meta}>
                                    {[this.roleName(self.role), this.styleName(selfStyle)].filter(Boolean).join(' · ')}
                                </span>
                            </span>
                        </li>
                        {peers.map(p => this.renderPeer(p))}
                    </ul>
                    {peers.length ? null : <p className={styles.help}>{this.say(messages.alone)}</p>}
                </section>
                <section className={styles.section}>
                    <button
                        className={classNames(styles.button, styles.wide)}
                        data-room-history
                        type="button"
                        onClick={this.props.onOpenHistory}
                    >
                        {this.say(messages.history)}
                    </button>
                </section>
                {self.canEdit === false ? null : this.renderLibrary()}
            </div>
        );
    }
}

RoomPanel.propTypes = {
    intl: intlShape.isRequired,
    onClose: PropTypes.func,
    onOpenHistory: PropTypes.func,
    titleId: PropTypes.string,
    variant: PropTypes.oneOf(['sheet', 'pane'])
};

RoomPanel.defaultProps = {
    variant: 'sheet'
};

export {PeerMark};
export default injectIntl(RoomPanel);
