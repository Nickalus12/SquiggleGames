import bindAll from 'lodash.bindall';
import omit from 'lodash.omit';
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {LAYOUT_MODES, detectLayoutMode, watchLayoutMode} from './layout-mode';
import {STAGE_SIZE_MODES} from './layout-constants';
import {setLayoutMode, setViewport} from '../reducers/layout-mode';
import {setStageSize} from '../reducers/stage-size';

const OWN_PROPS = [
    'layoutMode',
    'miniStage',
    'onSetLayoutMode',
    'onSetStageSize',
    'onSetViewport',
    'phonePaletteOpen',
    'phoneTab',
    'stageSizeMode'
];

const LayoutModeHOC = function (WrappedComponent) {
    class LayoutModeWatcher extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleModeChange',
                'handleResize',
                'flushResize',
                'announceResize'
            ]);
            this.resizeFrame = null;
            this.announceFrame = null;
            this.savedStageSize = null;
        }
        componentDidMount () {
            this.stopWatching = watchLayoutMode(window, this.handleModeChange);
            window.addEventListener('resize', this.handleResize);
            this.handleModeChange(detectLayoutMode(window));
            if (this.props.layoutMode === LAYOUT_MODES.tablet) this.enterTablet();
        }
        componentDidUpdate (prevProps) {
            const {layoutMode} = this.props;
            if (
                layoutMode === LAYOUT_MODES.phone &&
                (this.props.phoneTab !== prevProps.phoneTab ||
                    this.props.miniStage !== prevProps.miniStage ||
                    this.props.phonePaletteOpen !== prevProps.phonePaletteOpen)
            ) {
                this.scheduleAnnounce();
            }
            if (layoutMode === prevProps.layoutMode) return;
            if (layoutMode === LAYOUT_MODES.tablet) this.enterTablet();
            else if (prevProps.layoutMode === LAYOUT_MODES.tablet) this.leaveTablet();
            if (layoutMode === LAYOUT_MODES.phone) this.flushResize();
        }
        componentWillUnmount () {
            if (this.stopWatching) this.stopWatching();
            window.removeEventListener('resize', this.handleResize);
            if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
            if (this.announceFrame) cancelAnimationFrame(this.announceFrame);
        }
        scheduleAnnounce () {
            if (this.announceFrame) cancelAnimationFrame(this.announceFrame);
            this.announceFrame = requestAnimationFrame(this.announceResize);
        }
        announceResize () {
            this.announceFrame = null;
            window.dispatchEvent(new Event('resize'));
        }
        enterTablet () {
            if (this.props.stageSizeMode === STAGE_SIZE_MODES.small) return;
            this.savedStageSize = this.props.stageSizeMode;
            this.props.onSetStageSize(STAGE_SIZE_MODES.small);
        }
        leaveTablet () {
            const saved = this.savedStageSize;
            this.savedStageSize = null;
            if (saved && this.props.stageSizeMode === STAGE_SIZE_MODES.small) {
                this.props.onSetStageSize(saved);
            }
        }
        handleModeChange (mode) {
            this.props.onSetLayoutMode(mode);
        }
        handleResize () {
            if (this.props.layoutMode !== LAYOUT_MODES.phone || this.resizeFrame) return;
            this.resizeFrame = requestAnimationFrame(this.flushResize);
        }
        flushResize () {
            this.resizeFrame = null;
            this.props.onSetViewport(window.innerWidth, window.innerHeight);
        }
        render () {
            const props = omit(this.props, OWN_PROPS);
            return (
                <WrappedComponent
                    {...props}
                />
            );
        }
    }
    LayoutModeWatcher.propTypes = {
        layoutMode: PropTypes.oneOf(Object.keys(LAYOUT_MODES)),
        miniStage: PropTypes.bool,
        onSetLayoutMode: PropTypes.func,
        onSetStageSize: PropTypes.func,
        onSetViewport: PropTypes.func,
        phonePaletteOpen: PropTypes.bool,
        phoneTab: PropTypes.string,
        stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES))
    };
    const mapStateToProps = state => ({
        layoutMode: state.scratchGui.layoutMode.mode,
        miniStage: state.scratchGui.layoutMode.miniStage,
        phonePaletteOpen: state.scratchGui.layoutMode.phonePaletteOpen,
        phoneTab: state.scratchGui.layoutMode.phoneTab,
        stageSizeMode: state.scratchGui.stageSize.stageSize
    });
    const mapDispatchToProps = dispatch => ({
        onSetLayoutMode: mode => dispatch(setLayoutMode(mode)),
        onSetStageSize: size => dispatch(setStageSize(size)),
        onSetViewport: (width, height) => dispatch(setViewport(width, height))
    });
    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(LayoutModeWatcher);
};

export {
    LayoutModeHOC as default
};
