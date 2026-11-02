import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import {defineMessages, injectIntl, intlShape, FormattedMessage} from 'react-intl';

import booleanInputIcon from './icon--boolean-input.svg';
import textInputIcon from './icon--text-input.svg';
import labelIcon from './icon--label.svg';

import styles from './custom-procedures.css';

const messages = defineMessages({
    myblockModalTitle: {
        defaultMessage: 'Make a block',
        description: 'Title for the modal where you create a custom block.',
        id: 'sq.customProcedures.modalTitle'
    }
});

const CustomProcedures = props => {
    const preview = props.preview || {
        tokens: [{type: 'label', text: 'do something'}],
        warp: props.warp,
        returnsValue: props.returnsValue,
        shape: props.returnsValue ? 'reporter' : 'command'
    };

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={props.intl.formatMessage(messages.myblockModalTitle)}
            onRequestClose={props.onCancel}
            id="customProceduresModal"
        >
            <Box
                className={styles.workspace}
                componentRef={props.componentRef}
            />
            <Box className={styles.body}>
                <div
                    className={styles.previewBar}
                    data-testid="custom-procedure-live-preview"
                >
                    <div className={styles.previewHeader}>
                        <span className={styles.previewHeading}>
                            <FormattedMessage
                                defaultMessage="Live preview"
                                description="Heading above the live block preview in Make a block modal"
                                id="sq.customProcedures.livePreviewHeading"
                            />
                        </span>
                        <div className={styles.previewBadges}>
                            {preview.warp ? (
                                <span className={styles.previewBadgeFast}>
                                    <FormattedMessage
                                        defaultMessage="Instant"
                                        description="Badge shown when run without screen refresh is enabled"
                                        id="sq.customProcedures.badgeInstant"
                                    />
                                </span>
                            ) : null}
                            {preview.returnsValue ? (
                                <span className={styles.previewBadgeReporter}>
                                    <FormattedMessage
                                        defaultMessage="Returns a value"
                                        description="Badge shown when custom block returns a value"
                                        id="sq.customProcedures.badgeReporter"
                                    />
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className={styles.previewStage}>
                        <div
                            className={preview.returnsValue ?
                                `${styles.previewBlock} ${styles.previewBlockReporter}` :
                                styles.previewBlock
                            }
                            data-shape={preview.shape}
                        >
                            {preview.tokens.map((token, idx) => {
                                const key = `${token.type}-${idx}`;
                                if (token.type === 'boolean') {
                                    return (
                                        <span
                                            key={key}
                                            className={styles.previewBooleanPill}
                                        >
                                            {token.text}
                                        </span>
                                    );
                                }
                                if (token.type === 'numberText') {
                                    return (
                                        <span
                                            key={key}
                                            className={styles.previewInputPill}
                                        >
                                            {token.text}
                                        </span>
                                    );
                                }
                                return (
                                    <span
                                        key={key}
                                        className={styles.previewLabelWord}
                                    >
                                        {token.text}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className={styles.optionsRow}>
                    <div
                        className={styles.optionCard}
                        role="button"
                        tabIndex="0"
                        onClick={props.onAddTextNumber}
                    >
                        <img
                            className={styles.optionIcon}
                            src={textInputIcon}
                            draggable={false}
                        />
                        <div className={styles.optionTitle}>
                            <FormattedMessage
                                defaultMessage="Add a number or text"
                                description="Button to add a number or text input to a custom block"
                                id="sq.customProcedures.addNumberTextTitle"
                            />
                        </div>
                        <div className={styles.optionDescription}>
                            <FormattedMessage
                                defaultMessage="Pass in a number, word, or variable."
                                description="Short kid-friendly description for number or text input"
                                id="sq.customProcedures.addNumberTextHint"
                            />
                        </div>
                    </div>
                    <div
                        className={styles.optionCard}
                        role="button"
                        tabIndex="0"
                        onClick={props.onAddBoolean}
                    >
                        <img
                            className={styles.optionIcon}
                            src={booleanInputIcon}
                            draggable={false}
                        />
                        <div className={styles.optionTitle}>
                            <FormattedMessage
                                defaultMessage="Add a yes or no"
                                description="Button to add a boolean input to a custom block"
                                id="sq.customProcedures.addBooleanTitle"
                            />
                        </div>
                        <div className={styles.optionDescription}>
                            <FormattedMessage
                                defaultMessage="Check a true or false question."
                                description="Short kid-friendly description for boolean input"
                                id="sq.customProcedures.addBooleanHint"
                            />
                        </div>
                    </div>
                    <div
                        className={styles.optionCard}
                        role="button"
                        tabIndex="0"
                        onClick={props.onAddLabel}
                    >
                        <img
                            className={styles.optionIcon}
                            src={labelIcon}
                            draggable={false}
                        />
                        <div className={styles.optionTitle}>
                            <FormattedMessage
                                defaultMessage="Add words"
                                description="Button to add a text label to a custom block"
                                id="sq.customProcedures.addLabelTitle"
                            />
                        </div>
                        <div className={styles.optionDescription}>
                            <FormattedMessage
                                defaultMessage="Extra words between inputs so your block reads like a sentence."
                                description="Short kid-friendly explanation of what labels do on a custom block"
                                id="sq.customProcedures.addLabelHint"
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.togglesGroup}>
                    <label className={styles.checkboxRow}>
                        <input
                            checked={props.warp}
                            type="checkbox"
                            onChange={props.onToggleWarp}
                        />
                        <div className={styles.checkboxTextGroup}>
                            <span className={styles.checkboxTitle}>
                                <FormattedMessage
                                    defaultMessage="Run without screen refresh"
                                    description="Checkbox to run custom block without screen refresh"
                                    id="sq.customProcedures.runWithoutScreenRefresh"
                                />
                            </span>
                            <span className={styles.checkboxHelp}>
                                <FormattedMessage
                                    defaultMessage="Runs the whole block all at once without waiting between steps."
                                    description="One-line explanation of run without screen refresh"
                                    id="sq.customProcedures.runWithoutScreenRefreshHelp"
                                />
                            </span>
                        </div>
                    </label>

                    <label className={styles.checkboxRow}>
                        <input
                            checked={props.returnsValue}
                            type="checkbox"
                            onChange={props.onToggleReturnsValue}
                        />
                        <div className={styles.checkboxTextGroup}>
                            <span className={styles.checkboxTitle}>
                                <FormattedMessage
                                    defaultMessage="Give back a value (reporter)"
                                    description="Checkbox to make the custom block return a value"
                                    id="sq.customProcedures.returnsValueTitle"
                                />
                            </span>
                            <span className={styles.checkboxHelp}>
                                <FormattedMessage
                                    defaultMessage="Makes a round block that gives back an answer with return."
                                    description="One-line explanation of custom reporter return option"
                                    id="sq.customProcedures.returnsValueHelp"
                                />
                            </span>
                        </div>
                    </label>
                </div>

                <Box className={styles.buttonRow}>
                    <button
                        className={styles.cancelButton}
                        onClick={props.onCancel}
                    >
                        <FormattedMessage
                            defaultMessage="Cancel"
                            description="Button to cancel custom block creation"
                            id="sq.customProcedures.cancel"
                        />
                    </button>
                    <button
                        className={styles.okButton}
                        onClick={props.onOk}
                    >
                        {props.isEditing ? (
                            <FormattedMessage
                                defaultMessage="Save block"
                                description="Button to save edits to an existing custom block"
                                id="sq.customProcedures.saveBlock"
                            />
                        ) : (
                            <FormattedMessage
                                defaultMessage="Create block"
                                description="Button to create a new custom block"
                                id="sq.customProcedures.createBlock"
                            />
                        )}
                    </button>
                </Box>
            </Box>
        </Modal>
    );
};

CustomProcedures.propTypes = {
    componentRef: PropTypes.func.isRequired,
    intl: intlShape,
    isEditing: PropTypes.bool,
    onAddBoolean: PropTypes.func.isRequired,
    onAddLabel: PropTypes.func.isRequired,
    onAddTextNumber: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired,
    onToggleReturnsValue: PropTypes.func,
    onToggleWarp: PropTypes.func.isRequired,
    preview: PropTypes.shape({
        tokens: PropTypes.arrayOf(PropTypes.shape({
            type: PropTypes.string,
            text: PropTypes.string
        })),
        warp: PropTypes.bool,
        returnsValue: PropTypes.bool,
        shape: PropTypes.string
    }),
    returnsValue: PropTypes.bool,
    warp: PropTypes.bool.isRequired
};

CustomProcedures.defaultProps = {
    isEditing: false,
    onToggleReturnsValue: () => {},
    returnsValue: false
};

export default injectIntl(CustomProcedures);
