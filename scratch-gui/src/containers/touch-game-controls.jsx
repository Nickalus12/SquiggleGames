import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import TouchGameControlsComponent from '../components/touch-game-controls/touch-game-controls.jsx';
import {keyboardData, listenedTouchKeys} from '../lib/touch-keys';
import {setProjectUsesKeys, touchControlsVisible} from '../reducers/layout-mode';

const SCAN_DELAY = 500;

class TouchGameControls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleKey',
            'scheduleScan',
            'scan'
        ]);
        this.scanTimer = null;
        this.state = {keys: []};
    }
    componentDidMount () {
        const {vm} = this.props;
        vm.on('PROJECT_LOADED', this.scheduleScan);
        vm.on('PROJECT_CHANGED', this.scheduleScan);
        vm.on('workspaceUpdate', this.scheduleScan);
        this.scan();
    }
    componentWillUnmount () {
        const {vm} = this.props;
        vm.off('PROJECT_LOADED', this.scheduleScan);
        vm.off('PROJECT_CHANGED', this.scheduleScan);
        vm.off('workspaceUpdate', this.scheduleScan);
        clearTimeout(this.scanTimer);
    }
    scheduleScan () {
        clearTimeout(this.scanTimer);
        this.scanTimer = setTimeout(this.scan, SCAN_DELAY);
    }
    scan () {
        this.scanTimer = null;
        const keys = Array.from(listenedTouchKeys(this.props.vm.runtime.targets)).sort();
        if (keys.join() !== this.state.keys.join()) this.setState({keys});
        this.props.onSetProjectUsesKeys(keys.length > 0);
    }
    handleKey (name, isDown) {
        const data = keyboardData(name, isDown);
        if (data) this.props.vm.postIOData('keyboard', data);
    }
    render () {
        if (!this.props.show || !this.props.visible) return null;
        return (
            <TouchGameControlsComponent
                className={this.props.className}
                keys={this.state.keys}
                layout={this.props.layout}
                onKey={this.handleKey}
            />
        );
    }
}

TouchGameControls.propTypes = {
    className: PropTypes.string,
    layout: PropTypes.oneOf(['bottom', 'sides', 'overlay']),
    onSetProjectUsesKeys: PropTypes.func.isRequired,
    show: PropTypes.bool,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};

TouchGameControls.defaultProps = {
    show: true
};

const mapStateToProps = state => ({
    visible: touchControlsVisible(state.scratchGui.layoutMode)
});

const mapDispatchToProps = dispatch => ({
    onSetProjectUsesKeys: uses => dispatch(setProjectUsesKeys(uses))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(TouchGameControls);
