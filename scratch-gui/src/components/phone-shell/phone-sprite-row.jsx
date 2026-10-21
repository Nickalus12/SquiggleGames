import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {setFullScreen} from '../../reducers/mode';
import {setTouchControls, touchControlsVisible} from '../../reducers/layout-mode';

import styles from './phone-shell.css';

const messages = defineMessages({
    fullScreen: {
        id: 'gui.phone.fullScreen',
        defaultMessage: 'Full screen',
        description: 'Button that shows the stage full screen on phones'
    },
    gameKeys: {
        id: 'gui.phone.gameKeys',
        defaultMessage: 'Game buttons',
        description: 'Button that shows or hides on-screen arrow and space buttons'
    },
    position: {
        id: 'gui.phone.spritePosition',
        defaultMessage: 'x: {x}  y: {y}',
        description: 'Position of the selected sprite on the phone stage tab'
    }
});

const GAMEPAD_PATH = [
    'M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-1a4 4 0 0 1 4-4z',
    'M7 10.5v4M5 12.5h4M15.5 11.5h.01M18 14h.01'
].join('');

class PhoneSpriteRow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleFullScreen',
            'handleToggleKeys'
        ]);
    }
    handleFullScreen () {
        this.props.onSetFullScreen();
    }
    handleToggleKeys () {
        this.props.onSetTouchControls(!this.props.keysVisible);
    }
    render () {
        const {intl, keysVisible, target} = this.props;
        const isSprite = target && !target.isStage;
        return (
            <div
                className={styles.spriteRow}
                data-phone-sprite-row
            >
                <div className={styles.spriteInfo}>
                    <span className={styles.spriteName}>{target ? target.name : ''}</span>
                    {isSprite ? (
                        <span className={styles.spritePosition}>
                            {intl.formatMessage(messages.position, {
                                x: Math.round(target.x),
                                y: Math.round(target.y)
                            })}
                        </span>
                    ) : null}
                </div>
                <button
                    aria-label={intl.formatMessage(messages.gameKeys)}
                    aria-pressed={keysVisible}
                    className={classNames(styles.iconButton, styles.rowButton)}
                    data-touch-keys-toggle
                    title={intl.formatMessage(messages.gameKeys)}
                    type="button"
                    onClick={this.handleToggleKeys}
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                    >
                        <path
                            d={GAMEPAD_PATH}
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                        />
                    </svg>
                </button>
                <button
                    aria-label={intl.formatMessage(messages.fullScreen)}
                    className={classNames(styles.iconButton, styles.rowButton)}
                    data-phone-fullscreen
                    title={intl.formatMessage(messages.fullScreen)}
                    type="button"
                    onClick={this.handleFullScreen}
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                    >
                        <path
                            d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                        />
                    </svg>
                </button>
            </div>
        );
    }
}

PhoneSpriteRow.propTypes = {
    intl: intlShape.isRequired,
    keysVisible: PropTypes.bool,
    onSetFullScreen: PropTypes.func.isRequired,
    onSetTouchControls: PropTypes.func.isRequired,
    target: PropTypes.shape({
        isStage: PropTypes.bool,
        name: PropTypes.string,
        x: PropTypes.number,
        y: PropTypes.number
    })
};

const mapStateToProps = state => {
    const targets = state.scratchGui.targets;
    const id = targets.editingTarget;
    const target = targets.sprites[id] || (targets.stage && targets.stage.id === id ? targets.stage : null);
    return {
        keysVisible: touchControlsVisible(state.scratchGui.layoutMode),
        target
    };
};

const mapDispatchToProps = dispatch => ({
    onSetFullScreen: () => dispatch(setFullScreen(true)),
    onSetTouchControls: show => dispatch(setTouchControls(show))
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(PhoneSpriteRow));
