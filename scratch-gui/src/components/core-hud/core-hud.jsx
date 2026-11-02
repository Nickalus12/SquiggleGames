import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {extractHudState} from '../../lib/core-hud-state.js';
import HudFace from './hud-face.jsx';
import styles from './core-hud.css';

const POLL_MS = 100;
const HURT_MS = 650;
const FLASH_MS = 360;
const LEGACY_HUD = {StatusHUD: 'bar', TimerHUD: 'timer'};

const messages = defineMessages({
    statusBar: {
        id: 'sq.coreHud.statusBar',
        defaultMessage: 'Player status',
        description: 'Accessible name of the status bar along the bottom of a game'
    },
    health: {
        id: 'sq.coreHud.health',
        defaultMessage: 'Health',
        description: 'Label under the player health number in the game status bar'
    },
    lives: {
        id: 'sq.coreHud.lives',
        defaultMessage: 'Lives',
        description: 'Label under the number of lives left in the game status bar'
    },
    armor: {
        id: 'sq.coreHud.armor',
        defaultMessage: 'Armor',
        description: 'Label under the player armor number in the game status bar'
    },
    shield: {
        id: 'sq.coreHud.shield',
        defaultMessage: 'Shield',
        description: 'Label under the player shield number in the game status bar'
    },
    ammo: {
        id: 'sq.coreHud.ammo',
        defaultMessage: 'Ammo',
        description: 'Label under the ammo number in the game status bar'
    },
    weapon: {
        id: 'sq.coreHud.weapon',
        defaultMessage: 'Weapon',
        description: 'Label under the weapon slot numbers in the game status bar'
    },
    weaponSlot: {
        id: 'sq.coreHud.weaponSlot',
        defaultMessage: 'Weapon {slot} of {slots}',
        description: 'Accessible description of the selected weapon slot in the game status bar'
    },
    keys: {
        id: 'sq.coreHud.keys',
        defaultMessage: 'Keys',
        description: 'Label under the keycards the player holds in the game status bar'
    },
    itemOwned: {
        id: 'sq.coreHud.itemOwned',
        defaultMessage: '{item}, found',
        description: 'Accessible name of a key or item the player has picked up'
    },
    itemMissing: {
        id: 'sq.coreHud.itemMissing',
        defaultMessage: '{item}, not found yet',
        description: 'Accessible name of a key or item the player still has to find'
    },
    face: {
        id: 'sq.coreHud.face',
        defaultMessage: 'Squiggle is feeling {mood}',
        description: 'Accessible name of the mascot face in the game status bar, mood is a word like great or ouch'
    },
    hideBoard: {
        id: 'sq.coreHud.hideBoard',
        defaultMessage: 'Hide',
        description: 'Button that collapses the score board in a game'
    }
});

const moodWords = defineMessages({
    great: {id: 'sq.coreHud.mood.great', defaultMessage: 'great', description: 'Mascot mood at full health'},
    good: {id: 'sq.coreHud.mood.good', defaultMessage: 'good', description: 'Mascot mood at good health'},
    worried: {id: 'sq.coreHud.mood.worried', defaultMessage: 'worried', description: 'Mascot mood at half health'},
    low: {id: 'sq.coreHud.mood.low', defaultMessage: 'wobbly', description: 'Mascot mood at low health'},
    ouch: {id: 'sq.coreHud.mood.ouch', defaultMessage: 'ouch', description: 'Mascot mood right after taking a hit'},
    out: {id: 'sq.coreHud.mood.out', defaultMessage: 'knocked out', description: 'Mascot mood at zero health'}
});

const TONE_CLASS = {
    red: styles.toneRed,
    blue: styles.toneBlue,
    gold: styles.toneGold,
    green: styles.toneGreen,
    purple: styles.tonePurple
};

const clampRatio = (value, max) => Math.max(0, Math.min(1, value / Math.max(1, max || 100)));

const healthTone = ratio => {
    if (ratio <= 0.28) return styles.toneDanger;
    if (ratio <= 0.55) return styles.toneWarn;
    return styles.toneGood;
};

const Icon = ({kind}) => {
    const paths = {
        health: 'M12 20 C5 15 2 11 2 7.5 C2 4.5 4.4 2.5 7 2.5 C9 2.5 10.9 3.7 12 5.4 ' +
            'C13.1 3.7 15 2.5 17 2.5 C19.6 2.5 22 4.5 22 7.5 C22 11 19 15 12 20 Z',
        lives: 'M12 20 C5 15 2 11 2 7.5 C2 4.5 4.4 2.5 7 2.5 C9 2.5 10.9 3.7 12 5.4 ' +
            'C13.1 3.7 15 2.5 17 2.5 C19.6 2.5 22 4.5 22 7.5 C22 11 19 15 12 20 Z',
        armor: 'M12 2 L20 5 V11 C20 16 16.5 19.5 12 21.5 C7.5 19.5 4 16 4 11 V5 Z',
        shield: 'M12 2 L20 5 V11 C20 16 16.5 19.5 12 21.5 C7.5 19.5 4 16 4 11 V5 Z',
        ammo: 'M8 3 H13 V6 H8 Z M7 7 H14 V21 H7 Z M16 9 H19 V21 H16 Z M16 6 H19 V8 H16 Z',
        frags: 'M12 2 L14.6 8.6 L21.5 9.2 L16.2 13.7 L17.9 20.5 L12 16.8 L6.1 20.5 L7.8 13.7 ' +
            'L2.5 9.2 L9.4 8.6 Z'
    };
    return (
        <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
        >
            <path
                d={paths[kind] || paths.frags}
                fill="currentColor"
            />
        </svg>
    );
};
Icon.propTypes = {kind: PropTypes.string};

const KeyGlyph = () => (
    <svg
        className={styles.keyGlyph}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
    >
        <circle
            cx="7.5"
            cy="12"
            r="4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
        />
        <path
            d="M12 12 H21 M17 12 V16 M20 12 V15"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="3"
        />
    </svg>
);

const Meter = ({ratio, toneClass}) => (
    <span className={styles.meter}>
        <span
            className={classNames(styles.meterFill, toneClass)}
            style={{transform: `scaleX(${ratio.toFixed(3)})`}}
        />
    </span>
);
Meter.propTypes = {
    ratio: PropTypes.number,
    toneClass: PropTypes.string
};

const TopCenter = ({timer, teams, statusPill}) => {
    if (!timer && (!teams || !teams.length) && !statusPill) return null;
    return (
        <div
            className={styles.topCenter}
            data-testid="core-hud-top-center"
        >
            {teams && teams.length > 0 && (
                <div className={classNames(styles.plate, styles.teamPlate)}>
                    {teams.map(team => (
                        <span
                            key={team.name}
                            className={classNames(styles.teamChip, TONE_CLASS[team.tone],
                                {[styles.teamMine]: team.mine})}
                        >
                            <span className={styles.teamDot} />
                            <span className={styles.teamName}>{team.name}</span>
                            <span className={styles.teamScore}>{team.score}</span>
                        </span>
                    ))}
                </div>
            )}
            {timer && (
                <div className={styles.plate}>
                    <span className={styles.timerLabel}>{timer.label}</span>
                    <span className={styles.timerValue}>{timer.formatted}</span>
                </div>
            )}
            {statusPill && (
                <div className={styles.plate}>
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
        tone: PropTypes.string,
        mine: PropTypes.bool
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
                    <span className={styles.boardTitle}>
                        <Icon kind="frags" />
                        <span>{leaderboard.boardName}</span>
                    </span>
                    <span className={styles.boardHint}>
                        {collapsed ? `${topScore}` : <FormattedMessage {...messages.hideBoard} />}
                    </span>
                </button>
                {!collapsed && (
                    <ol className={styles.boardList}>
                        {leaderboard.rows.map(row => (
                            <li
                                key={`${row.slot}-${row.rank}`}
                                className={classNames(styles.boardRow, {[styles.boardRowMe]: row.isMe})}
                            >
                                <span className={styles.boardRank}>{row.rank}</span>
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

const Slot = ({kind, className, label, children}) => (
    <div
        className={classNames(styles.slot, className)}
        data-slot={kind}
    >
        <div className={styles.slotBody}>{children}</div>
        <div className={styles.slotLabel}>
            <Icon kind={kind} />
            <span className={styles.slotLabelText}>{label}</span>
        </div>
    </div>
);
Slot.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    kind: PropTypes.string,
    label: PropTypes.node
};

const HealthSlot = ({vitals, flash}) => {
    const ratio = clampRatio(vitals.hp, vitals.maxHp);
    const lives = vitals.hpKind === 'lives';
    return (
        <Slot
            kind={lives ? 'lives' : 'health'}
            className={classNames(
                styles.slotHealth,
                healthTone(lives ? 1 : ratio),
                {[styles.slotFlash]: flash, [styles.slotHealthFlash]: flash}
            )}
            label={<FormattedMessage {...(lives ? messages.lives : messages.health)} />}
        >
            <span className={styles.bigNumber}>{Math.round(vitals.hp)}</span>
            {lives ? null : (
                <Meter
                    ratio={ratio}
                    toneClass={healthTone(ratio)}
                />
            )}
        </Slot>
    );
};
HealthSlot.propTypes = {
    flash: PropTypes.bool,
    vitals: PropTypes.object
};

const ArmorSlot = ({vitals}) => {
    const ratio = clampRatio(vitals.shield, vitals.maxShield);
    const shield = vitals.shieldKind === 'shield';
    return (
        <Slot
            kind={shield ? 'shield' : 'armor'}
            className={styles.slotArmor}
            label={<FormattedMessage {...(shield ? messages.shield : messages.armor)} />}
        >
            <span className={styles.bigNumber}>{Math.round(vitals.shield)}</span>
            <Meter
                ratio={ratio}
                toneClass={styles.toneArmor}
            />
        </Slot>
    );
};
ArmorSlot.propTypes = {vitals: PropTypes.object};

const AmmoSlot = ({vitals, flash}) => (
    <Slot
        kind="ammo"
        className={classNames(
            styles.slotAmmo,
            vitals.ammo <= 0 ? styles.toneDanger : null,
            {[styles.slotFlash]: flash, [styles.slotAmmoFlash]: flash}
        )}
        label={<FormattedMessage {...messages.ammo} />}
    >
        <span className={styles.bigNumber}>{Math.round(vitals.ammo)}</span>
        {vitals.ammoKinds && vitals.ammoKinds.length > 0 ? (
            <span className={styles.ammoKinds}>
                {vitals.ammoKinds.slice(0, 3).map(kind => (
                    <span
                        key={kind.id}
                        className={styles.ammoKind}
                    >
                        <span>{kind.label}</span>
                        <span className={styles.ammoKindValue}>{kind.value}</span>
                    </span>
                ))}
            </span>
        ) : null}
    </Slot>
);
AmmoSlot.propTypes = {
    flash: PropTypes.bool,
    vitals: PropTypes.object
};

const WeaponSlot = ({weapon, intl}) => {
    const caps = [];
    for (let n = 1; n <= weapon.slots; n++) caps.push(n);
    const columns = weapon.slots <= 4 ? weapon.slots : Math.ceil(weapon.slots / 2);
    return (
        <div
            className={classNames(styles.slot, styles.slotWeapon)}
            data-slot="weapon"
        >
            <div
                className={styles.keycaps}
                style={{gridTemplateColumns: `repeat(${columns}, auto)`}}
                role="img"
                aria-label={intl.formatMessage(messages.weaponSlot, {slot: weapon.slot, slots: weapon.slots})}
            >
                {caps.map(n => (
                    <span
                        key={n}
                        className={classNames(styles.keycap, {[styles.keycapOn]: n === weapon.slot})}
                    >
                        {n}
                    </span>
                ))}
            </div>
            <div className={styles.slotLabel}>
                <span className={styles.slotLabelText}>
                    <FormattedMessage {...messages.weapon} />
                </span>
            </div>
        </div>
    );
};
WeaponSlot.propTypes = {
    intl: intlShape,
    weapon: PropTypes.shape({slot: PropTypes.number, slots: PropTypes.number})
};

const ItemsSlot = ({items, intl}) => (
    <div
        className={classNames(styles.slot, styles.slotItems)}
        data-slot="items"
    >
        <ul className={styles.itemList}>
            {items.map(item => (
                <li
                    key={item.id}
                    className={classNames(styles.item, TONE_CLASS[item.tone], {[styles.itemOwned]: item.owned})}
                    aria-label={intl.formatMessage(item.owned ? messages.itemOwned : messages.itemMissing,
                        {item: item.label})}
                >
                    <KeyGlyph />
                </li>
            ))}
        </ul>
        <div className={styles.slotLabel}>
            <span className={styles.slotLabelText}>
                <FormattedMessage {...messages.keys} />
            </span>
        </div>
    </div>
);
ItemsSlot.propTypes = {
    intl: intlShape,
    items: PropTypes.arrayOf(PropTypes.object)
};

const FragsSlot = ({frags, flash}) => (
    <Slot
        kind="frags"
        className={classNames(styles.slotFrags, {[styles.slotFlash]: flash, [styles.slotFragsFlash]: flash})}
        label={frags.label}
    >
        <span className={styles.bigNumber}>{frags.value}</span>
    </Slot>
);
FragsSlot.propTypes = {
    flash: PropTypes.bool,
    frags: PropTypes.shape({label: PropTypes.string, value: PropTypes.number})
};

const FaceSlot = ({mood, intl}) => (
    <div
        className={styles.faceSlot}
        data-slot="face"
        role="img"
        aria-label={intl.formatMessage(messages.face, {
            mood: intl.formatMessage(moodWords[mood] || moodWords.good)
        })}
    >
        <HudFace
            className={styles.face}
            mood={mood}
        />
    </div>
);
FaceSlot.propTypes = {
    intl: intlShape,
    mood: PropTypes.string
};

const StatusBandComponent = ({vitals, bar, hurt, ammoFlash, fragsFlash, intl}) => {
    if (!vitals || !bar) return null;
    const hasHp = typeof vitals.hp === 'number';
    const hasShield = typeof vitals.shield === 'number';
    const hasAmmo = typeof vitals.ammo === 'number';
    const items = Array.isArray(vitals.items) ? vitals.items : [];
    const mood = hurt && vitals.mood !== 'out' ? 'ouch' : vitals.mood;
    if (bar.layout === 'compact') {
        return (
            <div
                className={styles.bottomRow}
                data-testid="core-hud-vitals"
            >
                <div
                    className={classNames(styles.band, styles.bandCompact, {[styles.bandHurt]: hurt})}
                    role="group"
                    aria-label={intl.formatMessage(messages.statusBar)}
                >
                    {hasHp ? (
                        <HealthSlot
                            flash={hurt}
                            vitals={vitals}
                        />
                    ) : null}
                    {hasShield ? <ArmorSlot vitals={vitals} /> : null}
                    {hasAmmo ? (
                        <AmmoSlot
                            flash={ammoFlash}
                            vitals={vitals}
                        />
                    ) : null}
                </div>
            </div>
        );
    }
    return (
        <div
            className={styles.bottomRow}
            data-testid="core-hud-vitals"
        >
            <div
                className={classNames(styles.band, {[styles.bandHurt]: hurt})}
                role="group"
                aria-label={intl.formatMessage(messages.statusBar)}
                data-testid="core-hud-band"
            >
                <div className={styles.bandSide}>
                    {hasAmmo ? (
                        <AmmoSlot
                            flash={ammoFlash}
                            vitals={vitals}
                        />
                    ) : null}
                    {hasHp ? (
                        <HealthSlot
                            flash={hurt}
                            vitals={vitals}
                        />
                    ) : null}
                    {vitals.weapon ? (
                        <WeaponSlot
                            intl={intl}
                            weapon={vitals.weapon}
                        />
                    ) : null}
                </div>
                <FaceSlot
                    intl={intl}
                    mood={hasHp ? mood : 'good'}
                />
                <div className={styles.bandSide}>
                    {hasShield ? <ArmorSlot vitals={vitals} /> : null}
                    {items.length ? (
                        <ItemsSlot
                            intl={intl}
                            items={items}
                        />
                    ) : null}
                    {bar.frags ? (
                        <FragsSlot
                            flash={fragsFlash}
                            frags={bar.frags}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
};
StatusBandComponent.propTypes = {
    ammoFlash: PropTypes.bool,
    bar: PropTypes.shape({
        layout: PropTypes.oneOf(['band', 'compact']),
        frags: PropTypes.object,
        foldsBoard: PropTypes.bool
    }),
    fragsFlash: PropTypes.bool,
    hurt: PropTypes.bool,
    intl: intlShape,
    vitals: PropTypes.object
};
const StatusBand = injectIntl(StatusBandComponent);

class CoreHud extends React.Component {
    constructor (props) {
        super(props);
        const hud = extractHudState(props.vm);
        this.state = {
            hud,
            collapsed: false,
            hurt: false,
            ammoFlash: false,
            fragsFlash: false
        };
        this.sig = JSON.stringify(hud);
        this.lastPoll = 0;
        this.hurtTimer = null;
        this.ammoTimer = null;
        this.fragsTimer = null;
        this.hiddenLegacy = new Set();
        this.handleAfterStep = this.handleAfterStep.bind(this);
        this.handleForceRefresh = this.handleForceRefresh.bind(this);
        this.handleProjectLoaded = this.handleProjectLoaded.bind(this);
        this.handleToggleBoard = this.handleToggleBoard.bind(this);
        this.clearHurt = this.clearHurt.bind(this);
        this.clearAmmoFlash = this.clearAmmoFlash.bind(this);
        this.clearFragsFlash = this.clearFragsFlash.bind(this);
    }

    componentDidMount () {
        this.bindRuntime(this.props.vm);
        this.handleForceRefresh();
    }

    componentDidUpdate (prevProps) {
        if (prevProps.vm !== this.props.vm) {
            this.restoreLegacy(prevProps.vm);
            this.unbindRuntime(prevProps.vm);
            this.bindRuntime(this.props.vm);
            this.handleForceRefresh();
        }
    }

    componentWillUnmount () {
        clearTimeout(this.hurtTimer);
        clearTimeout(this.ammoTimer);
        clearTimeout(this.fragsTimer);
        this.restoreLegacy(this.props.vm);
        this.unbindRuntime(this.props.vm);
    }

    bindRuntime (vm) {
        const runtime = vm && vm.runtime;
        if (!runtime || typeof runtime.on !== 'function') return;
        runtime.on('AFTER_EXECUTE', this.handleAfterStep);
        runtime.on('PROJECT_LOADED', this.handleProjectLoaded);
        runtime.on('PROJECT_START', this.handleForceRefresh);
        runtime.on('SQUIGGLE_SETTINGS_CHANGED', this.handleForceRefresh);
    }

    unbindRuntime (vm) {
        const runtime = vm && vm.runtime;
        if (!runtime || typeof runtime.removeListener !== 'function') return;
        runtime.removeListener('AFTER_EXECUTE', this.handleAfterStep);
        runtime.removeListener('PROJECT_LOADED', this.handleProjectLoaded);
        runtime.removeListener('PROJECT_START', this.handleForceRefresh);
        runtime.removeListener('SQUIGGLE_SETTINGS_CHANGED', this.handleForceRefresh);
    }

    handleAfterStep () {
        const now = Date.now();
        if (now - this.lastPoll < POLL_MS) return;
        this.lastPoll = now;
        this.syncHud();
    }

    handleForceRefresh () {
        this.lastPoll = Date.now();
        this.syncHud();
    }

    handleProjectLoaded () {
        this.hiddenLegacy.clear();
        this.handleForceRefresh();
    }

    legacyRole (target) {
        if (!target || !target.isOriginal) return null;
        const name = (target.getName && target.getName()) || (target.sprite && target.sprite.name);
        return Object.prototype.hasOwnProperty.call(LEGACY_HUD, name) ? LEGACY_HUD[name] : null;
    }

    syncLegacy (hud) {
        const runtime = this.props.vm && this.props.vm.runtime;
        if (!runtime || !Array.isArray(runtime.targets)) return;
        const shows = !!(hud && hud.enabled && hud.hasHudContent && hud.replaces);
        const owns = {bar: shows && !!hud.replaces.bar, timer: shows && !!hud.replaces.timer};
        for (const target of runtime.targets) {
            const role = this.legacyRole(target);
            if (!role || typeof target.setVisible !== 'function') continue;
            if (owns[role] && target.visible !== false) {
                target.setVisible(false);
                this.hiddenLegacy.add(target);
            } else if (!owns[role] && this.hiddenLegacy.has(target)) {
                target.setVisible(true);
                this.hiddenLegacy.delete(target);
            }
        }
    }

    restoreLegacy (vm) {
        const runtime = vm && vm.runtime;
        const live = runtime && Array.isArray(runtime.targets) ? runtime.targets : [];
        this.hiddenLegacy.forEach(target => {
            if (live.indexOf(target) !== -1 && typeof target.setVisible === 'function') target.setVisible(true);
        });
        this.hiddenLegacy.clear();
    }

    syncHud () {
        const next = extractHudState(this.props.vm);
        this.syncLegacy(next);
        const sig = JSON.stringify(next);
        if (sig === this.sig) return;
        this.sig = sig;
        const before = this.state.hud && this.state.hud.vitals;
        const after = next && next.vitals;
        const hit = !!before && !!after && typeof before.hp === 'number' && typeof after.hp === 'number' &&
            after.hp < before.hp;
        const ammoChanged = !!before && !!after && typeof before.ammo === 'number' &&
            typeof after.ammo === 'number' && after.ammo !== before.ammo;
        const beforeFrags = this.state.hud && this.state.hud.bar && this.state.hud.bar.frags ?
            this.state.hud.bar.frags.value :
            null;
        const afterFrags = next && next.bar && next.bar.frags ? next.bar.frags.value : null;
        const fragsRose = typeof beforeFrags === 'number' && typeof afterFrags === 'number' &&
            afterFrags > beforeFrags;
        const patch = {hud: next};
        if (hit) {
            clearTimeout(this.hurtTimer);
            this.hurtTimer = setTimeout(this.clearHurt, HURT_MS);
            patch.hurt = true;
        }
        if (ammoChanged) {
            clearTimeout(this.ammoTimer);
            this.ammoTimer = setTimeout(this.clearAmmoFlash, FLASH_MS);
            patch.ammoFlash = true;
        }
        if (fragsRose) {
            clearTimeout(this.fragsTimer);
            this.fragsTimer = setTimeout(this.clearFragsFlash, FLASH_MS);
            patch.fragsFlash = true;
        }
        this.setState(patch);
    }

    clearHurt () {
        this.hurtTimer = null;
        this.setState({hurt: false});
    }

    clearAmmoFlash () {
        this.ammoTimer = null;
        this.setState({ammoFlash: false});
    }

    clearFragsFlash () {
        this.fragsTimer = null;
        this.setState({fragsFlash: false});
    }

    handleToggleBoard () {
        this.setState(prev => ({collapsed: !prev.collapsed}));
    }

    render () {
        const {hud, collapsed, hurt, ammoFlash, fragsFlash} = this.state;
        if (!hud || !hud.enabled || !hud.hasHudContent) return null;
        const foldsBoard = !!(hud.bar && hud.bar.foldsBoard);
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
                    {foldsBoard ? null : (
                        <Leaderboard
                            leaderboard={hud.leaderboard}
                            collapsed={collapsed}
                            onToggle={this.handleToggleBoard}
                        />
                    )}
                </div>
                <StatusBand
                    ammoFlash={ammoFlash}
                    bar={hud.bar}
                    fragsFlash={fragsFlash}
                    hurt={hurt}
                    vitals={hud.vitals}
                />
            </div>
        );
    }
}

CoreHud.TopCenter = TopCenter;
CoreHud.Leaderboard = Leaderboard;
CoreHud.StatusBand = StatusBand;

CoreHud.propTypes = {
    vm: PropTypes.shape({
        runtime: PropTypes.object
    }),
    className: PropTypes.string
};

export default CoreHud;
