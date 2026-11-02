import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

import {connect} from 'react-redux';
import VM from 'scratch-vm';
import Box from '../components/box/box.jsx';
import greenFlag from '../components/green-flag/icon--green-flag.svg';
import {setStartedState} from '../reducers/vm-status.js';

class GreenFlagOverlay extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClick'
        ]);
    }

    handleClick () {
        this.props.vm.start();
        this.props.vm.greenFlag();
        this.props.onStarted();
    }

    render () {
        return (
            <Box
                className={this.props.wrapperClass}
                onClick={this.handleClick}
            >
                <button
                    className={this.props.className}
                    type="button"
                >
                    <img
                        alt=""
                        draggable={false}
                        src={greenFlag}
                    />
                    <span>
                        <FormattedMessage
                            defaultMessage="Click to play"
                            description="Overlay button on the stage to start the game"
                            id="sq.stage.clickToPlay"
                        />
                    </span>
                </button>
            </Box>
        );
    }
}

GreenFlagOverlay.propTypes = {
    className: PropTypes.string,
    vm: PropTypes.instanceOf(VM),
    wrapperClass: PropTypes.string,
    onStarted: PropTypes.func
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onStarted: () => dispatch(setStartedState(true))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(GreenFlagOverlay);
