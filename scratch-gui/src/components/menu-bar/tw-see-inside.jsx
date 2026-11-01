import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Button from '../button/button.jsx';

import {sqIconDataUri} from '../sq-icon';
import styles from './tw-see-inside.css';

const buttonIcon = sqIconDataUri('code', {color: '#ffffff'});

const SeeInsideButton = ({
    className,
    onClick
}) => (
    <Button
        className={classNames(
            className,
            styles.seeInsideButton
        )}
        iconClassName={styles.seeInsideButtonIcon}
        iconSrc={buttonIcon}
        iconWidth={20}
        iconHeight={20}
        onClick={onClick}
    >
        <FormattedMessage
            defaultMessage="Open in editor"
            description="Button on the player page that opens the game in the editor"
            id="sq.menuBar.openEditor"
        />
    </Button>
);

SeeInsideButton.propTypes = {
    className: PropTypes.string,
    onClick: PropTypes.func
};

SeeInsideButton.defaultProps = {
    onClick: () => {}
};

export default SeeInsideButton;
