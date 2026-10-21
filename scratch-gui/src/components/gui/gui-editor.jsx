import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import tabStyles from 'react-tabs/style/react-tabs.css';
import VM from 'scratch-vm';

import Blocks from '../../containers/blocks.jsx';
import CostumeTab from '../../containers/costume-tab.jsx';
import TargetPane from '../../containers/target-pane.jsx';
import SoundTab from '../../containers/sound-tab.jsx';
import StageWrapper from '../../containers/stage-wrapper.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import MenuBar from '../menu-bar/menu-bar.jsx';
import CostumeLibrary from '../../containers/costume-library.jsx';
import BackdropLibrary from '../../containers/backdrop-library.jsx';
import Watermark from '../../containers/watermark.jsx';

import Backpack from '../../containers/backpack.jsx';
import BrowserModal from '../browser-modal/browser-modal.jsx';
import TipsLibrary from '../../containers/tips-library.jsx';
import Cards from '../../containers/cards.jsx';
import Alerts from '../../containers/alerts.jsx';
import DragLayer from '../../containers/drag-layer.jsx';
import ConnectionModal from '../../containers/connection-modal.jsx';
import TelemetryModal from '../telemetry-modal/telemetry-modal.jsx';
import TWCustomExtensionModal from '../../containers/tw-custom-extension-modal.jsx';
import TWFontsModal from '../../containers/tw-fonts-modal.jsx';
import TouchGameControls from '../../containers/touch-game-controls.jsx';
import PhoneTopBar from '../phone-shell/phone-top-bar.jsx';
import PhoneTabBar from '../phone-shell/phone-tab-bar.jsx';
import PhoneSpriteRow from '../phone-shell/phone-sprite-row.jsx';
import PhoneMiniStageButton from '../phone-shell/phone-mini-stage-button.jsx';
import CollabPresence from '../menu-bar/collab-presence.jsx';
import CheckerPill from '../checker-pill/index.jsx';

import {STAGE_SIZE_MODES} from '../../lib/layout-constants';
import {
    LAYOUT_MODES,
    PHONE_FLYOUT_WIDTH,
    PHONE_TOOLBOX_WIDTH,
    PHONE_TABS,
    isPhoneLandscape,
    phoneStageWidth
} from '../../lib/layout-mode';
import {setPhoneMenuOpen, touchControlsVisible} from '../../reducers/layout-mode';
import {Theme} from '../../lib/themes';

import {isRendererSupported, isBrowserSupported} from '../../lib/tw-environment-support-prober';

import styles from './gui.css';
import addExtensionIcon from './icon--extensions.svg';
import SqIcon from '../sq-icon/sq-icon.jsx';

const messages = defineMessages({
    addExtension: {
        id: 'gui.gui.addExtension',
        description: 'Button to add an extension in the target pane',
        defaultMessage: 'Add Extension'
    }
});

const GUIEditor = props => {
    const {
        accountNavOpen,
        activeTabIndex,
        alertsVisible,
        alwaysEnabledModals,
        authorId,
        authorThumbnailUrl,
        authorUsername,
        basePath,
        backdropLibraryVisible,
        backpackHost,
        backpackVisible,
        blocksId,
        blocksTabVisible,
        cardsVisible,
        canChangeLanguage,
        canChangeTheme,
        canCreateNew,
        canEditTitle,
        canManageFiles,
        canRemix,
        canSave,
        canCreateCopy,
        canShare,
        canUseCloud,
        connectionModalVisible,
        costumeLibraryVisible,
        costumesTabVisible,
        customExtensionModalVisible,
        customStageSize,
        enableCommunity,
        fontsModalVisible,
        intl,
        isCreating,
        isFullScreen,
        isRtl,
        isShared,
        isTelemetryEnabled,
        isTotallyNormal,
        layoutMode,
        loading,
        logo,
        miniStage,
        onActivateCostumesTab,
        onActivateSoundsTab,
        onActivateTab,
        onClickAbout,
        onClickAccountNav,
        onClickAddonSettings,
        onClickDesktopSettings,
        onClickLogo,
        onClickNewWindow,
        onClickPackager,
        onCloseAccountNav,
        onClosePhoneMenu,
        onExtensionButtonClick,
        onLogOut,
        onOpenCustomExtensionModal,
        onOpenRegistration,
        onProjectTelemetryEvent,
        onRequestCloseBackdropLibrary,
        onRequestCloseCostumeLibrary,
        onRequestCloseTelemetryModal,
        onSeeCommunity,
        onShare,
        onShowPrivacyPolicy,
        onStartSelectingFileUpload,
        onTelemetryModalCancel,
        onTelemetryModalOptIn,
        onTelemetryModalOptOut,
        onToggleLoginOpen,
        phoneMenuOpen,
        phonePaletteOpen,
        phoneTab,
        renderLogin,
        showComingSoon,
        showOpenFilePicker,
        showSaveFilePicker,
        soundsTabVisible,
        stageSize,
        targetIsStage,
        telemetryModalVisible,
        theme,
        tipsLibraryVisible,
        touchControlsShown,
        viewportHeight,
        viewportWidth,
        vm,
        componentProps
    } = props;

    const tabClassNames = {
        tabs: styles.tabs,
        tab: classNames(tabStyles.reactTabsTab, styles.tab),
        tabList: classNames(tabStyles.reactTabsTabList, styles.tabList),
        tabPanel: classNames(tabStyles.reactTabsTabPanel, styles.tabPanel),
        tabPanelSelected: classNames(tabStyles.reactTabsTabPanelSelected, styles.isSelected),
        tabSelected: classNames(tabStyles.reactTabsTabSelected, styles.isSelected)
    };

    const isPhone = layoutMode === LAYOUT_MODES.phone;
    const isTablet = layoutMode === LAYOUT_MODES.tablet;
    const phoneLandscape = isPhone && isPhoneLandscape({viewportWidth, viewportHeight});
    const phoneControls = isPhone && touchControlsShown && phoneTab === PHONE_TABS.stage;
    const phoneFixedWidth = isPhone ? phoneStageWidth({
        viewportWidth,
        viewportHeight,
        stageWidth: customStageSize.width,
        stageHeight: customStageSize.height,
        tab: phoneTab === PHONE_TABS.code ? PHONE_TABS.code : PHONE_TABS.stage,
        controls: phoneControls
    }) : null;
    let pageWrapperStyle = {
        minWidth: 1024 + Math.max(0, customStageSize.width - 480),
        minHeight: 640 + Math.max(0, customStageSize.height - 360)
    };
    if (isPhone) pageWrapperStyle = null;
    else if (isTablet) pageWrapperStyle = Object.assign({}, pageWrapperStyle, {minWidth: 0});
    let touchControlsLayout = 'bottom';
    if (isFullScreen) touchControlsLayout = 'overlay';
    else if (phoneLandscape) touchControlsLayout = 'sides';

    return (
        <Box
            className={classNames(styles.pageWrapper, {
                [styles.phone]: isPhone,
                [styles.tablet]: isTablet,
                [styles.phoneLandscape]: phoneLandscape,
                [styles.miniStageOpen]: isPhone && miniStage,
                [styles.phonePaletteOpen]: isPhone && phonePaletteOpen,
                [styles.withTouchControls]: phoneControls
            })}
            data-phone-tab={isPhone ? phoneTab : null}
            dir={isRtl ? 'rtl' : 'ltr'}
            style={pageWrapperStyle}
            {...componentProps}
        >
            {alwaysEnabledModals}
            {customExtensionModalVisible && <TWCustomExtensionModal />}
            {fontsModalVisible && <TWFontsModal />}
            {telemetryModalVisible ? (
                <TelemetryModal
                    isRtl={isRtl}
                    isTelemetryEnabled={isTelemetryEnabled}
                    onCancel={onTelemetryModalCancel}
                    onOptIn={onTelemetryModalOptIn}
                    onOptOut={onTelemetryModalOptOut}
                    onRequestClose={onRequestCloseTelemetryModal}
                    onShowPrivacyPolicy={onShowPrivacyPolicy}
                />
            ) : null}
            {loading ? (
                <Loader isFullScreen />
            ) : null}
            {isCreating ? (
                <Loader
                    isFullScreen
                    messageId="gui.loader.creating"
                />
            ) : null}
            {isBrowserSupported() ? null : (
                <BrowserModal
                    isRtl={isRtl}
                    onClickDesktopSettings={onClickDesktopSettings}
                />
            )}
            {tipsLibraryVisible ? (
                <TipsLibrary />
            ) : null}
            {cardsVisible ? (
                <Cards />
            ) : null}
            {alertsVisible ? (
                <Alerts className={styles.alertsContainer} />
            ) : null}
            {connectionModalVisible ? (
                <ConnectionModal
                    vm={vm}
                />
            ) : null}
            {costumeLibraryVisible ? (
                <CostumeLibrary
                    vm={vm}
                    onRequestClose={onRequestCloseCostumeLibrary}
                />
            ) : null}
            {backdropLibraryVisible ? (
                <BackdropLibrary
                    vm={vm}
                    onRequestClose={onRequestCloseBackdropLibrary}
                />
            ) : null}
            {isPhone ? (
                <PhoneTopBar
                    canEditTitle={canEditTitle}
                    vm={vm}
                />
            ) : null}
            {isPhone && phoneMenuOpen ? (
                <div
                    aria-hidden="true"
                    className={styles.phoneSheetBackdrop}
                    onClick={onClosePhoneMenu}
                />
            ) : null}
            <MenuBar
                accountNavOpen={accountNavOpen}
                authorId={authorId}
                authorThumbnailUrl={authorThumbnailUrl}
                authorUsername={authorUsername}
                canChangeLanguage={canChangeLanguage}
                canChangeTheme={canChangeTheme}
                canCreateCopy={canCreateCopy}
                canCreateNew={canCreateNew}
                canEditTitle={canEditTitle}
                canManageFiles={canManageFiles}
                canRemix={canRemix}
                canSave={canSave}
                canShare={canShare}
                className={classNames(styles.menuBarPosition, {
                    [styles.phoneSheet]: isPhone,
                    [styles.phoneSheetOpen]: isPhone && phoneMenuOpen
                })}
                enableCommunity={enableCommunity}
                isPhoneSheet={isPhone}
                isShared={isShared}
                isTotallyNormal={isTotallyNormal}
                logo={logo}
                renderLogin={renderLogin}
                rightSlot={<CheckerPill inline />}
                showComingSoon={showComingSoon}
                showOpenFilePicker={showOpenFilePicker}
                showSaveFilePicker={showSaveFilePicker}
                onClickAbout={onClickAbout}
                onClickAccountNav={onClickAccountNav}
                onClickAddonSettings={onClickAddonSettings}
                onClickDesktopSettings={onClickDesktopSettings}
                onClickNewWindow={onClickNewWindow}
                onClickPackager={onClickPackager}
                onClickLogo={onClickLogo}
                onCloseAccountNav={onCloseAccountNav}
                onLogOut={onLogOut}
                onOpenRegistration={onOpenRegistration}
                onProjectTelemetryEvent={onProjectTelemetryEvent}
                onSeeCommunity={onSeeCommunity}
                onShare={onShare}
                onStartSelectingFileUpload={onStartSelectingFileUpload}
                onToggleLoginOpen={onToggleLoginOpen}
            />
            <Box
                className={styles.bodyWrapper}
                inert={isPhone && phoneMenuOpen ? '' : null}
            >
                <Box className={styles.flexWrapper}>
                    <Box className={styles.editorWrapper}>
                        {isPhone && phoneTab === PHONE_TABS.code ? <PhoneMiniStageButton /> : null}
                        <Tabs
                            forceRenderTabPanel
                            className={tabClassNames.tabs}
                            selectedIndex={activeTabIndex}
                            selectedTabClassName={tabClassNames.tabSelected}
                            selectedTabPanelClassName={tabClassNames.tabPanelSelected}
                            onSelect={onActivateTab}
                        >
                            <TabList className={tabClassNames.tabList}>
                                <Tab className={tabClassNames.tab}>
                                    <SqIcon
                                        className={styles.tabIcon}
                                        name="code"
                                        size={24}
                                    />
                                    <FormattedMessage
                                        defaultMessage="Code"
                                        description="Button to get to the code panel"
                                        id="gui.gui.codeTab"
                                    />
                                </Tab>
                                <Tab
                                    className={tabClassNames.tab}
                                    onClick={onActivateCostumesTab}
                                >
                                    <SqIcon
                                        className={styles.tabIcon}
                                        name="art"
                                        size={24}
                                    />
                                    {targetIsStage ? (
                                        <FormattedMessage
                                            defaultMessage="Backdrops"
                                            description="Button to get to the backdrops panel"
                                            id="gui.gui.backdropsTab"
                                        />
                                    ) : (
                                        <FormattedMessage
                                            defaultMessage="Costumes"
                                            description="Button to get to the costumes panel"
                                            id="gui.gui.costumesTab"
                                        />
                                    )}
                                </Tab>
                                <Tab
                                    className={tabClassNames.tab}
                                    onClick={onActivateSoundsTab}
                                >
                                    <SqIcon
                                        className={styles.tabIcon}
                                        name="sounds"
                                        size={24}
                                    />
                                    <FormattedMessage
                                        defaultMessage="Sounds"
                                        description="Button to get to the sounds panel"
                                        id="gui.gui.soundsTab"
                                    />
                                </Tab>
                            </TabList>
                            <TabPanel className={tabClassNames.tabPanel}>
                                <Box
                                    className={styles.blocksWrapper}
                                    style={isPhone ? {'--sq-phone-toolbox': `${PHONE_TOOLBOX_WIDTH}px`} : null}
                                >
                                    <Blocks
                                        key={`${blocksId}/${theme.id}${isPhone ? '/phone' : ''}`}
                                        canUseCloud={canUseCloud}
                                        flyoutWidth={isPhone ? PHONE_FLYOUT_WIDTH : null}
                                        grow={1}
                                        isVisible={blocksTabVisible && (!isPhone || phoneTab === PHONE_TABS.code)}
                                        options={{
                                            media: `${basePath}static/${theme.getBlocksMediaFolder()}/`
                                        }}
                                        stageSize={stageSize}
                                        onOpenCustomExtensionModal={onOpenCustomExtensionModal}
                                        theme={theme}
                                        vm={vm}
                                    />
                                </Box>
                                <Box className={styles.extensionButtonContainer}>
                                    <button
                                        className={styles.extensionButton}
                                        title={intl.formatMessage(messages.addExtension)}
                                        onClick={onExtensionButtonClick}
                                    >
                                        <img
                                            className={styles.extensionButtonIcon}
                                            draggable={false}
                                            src={addExtensionIcon}
                                        />
                                    </button>
                                </Box>
                                <Box className={styles.watermark}>
                                    <Watermark />
                                </Box>
                            </TabPanel>
                            <TabPanel className={tabClassNames.tabPanel}>
                                {costumesTabVisible ? <CostumeTab
                                    vm={vm}
                                /> : null}
                            </TabPanel>
                            <TabPanel className={tabClassNames.tabPanel}>
                                {soundsTabVisible ? <SoundTab vm={vm} /> : null}
                            </TabPanel>
                        </Tabs>
                        {backpackVisible ? (
                            <Backpack host={backpackHost} />
                        ) : null}
                    </Box>

                    <Box className={classNames(styles.stageAndTargetWrapper, styles[stageSize])}>
                        <StageWrapper
                            fixedWidth={phoneFixedWidth}
                            isFullScreen={isFullScreen}
                            isRendererSupported={isRendererSupported()}
                            isRtl={isRtl}
                            stageSize={stageSize}
                            vm={vm}
                        />
                        {isPhone ? <PhoneSpriteRow /> : null}
                        {isPhone ? (
                            <TouchGameControls
                                className={styles.phoneTouchControls}
                                layout={touchControlsLayout}
                                show={isFullScreen || phoneTab === PHONE_TABS.stage}
                                vm={vm}
                            />
                        ) : null}
                        <Box className={styles.targetWrapper}>
                            <TargetPane
                                stageSize={isPhone ? STAGE_SIZE_MODES.small : stageSize}
                                vm={vm}
                            />
                        </Box>
                    </Box>
                    {isPhone && phoneTab === PHONE_TABS.room ? (
                        <Box className={styles.phoneRoomPane}>
                            <CollabPresence variant="pane" />
                        </Box>
                    ) : null}
                </Box>
            </Box>
            {isPhone ? <PhoneTabBar /> : null}
            <DragLayer />
        </Box>
    );
};

GUIEditor.propTypes = {
    accountNavOpen: PropTypes.bool,
    activeTabIndex: PropTypes.number,
    alertsVisible: PropTypes.bool,
    alwaysEnabledModals: PropTypes.node,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    backdropLibraryVisible: PropTypes.bool,
    backpackHost: PropTypes.string,
    backpackVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksId: PropTypes.string,
    blocksTabVisible: PropTypes.bool,
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
    componentProps: PropTypes.shape({}),
    connectionModalVisible: PropTypes.bool,
    costumeLibraryVisible: PropTypes.bool,
    costumesTabVisible: PropTypes.bool,
    customExtensionModalVisible: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    enableCommunity: PropTypes.bool,
    fontsModalVisible: PropTypes.bool,
    intl: intlShape.isRequired,
    isCreating: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isTelemetryEnabled: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    layoutMode: PropTypes.oneOf(Object.keys(LAYOUT_MODES)),
    loading: PropTypes.bool,
    logo: PropTypes.string,
    miniStage: PropTypes.bool,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func,
    onActivateTab: PropTypes.func,
    onClickAbout: PropTypes.func,
    onClickAccountNav: PropTypes.func,
    onClickAddonSettings: PropTypes.func,
    onClickDesktopSettings: PropTypes.func,
    onClickLogo: PropTypes.func,
    onClickNewWindow: PropTypes.func,
    onClickPackager: PropTypes.func,
    onCloseAccountNav: PropTypes.func,
    onClosePhoneMenu: PropTypes.func,
    onExtensionButtonClick: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onProjectTelemetryEvent: PropTypes.func,
    onRequestCloseBackdropLibrary: PropTypes.func,
    onRequestCloseCostumeLibrary: PropTypes.func,
    onRequestCloseTelemetryModal: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    onShowPrivacyPolicy: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onTelemetryModalCancel: PropTypes.func,
    onTelemetryModalOptIn: PropTypes.func,
    onTelemetryModalOptOut: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    phoneMenuOpen: PropTypes.bool,
    phonePaletteOpen: PropTypes.bool,
    phoneTab: PropTypes.oneOf(Object.keys(PHONE_TABS)),
    renderLogin: PropTypes.func,
    showComingSoon: PropTypes.bool,
    showOpenFilePicker: PropTypes.func,
    showSaveFilePicker: PropTypes.func,
    soundsTabVisible: PropTypes.bool,
    stageSize: PropTypes.string,
    targetIsStage: PropTypes.bool,
    telemetryModalVisible: PropTypes.bool,
    theme: PropTypes.instanceOf(Theme),
    tipsLibraryVisible: PropTypes.bool,
    touchControlsShown: PropTypes.bool,
    viewportHeight: PropTypes.number,
    viewportWidth: PropTypes.number,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    layoutMode: state.scratchGui.layoutMode.mode,
    miniStage: state.scratchGui.layoutMode.miniStage,
    phoneMenuOpen: state.scratchGui.layoutMode.phoneMenuOpen,
    phonePaletteOpen: state.scratchGui.layoutMode.phonePaletteOpen,
    phoneTab: state.scratchGui.layoutMode.phoneTab,
    touchControlsShown: touchControlsVisible(state.scratchGui.layoutMode),
    viewportHeight: state.scratchGui.layoutMode.viewportHeight,
    viewportWidth: state.scratchGui.layoutMode.viewportWidth
});

const mapDispatchToProps = dispatch => ({
    onClosePhoneMenu: () => dispatch(setPhoneMenuOpen(false))
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(GUIEditor));
