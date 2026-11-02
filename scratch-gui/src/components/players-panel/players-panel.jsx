import PropTypes from 'prop-types';
import React from 'react';
import {playerPeerStyle} from '../../lib/themes/peers.js';
import {
    RECONNECTING_TEXT,
    WEAK_TEXT,
    pingBucket,
    tickP95Band,
    tickP95Bucket
} from '../../lib/together2/buffer.js';
import {
    JOIN_AGAIN_TEXT,
    createToastQueue
} from '../../lib/together2/play-client.js';
import messages, {colorMessages, shapeMessages} from './players-panel-messages.js';
import styles from './players-panel.css';

const formatWord = (intl, descriptor, values) => {
    if (intl && typeof intl.formatMessage === 'function') {
        return intl.formatMessage(descriptor, values);
    }
    const text = descriptor && descriptor.defaultMessage ? descriptor.defaultMessage : '';
    if (!values) return text;
    return text.replace(/\{(\w+)\}/g, (all, key) => (key in values ? String(values[key]) : all));
};

const peerTitle = (intl, style) => {
    const colorEntry = colorMessages[style.color];
    const shapeEntry = shapeMessages[style.shape];
    if (!colorEntry || !shapeEntry) return style.name || '';
    return `${formatWord(intl, colorEntry)} ${formatWord(intl, shapeEntry)}`;
};

const formatPingText = (intl, bucket, pingMs) => {
    const descriptor = bucket === 'weak' ?
        messages.pingWeak :
        (bucket === 'ok' ? messages.pingOk : messages.pingGood);
    const word = formatWord(intl, descriptor);
    if (Number.isFinite(pingMs) && pingMs >= 0) {
        return `${word} · ${Math.round(pingMs)} ms`;
    }
    return word;
};

const formatTickHealth = (intl, health) => {
    if (!health || typeof health !== 'object' || !Number.isFinite(Number(health.tickP95))) return null;
    const tickP95 = Math.round(Number(health.tickP95));
    const tickP50 = Number.isFinite(Number(health.tickP50)) ? Math.round(Number(health.tickP50)) : null;
    const bucket = tickP95Bucket(tickP95);
    const band = tickP95Band(tickP95);
    let statusDesc = messages.tickP50Ok;
    if (band === 'p95') statusDesc = messages.tickP95Ok;
    else if (band === 'ceiling') statusDesc = messages.tickNearCeiling;
    else if (band === 'over') statusDesc = messages.tickOverCeiling;
    const statusText = formatWord(intl, statusDesc);
    const label = formatWord(intl, messages.serverTick, {ms: tickP95, status: statusText});
    return {
        tickP50,
        tickP95,
        bucket,
        band,
        statusText,
        label,
        lateTicks: Number.isFinite(Number(health.lateTicks)) ? Number(health.lateTicks) : 0,
        deadlineJumps: Number.isFinite(Number(health.deadlineJumps)) ? Number(health.deadlineJumps) : 0
    };
};

const buildPlayersRows = (players = [], meId = null, defaultRttMs = null, healthRtt = null) => {
    const seen = new Set();
    const rows = [];
    for (let i = 0; i < players.length; i++) {
        const raw = players[i];
        if (!raw) continue;
        const slot = Number.isFinite(Number(raw.id)) ? Number(raw.id) : i + 1;
        if (seen.has(slot)) continue;
        seen.add(slot);
        const style = playerPeerStyle(slot);
        const isYou = Boolean(raw.you || (meId !== null && Number(meId) === slot));
        const slotRtt = healthRtt && typeof healthRtt === 'object' && Number.isFinite(Number(healthRtt[slot])) ?
            Number(healthRtt[slot]) :
            null;
        let pingMs = null;
        if (Number.isFinite(raw.pingMs)) pingMs = raw.pingMs;
        else if (slotRtt !== null) pingMs = slotRtt;
        else if (isYou && Number.isFinite(defaultRttMs)) pingMs = defaultRttMs;
        const bucket = raw.ping === 'good' || raw.ping === 'ok' || raw.ping === 'weak' ?
            (slotRtt !== null && !Number.isFinite(raw.pingMs) ? pingBucket(pingMs) : raw.ping) :
            pingBucket(pingMs);
        rows.push({
            id: slot,
            name: String(raw.name || `Player ${slot}`),
            you: isYou,
            team: typeof raw.team === 'string' ? raw.team : '',
            pingMs,
            ping: bucket,
            color: raw.peerColor || style.color,
            shape: raw.shape || style.shape,
            peerName: raw.peerName || style.name,
            hex: raw.hex || style.hex,
            ink: raw.ink || style.ink,
            d: raw.d || style.d,
            fillRule: raw.fillRule || style.fillRule
        });
    }
    return rows;
};

const connectionBannerState = ({weakConnection = false, reconnecting = false, graceExpired = false}, intl) => {
    if (graceExpired) {
        return {
            kind: 'grace-expired',
            text: formatWord(intl, messages.connectionLost),
            actionLabel: formatWord(intl, messages.joinAgain) || JOIN_AGAIN_TEXT
        };
    }
    if (reconnecting) {
        return {
            kind: 'reconnecting',
            text: formatWord(intl, messages.reconnecting) || RECONNECTING_TEXT,
            actionLabel: ''
        };
    }
    if (weakConnection) {
        return {
            kind: 'weak',
            text: formatWord(intl, messages.weakConnection) || WEAK_TEXT,
            actionLabel: ''
        };
    }
    return null;
};

const PeerShapeSvg = ({row, title}) => (
    <svg
        aria-label={title}
        className={styles.glyph}
        data-peer-color={row.color}
        data-peer-shape={row.shape}
        role="img"
        viewBox="0 0 20 20"
    >
        <title>{title}</title>
        <path
            d={row.d}
            fill={row.hex}
            fillRule={row.fillRule}
            stroke="#ffffff"
            strokeWidth="1.2"
        />
    </svg>
);

PeerShapeSvg.propTypes = {
    row: PropTypes.shape({
        color: PropTypes.string,
        shape: PropTypes.string,
        d: PropTypes.string,
        hex: PropTypes.string,
        fillRule: PropTypes.string
    }).isRequired,
    title: PropTypes.string.isRequired
};

class PlayersPanel extends React.Component {
    constructor (props) {
        super(props);
        this.toastQueue = createToastQueue();
        this.toastTimer = null;
        this.state = {
            internalOpen: Boolean(props.defaultOpen),
            hostPlayers: null,
            hostMeId: null,
            hostRttMs: null,
            hostHealth: null,
            hostWeak: false,
            hostReconnecting: false,
            hostGraceExpired: false,
            toastText: props.toastText || ''
        };
        this.handleToggle = this.handleToggle.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleJoinAgain = this.handleJoinAgain.bind(this);
        this.handleWindowMessage = this.handleWindowMessage.bind(this);
    }

    componentDidMount () {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('message', this.handleWindowMessage);
        }
    }

    componentWillUnmount () {
        if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('message', this.handleWindowMessage);
        }
        if (this.toastTimer) clearTimeout(this.toastTimer);
    }

    showToast (text) {
        if (!text) return;
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.setState({toastText: text});
        this.toastTimer = setTimeout(() => {
            this.toastTimer = null;
            this.setState({toastText: ''});
        }, 2000);
    }

    handleWindowMessage (event) {
        if (typeof window === 'undefined' || event.origin !== window.location.origin) return;
        const data = event && event.data;
        if (!data || data.source !== 'squiggle-coplay') return;
        const detail = data.detail || {};
        if (data.event === 'roster') {
            this.setState({
                hostPlayers: Array.isArray(detail.players) ? detail.players : [],
                hostMeId: detail.me && Number.isFinite(detail.me.id) ? detail.me.id : null,
                hostHealth: detail.health && typeof detail.health === 'object' ?
                    detail.health :
                    this.state.hostHealth
            });
        } else if (data.event === 'health' && detail && typeof detail === 'object') {
            this.setState({hostHealth: detail});
        } else if (data.event === 'latency' && Number.isFinite(detail.ms)) {
            this.setState({hostRttMs: detail.ms, hostWeak: detail.ms > 150});
        } else if (data.event === 'status') {
            this.setState({
                hostReconnecting: detail.connected === false,
                hostGraceExpired: detail.connected === true ? false : this.state.hostGraceExpired
            });
        } else if (data.event === 'toast' && detail.text) {
            this.showToast(detail.text);
        } else if (data.event === 'reconnected') {
            this.setState({hostReconnecting: false, hostGraceExpired: false});
            if (detail.text) this.showToast(detail.text);
        } else if (data.event === 'reconnect-prompt') {
            this.setState({hostGraceExpired: true, hostReconnecting: false});
        }
    }

    handleToggle () {
        if (typeof this.props.onToggle === 'function') {
            this.props.onToggle();
            return;
        }
        this.setState(prev => ({internalOpen: !prev.internalOpen}));
    }

    handleClose () {
        if (typeof this.props.onClose === 'function') {
            this.props.onClose();
            return;
        }
        this.setState({internalOpen: false});
    }

    handleJoinAgain () {
        this.setState({hostGraceExpired: false, hostReconnecting: true});
        if (typeof this.props.onJoinAgain === 'function') {
            this.props.onJoinAgain();
            return;
        }
        if (typeof window !== 'undefined') {
            try {
                window.postMessage({source: 'squiggle-coplay-host', action: 'join-again'}, window.location.origin);
            } catch (e) {
                return;
            }
        }
    }

    render () {
        const {
            intl,
            open,
            players,
            meId,
            rttMs,
            health,
            weakConnection,
            reconnecting,
            graceExpired,
            toastText
        } = this.props;
        const isOpen = typeof open === 'boolean' ? open : this.state.internalOpen;
        const resolvedPlayers = Array.isArray(players) ? players : (this.state.hostPlayers || []);
        const resolvedMeId = meId !== null && typeof meId !== 'undefined' ? meId : this.state.hostMeId;
        const resolvedRtt = Number.isFinite(rttMs) ? rttMs : this.state.hostRttMs;
        const resolvedHealth = health && typeof health === 'object' ? health : this.state.hostHealth;
        const healthRtt = resolvedHealth && resolvedHealth.rtt && typeof resolvedHealth.rtt === 'object' ?
            resolvedHealth.rtt :
            null;
        const rows = buildPlayersRows(resolvedPlayers, resolvedMeId, resolvedRtt, healthRtt);
        const meRow = rows.find(r => r.you) || rows[0] || buildPlayersRows([{id: 1, name: 'Player 1'}], 1)[0];
        const tickHealth = formatTickHealth(intl, resolvedHealth);
        const tickClass = tickHealth ?
            (tickHealth.bucket === 'weak' ?
                styles.pingWeak :
                (tickHealth.bucket === 'ok' ? styles.pingOk : styles.pingGood)) :
            '';
        const banner = connectionBannerState({
            weakConnection: Boolean(weakConnection || this.state.hostWeak),
            reconnecting: Boolean(reconnecting || this.state.hostReconnecting),
            graceExpired: Boolean(graceExpired || this.state.hostGraceExpired)
        }, intl);
        const activeToast = typeof toastText === 'string' && toastText ? toastText : this.state.toastText;

        return (
            <div
                className={styles.root}
                data-sq-players-panel=""
            >
                {activeToast ? (
                    <div
                        aria-live="polite"
                        className={styles.toast}
                        data-sq-players-toast=""
                        role="status"
                    >
                        {activeToast}
                    </div>
                ) : null}
                {banner ? (
                    <div
                        aria-live="polite"
                        className={styles.statusPill}
                        data-sq-connection-state={banner.kind}
                        role="status"
                    >
                        <span
                            aria-hidden="true"
                            className={styles.statusDot}
                        />
                        <span>{banner.text}</span>
                    </div>
                ) : null}
                {banner && banner.kind === 'grace-expired' ? (
                    <button
                        className={styles.joinAgain}
                        data-sq-join-again=""
                        type="button"
                        onClick={this.handleJoinAgain}
                    >
                        {banner.actionLabel}
                    </button>
                ) : null}
                <button
                    aria-expanded={isOpen}
                    className={styles.trigger}
                    data-sq-players-button=""
                    type="button"
                    onClick={this.handleToggle}
                >
                    <PeerShapeSvg
                        row={meRow}
                        title={peerTitle(intl, meRow)}
                    />
                    <span>{formatWord(intl, messages.button, {count: rows.length})}</span>
                </button>
                {isOpen ? (
                    <section
                        aria-label={formatWord(intl, messages.heading, {count: rows.length})}
                        className={styles.panel}
                        data-sq-players-drawer=""
                        role="dialog"
                    >
                        <header className={styles.header}>
                            <h2 className={styles.title}>
                                {formatWord(intl, messages.heading, {count: rows.length})}
                            </h2>
                            <button
                                aria-label={formatWord(intl, messages.close)}
                                className={styles.close}
                                type="button"
                                onClick={this.handleClose}
                            >
                                {'×'}
                            </button>
                        </header>
                        {banner ? (
                            <div className={styles.banner}>
                                <span>{banner.text}</span>
                                {banner.kind === 'grace-expired' ? (
                                    <button
                                        className={styles.joinAgain}
                                        type="button"
                                        onClick={this.handleJoinAgain}
                                    >
                                        {banner.actionLabel}
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                        {tickHealth ? (
                            <div
                                className={styles.healthBar}
                                data-sq-host-health=""
                                data-tick-band={tickHealth.band}
                                data-tick-bucket={tickHealth.bucket}
                                data-tick-p95={tickHealth.tickP95}
                            >
                                <span className={`${styles.healthPill} ${tickClass}`}>
                                    <span
                                        aria-hidden="true"
                                        className={styles.statusDot}
                                    />
                                    <span>{tickHealth.label}</span>
                                </span>
                            </div>
                        ) : null}
                        {rows.length ? (
                            <ul
                                className={styles.list}
                                role="list"
                            >
                                {rows.map(row => {
                                    const pingClass = row.ping === 'weak' ?
                                        styles.pingWeak :
                                        (row.ping === 'ok' ? styles.pingOk : styles.pingGood);
                                    return (
                                        <li
                                            className={`${styles.row} ${row.you ? styles.rowYou : ''}`}
                                            data-peer-color={row.color}
                                            data-peer-shape={row.shape}
                                            data-ping-bucket={row.ping}
                                            data-player-slot={row.id}
                                            key={row.id}
                                            role="listitem"
                                        >
                                            <PeerShapeSvg
                                                row={row}
                                                title={peerTitle(intl, row)}
                                            />
                                            <div className={styles.identity}>
                                                <span className={styles.name}>{row.name}</span>
                                                {row.you ? (
                                                    <span
                                                        className={styles.youBadge}
                                                        data-sq-player-you=""
                                                    >
                                                        {formatWord(intl, messages.you)}
                                                    </span>
                                                ) : null}
                                                {row.team ? (
                                                    <span
                                                        className={styles.teamBadge}
                                                        data-sq-player-team=""
                                                    >
                                                        {row.team}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <span className={`${styles.ping} ${pingClass}`}>
                                                <span
                                                    aria-hidden="true"
                                                    className={styles.statusDot}
                                                />
                                                <span>{formatPingText(intl, row.ping, row.pingMs)}</span>
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className={styles.empty}>
                                {formatWord(intl, messages.empty)}
                            </p>
                        )}
                    </section>
                ) : null}
            </div>
        );
    }
}

PlayersPanel.propTypes = {
    defaultOpen: PropTypes.bool,
    graceExpired: PropTypes.bool,
    health: PropTypes.shape({
        t: PropTypes.number,
        players: PropTypes.number,
        tickP50: PropTypes.number,
        tickP95: PropTypes.number,
        bytesPerSec: PropTypes.number,
        downPerPlayer: PropTypes.number,
        upPerPlayer: PropTypes.number,
        keyframeBytes: PropTypes.number,
        rewindMs: PropTypes.number,
        deadlineJumps: PropTypes.number,
        rtt: PropTypes.objectOf(PropTypes.number),
        lateTicks: PropTypes.number
    }),
    intl: PropTypes.shape({
        formatMessage: PropTypes.func
    }),
    meId: PropTypes.number,
    onClose: PropTypes.func,
    onJoinAgain: PropTypes.func,
    onToggle: PropTypes.func,
    open: PropTypes.bool,
    players: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.number,
        name: PropTypes.string,
        team: PropTypes.string,
        pingMs: PropTypes.number,
        ping: PropTypes.string,
        you: PropTypes.bool
    })),
    reconnecting: PropTypes.bool,
    rttMs: PropTypes.number,
    toastText: PropTypes.string,
    weakConnection: PropTypes.bool
};

export {
    PlayersPanel,
    buildPlayersRows,
    connectionBannerState,
    formatPingText,
    formatTickHealth
};
export default PlayersPanel;
