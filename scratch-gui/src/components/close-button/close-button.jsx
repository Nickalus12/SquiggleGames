import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import SqIcon from '../sq-icon';
import styles from './close-button.css';

const messages = defineMessages({
    close: {
        id: 'sq.closeButton.close',
        defaultMessage: 'Close',
        description: 'Accessible name of the close button on modals and alerts'
    },
    back: {
        id: 'sq.closeButton.back',
        defaultMessage: 'Back',
        description: 'Accessible name of the back button on modals'
    }
});

const SIZE_SMALL = 'small';
const SIZE_LARGE = 'large';
const COLOR_NEUTRAL = 'neutral';
const COLOR_GREEN = 'green';
const COLOR_ORANGE = 'orange';

const CloseButtonComponent = props => (
    <button
        aria-label={props.intl.formatMessage(props.buttonType === 'back' ? messages.back : messages.close)}
        className={classNames(
            styles.closeButton,
            props.className,
            {
                [styles.small]: props.size === SIZE_SMALL,
                [styles.large]: props.size === SIZE_LARGE,
                [styles.orange]: props.color === COLOR_ORANGE,
                [styles.green]: props.color === COLOR_GREEN
            }
        )}
        type="button"
        onClick={props.onClick}
    >
        <SqIcon
            className={styles.icon}
            name={props.buttonType === 'back' ? 'arrowLeft' : 'close'}
            size={props.size === SIZE_SMALL ? 12 : 20}
        />
    </button>
);

CloseButtonComponent.propTypes = {
    buttonType: PropTypes.oneOf(['back', 'close']),
    className: PropTypes.string,
    color: PropTypes.string,
    intl: intlShape,
    onClick: PropTypes.func.isRequired,
    size: PropTypes.oneOf([SIZE_SMALL, SIZE_LARGE])
};

CloseButtonComponent.defaultProps = {
    color: COLOR_NEUTRAL,
    size: SIZE_LARGE,
    buttonType: 'close'
};

const CloseButton = injectIntl(CloseButtonComponent);

CloseButton.SIZE_SMALL = SIZE_SMALL;
CloseButton.SIZE_LARGE = SIZE_LARGE;
CloseButton.COLOR_NEUTRAL = COLOR_NEUTRAL;
CloseButton.COLOR_GREEN = COLOR_GREEN;
CloseButton.COLOR_ORANGE = COLOR_ORANGE;

export default CloseButton;
