import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';

import chatRoom, {reportMessage} from '../../lib/collab/chat-room';
import chat from '../../lib/collab/chat';
import format from '../../lib/collab/chat-format';
import overlay from '../../lib/collab/overlay';
import messages from './chat-messages';
import ReportSheet from './report-sheet.jsx';

import styles from './collab-chat.css';

const SURFACE = '#161c36';
const BOTTOM_SLACK = 32;
const KEYBOARD_GAP = 120;
const GROUP_MS = 2 * 60 * 1000;
const COUNTER_FROM = 250;
const TICK_MS = 30 * 1000;
const MIN_DOCK_HEIGHT = 340;

const isBigEmoji = m => !!m.phrase && m.text.length <= 8 && !/[A-Za-z0-9]/.test(m.text);

const prefersReducedMotion = () => {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;
    }
};

class ChatPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleStore',
            'handleOverlay',
            'handleScroll',
            'handleJump',
            'handleText',
            'handleKeyDown',
            'handleSubmit',
            'handlePhrase',
            'handleKeepFocus',
            'handleFocus',
            'handleBlur',
            'handleViewport',
            'handleDone',
            'handleSwitch',
            'handleMore',
            'handleAction',
            'handleReportClose',
            'handleReportSend',
            'handlePanelKeyDown',
            'handleResize',
            'setList',
            'setInput',
            'setRoot'
        ]);
        this.state = {
            chat: chatRoom.getState(),
            connected: overlay.getState().connected,
            peers: overlay.getState().peers,
            now: Date.now(),
            text: '',
            menuFor: null,
            reportFor: null,
            reportStatus: 'idle',
            newPill: false,
            announce: '',
            typing: false,
            keyboard: null,
            dock: null
        };
        this.viewerKey = {};
        this.baseline = 0;
    }
    componentDidMount () {
        this.unsubscribe = chatRoom.subscribe(this.handleStore);
        this.unsubscribeOverlay = overlay.subscribe(this.handleOverlay);
        chatRoom.setVisible(this.viewerKey, true);
        this.tick = setInterval(() => this.setState({now: Date.now()}), TICK_MS);
        this.scrollToBottom(false);
        const vv = window.visualViewport;
        if (this.props.variant === 'pane' && vv) {
            this.baseline = vv.height;
            vv.addEventListener('resize', this.handleViewport);
            vv.addEventListener('scroll', this.handleViewport);
        }
        if (this.props.variant === 'desktop') {
            window.addEventListener('resize', this.handleResize);
            const target = document.querySelector('[class*="gui_target-wrapper"]');
            if (target && typeof ResizeObserver !== 'undefined') {
                this.observer = new ResizeObserver(this.handleResize);
                this.observer.observe(target);
            }
            this.handleResize();
            if (this.input) this.input.focus();
        }
    }
    componentWillUnmount () {
        if (this.unsubscribe) this.unsubscribe();
        if (this.unsubscribeOverlay) this.unsubscribeOverlay();
        chatRoom.setVisible(this.viewerKey, false);
        clearInterval(this.tick);
        const vv = window.visualViewport;
        if (vv) {
            vv.removeEventListener('resize', this.handleViewport);
            vv.removeEventListener('scroll', this.handleViewport);
        }
        window.removeEventListener('resize', this.handleResize);
        if (this.observer) this.observer.disconnect();
    }
    setList (el) {
        this.list = el;
    }
    setInput (el) {
        this.input = el;
    }
    setRoot (el) {
        this.root = el;
    }
    atBottom () {
        const el = this.list;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
    }
    scrollToBottom (smooth) {
        const el = this.list;
        if (!el) return;
        const top = el.scrollHeight;
        if (smooth && !prefersReducedMotion() && el.scrollTo) {
            el.scrollTo({top, behavior: 'smooth'});
        } else {
            el.scrollTop = top;
        }
    }
    visibleMessages (state) {
        return state.messages.filter(m => !chatRoom.isHidden(m));
    }
    handleStore () {
        const prev = this.state.chat;
        const next = chatRoom.getState();
        const stick = this.atBottom();
        const loaded = next.messages !== prev.messages && next.lastAdded === null;
        const added = next.lastAdded !== null && next.lastAdded !== prev.lastAdded ?
            next.messages.find(m => m.id === next.lastAdded) : null;
        const ownNew = !!added && chatRoom.isMine(added);
        const incoming = !!added && !ownNew && !chatRoom.isHidden(added);
        const patch = {chat: next};
        if (incoming) {
            patch.announce = this.props.intl.formatMessage(messages.announce, {name: added.name, text: added.text});
        }
        const restore = next.restoreText === null ? null : chatRoom.takeRestoreText();
        if (restore && !this.state.text) patch.text = restore;
        this.setState(patch, () => {
            if (loaded || ownNew || (incoming && stick)) {
                this.scrollToBottom(!loaded);
                if (this.state.newPill) this.setState({newPill: false});
            } else if (incoming) {
                this.setState({newPill: true});
            }
        });
    }
    handleOverlay () {
        const {connected, peers} = overlay.getState();
        if (connected !== this.state.connected || peers !== this.state.peers) this.setState({connected, peers});
    }
    handleScroll () {
        if (this.state.newPill && this.atBottom()) this.setState({newPill: false});
    }
    handleJump () {
        this.scrollToBottom(true);
        this.setState({newPill: false});
    }
    handleText (e) {
        this.setState({text: e.target.value.slice(0, chat.MAX_TEXT)});
        if (this.state.chat.blocked) chatRoom.clearBlocked();
    }
    handleKeyDown (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            this.handleSubmit();
        }
    }
    handleSubmit (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (chatRoom.sendText(this.state.text)) this.setState({text: ''});
        if (this.state.keyboard && this.input) this.input.focus();
    }
    handlePhrase (e) {
        chatRoom.sendPhrase(e.currentTarget.getAttribute('data-phrase'));
        if (this.state.keyboard && this.input) this.input.focus();
    }
    handleKeepFocus (e) {
        if (this.state.keyboard) e.preventDefault();
    }
    handleFocus () {
        this.setState({typing: true}, this.handleViewport);
    }
    handleBlur () {
        const vv = window.visualViewport;
        if (!vv || vv.height >= this.baseline - KEYBOARD_GAP) this.setState({typing: false, keyboard: null});
    }
    handleViewport () {
        const vv = window.visualViewport;
        if (!vv || this.props.variant !== 'pane') return;
        const focused = this.input && document.activeElement === this.input;
        const shrunk = vv.height < this.baseline - KEYBOARD_GAP;
        if (!shrunk && !focused) {
            this.baseline = vv.height;
            if (this.state.typing || this.state.keyboard) this.setState({typing: false, keyboard: null});
            return;
        }
        if (!shrunk) {
            this.baseline = Math.max(this.baseline, vv.height);
            if (this.state.keyboard) this.setState({keyboard: null});
            return;
        }
        if (!this.state.typing) return;
        const stick = this.atBottom();
        this.setState({keyboard: {top: vv.offsetTop, height: vv.height}}, () => {
            if (stick) this.scrollToBottom(false);
        });
    }
    handleDone () {
        if (this.input) this.input.blur();
        this.setState({typing: false, keyboard: null}, () => {
            if (this.root && this.root.scrollIntoView) this.root.scrollIntoView({block: 'nearest'});
        });
    }
    handleSwitch () {
        const config = this.state.chat.config;
        if (config) chatRoom.setOn(!config.on);
    }
    handleMore (e) {
        const id = e.currentTarget.getAttribute('data-chat-message-menu');
        this.setState(s => ({menuFor: s.menuFor === id ? null : id}));
    }
    findMessage (id) {
        return this.state.chat.messages.find(m => String(m.id) === String(id)) || null;
    }
    handleAction (e) {
        const action = e.currentTarget.getAttribute('data-chat-action');
        const m = this.findMessage(this.state.menuFor);
        if (m && action === 'report') {
            this.reportReturn = e.currentTarget.closest('li');
            this.setState({reportFor: m, reportStatus: 'idle'});
            return;
        }
        const patch = {menuFor: null};
        if (m && action === 'hide') {
            chatRoom.setHidden(m.userId, true);
            patch.announce = this.props.intl.formatMessage(messages.hidAnnounce, {name: m.name});
        }
        if (m && action === 'mute') chatRoom.setMuted(m.userId, !chatRoom.isMuted(m.userId));
        this.setState(patch);
    }
    handleReportClose () {
        const row = this.reportReturn;
        this.setState({reportFor: null, menuFor: null, reportStatus: 'idle'}, () => {
            const back = row && row.isConnected && row.querySelector('[data-chat-message-menu]');
            const target = back || this.input || this.list;
            if (target) target.focus();
        });
    }
    handleReportSend (reason) {
        const m = this.state.reportFor;
        if (!m || this.state.reportStatus === 'sending') return;
        this.setState({reportStatus: 'sending'});
        reportMessage(m.id, reason)
            .then(() => this.setState({reportStatus: 'done'}))
            .catch(() => this.setState({reportStatus: 'error'}));
    }
    handlePanelKeyDown (e) {
        if (e.key !== 'Escape') return;
        if (this.state.reportFor) return;
        if (this.state.menuFor) {
            this.setState({menuFor: null});
            return;
        }
        if (this.props.onClose) this.props.onClose();
    }
    handleResize () {
        const target = document.querySelector('[class*="gui_target-wrapper"]');
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const stick = !this.state.dock || this.atBottom();
        const settle = () => {
            if (stick) this.scrollToBottom(false);
        };
        if (!target) {
            this.setState({dock: {right: 8, bottom: 8, width: 340, height: Math.min(460, vh - 64)}}, settle);
            return;
        }
        const r = target.getBoundingClientRect();
        const bottom = Math.max(8, vh - r.bottom + 8);
        const top = Math.max(56, Math.min(r.top, vh - bottom - MIN_DOCK_HEIGHT));
        const width = Math.max(300, Math.min(380, r.width - 16));
        this.setState({dock: {top, bottom, width, right: Math.max(8, vw - r.right + 8)}}, settle);
    }
    timeLabel (ts) {
        const {intl} = this.props;
        const rel = format.relativeTime(ts, this.state.now);
        if (rel.unit === 'now') return intl.formatMessage(messages.now);
        if (rel.unit === 'min') return intl.formatMessage(messages.minAgo, {n: rel.n});
        if (rel.unit === 'hr') return intl.formatMessage(messages.hrAgo, {n: rel.n});
        return intl.formatMessage(messages.dayAgo, {n: rel.n});
    }
    renderMessage (m, prev) {
        const {intl} = this.props;
        const {chat: state, menuFor} = this.state;
        const mine = chatRoom.isMine(m);
        const grouped = !!prev && prev.userId === m.userId && chatRoom.isMine(prev) === mine &&
            m.ts - prev.ts < GROUP_MS;
        const reported = state.reported.indexOf(m.id) !== -1;
        const parts = format.splitMentions(m.text, state.selfHandle);
        const mentionsMe = !mine && parts.some(p => p.mention);
        const open = menuFor === String(m.id);
        const canModerate = !!(state.config && state.config.canModerate);
        const muted = chatRoom.isMuted(m.userId);
        return (
            <li
                className={classNames(styles.message, {
                    [styles.mine]: mine,
                    [styles.grouped]: grouped,
                    [styles.mentionsMe]: mentionsMe
                })}
                key={m.id}
            >
                {grouped ? null : (
                    <div className={styles.meta}>
                        <span
                            className={styles.name}
                            style={mine ? null : {color: format.readableColor(m.color, SURFACE)}}
                        >
                            {mine ? null : (
                                <span
                                    aria-hidden="true"
                                    className={styles.dot}
                                    style={{background: m.color || '#a3abc8'}}
                                />
                            )}
                            {mine ? intl.formatMessage(messages.you) : m.name}
                        </span>
                        <time
                            className={styles.time}
                            dateTime={new Date(m.ts).toISOString()}
                            title={new Date(m.ts).toLocaleString()}
                        >
                            {this.timeLabel(m.ts)}
                        </time>
                    </div>
                )}
                <div className={styles.bubbleRow}>
                    {reported ? (
                        <div className={classNames(styles.bubble, styles.reported)}>
                            {intl.formatMessage(messages.reportedNote)}
                        </div>
                    ) : (
                        <div className={classNames(styles.bubble, {[styles.bigEmoji]: isBigEmoji(m)})}>
                            {parts.map((p, i) => (p.mention ? (
                                <mark
                                    className={styles.mention}
                                    key={i}
                                >
                                    {p.text}
                                </mark>
                            ) : (
                                <React.Fragment key={i}>{p.text}</React.Fragment>
                            )))}
                        </div>
                    )}
                    {mine || reported ? null : (
                        <button
                            aria-expanded={open}
                            aria-label={intl.formatMessage(messages.more, {name: m.name})}
                            className={styles.more}
                            data-chat-message-menu={String(m.id)}
                            type="button"
                            onClick={this.handleMore}
                        >
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                            >
                                <circle
                                    cx="4"
                                    cy="10"
                                    r="1.8"
                                />
                                <circle
                                    cx="10"
                                    cy="10"
                                    r="1.8"
                                />
                                <circle
                                    cx="16"
                                    cy="10"
                                    r="1.8"
                                />
                            </svg>
                        </button>
                    )}
                </div>
                {open ? (
                    <div className={styles.actions}>
                        <button
                            className={styles.action}
                            data-chat-action="report"
                            type="button"
                            onClick={this.handleAction}
                        >
                            {intl.formatMessage(messages.report)}
                        </button>
                        {m.userId === null ? null : (
                            <button
                                className={styles.action}
                                data-chat-action="hide"
                                type="button"
                                onClick={this.handleAction}
                            >
                                {intl.formatMessage(messages.hide, {name: m.name})}
                            </button>
                        )}
                        {canModerate && m.userId !== null ? (
                            <button
                                className={classNames(styles.action, styles.actionWarn)}
                                data-chat-action="mute"
                                type="button"
                                onClick={this.handleAction}
                            >
                                {intl.formatMessage(muted ? messages.unmute : messages.mute, {name: m.name})}
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </li>
        );
    }
    renderPhraseButton (p, className) {
        return (
            <button
                className={className}
                data-phrase={p.id}
                key={p.id}
                type="button"
                onClick={this.handlePhrase}
                onMouseDown={this.handleKeepFocus}
            >
                {p.text}
            </button>
        );
    }
    renderComposer () {
        const {intl} = this.props;
        const {chat: state, connected, text, keyboard} = this.state;
        const config = state.config;
        if (!connected) return <p className={styles.notice}>{intl.formatMessage(messages.reconnecting)}</p>;
        if (!config.on) {
            return (
                <p className={styles.notice}>
                    {intl.formatMessage(config.canModerate ? messages.offOwner : messages.offEveryone)}
                </p>
            );
        }
        if (config.muted) return <p className={styles.notice}>{intl.formatMessage(messages.muted)}</p>;
        const blockedId = `collab-chat-blocked-${this.props.variant}`;
        const blocked = state.blocked ? (
            <p
                className={styles.blocked}
                id={blockedId}
                data-chat-blocked={state.blocked.reason}
                role="alert"
            >
                {state.blocked.message}
            </p>
        ) : null;
        const emoji = config.phrases.filter(p => !/[A-Za-z0-9]/.test(p.text));
        const words = config.phrases.filter(p => /[A-Za-z0-9]/.test(p.text));
        if (config.mode === 'quick') {
            return (
                <React.Fragment>
                    {blocked}
                    <p className={styles.hint}>{intl.formatMessage(messages.quickHint)}</p>
                    <div
                        aria-label={intl.formatMessage(messages.phrases)}
                        className={styles.picker}
                        data-chat-picker
                        role="group"
                    >
                        <div className={styles.emojiRow}>
                            {emoji.map(p => this.renderPhraseButton(p, styles.emojiButton))}
                        </div>
                        <div className={styles.phraseGrid}>
                            {words.map(p => this.renderPhraseButton(p, styles.phraseButton))}
                        </div>
                    </div>
                </React.Fragment>
            );
        }
        const roomForRow = !keyboard || keyboard.height > 300;
        const left = chat.MAX_TEXT - text.length;
        return (
            <React.Fragment>
                {blocked}
                {roomForRow ? (
                    <div
                        aria-label={intl.formatMessage(messages.phrases)}
                        className={styles.phraseRow}
                        role="group"
                    >
                        {emoji.concat(words.slice(0, 8)).map(p => this.renderPhraseButton(p, styles.chip))}
                    </div>
                ) : null}
                <form
                    className={styles.form}
                    onSubmit={this.handleSubmit}
                >
                    <input
                        aria-describedby={state.blocked ? blockedId : null}
                        aria-label={intl.formatMessage(messages.inputLabel)}
                        autoComplete="off"
                        className={styles.input}
                        data-chat-input
                        enterKeyHint="send"
                        maxLength={chat.MAX_TEXT}
                        placeholder={intl.formatMessage(messages.placeholder)}
                        ref={this.setInput}
                        type="text"
                        value={text}
                        onBlur={this.handleBlur}
                        onChange={this.handleText}
                        onFocus={this.handleFocus}
                        onKeyDown={this.handleKeyDown}
                    />
                    <button
                        className={styles.send}
                        disabled={!text.trim()}
                        type="submit"
                        onMouseDown={this.handleKeepFocus}
                    >
                        {intl.formatMessage(messages.send)}
                    </button>
                </form>
                {left <= chat.MAX_TEXT - COUNTER_FROM ? (
                    <p
                        aria-live="polite"
                        className={classNames(styles.counter, {[styles.counterLow]: left <= 20})}
                    >
                        {intl.formatMessage(messages.charsLeft, {n: left})}
                    </p>
                ) : null}
            </React.Fragment>
        );
    }
    render () {
        const {intl, variant, onClose} = this.props;
        const {chat: state, newPill, announce, keyboard, reportFor, reportStatus, dock} = this.state;
        const config = state.config;
        if (!config) return null;
        const shown = this.visibleMessages(state);
        const style = keyboard ? {top: `${keyboard.top}px`, height: `${keyboard.height}px`} :
            (variant === 'desktop' && dock ? {
                top: typeof dock.top === 'number' ? `${dock.top}px` : 'auto',
                bottom: `${dock.bottom}px`,
                right: `${dock.right}px`,
                width: `${dock.width}px`,
                height: dock.height ? `${dock.height}px` : 'auto'
            } : null);
        return (
            <section
                aria-label={intl.formatMessage(messages.title)}
                className={classNames(styles.panel, styles[variant], {[styles.keyboard]: !!keyboard})}
                data-chat-section
                ref={this.setRoot}
                style={style}
                onKeyDown={this.handlePanelKeyDown}
            >
                <header className={styles.head}>
                    <h2 className={styles.title}>{intl.formatMessage(messages.title)}</h2>
                    {config.canModerate ? (
                        <button
                            aria-checked={config.on}
                            aria-label={intl.formatMessage(messages.switchLabel)}
                            className={classNames(styles.switch, {[styles.switchOn]: config.on})}
                            data-chat-switch
                            role="switch"
                            type="button"
                            onClick={this.handleSwitch}
                        >
                            <span
                                aria-hidden="true"
                                className={styles.switchTrack}
                            >
                                <span className={styles.switchThumb} />
                            </span>
                            <span aria-hidden="true">
                                {intl.formatMessage(config.on ? messages.on : messages.off)}
                            </span>
                        </button>
                    ) : null}
                    {keyboard ? (
                        <button
                            className={styles.headButton}
                            type="button"
                            onClick={this.handleDone}
                        >
                            {intl.formatMessage(messages.done)}
                        </button>
                    ) : null}
                    {!keyboard && onClose ? (
                        <button
                            aria-label={intl.formatMessage(messages.close)}
                            className={styles.close}
                            data-chat-close
                            type="button"
                            onClick={onClose}
                        >
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    d="M5 5l10 10M15 5L5 15"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeWidth="2"
                                />
                            </svg>
                        </button>
                    ) : null}
                </header>
                <div className={styles.listWrap}>
                    <ol
                        aria-label={intl.formatMessage(messages.list)}
                        className={styles.list}
                        data-chat-list
                        ref={this.setList}
                        tabIndex={0}
                        onScroll={this.handleScroll}
                    >
                        {shown.length ? shown.map((m, i) => this.renderMessage(m, shown[i - 1])) : (
                            <li className={styles.empty}>{intl.formatMessage(messages.empty)}</li>
                        )}
                    </ol>
                    {newPill ? (
                        <button
                            className={styles.newPill}
                            data-chat-new-pill
                            type="button"
                            onClick={this.handleJump}
                        >
                            {intl.formatMessage(messages.newMessages)}
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    d="M10 4v11M5 10l5 5 5-5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                />
                            </svg>
                        </button>
                    ) : null}
                </div>
                <div className={styles.composer}>
                    {this.renderComposer()}
                </div>
                <div
                    aria-live="polite"
                    className={styles.srOnly}
                    role="status"
                >
                    {announce}
                </div>
                {reportFor ? (
                    <ReportSheet
                        message={reportFor}
                        status={reportStatus}
                        variant={variant}
                        onClose={this.handleReportClose}
                        onSend={this.handleReportSend}
                    />
                ) : null}
            </section>
        );
    }
}

ChatPanel.propTypes = {
    intl: intlShape.isRequired,
    onClose: PropTypes.func,
    variant: PropTypes.oneOf(['desktop', 'pane'])
};

export default injectIntl(ChatPanel);
