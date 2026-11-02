import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import FancyCheckbox from '../tw-fancy-checkbox/checkbox.jsx';
import Input from '../forms/input.jsx';
import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import {STAGE_PRESETS, MIN_FPS, MAX_FPS} from '../../lib/game-settings.js';
import styles from './settings-modal.css';

/* eslint-disable react/no-multi-comp */

const BufferedInput = BufferedInputHOC(Input);

const messages = defineMessages({
    title: {
        defaultMessage: 'Game settings',
        description: 'Title of the game settings modal',
        id: 'sq.settings.title'
    },
    normal: {
        defaultMessage: 'Normal',
        description: 'Stage shape preset, the Scratch default',
        id: 'sq.settings.stage.normal'
    },
    wide: {
        defaultMessage: 'Wide',
        description: 'Stage shape preset, widescreen',
        id: 'sq.settings.stage.wide'
    },
    tall: {
        defaultMessage: 'Tall',
        description: 'Stage shape preset, portrait for phones',
        id: 'sq.settings.stage.tall'
    },
    custom: {
        defaultMessage: 'Custom',
        description: 'Stage shape preset, pick your own size',
        id: 'sq.settings.stage.custom'
    }
});

const Setting = ({value, onChange, label, detail, children}) => (
    <div className={classNames(styles.setting, {[styles.active]: value})}>
        <label className={styles.label}>
            <FancyCheckbox
                className={styles.checkbox}
                checked={value}
                onChange={onChange}
            />
            {label}
        </label>
        <p className={styles.detail}>{detail}</p>
        {children}
    </div>
);
Setting.propTypes = {
    value: PropTypes.bool.isRequired,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.node.isRequired,
    detail: PropTypes.node.isRequired,
    children: PropTypes.node
};

const Header = ({children}) => (
    <div className={styles.header}>
        {children}
        <div className={styles.divider} />
    </div>
);
Header.propTypes = {
    children: PropTypes.node
};

const Framerate = ({framerate, onChange, onValue}) => (
    <Setting
        value={framerate !== 30}
        onChange={onChange}
        label={
            <FormattedMessage
                defaultMessage="60 frames a second"
                description="Setting that doubles the script rate"
                id="sq.settings.fps"
            />
        }
        detail={
            <FormattedMessage
                defaultMessage="Scripts run twice as fast. Many games get too fast to play. Try Smooth motion first."
                description="Help for the 60 frames a second setting"
                id="sq.settings.fpsDetail"
            />
        }
    >
        {framerate !== 30 && (
            <label className={styles.inline}>
                <FormattedMessage
                    defaultMessage="Frames a second:"
                    description="Label for the custom framerate field"
                    id="sq.settings.fpsValue"
                />
                <BufferedInput
                    value={framerate}
                    onSubmit={onValue}
                    className={styles.numberInput}
                    type="number"
                    min={MIN_FPS}
                    max={MAX_FPS}
                    step="1"
                />
            </label>
        )}
    </Setting>
);
Framerate.propTypes = {
    framerate: PropTypes.number,
    onChange: PropTypes.func,
    onValue: PropTypes.func
};

const ACTION_KEY_SLOTS = [
    {key: 'space', label: 'Space', placeholder: 'Jump'},
    {key: 'e', label: 'E key', placeholder: 'Use'},
    {key: 'f', label: 'F key', placeholder: 'Fire'},
    {key: 'q', label: 'Q key', placeholder: 'Dash'}
];

const ControlsAndHud = ({
    touchMode,
    actionLabels,
    hudSettings,
    onTouchModeChange,
    onActionLabelChange,
    onHudToggle
}) => {
    const hud = hudSettings || {enabled: true, scores: true, teams: true, timer: true, health: true};
    const labels = actionLabels || {};
    return (
        <React.Fragment>
            <Header>
                <FormattedMessage
                    defaultMessage="Controls and HUD"
                    description="Section of game settings for touch controls and HUD"
                    id="sq.settings.controlsHud"
                />
            </Header>
            <div
                className={styles.presets}
                role="group"
                aria-label="Touch movement style"
            >
                <button
                    type="button"
                    data-touch-mode="thumbstick"
                    className={classNames(styles.preset, {[styles.selected]: touchMode !== 'dpad'})}
                    aria-pressed={touchMode !== 'dpad'}
                    onClick={onTouchModeChange}
                >
                    {'Thumbstick'}
                    <small>{'Smooth 360° pad'}</small>
                </button>
                <button
                    type="button"
                    data-touch-mode="dpad"
                    className={classNames(styles.preset, {[styles.selected]: touchMode === 'dpad'})}
                    aria-pressed={touchMode === 'dpad'}
                    onClick={onTouchModeChange}
                >
                    {'D-Pad'}
                    <small>{'Classic arrows'}</small>
                </button>
            </div>
            <div className={styles.actionLabelsGrid}>
                {ACTION_KEY_SLOTS.map(slot => (
                    <label
                        key={slot.key}
                        className={styles.actionLabelItem}
                    >
                        <span>{slot.label}</span>
                        <BufferedInput
                            value={labels[slot.key] || ''}
                            placeholder={slot.placeholder}
                            onSubmit={val => onActionLabelChange && onActionLabelChange(slot.key, val)}
                            className={styles.textInput}
                            type="text"
                        />
                    </label>
                ))}
            </div>
            <Setting
                value={hud.enabled !== false}
                onChange={e => onHudToggle && onHudToggle('enabled', e.target.checked)}
                label={
                    <FormattedMessage
                        defaultMessage="Show game HUD bar"
                        description="Toggle the automatic platform HUD for scores, teams, timer, and health"
                        id="sq.settings.hudEnabled"
                    />
                }
                detail={
                    <FormattedMessage
                        defaultMessage="Displays sleek scoreboards, team tallies, round timers, and health bars automatically."
                        description="Help text for the automatic HUD setting"
                        id="sq.settings.hudEnabledDetail"
                    />
                }
            >
                {hud.enabled !== false && (
                    <div className={styles.hudPills}>
                        {[
                            {id: 'scores', text: 'Leaderboard'},
                            {id: 'teams', text: 'Teams'},
                            {id: 'timer', text: 'Timer'},
                            {id: 'health', text: 'Health bar'}
                        ].map(item => (
                            <label
                                key={item.id}
                                className={styles.hudPill}
                            >
                                <FancyCheckbox
                                    className={styles.checkbox}
                                    checked={hud[item.id] !== false}
                                    onChange={e => onHudToggle && onHudToggle(item.id, e.target.checked)}
                                />
                                <span>{item.text}</span>
                            </label>
                        ))}
                    </div>
                )}
            </Setting>
        </React.Fragment>
    );
};
ControlsAndHud.propTypes = {
    touchMode: PropTypes.string,
    actionLabels: PropTypes.objectOf(PropTypes.string),
    hudSettings: PropTypes.shape({
        enabled: PropTypes.bool,
        scores: PropTypes.bool,
        teams: PropTypes.bool,
        timer: PropTypes.bool,
        health: PropTypes.bool
    }),
    onTouchModeChange: PropTypes.func,
    onActionLabelChange: PropTypes.func,
    onHudToggle: PropTypes.func
};

const StageShape = ({stageWidth, stageHeight, preset, onPreset, onStageWidthChange, onStageHeightChange, intl}) => (
    <React.Fragment>
        <div
            className={styles.presets}
            role="group"
            aria-label={intl.formatMessage({
                defaultMessage: 'Stage shape',
                description: 'Section of the game settings about the stage size',
                id: 'sq.settings.stage'
            })}
        >
            {STAGE_PRESETS.map(p => (
                <button
                    key={p.id}
                    type="button"
                    data-preset={p.id}
                    className={classNames(styles.preset, {[styles.selected]: preset === p.id})}
                    aria-pressed={preset === p.id}
                    onClick={onPreset}
                >
                    {intl.formatMessage(messages[p.id])}
                    <small>{`${p.width} × ${p.height}`}</small>
                </button>
            ))}
            <button
                type="button"
                data-preset="custom"
                className={classNames(styles.preset, {[styles.selected]: preset === 'custom'})}
                aria-pressed={preset === 'custom'}
                onClick={onPreset}
            >
                {intl.formatMessage(messages.custom)}
                <small>{preset === 'custom' ? `${stageWidth} × ${stageHeight}` : '…'}</small>
            </button>
        </div>
        {preset === 'custom' && (
            <div className={styles.customStageSize}>
                <BufferedInput
                    value={stageWidth}
                    onSubmit={onStageWidthChange}
                    className={styles.numberInput}
                    type="number"
                    min="0"
                    max="1024"
                    step="1"
                    aria-label="Width"
                />
                <span>{'×'}</span>
                <BufferedInput
                    value={stageHeight}
                    onSubmit={onStageHeightChange}
                    className={styles.numberInput}
                    type="number"
                    min="0"
                    max="1024"
                    step="1"
                    aria-label="Height"
                />
            </div>
        )}
        <p className={styles.detail}>
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Tall fits a phone held upright. A game built for one shape usually needs changes to fit another."
                description="Help for the stage shape presets"
                id="sq.settings.stageDetail"
            />
        </p>
        {(stageWidth >= 1000 || stageHeight >= 1000) && (
            <div className={styles.warning}>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="That is very big. Pick a smaller size with the same shape and let full screen scale it up."
                    description="Warning about a very large custom stage size"
                    id="sq.settings.largeStage"
                />
            </div>
        )}
    </React.Fragment>
);
StageShape.propTypes = {
    intl: intlShape,
    stageWidth: PropTypes.number,
    stageHeight: PropTypes.number,
    preset: PropTypes.string,
    onPreset: PropTypes.func,
    onStageWidthChange: PropTypes.func,
    onStageHeightChange: PropTypes.func
};

const SettingsModalComponent = props => (
    <Modal
        className={styles.modalContent}
        onRequestClose={props.onClose}
        contentLabel={props.intl.formatMessage(messages.title)}
        id="settingsModal"
    >
        <Box className={styles.body}>
            {!props.isEmbedded && (
                <p className={styles.intro}>
                    <FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Tune how your game runs. These settings save with your game, so friends play it the way you made it."
                        description="Intro line of the game settings modal"
                        id="sq.settings.intro"
                    />
                </p>
            )}

            <Header>
                <FormattedMessage
                    defaultMessage="Make it smoother"
                    description="Game settings section"
                    id="sq.settings.smoother"
                />
            </Header>
            <Setting
                value={props.interpolation}
                onChange={props.onInterpolationChange}
                label={
                    <FormattedMessage
                        defaultMessage="Smooth motion"
                        description="Interpolation setting"
                        id="sq.settings.interpolation"
                    />
                }
                detail={
                    <FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Sprites glide instead of jumping between frames. Skip this for pen drawings and 3D games."
                        description="Help for the interpolation setting"
                        id="sq.settings.interpolationDetail"
                    />
                }
            />
            <Framerate
                framerate={props.framerate}
                onChange={props.onFramerateChange}
                onValue={props.onFramerateValue}
            />
            <Setting
                value={props.highQualityPen}
                onChange={props.onHighQualityPenChange}
                label={
                    <FormattedMessage
                        defaultMessage="Sharp pen"
                        description="High quality pen setting"
                        id="sq.settings.hqpen"
                    />
                }
                detail={
                    <FormattedMessage
                        defaultMessage="Pen lines stay crisp when the stage is big. A little slower on old computers."
                        description="Help for the high quality pen setting"
                        id="sq.settings.hqpenDetail"
                    />
                }
            />

            <Header>
                <FormattedMessage
                    defaultMessage="Take off the limits"
                    description="Game settings section"
                    id="sq.settings.limits"
                />
            </Header>
            <Setting
                value={props.infiniteClones}
                onChange={props.onInfiniteClonesChange}
                label={
                    <FormattedMessage
                        defaultMessage="More than 300 clones"
                        description="Infinite clones setting"
                        id="sq.settings.clones"
                    />
                }
                detail={
                    <FormattedMessage
                        defaultMessage="Scratch stops at 300 clones. This lets you make as many as you like."
                        description="Help for the infinite clones setting"
                        id="sq.settings.clonesDetail"
                    />
                }
            />
            <Setting
                value={props.removeFencing}
                onChange={props.onRemoveFencingChange}
                label={
                    <FormattedMessage
                        defaultMessage="Sprites can leave the stage"
                        description="Remove fencing setting"
                        id="sq.settings.fencing"
                    />
                }
                detail={
                    <FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Sprites can go past the edge, grow huge or tiny, and still touch things out there."
                        description="Help for the remove fencing setting"
                        id="sq.settings.fencingDetail"
                    />
                }
            />
            <Setting
                value={props.removeLimits}
                onChange={props.onRemoveLimitsChange}
                label={
                    <FormattedMessage
                        defaultMessage="Louder effects and bigger pen"
                        description="Remove miscellaneous limits setting"
                        id="sq.settings.misc"
                    />
                }
                detail={
                    <FormattedMessage
                        defaultMessage="Takes the caps off sound effects and pen size."
                        description="Help for the remove miscellaneous limits setting"
                        id="sq.settings.miscDetail"
                    />
                }
            />

            {!props.isEmbedded && (
                <React.Fragment>
                    <Header>
                        <FormattedMessage
                            defaultMessage="Stage shape"
                            description="Section of the game settings about the stage size"
                            id="sq.settings.stage"
                        />
                    </Header>
                    <StageShape
                        intl={props.intl}
                        stageWidth={props.stageWidth}
                        stageHeight={props.stageHeight}
                        preset={props.stagePreset}
                        onPreset={props.onStagePreset}
                        onStageWidthChange={props.onStageWidthChange}
                        onStageHeightChange={props.onStageHeightChange}
                    />
                    <ControlsAndHud
                        touchMode={props.touchMode}
                        actionLabels={props.actionLabels}
                        hudSettings={props.hudSettings}
                        onTouchModeChange={props.onTouchModeChange}
                        onActionLabelChange={props.onActionLabelChange}
                        onHudToggle={props.onHudToggle}
                    />
                </React.Fragment>
            )}

            <details className={styles.experts}>
                <summary>
                    <FormattedMessage
                        defaultMessage="For experts"
                        description="Collapsed section of the game settings with editor-only switches"
                        id="sq.settings.experts"
                    />
                </summary>
                <Setting
                    value={props.warpTimer}
                    onChange={props.onWarpTimerChange}
                    label={
                        <FormattedMessage
                            defaultMessage="Stuck-loop guard"
                            description="Warp timer setting"
                            id="sq.settings.warpTimer"
                        />
                    }
                    detail={
                        <FormattedMessage
                            // eslint-disable-next-line max-len
                            defaultMessage="Catches forever loops that never end so the editor does not freeze. It costs speed, so it is on here and off when your game is played."
                            description="Help for the warp timer setting"
                            id="sq.settings.warpTimerDetail"
                        />
                    }
                />
                <Setting
                    value={props.disableCompiler}
                    onChange={props.onDisableCompilerChange}
                    label={
                        <FormattedMessage
                            defaultMessage="Turn off the compiler"
                            description="Disable compiler setting"
                            id="sq.settings.compiler"
                        />
                    }
                    detail={
                        <FormattedMessage
                            // eslint-disable-next-line max-len
                            defaultMessage="Runs scripts the slow way so a change shows the instant you make it. Leave this off unless a block acts strangely."
                            description="Help for the disable compiler setting"
                            id="sq.settings.compilerDetail"
                        />
                    }
                />
                {!props.isEmbedded && (
                    <p className={styles.footnote}>
                        <FormattedMessage
                            defaultMessage="These two are for this editor only. Everything above saves with your game."
                            description="Footnote under the expert settings"
                            id="sq.settings.expertsNote"
                        />
                    </p>
                )}
            </details>
        </Box>
    </Modal>
);

SettingsModalComponent.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func,
    isEmbedded: PropTypes.bool,
    framerate: PropTypes.number,
    onFramerateChange: PropTypes.func,
    onFramerateValue: PropTypes.func,
    highQualityPen: PropTypes.bool,
    onHighQualityPenChange: PropTypes.func,
    interpolation: PropTypes.bool,
    onInterpolationChange: PropTypes.func,
    infiniteClones: PropTypes.bool,
    onInfiniteClonesChange: PropTypes.func,
    removeFencing: PropTypes.bool,
    onRemoveFencingChange: PropTypes.func,
    removeLimits: PropTypes.bool,
    onRemoveLimitsChange: PropTypes.func,
    warpTimer: PropTypes.bool,
    onWarpTimerChange: PropTypes.func,
    disableCompiler: PropTypes.bool,
    onDisableCompilerChange: PropTypes.func,
    stageWidth: PropTypes.number,
    stageHeight: PropTypes.number,
    stagePreset: PropTypes.string,
    onStagePreset: PropTypes.func,
    onStageWidthChange: PropTypes.func,
    onStageHeightChange: PropTypes.func,
    touchMode: PropTypes.string,
    actionLabels: PropTypes.objectOf(PropTypes.string),
    hudSettings: PropTypes.shape({
        enabled: PropTypes.bool,
        scores: PropTypes.bool,
        teams: PropTypes.bool,
        timer: PropTypes.bool,
        health: PropTypes.bool
    }),
    onTouchModeChange: PropTypes.func,
    onActionLabelChange: PropTypes.func,
    onHudToggle: PropTypes.func
};

export default injectIntl(SettingsModalComponent);
