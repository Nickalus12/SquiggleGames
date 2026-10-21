import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import MediaQuery from 'react-responsive';
import VM from 'scratch-vm';

import StageWrapper from '../../containers/stage-wrapper.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import Alerts from '../../containers/alerts.jsx';
import TouchGameControls from '../../containers/touch-game-controls.jsx';
import TWUsernameModal from '../../containers/tw-username-modal.jsx';
import TWSettingsModal from '../../containers/tw-settings-modal.jsx';
import TWSecurityManager from '../../containers/tw-security-manager.jsx';
import TWRestorePointManager from '../../containers/tw-restore-point-manager.jsx';
import TWUnknownPlatformModal from '../../containers/tw-unknown-platform-modal.jsx';
import TWInvalidProjectModal from '../../containers/tw-invalid-project-modal.jsx';

import {STAGE_SIZE_MODES, FIXED_WIDTH, UNCONSTRAINED_NON_STAGE_WIDTH} from '../../lib/layout-constants';
import {resolveStageSize} from '../../lib/screen-utils';
import {LAYOUT_MODES, PHONE_TABS} from '../../lib/layout-mode';
import {Theme} from '../../lib/themes';

import {isRendererSupported} from '../../lib/tw-environment-support-prober';

import styles from './gui.css';

const GUIEditor = React.lazy(() => import('./gui-editor.jsx'));

const CONSUMED_PROPS = [
    'dispatch',
    'accountNavOpen',
    'activeTabIndex',
    'alertsVisible',
    'authorId',
    'authorThumbnailUrl',
    'authorUsername',
    'basePath',
    'backdropLibraryVisible',
    'backpackHost',
    'backpackVisible',
    'blocksId',
    'blocksTabVisible',
    'cardsVisible',
    'canChangeLanguage',
    'canChangeTheme',
    'canCreateNew',
    'canEditTitle',
    'canManageFiles',
    'canRemix',
    'canSave',
    'canCreateCopy',
    'canShare',
    'canUseCloud',
    'children',
    'connectionModalVisible',
    'costumeLibraryVisible',
    'costumesTabVisible',
    'customStageSize',
    'enableCommunity',
    'intl',
    'isCreating',
    'isEmbedded',
    'isFullScreen',
    'isPlayerOnly',
    'isRtl',
    'isShared',
    'isWindowFullScreen',
    'isTelemetryEnabled',
    'layoutMode',
    'miniStage',
    'onClosePhoneMenu',
    'phoneMenuOpen',
    'phonePaletteOpen',
    'phoneTab',
    'touchControlsShown',
    'viewportHeight',
    'viewportWidth',
    'isTotallyNormal',
    'loading',
    'logo',
    'renderLogin',
    'onClickAbout',
    'onClickAccountNav',
    'onCloseAccountNav',
    'onClickAddonSettings',
    'onClickDesktopSettings',
    'onClickNewWindow',
    'onClickPackager',
    'onLogOut',
    'onOpenRegistration',
    'onToggleLoginOpen',
    'onActivateCostumesTab',
    'onActivateSoundsTab',
    'onActivateTab',
    'onClickLogo',
    'onExtensionButtonClick',
    'onOpenCustomExtensionModal',
    'onProjectTelemetryEvent',
    'onRequestCloseBackdropLibrary',
    'onRequestCloseCostumeLibrary',
    'onRequestCloseTelemetryModal',
    'onSeeCommunity',
    'onShare',
    'onShowPrivacyPolicy',
    'onStartSelectingFileUpload',
    'onTelemetryModalCancel',
    'onTelemetryModalOptIn',
    'onTelemetryModalOptOut',
    'securityManager',
    'showComingSoon',
    'showOpenFilePicker',
    'showSaveFilePicker',
    'soundsTabVisible',
    'stageSizeMode',
    'targetIsStage',
    'telemetryModalVisible',
    'theme',
    'tipsLibraryVisible',
    'usernameModalVisible',
    'settingsModalVisible',
    'customExtensionModalVisible',
    'fontsModalVisible',
    'unknownPlatformModalVisible',
    'invalidProjectModalVisible',
    'vm'
];

const getFullscreenBackgroundColor = () => {
    const params = new URLSearchParams(location.search);
    if (params.has('fullscreen-background')) {
        return params.get('fullscreen-background');
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return '#111';
    }
    return 'white';
};

const fullscreenBackgroundColor = getFullscreenBackgroundColor();

const EDITOR_OMIT = ['dispatch', 'children', 'intl', 'isPlayerOnly', 'securityManager', 'stageSizeMode'];

const GUIComponent = props => {
    const {
        alertsVisible,
        children,
        customStageSize,
        isEmbedded,
        isFullScreen,
        isPlayerOnly,
        isRtl,
        isWindowFullScreen,
        loading,
        securityManager,
        stageSizeMode,
        usernameModalVisible,
        settingsModalVisible,
        unknownPlatformModalVisible,
        invalidProjectModalVisible,
        vm
    } = props;
    const componentProps = omit(props, CONSUMED_PROPS);
    if (children) {
        return <Box {...componentProps}>{children}</Box>;
    }

    const unconstrainedWidth = (
        UNCONSTRAINED_NON_STAGE_WIDTH +
        FIXED_WIDTH +
        Math.max(0, customStageSize.width - FIXED_WIDTH)
    );
    return (<MediaQuery minWidth={unconstrainedWidth}>{isUnconstrained => {
        const stageSize = resolveStageSize(stageSizeMode, isUnconstrained);

        const alwaysEnabledModals = (
            <React.Fragment>
                <TWSecurityManager securityManager={securityManager} />
                <TWRestorePointManager />
                {usernameModalVisible && <TWUsernameModal />}
                {settingsModalVisible && <TWSettingsModal />}
                {unknownPlatformModalVisible && <TWUnknownPlatformModal />}
                {invalidProjectModalVisible && <TWInvalidProjectModal />}
            </React.Fragment>
        );

        if (isPlayerOnly) {
            return (
                <React.Fragment>
                    {isWindowFullScreen ? (
                        <div
                            className={styles.fullscreenBackground}
                            style={{
                                backgroundColor: fullscreenBackgroundColor
                            }}
                        />
                    ) : null}
                    <div className={styles.playerStage}>
                        <StageWrapper
                            isFullScreen={isFullScreen}
                            isEmbedded={isEmbedded}
                            isRendererSupported={isRendererSupported()}
                            isRtl={isRtl}
                            loading={loading}
                            stageSize={STAGE_SIZE_MODES.full}
                            vm={vm}
                        >
                            {alertsVisible ? (
                                <Alerts className={styles.alertsContainer} />
                            ) : null}
                        </StageWrapper>
                        <TouchGameControls
                            player
                            layout={isFullScreen || isEmbedded ? 'overlay' : 'stage'}
                            vm={vm}
                        />
                    </div>
                    {alwaysEnabledModals}
                </React.Fragment>
            );
        }

        return (
            <React.Suspense fallback={<Loader isFullScreen />}>
                <GUIEditor
                    {...omit(props, EDITOR_OMIT)}
                    alwaysEnabledModals={alwaysEnabledModals}
                    componentProps={componentProps}
                    stageSize={stageSize}
                />
            </React.Suspense>
        );
    }}</MediaQuery>);
};

GUIComponent.propTypes = {
    accountNavOpen: PropTypes.bool,
    activeTabIndex: PropTypes.number,
    alertsVisible: PropTypes.bool,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    backdropLibraryVisible: PropTypes.bool,
    backpackHost: PropTypes.string,
    backpackVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksTabVisible: PropTypes.bool,
    blocksId: PropTypes.string,
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    cardsVisible: PropTypes.bool,
    children: PropTypes.node,
    costumeLibraryVisible: PropTypes.bool,
    costumesTabVisible: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    enableCommunity: PropTypes.bool,
    intl: intlShape.isRequired,
    isCreating: PropTypes.bool,
    isEmbedded: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isWindowFullScreen: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    layoutMode: PropTypes.oneOf(Object.keys(LAYOUT_MODES)),
    loading: PropTypes.bool,
    logo: PropTypes.string,
    miniStage: PropTypes.bool,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func,
    onActivateTab: PropTypes.func,
    onClickAccountNav: PropTypes.func,
    onClosePhoneMenu: PropTypes.func,
    onClickAddonSettings: PropTypes.func,
    onClickDesktopSettings: PropTypes.func,
    onClickNewWindow: PropTypes.func,
    onClickPackager: PropTypes.func,
    onClickLogo: PropTypes.func,
    onCloseAccountNav: PropTypes.func,
    onExtensionButtonClick: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onRequestCloseBackdropLibrary: PropTypes.func,
    onRequestCloseCostumeLibrary: PropTypes.func,
    onRequestCloseTelemetryModal: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    onShowPrivacyPolicy: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onTabSelect: PropTypes.func,
    onTelemetryModalCancel: PropTypes.func,
    onTelemetryModalOptIn: PropTypes.func,
    onTelemetryModalOptOut: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    phoneMenuOpen: PropTypes.bool,
    phonePaletteOpen: PropTypes.bool,
    phoneTab: PropTypes.oneOf(Object.keys(PHONE_TABS)),
    renderLogin: PropTypes.func,
    securityManager: PropTypes.shape({}),
    showComingSoon: PropTypes.bool,
    showOpenFilePicker: PropTypes.func,
    showSaveFilePicker: PropTypes.func,
    soundsTabVisible: PropTypes.bool,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    targetIsStage: PropTypes.bool,
    telemetryModalVisible: PropTypes.bool,
    theme: PropTypes.instanceOf(Theme),
    tipsLibraryVisible: PropTypes.bool,
    touchControlsShown: PropTypes.bool,
    usernameModalVisible: PropTypes.bool,
    settingsModalVisible: PropTypes.bool,
    customExtensionModalVisible: PropTypes.bool,
    fontsModalVisible: PropTypes.bool,
    unknownPlatformModalVisible: PropTypes.bool,
    invalidProjectModalVisible: PropTypes.bool,
    viewportHeight: PropTypes.number,
    viewportWidth: PropTypes.number,
    vm: PropTypes.instanceOf(VM).isRequired
};
GUIComponent.defaultProps = {
    backpackHost: null,
    backpackVisible: false,
    basePath: './',
    blocksId: 'original',
    canChangeLanguage: true,
    canChangeTheme: true,
    canCreateNew: false,
    canEditTitle: false,
    canManageFiles: true,
    canRemix: false,
    canSave: false,
    canCreateCopy: false,
    canShare: false,
    canUseCloud: false,
    enableCommunity: false,
    isCreating: false,
    isShared: false,
    isTotallyNormal: false,
    loading: false,
    showComingSoon: false,
    stageSizeMode: STAGE_SIZE_MODES.large
};

const mapStateToProps = state => ({
    customStageSize: state.scratchGui.customStageSize,
    isWindowFullScreen: state.scratchGui.tw.isWindowFullScreen,
    blocksId: state.scratchGui.timeTravel.year.toString(),
    stageSizeMode: state.scratchGui.stageSize.stageSize,
    theme: state.scratchGui.theme.theme
});

export default injectIntl(connect(
    mapStateToProps
)(GUIComponent));
