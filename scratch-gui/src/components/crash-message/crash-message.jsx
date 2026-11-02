import PropTypes from 'prop-types';
import React from 'react';
import Box from '../box/box.jsx';
import {FormattedMessage} from 'react-intl';

import styles from './crash-message.css';
import reloadIcon from './reload.svg';

const CrashMessage = props => (
    <div className={styles.crashWrapper}>
        <Box className={styles.body}>
            <img
                alt=""
                className={styles.reloadIcon}
                src={reloadIcon}
                draggable={false}
            />
            <p className={styles.header}>
                <FormattedMessage
                    defaultMessage="Oops! Something went wrong"
                    description="Crash message title"
                    id="sq.crashMessage.label"
                />
            </p>
            <p className={styles.description}>
                <FormattedMessage
                    defaultMessage="This game hit a bump and had to stop. Reload the page to try again."
                    description="Message to inform the player that the page has crashed"
                    id="sq.crashMessage.description"
                />
            </p>
            <button
                className={styles.reloadButton}
                type="button"
                onClick={props.onReload}
            >
                <FormattedMessage
                    defaultMessage="Reload"
                    description="Button to reload the page when page crashes"
                    id="sq.crashMessage.reload"
                />
            </button>
            {(props.errorMessage || props.eventId) && (
                <details className={styles.details}>
                    <summary className={styles.detailsSummary}>
                        <FormattedMessage
                            defaultMessage="Details"
                            description="Toggle technical crash details"
                            id="sq.crashMessage.details"
                        />
                    </summary>
                    {props.errorMessage && (
                        <pre className={styles.errorMessage}>
                            {props.errorMessage}
                        </pre>
                    )}
                    {props.eventId && (
                        <p className={styles.eventId}>
                            <FormattedMessage
                                defaultMessage="Report number: {errorId}"
                                description="Technical error reference hidden inside Details"
                                id="sq.crashMessage.errorNumber"
                                values={{
                                    errorId: props.eventId
                                }}
                            />
                        </p>
                    )}
                </details>
            )}
        </Box>
    </div>
);

CrashMessage.propTypes = {
    eventId: PropTypes.string,
    errorMessage: PropTypes.string,
    onReload: PropTypes.func.isRequired
};

export default CrashMessage;
