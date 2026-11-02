import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import Box from '../box/box.jsx';
import SpriteInfo from '../../containers/sprite-info.jsx';
import SpriteList from './sprite-list.jsx';
import ActionMenu from '../action-menu/action-menu.jsx';
import PhoneAddSpriteSlot, {
    SHEET_ID as ADD_SPRITE_SHEET_ID,
    messages as phoneMessages
} from '../phone-shell/phone-add-sprite-slot.jsx';
import {addSheetItems} from '../phone-shell/add-sheet-items';
import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants';
import {isRtl} from '@turbowarp/scratch-l10n';

import styles from './sprite-selector.css';

import fileUploadIcon from '../action-menu/icon--file-upload.svg';
import paintIcon from '../action-menu/icon--paint.svg';
import spriteIcon from '../action-menu/icon--sprite.svg';
import surpriseIcon from '../action-menu/icon--surprise.svg';
import searchIcon from '../action-menu/icon--search.svg';

const messages = defineMessages({
    addSpriteFromLibrary: {
        id: 'sq.spriteSelector.choose',
        description: 'Button to add a sprite in the target pane from library',
        defaultMessage: 'Choose a sprite'
    },
    addSpriteFromPaint: {
        id: 'sq.spriteSelector.draw',
        description: 'Button to add a sprite in the target pane from paint',
        defaultMessage: 'Draw a sprite'
    },
    addSpriteFromSurprise: {
        id: 'sq.spriteSelector.surprise',
        description: 'Button to add a random sprite in the target pane',
        defaultMessage: 'Surprise me'
    },
    addSpriteFromFile: {
        id: 'sq.spriteSelector.upload',
        description: 'Button to add a sprite in the target pane from file',
        defaultMessage: 'Upload a sprite'
    }
});

const SpriteSelectorComponent = function (props) {
    const {
        editingTarget,
        hoveredTarget,
        intl,
        onChangeSpriteDirection,
        onChangeSpriteName,
        onChangeSpriteRotationStyle,
        onChangeSpriteSize,
        onChangeSpriteVisibility,
        onChangeSpriteX,
        onChangeSpriteY,
        onDrop,
        onDeleteSprite,
        onDuplicateSprite,
        onExportSprite,
        onExplainSprite,
        onFileUploadClick,
        onNewSpriteClick,
        onPaintSpriteClick,
        onSelectSprite,
        onSpriteUpload,
        onSurpriseSpriteClick,
        raised,
        selectedId,
        spriteFileInput,
        sprites,
        stageSize,
        ...componentProps
    } = props;
    let selectedSprite = sprites[selectedId];
    let spriteInfoDisabled = false;
    if (typeof selectedSprite === 'undefined') {
        selectedSprite = {};
        spriteInfoDisabled = true;
    }
    const addButtons = [
        {
            title: intl.formatMessage(messages.addSpriteFromFile),
            img: fileUploadIcon,
            onClick: onFileUploadClick,
            fileAccept: '.svg, .png, .bmp, .jpg, .jpeg, .jfif, .webp, .sprite2, .sprite3, .gif',
            fileChange: onSpriteUpload,
            fileInput: spriteFileInput,
            fileMultiple: true
        }, {
            title: intl.formatMessage(messages.addSpriteFromSurprise),
            img: surpriseIcon,
            onClick: onSurpriseSpriteClick
        }, {
            title: intl.formatMessage(messages.addSpriteFromPaint),
            img: paintIcon,
            onClick: onPaintSpriteClick
        }, {
            title: intl.formatMessage(messages.addSpriteFromLibrary),
            img: searchIcon,
            onClick: onNewSpriteClick
        }
    ];
    const addSheetTitle = intl.formatMessage(phoneMessages.addSprite);
    return (
        <Box
            className={styles.spriteSelector}
            {...componentProps}
        >

            <SpriteInfo
                direction={selectedSprite.direction}
                disabled={spriteInfoDisabled}
                name={selectedSprite.name}
                rotationStyle={selectedSprite.rotationStyle}
                size={selectedSprite.size}
                stageSize={stageSize}
                visible={selectedSprite.visible}
                x={selectedSprite.x}
                y={selectedSprite.y}
                onChangeDirection={onChangeSpriteDirection}
                onChangeName={onChangeSpriteName}
                onChangeRotationStyle={onChangeSpriteRotationStyle}
                onChangeSize={onChangeSpriteSize}
                onChangeVisibility={onChangeSpriteVisibility}
                onChangeX={onChangeSpriteX}
                onChangeY={onChangeSpriteY}
            />

            <SpriteList
                editingTarget={editingTarget}
                hoveredTarget={hoveredTarget}
                items={Object.keys(sprites).map(id => sprites[id])}
                raised={raised}
                selectedId={selectedId}
                onDeleteSprite={onDeleteSprite}
                onDrop={onDrop}
                onDuplicateSprite={onDuplicateSprite}
                onExportSprite={onExportSprite}
                onExplainSprite={onExplainSprite}
                onSelectSprite={onSelectSprite}
            />
            <ActionMenu
                className={styles.addButton}
                img={spriteIcon}
                moreButtons={addButtons}
                sheetId={ADD_SPRITE_SHEET_ID}
                sheetTitle={addSheetTitle}
                title={intl.formatMessage(messages.addSpriteFromLibrary)}
                tooltipPlace={isRtl(intl.locale) ? 'right' : 'left'}
                onClick={onNewSpriteClick}
            />
            <PhoneAddSpriteSlot
                items={addSheetItems({
                    main: {
                        title: intl.formatMessage(messages.addSpriteFromLibrary),
                        img: searchIcon,
                        onClick: onNewSpriteClick
                    },
                    moreButtons: addButtons
                })}
            />
        </Box>
    );
};

SpriteSelectorComponent.propTypes = {
    editingTarget: PropTypes.string,
    hoveredTarget: PropTypes.shape({
        hoveredSprite: PropTypes.string,
        receivedBlocks: PropTypes.bool
    }),
    intl: intlShape.isRequired,
    onChangeSpriteDirection: PropTypes.func,
    onChangeSpriteName: PropTypes.func,
    onChangeSpriteRotationStyle: PropTypes.func,
    onChangeSpriteSize: PropTypes.func,
    onChangeSpriteVisibility: PropTypes.func,
    onChangeSpriteX: PropTypes.func,
    onChangeSpriteY: PropTypes.func,
    onDeleteSprite: PropTypes.func,
    onDrop: PropTypes.func,
    onDuplicateSprite: PropTypes.func,
    onExportSprite: PropTypes.func,
    onExplainSprite: PropTypes.func,
    onFileUploadClick: PropTypes.func,
    onNewSpriteClick: PropTypes.func,
    onPaintSpriteClick: PropTypes.func,
    onSelectSprite: PropTypes.func,
    onSpriteUpload: PropTypes.func,
    onSurpriseSpriteClick: PropTypes.func,
    raised: PropTypes.bool,
    selectedId: PropTypes.string,
    spriteFileInput: PropTypes.func,
    sprites: PropTypes.shape({
        id: PropTypes.shape({
            costume: PropTypes.shape({
                url: PropTypes.string,
                name: PropTypes.string.isRequired,
                bitmapResolution: PropTypes.number.isRequired,
                rotationCenterX: PropTypes.number.isRequired,
                rotationCenterY: PropTypes.number.isRequired
            }),
            name: PropTypes.string.isRequired,
            order: PropTypes.number.isRequired
        })
    }),
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired
};

export default injectIntl(SpriteSelectorComponent);
