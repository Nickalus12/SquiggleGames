import React from 'react';
import {FormattedMessage, injectIntl, intlShape, defineMessages} from 'react-intl';
import {connect} from 'react-redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import styles from './loader.css';
import {getIsLoadingWithId} from '../../reducers/project-state';

const mainMessages = {
    'gui.loader.headline': (
        <FormattedMessage
            defaultMessage="Loading your game"
            description="Main loading message"
            id="sq.loader.headline"
        />
    ),
    'gui.loader.creating': (
        <FormattedMessage
            defaultMessage="Making a new game"
            description="Main creating message"
            id="sq.loader.creating"
        />
    )
};

const messages = defineMessages({
    projectData: {
        defaultMessage: 'Getting your game ready',
        description: 'Appears when loading project data, but not assets yet',
        id: 'sq.loader.projectData'
    },
    downloadingAssets: {
        defaultMessage: 'Downloading pictures and sounds ({complete} of {total})',
        description: 'Appears when loading project assets from a project on a remote website',
        id: 'sq.loader.downloadingAssets'
    },
    loadingAssets: {
        defaultMessage: 'Loading pictures and sounds ({complete} of {total})',
        description: 'Appears when loading project assets from a project file on the user\'s computer',
        id: 'sq.loader.loadingAssets'
    }
});

const WaveMark = () => (
    <svg
        aria-hidden="true"
        className={styles.mark}
        focusable="false"
        viewBox="0 0 64 64"
    >
        <defs>
            <linearGradient
                id="sq-loader-g"
                x1="0"
                x2="1"
                y1="0"
                y2="1"
            >
                <stop
                    offset="0"
                    stopColor="#8b5cf6"
                />
                <stop
                    offset=".55"
                    stopColor="#5b6cff"
                />
                <stop
                    offset="1"
                    stopColor="#22d3ee"
                />
            </linearGradient>
            <clipPath id="sq-loader-c">
                <rect
                    height="64"
                    rx="16"
                    width="64"
                />
            </clipPath>
        </defs>
        <rect
            fill="url(#sq-loader-g)"
            height="64"
            rx="16"
            width="64"
        />
        <g clipPath="url(#sq-loader-c)">
            <path
                className={styles.wave}
                d="M-32 34 q8 -15 16 0 q8 15 16 0 q8 -15 16 0 q8 15 16 0 q8 -15 16 0 q8 15 16 0 q8 -15 16 0 q8 15 16 0"
                fill="none"
                stroke="#ffffff"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="7"
            />
        </g>
    </svg>
);

class LoaderComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAssetProgress',
            'handleProjectLoaded',
            'barInnerRef',
            'messageRef'
        ]);
        this.barInnerEl = null;
        this.messageEl = null;
        this.ignoreProgress = false;
    }
    componentDidMount () {
        this.handleAssetProgress(
            this.props.vm.runtime.finishedAssetRequests,
            this.props.vm.runtime.totalAssetRequests
        );
        this.props.vm.on('ASSET_PROGRESS', this.handleAssetProgress);
        this.props.vm.runtime.on('PROJECT_LOADED', this.handleProjectLoaded);
    }
    componentWillUnmount () {
        this.props.vm.off('ASSET_PROGRESS', this.handleAssetProgress);
        this.props.vm.runtime.off('PROJECT_LOADED', this.handleProjectLoaded);
    }
    handleAssetProgress (finished, total) {
        if (this.ignoreProgress || !this.barInnerEl || !this.messageEl) {
            return;
        }

        if (total === 0) {
            this.barInnerEl.style.width = '0';
            this.messageEl.textContent = this.props.intl.formatMessage(messages.projectData);
        } else {
            this.barInnerEl.style.width = `${finished / total * 100}%`;
            const message = this.props.isRemote ? messages.downloadingAssets : messages.loadingAssets;
            this.messageEl.textContent = this.props.intl.formatMessage(message, {
                complete: finished,
                total
            });
        }
    }
    handleProjectLoaded () {
        if (this.ignoreProgress || !this.barInnerEl || !this.messageEl) {
            return;
        }

        this.ignoreProgress = true;
        this.props.vm.runtime.resetProgress();
    }
    barInnerRef (barInner) {
        this.barInnerEl = barInner;
    }
    messageRef (message) {
        this.messageEl = message;
    }
    render () {
        return (
            <div
                className={classNames(styles.background, {
                    [styles.fullscreen]: this.props.isFullScreen
                })}
            >
                <div className={styles.container}>
                    <WaveMark />

                    <div className={styles.title}>
                        {mainMessages[this.props.messageId]}
                    </div>

                    <div
                        className={styles.message}
                        ref={this.messageRef}
                    />

                    <div className={styles.barOuter}>
                        <div
                            className={styles.barInner}
                            ref={this.barInnerRef}
                        />
                    </div>
                </div>
            </div>
        );
    }
}

LoaderComponent.propTypes = {
    intl: intlShape,
    isFullScreen: PropTypes.bool,
    isRemote: PropTypes.bool,
    messageId: PropTypes.string,
    vm: PropTypes.shape({
        on: PropTypes.func,
        off: PropTypes.func,
        runtime: PropTypes.shape({
            totalAssetRequests: PropTypes.number,
            finishedAssetRequests: PropTypes.number,
            resetProgress: PropTypes.func,
            on: PropTypes.func,
            off: PropTypes.func
        })
    })
};
LoaderComponent.defaultProps = {
    isFullScreen: false,
    messageId: 'gui.loader.headline'
};

const mapStateToProps = state => ({
    isRemote: getIsLoadingWithId(state.scratchGui.projectState.loadingState),
    vm: state.scratchGui.vm
});

const mapDispatchToProps = () => ({});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(injectIntl(LoaderComponent));
