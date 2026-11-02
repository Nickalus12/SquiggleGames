import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {readGameSettings} from '../../lib/game-settings.js';
import {peekView3d} from '../../lib/world/view3d.js';
import {
    DRAW_DISTANCES,
    MAX_HEAD_BOB,
    MAX_MOUSE_SPEED,
    MAX_PLAYER_FOV,
    MIN_HEAD_BOB,
    MIN_MOUSE_SPEED,
    MIN_PLAYER_FOV,
    PLAYER_SETTINGS_CHANGED,
    QUALITY_MODES,
    readPlayerSettings,
    resetPlayerSettings,
    updatePlayerSettings
} from '../../lib/world/player-settings.js';
import styles from './player-settings.css';

const POLL_MS = 200;

const messages = defineMessages({
    openButton: {
        id: 'sq.playerSettings.openButton',
        defaultMessage: '3D settings',
        description: 'Button in the game player that opens the 3D controls and picture settings panel'
    },
    title: {
        id: 'sq.playerSettings.title',
        defaultMessage: '3D settings',
        description: 'Heading of the player 3D settings panel'
    },
    closeButton: {
        id: 'sq.playerSettings.closeButton',
        defaultMessage: 'Done',
        description: 'Button that closes the player 3D settings panel'
    },
    resetButton: {
        id: 'sq.playerSettings.resetButton',
        defaultMessage: 'Reset',
        description: 'Button that puts the player 3D settings back to the game defaults'
    },
    lockedNotice: {
        id: 'sq.playerSettings.lockedNotice',
        defaultMessage: 'This part of the game sets the camera',
        description: 'Short note shown when the game locks the 3D look for a puzzle'
    },
    mouseSpeed: {
        id: 'sq.playerSettings.mouseSpeed',
        defaultMessage: 'Mouse speed',
        description: 'Slider label for how fast the mouse turns the 3D camera'
    },
    invertLook: {
        id: 'sq.playerSettings.invertLook',
        defaultMessage: 'Invert look',
        description: 'Toggle label for flipping up and down look controls'
    },
    lookUpDown: {
        id: 'sq.playerSettings.lookUpDown',
        defaultMessage: 'Look up and down',
        description: 'Toggle label for turning vertical look on or off'
    },
    headBob: {
        id: 'sq.playerSettings.headBob',
        defaultMessage: 'Head bob',
        description: 'Toggle and slider label for camera bobbing while walking'
    },
    fov: {
        id: 'sq.playerSettings.fov',
        defaultMessage: 'Field of view',
        description: 'Slider label for how wide the 3D camera sees'
    },
    quality: {
        id: 'sq.playerSettings.quality',
        defaultMessage: 'Picture quality',
        description: 'Choice label for how sharp or fast the 3D view is drawn'
    },
    qualityAuto: {
        id: 'sq.playerSettings.quality.auto',
        defaultMessage: 'Auto',
        description: '3D picture quality choice that adjusts automatically'
    },
    qualityCrisp: {
        id: 'sq.playerSettings.quality.crisp',
        defaultMessage: 'Crisp',
        description: '3D picture quality choice for sharp resolution'
    },
    qualityFast: {
        id: 'sq.playerSettings.quality.fast',
        defaultMessage: 'Fast',
        description: '3D picture quality choice for smooth speed'
    },
    qualityFastest: {
        id: 'sq.playerSettings.quality.fastest',
        defaultMessage: 'Fastest',
        description: '3D picture quality choice for maximum frame rate on slow devices'
    },
    qualitySharpest: {
        id: 'sq.playerSettings.quality.sharpest',
        defaultMessage: 'Sharpest',
        description: '3D picture quality choice for extra sharp detail'
    },
    drawDistance: {
        id: 'sq.playerSettings.drawDistance',
        defaultMessage: 'Draw distance',
        description: 'Choice label for how far the player can see before fog'
    },
    drawNear: {
        id: 'sq.playerSettings.drawDistance.near',
        defaultMessage: 'Near',
        description: 'Draw distance choice for close fog'
    },
    drawNormal: {
        id: 'sq.playerSettings.drawDistance.normal',
        defaultMessage: 'Normal',
        description: 'Draw distance choice for default game fog'
    },
    drawFar: {
        id: 'sq.playerSettings.drawDistance.far',
        defaultMessage: 'Far',
        description: 'Draw distance choice for seeing far away'
    },
    on: {
        id: 'sq.playerSettings.on',
        defaultMessage: 'On',
        description: 'Switch state when a player setting is turned on'
    },
    off: {
        id: 'sq.playerSettings.off',
        defaultMessage: 'Off',
        description: 'Switch state when a player setting is turned off'
    }
});

const QUALITY_LABELS = {
    auto: messages.qualityAuto,
    crisp: messages.qualityCrisp,
    fast: messages.qualityFast,
    fastest: messages.qualityFastest,
    sharpest: messages.qualitySharpest
};

const DISTANCE_LABELS = {
    near: messages.drawNear,
    normal: messages.drawNormal,
    far: messages.drawFar
};

const uses3d = vm => {
    const runtime = vm && (vm.runtime || vm);
    if (!runtime) return false;
    const live = peekView3d(runtime);
    if (live && typeof live.isOn === 'function' && live.isOn()) return true;
    const targets = runtime.targets;
    if (!Array.isArray(targets)) return false;
    return targets.some(target => {
        if (!target || !target.isOriginal || !target.blocks) return false;
        const blocks = target.blocks._blocks;
        if (!blocks) return false;
        return Object.keys(blocks).some(id => {
            const block = blocks[id];
            return block && typeof block.opcode === 'string' && block.opcode.startsWith('squiggle3d_');
        });
    });
};

const readProjectDefaults = vm => {
    const runtime = vm && (vm.runtime || vm);
    const live = runtime ? peekView3d(runtime) : null;
    const viewSettings = live && typeof live.settings === 'function' ? live.settings() : null;
    const gameSettings = readGameSettings(vm);
    const locked = live && typeof live.usePlayerSettings === 'function' ? !live.usePlayerSettings() : false;
    return {
        fov: viewSettings && typeof viewSettings.fov === 'number' ? viewSettings.fov : 66,
        fog: viewSettings && typeof viewSettings.fog === 'number' ? viewSettings.fog : 0,
        quality: (gameSettings && gameSettings.render3d) || 'auto',
        locked
    };
};

const GEAR_PATH = 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 2.4-1.6-.5a6.8 6.8 0 0 0-.6-1.4l.8-1.5' +
    'a.9.9 0 0 0-.1-1.1l-1.2-1.2a.9.9 0 0 0-1.1-.1l-1.5.8a6.8 6.8 0 0 0-1.4-.6l-.5-1.6a.9.9 0 0 0-.9-.6h-1.6' +
    'a.9.9 0 0 0-.9.6l-.5 1.6a6.8 6.8 0 0 0-1.4.6l-1.5-.8a.9.9 0 0 0-1.1.1L4.1 6.4a.9.9 0 0 0-.1 1.1l.8 1.5' +
    'a6.8 6.8 0 0 0-.6 1.4l-1.6.5a.9.9 0 0 0-.6.9v1.6c0 .4.2.8.6.9l1.6.5c.2.5.4 1 .6 1.4l-.8 1.5' +
    'a.9.9 0 0 0 .1 1.1l1.2 1.2c.3.3.7.3 1.1.1l1.5-.8c.4.2.9.4 1.4.6l.5 1.6c.1.4.5.6.9.6h1.6c.4 0 .8-.2.9-.6' +
    'l.5-1.6c.5-.2 1-.4 1.4-.6l1.5.8c.4.2.8.2 1.1-.1l1.2-1.2a.9.9 0 0 0 .1-1.1l-.8-1.5c.2-.4.4-.9.6-1.4' +
    'l1.6-.5c.4-.1.6-.5.6-.9v-1.6a.9.9 0 0 0-.6-.9Z';

const GearIcon = () => (
    <svg
        className={styles.gearIcon}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
    >
        <path
            d={GEAR_PATH}
            fill="currentColor"
        />
    </svg>
);

class PlayerSettingsComponent extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            open: Boolean(props.defaultOpen),
            available: Boolean(props.alwaysShow) || uses3d(props.vm),
            settings: readPlayerSettings(props.storage),
            project: readProjectDefaults(props.vm)
        };
        this.lastPoll = 0;
        this.gearRef = null;
        this.setGearRef = this.setGearRef.bind(this);
        this.handleToggleOpen = this.handleToggleOpen.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleReset = this.handleReset.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleAfterStep = this.handleAfterStep.bind(this);
        this.handleSync = this.handleSync.bind(this);
        this.handleMouseSpeed = this.handleMouseSpeed.bind(this);
        this.handleInvertLook = this.handleInvertLook.bind(this);
        this.handleLookUpDown = this.handleLookUpDown.bind(this);
        this.handleHeadBobToggle = this.handleHeadBobToggle.bind(this);
        this.handleHeadBobSlider = this.handleHeadBobSlider.bind(this);
        this.handleFov = this.handleFov.bind(this);
        this.handleQualityClick = this.handleQualityClick.bind(this);
        this.handleDistanceClick = this.handleDistanceClick.bind(this);
    }

    componentDidMount () {
        this.bindRuntime(this.props.vm);
        this.handleSync();
    }

    componentDidUpdate (prevProps) {
        if (prevProps.vm !== this.props.vm) {
            this.unbindRuntime(prevProps.vm);
            this.bindRuntime(this.props.vm);
            this.handleSync();
        }
    }

    componentWillUnmount () {
        this.unbindRuntime(this.props.vm);
    }

    setGearRef (el) {
        this.gearRef = el;
    }

    bindRuntime (vm) {
        const runtime = vm && (vm.runtime || vm);
        if (!runtime || typeof runtime.on !== 'function') return;
        runtime.on('AFTER_EXECUTE', this.handleAfterStep);
        runtime.on('PROJECT_LOADED', this.handleSync);
        runtime.on('PROJECT_START', this.handleSync);
        runtime.on('SQUIGGLE_SETTINGS_CHANGED', this.handleSync);
        runtime.on(PLAYER_SETTINGS_CHANGED, this.handleSync);
    }

    unbindRuntime (vm) {
        const runtime = vm && (vm.runtime || vm);
        if (!runtime || typeof runtime.removeListener !== 'function') return;
        runtime.removeListener('AFTER_EXECUTE', this.handleAfterStep);
        runtime.removeListener('PROJECT_LOADED', this.handleSync);
        runtime.removeListener('PROJECT_START', this.handleSync);
        runtime.removeListener('SQUIGGLE_SETTINGS_CHANGED', this.handleSync);
        runtime.removeListener(PLAYER_SETTINGS_CHANGED, this.handleSync);
    }

    handleAfterStep () {
        const now = Date.now();
        if (now - this.lastPoll < POLL_MS) return;
        this.lastPoll = now;
        this.handleSync();
    }

    handleSync () {
        const available = Boolean(this.props.alwaysShow) || uses3d(this.props.vm);
        const settings = readPlayerSettings(this.props.storage);
        const project = readProjectDefaults(this.props.vm);
        if (available !== this.state.available ||
            JSON.stringify(settings) !== JSON.stringify(this.state.settings) ||
            JSON.stringify(project) !== JSON.stringify(this.state.project)) {
            this.setState({available, settings, project});
        }
    }

    applyPatch (patch) {
        const runtime = this.props.vm && (this.props.vm.runtime || this.props.vm);
        const next = updatePlayerSettings(patch, runtime, this.props.storage);
        const live = runtime ? peekView3d(runtime) : null;
        if (live && typeof live.setPlayerSettings === 'function') {
            live.setPlayerSettings(next);
        }
        this.setState({settings: next, project: readProjectDefaults(this.props.vm)});
    }

    handleToggleOpen (e) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (typeof document !== 'undefined' && document.pointerLockElement &&
            typeof document.exitPointerLock === 'function') {
            document.exitPointerLock();
        }
        this.setState(prev => ({
            open: !prev.open,
            settings: readPlayerSettings(this.props.storage),
            project: readProjectDefaults(this.props.vm)
        }));
    }

    handleClose () {
        this.setState({open: false});
        if (this.gearRef && typeof this.gearRef.focus === 'function') {
            this.gearRef.focus();
        }
    }

    handleReset () {
        const runtime = this.props.vm && (this.props.vm.runtime || this.props.vm);
        const next = resetPlayerSettings(runtime, this.props.storage);
        const live = runtime ? peekView3d(runtime) : null;
        if (live && typeof live.setPlayerSettings === 'function') {
            live.setPlayerSettings(next);
        }
        this.setState({settings: next, project: readProjectDefaults(this.props.vm)});
    }

    handleKeyDown (e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.handleClose();
        }
    }

    handleMouseSpeed (e) {
        this.applyPatch({mouseSpeed: Number(e.target.value)});
    }

    handleInvertLook () {
        this.applyPatch({invertLook: !this.state.settings.invertLook});
    }

    handleLookUpDown () {
        this.applyPatch({lookUpDown: !this.state.settings.lookUpDown});
    }

    handleHeadBobToggle () {
        const nextBob = this.state.settings.headBob > 0 ? 0 : 100;
        this.applyPatch({headBob: nextBob});
    }

    handleHeadBobSlider (e) {
        this.applyPatch({headBob: Number(e.target.value)});
    }

    handleFov (e) {
        this.applyPatch({fov: Number(e.target.value)});
    }

    handleQualityClick (e) {
        const mode = e.currentTarget && e.currentTarget.getAttribute('data-quality');
        if (mode) this.applyPatch({quality: mode});
    }

    handleDistanceClick (e) {
        const mode = e.currentTarget && e.currentTarget.getAttribute('data-distance');
        if (mode) this.applyPatch({drawDistance: mode});
    }

    render () {
        const {available, open, settings, project} = this.state;
        if (!available) return null;
        const {intl, className} = this.props;
        const activeQuality = settings.quality || project.quality || 'auto';
        const sliderFov = settings.fov === null ?
            Math.max(MIN_PLAYER_FOV, Math.min(MAX_PLAYER_FOV, Math.round(project.fov))) :
            settings.fov;
        const displayFov = settings.fov === null ? Math.round(project.fov) : settings.fov;
        const bobOn = settings.headBob > 0;

        return (
            <div
                className={classNames(styles.root, className)}
                data-testid="player-settings"
                onKeyDown={open ? this.handleKeyDown : null}
            >
                <button
                    type="button"
                    ref={this.setGearRef}
                    className={classNames(styles.gearButton, {[styles.gearButtonActive]: open})}
                    aria-label={intl.formatMessage(messages.openButton)}
                    aria-expanded={open}
                    aria-controls="sq-player-settings-panel"
                    data-testid="player-settings-gear"
                    onClick={this.handleToggleOpen}
                >
                    <GearIcon />
                </button>
                {open ? (
                    <div
                        id="sq-player-settings-panel"
                        role="dialog"
                        aria-label={intl.formatMessage(messages.title)}
                        className={styles.panel}
                        data-testid="player-settings-panel"
                    >
                        <div className={styles.header}>
                            <h2 className={styles.title}>
                                <FormattedMessage {...messages.title} />
                            </h2>
                            <div className={styles.headerActions}>
                                <button
                                    type="button"
                                    className={styles.actionButton}
                                    data-testid="player-settings-reset"
                                    onClick={this.handleReset}
                                >
                                    <FormattedMessage {...messages.resetButton} />
                                </button>
                                <button
                                    type="button"
                                    className={classNames(styles.actionButton, styles.actionButtonPrimary)}
                                    data-testid="player-settings-close"
                                    onClick={this.handleClose}
                                >
                                    <FormattedMessage {...messages.closeButton} />
                                </button>
                            </div>
                        </div>
                        {project.locked ? (
                            <div
                                className={styles.lockedBanner}
                                data-testid="player-settings-locked"
                            >
                                <FormattedMessage {...messages.lockedNotice} />
                            </div>
                        ) : null}
                        <div
                            className={styles.row}
                            data-setting="mouseSpeed"
                        >
                            <div className={styles.rowInline}>
                                <label
                                    className={styles.label}
                                    htmlFor="sq-ps-mouse-speed"
                                >
                                    <FormattedMessage {...messages.mouseSpeed} />
                                </label>
                                <span className={styles.valueBadge}>{settings.mouseSpeed}</span>
                            </div>
                            <div className={styles.sliderRow}>
                                <input
                                    id="sq-ps-mouse-speed"
                                    type="range"
                                    className={styles.slider}
                                    min={MIN_MOUSE_SPEED}
                                    max={MAX_MOUSE_SPEED}
                                    step={1}
                                    value={settings.mouseSpeed}
                                    onChange={this.handleMouseSpeed}
                                />
                            </div>
                        </div>
                        <div
                            className={styles.rowInline}
                            data-setting="invertLook"
                        >
                            <span className={styles.label}>
                                <FormattedMessage {...messages.invertLook} />
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={settings.invertLook}
                                aria-label={intl.formatMessage(messages.invertLook)}
                                className={classNames(styles.switchButton, {
                                    [styles.switchButtonOn]: settings.invertLook
                                })}
                                onClick={this.handleInvertLook}
                            >
                                <FormattedMessage {...(settings.invertLook ? messages.on : messages.off)} />
                            </button>
                        </div>
                        <div
                            className={styles.rowInline}
                            data-setting="lookUpDown"
                        >
                            <span className={styles.label}>
                                <FormattedMessage {...messages.lookUpDown} />
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={settings.lookUpDown}
                                aria-label={intl.formatMessage(messages.lookUpDown)}
                                className={classNames(styles.switchButton, {
                                    [styles.switchButtonOn]: settings.lookUpDown
                                })}
                                onClick={this.handleLookUpDown}
                            >
                                <FormattedMessage {...(settings.lookUpDown ? messages.on : messages.off)} />
                            </button>
                        </div>
                        <div
                            className={styles.row}
                            data-setting="headBob"
                        >
                            <div className={styles.rowInline}>
                                <label
                                    className={styles.label}
                                    htmlFor="sq-ps-head-bob"
                                >
                                    <FormattedMessage {...messages.headBob} />
                                </label>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={bobOn}
                                    aria-label={intl.formatMessage(messages.headBob)}
                                    className={classNames(styles.switchButton, {
                                        [styles.switchButtonOn]: bobOn
                                    })}
                                    onClick={this.handleHeadBobToggle}
                                >
                                    {bobOn ? `${settings.headBob}%` : <FormattedMessage {...messages.off} />}
                                </button>
                            </div>
                            <div className={styles.sliderRow}>
                                <input
                                    id="sq-ps-head-bob"
                                    type="range"
                                    className={styles.slider}
                                    min={MIN_HEAD_BOB}
                                    max={MAX_HEAD_BOB}
                                    step={5}
                                    value={settings.headBob}
                                    onChange={this.handleHeadBobSlider}
                                />
                            </div>
                        </div>
                        <div
                            className={styles.row}
                            data-setting="fov"
                        >
                            <div className={styles.rowInline}>
                                <label
                                    className={styles.label}
                                    htmlFor="sq-ps-fov"
                                >
                                    <FormattedMessage {...messages.fov} />
                                </label>
                                <span className={styles.valueBadge}>{`${displayFov}°`}</span>
                            </div>
                            <div className={styles.sliderRow}>
                                <input
                                    id="sq-ps-fov"
                                    type="range"
                                    className={styles.slider}
                                    min={MIN_PLAYER_FOV}
                                    max={MAX_PLAYER_FOV}
                                    step={1}
                                    value={sliderFov}
                                    onChange={this.handleFov}
                                />
                            </div>
                        </div>
                        <div
                            className={styles.row}
                            data-setting="quality"
                        >
                            <span className={styles.label}>
                                <FormattedMessage {...messages.quality} />
                            </span>
                            <div
                                className={styles.choices}
                                role="group"
                                aria-label={intl.formatMessage(messages.quality)}
                            >
                                {QUALITY_MODES.map(mode => (
                                    <button
                                        key={mode}
                                        type="button"
                                        data-quality={mode}
                                        aria-pressed={activeQuality === mode}
                                        className={classNames(styles.choiceButton, {
                                            [styles.choiceButtonActive]: activeQuality === mode
                                        })}
                                        onClick={this.handleQualityClick}
                                    >
                                        <FormattedMessage {...QUALITY_LABELS[mode]} />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div
                            className={styles.row}
                            data-setting="drawDistance"
                        >
                            <span className={styles.label}>
                                <FormattedMessage {...messages.drawDistance} />
                            </span>
                            <div
                                className={styles.choices}
                                role="group"
                                aria-label={intl.formatMessage(messages.drawDistance)}
                            >
                                {DRAW_DISTANCES.map(mode => (
                                    <button
                                        key={mode}
                                        type="button"
                                        data-distance={mode}
                                        aria-pressed={settings.drawDistance === mode}
                                        className={classNames(styles.choiceButton, {
                                            [styles.choiceButtonActive]: settings.drawDistance === mode
                                        })}
                                        onClick={this.handleDistanceClick}
                                    >
                                        <FormattedMessage {...DISTANCE_LABELS[mode]} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }
}

PlayerSettingsComponent.propTypes = {
    alwaysShow: PropTypes.bool,
    className: PropTypes.string,
    defaultOpen: PropTypes.bool,
    intl: intlShape.isRequired,
    storage: PropTypes.object,
    vm: PropTypes.shape({
        runtime: PropTypes.object
    })
};

const PlayerSettings = injectIntl(PlayerSettingsComponent);
PlayerSettings.Raw = PlayerSettingsComponent;

export {uses3d, readProjectDefaults};
export default PlayerSettings;
