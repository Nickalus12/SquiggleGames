import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import TouchGameControlsComponent from '../components/touch-game-controls/touch-game-controls.jsx';
import styles from '../components/touch-game-controls/touch-game-controls.css';
import {keyboardData, listenedTouchKeys, touchLayoutFor} from '../lib/touch-keys';
import {readGameSettings} from '../lib/game-settings';
import {playerTouchControlsVisible, setProjectUsesKeys, touchControlsVisible} from '../reducers/layout-mode';

const SCAN_DELAY = 500;
const HINT_DURATION = 3200;

class TouchGameControls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleKey',
            'handleProjectStart',
            'handleSettingsChanged',
            'dismissHint',
            'scheduleScan',
            'scan'
        ]);
        this.scanTimer = null;
        this.hintTimer = null;
        const squiggle = readGameSettings(props.vm);
        this.state = {
            keys: [],
            touchMode: squiggle.touchMode,
            actionLabels: squiggle.actionLabels,
            showHint: false
        };
    }
    componentDidMount () {
        const {vm} = this.props;
        vm.on('PROJECT_LOADED', this.scheduleScan);
        vm.on('PROJECT_CHANGED', this.scheduleScan);
        vm.on('workspaceUpdate', this.scheduleScan);
        if (vm.runtime && typeof vm.runtime.on === 'function') {
            vm.runtime.on('PROJECT_START', this.handleProjectStart);
            vm.runtime.on('SQUIGGLE_SETTINGS_CHANGED', this.handleSettingsChanged);
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', this.dismissHint);
        }
        this.scan();
    }
    componentWillUnmount () {
        const {vm} = this.props;
        vm.off('PROJECT_LOADED', this.scheduleScan);
        vm.off('PROJECT_CHANGED', this.scheduleScan);
        vm.off('workspaceUpdate', this.scheduleScan);
        if (vm.runtime && typeof vm.runtime.removeListener === 'function') {
            vm.runtime.removeListener('PROJECT_START', this.handleProjectStart);
            vm.runtime.removeListener('SQUIGGLE_SETTINGS_CHANGED', this.handleSettingsChanged);
        }
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', this.dismissHint);
        }
        clearTimeout(this.scanTimer);
        clearTimeout(this.hintTimer);
    }
    handleSettingsChanged () {
        const squiggle = readGameSettings(this.props.vm);
        this.setState({
            touchMode: squiggle.touchMode,
            actionLabels: squiggle.actionLabels
        });
    }
    handleProjectStart () {
        if (!this.props.player || this.props.visible || !this.props.finePointer) return;
        if (this.state.keys.length === 0) return;
        clearTimeout(this.hintTimer);
        this.setState({showHint: true});
        this.hintTimer = setTimeout(this.dismissHint, HINT_DURATION);
    }
    dismissHint () {
        clearTimeout(this.hintTimer);
        this.hintTimer = null;
        if (this.state.showHint) this.setState({showHint: false});
    }
    scheduleScan () {
        clearTimeout(this.scanTimer);
        this.scanTimer = setTimeout(this.scan, SCAN_DELAY);
    }
    scan () {
        this.scanTimer = null;
        const keys = Array.from(listenedTouchKeys(this.props.vm.runtime.targets)).sort();
        const squiggle = readGameSettings(this.props.vm);
        this.setState({
            keys,
            touchMode: squiggle.touchMode,
            actionLabels: squiggle.actionLabels
        });
        this.props.onSetProjectUsesKeys(keys.length > 0);
    }
    handleKey (name, isDown) {
        const data = keyboardData(name, isDown);
        if (data) this.props.vm.postIOData('keyboard', data);
    }
    renderHint () {
        const {pad, actions} = touchLayoutFor(this.state.keys);
        const parts = [];
        if (pad.length) parts.push('Move: WASD / Arrows');
        actions.forEach(act => {
            const label = (this.state.actionLabels && this.state.actionLabels[act]) || '';
            const keyName = act === 'space' ? 'Space' : act.toUpperCase();
            parts.push(label ? `${keyName}: ${label}` : keyName);
        });
        if (!parts.length) return null;
        return (
            <div
                className={styles.desktopHint}
                data-testid="desktop-controls-hint"
            >
                {parts.join(' · ')}
            </div>
        );
    }
    render () {
        if (!this.props.show) return null;
        if (!this.props.visible) {
            return this.state.showHint ? this.renderHint() : null;
        }
        return (
            <TouchGameControlsComponent
                actionLabels={this.state.actionLabels}
                className={this.props.className}
                keys={this.state.keys}
                layout={this.props.layout}
                touchMode={this.state.touchMode}
                onKey={this.handleKey}
            />
        );
    }
}

TouchGameControls.propTypes = {
    className: PropTypes.string,
    finePointer: PropTypes.bool,
    layout: PropTypes.oneOf(['bottom', 'sides', 'overlay', 'stage']),
    onSetProjectUsesKeys: PropTypes.func.isRequired,
    player: PropTypes.bool,
    show: PropTypes.bool,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};

TouchGameControls.defaultProps = {
    show: true
};

const mapStateToProps = (state, ownProps) => ({
    finePointer: !!state.scratchGui.layoutMode.finePointer,
    visible: ownProps.player ?
        playerTouchControlsVisible(state.scratchGui.layoutMode) :
        touchControlsVisible(state.scratchGui.layoutMode)
});

const mapDispatchToProps = dispatch => ({
    onSetProjectUsesKeys: uses => dispatch(setProjectUsesKeys(uses))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(TouchGameControls);
