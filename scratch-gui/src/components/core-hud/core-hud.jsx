import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import {extractHudState} from '../../lib/core-hud-state.js';
import styles from './core-hud.css';

const TONE_CLASS = {
    red: styles.toneRed,
    blue: styles.toneBlue,
    gold: styles.toneGold,
    green: styles.toneGreen
};

const TopCenter = ({timer, teams, statusPill}) => {
    if (!timer && (!teams || !teams.length) && !statusPill) return null;
    return (
        <div
            className={styles.topCenter}
            data-testid="core-hud-top-center"
        >
            {teams && teams.length > 0 && (
                <div className={styles.pill}>
                    {teams.map(team => (
                        <span
                            key={team.name}
                            className={classNames(styles.teamChip, TONE_CLASS[team.tone])}
                        >
                            <span className={styles.teamDot} />
                            <span>{team.name}</span>
                            <span className={styles.teamScore}>{team.score}</span>
                        </span>
                    ))}
                </div>
            )}
            {timer && (
                <div className={styles.pill}>
                    <span className={styles.timerLabel}>{timer.label}</span>
                    <span className={styles.timerValue}>{timer.formatted}</span>
                </div>
            )}
            {statusPill && (
                <div className={styles.pill}>
                    <span className={styles.statusBadge}>{statusPill}</span>
                </div>
            )}
        </div>
    );
};
TopCenter.propTypes = {
    timer: PropTypes.shape({
        label: PropTypes.string,
        seconds: PropTypes.number,
        formatted: PropTypes.string
    }),
    teams: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        score: PropTypes.number,
        tone: PropTypes.string
    })),
    statusPill: PropTypes.string
};

const Leaderboard = ({leaderboard, collapsed, onToggle}) => {
    if (!leaderboard || !Array.isArray(leaderboard.rows) || leaderboard.rows.length === 0) return null;
    const topScore = leaderboard.rows[0] ? leaderboard.rows[0].score : 0;
    return (
        <div
            className={styles.topRight}
            data-testid="core-hud-leaderboard"
        >
            <div className={styles.boardCard}>
                <button
                    type="button"
                    className={styles.boardToggle}
                    aria-expanded={!collapsed}
                    onClick={onToggle}
                >
                    <span>{leaderboard.boardName}</span>
                    <span>{collapsed ? `${topScore}` : 'Hide'}</span>
                </button>
                {!collapsed && (
                    <ol className={styles.boardList}>
                        {leaderboard.rows.map(row => (
                            <li
                                key={`${row.slot}-${row.rank}`}
                                className={classNames(styles.boardRow, {[styles.boardRowMe]: row.isMe})}
                            >
                                <span className={styles.boardRank}>{`${row.rank}.`}</span>
                                <span className={styles.boardName}>{row.name}</span>
                                <span className={styles.boardScore}>{row.score}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
};
Leaderboard.propTypes = {
    leaderboard: PropTypes.shape({
        boardName: PropTypes.string,
        rows: PropTypes.arrayOf(PropTypes.shape({
            rank: PropTypes.number,
            slot: PropTypes.number,
            name: PropTypes.string,
            score: PropTypes.number,
            isMe: PropTypes.bool
        }))
    }),
    collapsed: PropTypes.bool,
    onToggle: PropTypes.func
};

const BottomVitals = ({vitals}) => {
    if (!vitals) return null;
    const hasHp = typeof vitals.hp === 'number';
    const hasShield = typeof vitals.shield === 'number';
    const hasAmmo = typeof vitals.ammo === 'number';
    if (!hasHp && !hasShield && !hasAmmo) return null;
    const hpRatio = hasHp ? Math.max(0, Math.min(1, vitals.hp / Math.max(1, vitals.maxHp || 100))) : 0;
    const shieldRatio = hasShield ? Math.max(0, Math.min(1, vitals.shield / Math.max(1, vitals.maxShield || 100))) : 0;
    return (
        <div
            className={styles.bottomRow}
            data-testid="core-hud-vitals"
        >
            <div className={styles.vitalsBar}>
                {hasHp && (
                    <div className={styles.vitalGroup}>
                        <span className={styles.vitalLabel}>{vitals.hpLabel || 'HP'}</span>
                        <div className={styles.vitalTrack}>
                            <div
                                className={classNames(
                                    styles.vitalFill,
                                    hpRatio <= 0.28 ? styles.fillHpLow : styles.fillHp
                                )}
                                style={{transform: `scaleX(${hpRatio.toFixed(3)})`}}
                            />
                        </div>
                        <span className={styles.vitalNumber}>{Math.round(vitals.hp)}</span>
                    </div>
                )}
                {hasShield && (
                    <div className={styles.vitalGroup}>
                        <span className={styles.vitalLabel}>{'Shield'}</span>
                        <div className={styles.vitalTrack}>
                            <div
                                className={classNames(styles.vitalFill, styles.fillShield)}
                                style={{transform: `scaleX(${shieldRatio.toFixed(3)})`}}
                            />
                        </div>
                        <span className={styles.vitalNumber}>{Math.round(vitals.shield)}</span>
                    </div>
                )}
                {hasAmmo && (
                    <div className={styles.vitalGroup}>
                        <span className={styles.vitalLabel}>{'Ammo'}</span>
                        <span className={styles.vitalNumber}>{Math.round(vitals.ammo)}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
BottomVitals.propTypes = {
    vitals: PropTypes.shape({
        hp: PropTypes.number,
        maxHp: PropTypes.number,
        hpLabel: PropTypes.string,
        shield: PropTypes.number,
        maxShield: PropTypes.number,
        ammo: PropTypes.number
    })
};

class CoreHud extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            hud: extractHudState(props.vm),
            collapsed: false,
            lastSig: ''
        };
        this.lastPoll = 0;
        this.handleAfterStep = this.handleAfterStep.bind(this);
        this.handleForceRefresh = this.handleForceRefresh.bind(this);
        this.handleToggleBoard = this.handleToggleBoard.bind(this);
    }

    componentDidMount () {
        this.bindRuntime(this.props.vm);
        this.handleForceRefresh();
    }

    componentDidUpdate (prevProps) {
        if (prevProps.vm !== this.props.vm) {
            this.unbindRuntime(prevProps.vm);
            this.bindRuntime(this.props.vm);
            this.handleForceRefresh();
        }
    }

    componentWillUnmount () {
        this.unbindRuntime(this.props.vm);
    }

    bindRuntime (vm) {
        const runtime = vm && vm.runtime;
        if (!runtime || typeof runtime.on !== 'function') return;
        runtime.on('AFTER_EXECUTE', this.handleAfterStep);
        runtime.on('PROJECT_LOADED', this.handleForceRefresh);
        runtime.on('PROJECT_START', this.handleForceRefresh);
        runtime.on('SQUIGGLE_SETTINGS_CHANGED', this.handleForceRefresh);
    }

    unbindRuntime (vm) {
        const runtime = vm && vm.runtime;
        if (!runtime || typeof runtime.removeListener !== 'function') return;
        runtime.removeListener('AFTER_EXECUTE', this.handleAfterStep);
        runtime.removeListener('PROJECT_LOADED', this.handleForceRefresh);
        runtime.removeListener('PROJECT_START', this.handleForceRefresh);
        runtime.removeListener('SQUIGGLE_SETTINGS_CHANGED', this.handleForceRefresh);
    }

    handleAfterStep () {
        const now = Date.now();
        if (now - this.lastPoll < 120) return;
        this.lastPoll = now;
        this.syncHud();
    }

    handleForceRefresh () {
        this.lastPoll = Date.now();
        this.syncHud();
    }

    syncHud () {
        const next = extractHudState(this.props.vm);
        if (next && next.enabled && next.hasHudContent) {
            const runtime = this.props.vm && this.props.vm.runtime;
            if (runtime && Array.isArray(runtime.targets)) {
                runtime.targets.forEach(target => {
                    const name = target && (
                        (target.getName && target.getName()) ||
                        (target.sprite && target.sprite.name)
                    );
                    const isLegacyHud = name === 'StatusHUD' || name === 'TimerHUD';
                    if (isLegacyHud && target.visible !== false && typeof target.setVisible === 'function') {
                        target.setVisible(false);
                    }
                });
            }
        }
        const sig = JSON.stringify(next);
        if (sig === this.state.lastSig) return;
        this.setState({hud: next, lastSig: sig});
    }

    handleToggleBoard () {
        this.setState(prev => ({collapsed: !prev.collapsed}));
    }

    render () {
        const {hud, collapsed} = this.state;
        if (!hud || !hud.enabled || !hud.hasHudContent) return null;
        return (
            <div
                className={classNames(styles.hudRoot, this.props.className)}
                data-testid="core-hud"
            >
                <div className={styles.topRow}>
                    <div className={styles.topLeftSpacer} />
                    <TopCenter
                        timer={hud.timer}
                        teams={hud.teams}
                        statusPill={hud.statusPill}
                    />
                    <Leaderboard
                        leaderboard={hud.leaderboard}
                        collapsed={collapsed}
                        onToggle={this.handleToggleBoard}
                    />
                </div>
                <BottomVitals vitals={hud.vitals} />
            </div>
        );
    }
}

CoreHud.TopCenter = TopCenter;
CoreHud.Leaderboard = Leaderboard;
CoreHud.BottomVitals = BottomVitals;

CoreHud.propTypes = {
    vm: PropTypes.shape({
        runtime: PropTypes.object
    }),
    className: PropTypes.string
};

export default CoreHud;
