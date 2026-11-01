import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Button from '../button/button.jsx';

import {sqIconDataUri} from '../sq-icon';
import styles from './community-button.css';

const buttonIcon = sqIconDataUri('eye', {color: '#ffffff'});

const CommunityButton = ({
    className,
    onClick
}) => (
    <Button
        className={classNames(
            className,
            styles.communityButton
        )}
        iconClassName={styles.communityButtonIcon}
        iconSrc={buttonIcon}
        iconWidth={20}
        iconHeight={20}
        onClick={onClick}
    >
        <FormattedMessage
            defaultMessage="Preview"
            description="Menu bar button that shows the game the way players see it"
            id="sq.menuBar.preview"
        />
    </Button>
);

CommunityButton.propTypes = {
    className: PropTypes.string,
    onClick: PropTypes.func
};

CommunityButton.defaultProps = {
    onClick: () => {}
};

export default CommunityButton;
