import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import VM from 'scratch-vm';

import {
    applyPause,
    initialPause,
    livePeerCount,
    messages,
    stepPause
} from '../../lib/player-pause.js';
import styles from './player-pause.css';

const PauseCard = ({card, onTap}) => (
    <button
        className={styles.scrim}
        data-pause-card={card}
        type="button"
        onClick={onTap}
    >
        <span className={styles.card}>
            <FormattedMessage {...messages.keepPlaying} />
            {card === 'room' ? (
                <span className={styles.note}>
                    <FormattedMessage {...messages.friends} />
                </span>
            ) : null}
        </span>
    </button>
);

PauseCard.propTypes = {
    card: PropTypes.oneOf(['solo', 'room']),
    onTap: PropTypes.func.isRequired
};

class PlayerPause extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'onKeyDown',
            'handleTap',
            'onProjectStart',
            'onProjectStop'
        ]);
        this.model = initialPause();
        this.state = this.model;
    }
    componentDidMount () {
        window.addEventListener('keydown', this.onKeyDown, true);
        this.props.vm.runtime.on('PROJECT_START', this.onProjectStart);
        this.props.vm.runtime.on('PROJECT_STOP_ALL', this.onProjectStop);
    }
    componentWillUnmount () {
        window.removeEventListener('keydown', this.onKeyDown, true);
        this.props.vm.runtime.removeListener('PROJECT_START', this.onProjectStart);
        this.props.vm.runtime.removeListener('PROJECT_STOP_ALL', this.onProjectStop);
        if (this.model.held) {
            applyPause(this.props.vm, {clock: 'resume', vm: 'resume', restart: false});
        }
    }
    step (type) {
        const next = stepPause(this.model, {type, peerCount: livePeerCount()});
        this.model = next.state;
        applyPause(this.props.vm, next.effects);
        this.setState(next.state);
    }
    onKeyDown (event) {
        if (event.key !== 'Escape' || event.repeat) return;
        const target = event.target;
        const tag = target && target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) return;
        event.preventDefault();
        event.stopPropagation();
        this.step('escape');
    }
    handleTap () {
        this.step('tap');
    }
    onProjectStart () {
        this.step('greenFlag');
    }
    onProjectStop () {
        this.step('stop');
    }
    render () {
        if (!this.state.overlay) return null;
        return (
            <PauseCard
                card={this.state.card}
                onTap={this.handleTap}
            />
        );
    }
}

PlayerPause.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired
};

export default PlayerPause;
export {PauseCard};
