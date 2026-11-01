import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

import styles from './framerate-indicator.css';

const FramerateIndicator = ({framerate, interpolation}) => (
    <React.Fragment>
        {framerate !== 30 && framerate !== 0 && (
            <div className={styles.framerateContainer}>
                <div className={styles.framerateLabel}>
                    <FormattedMessage
                        defaultMessage="{framerate} frames a second"
                        description="Stage header label when the game runs at a custom framerate"
                        id="sq.stage.framerate"
                        values={{
                            framerate: framerate
                        }}
                    />
                </div>
            </div>
        )}
        {interpolation && (
            <div className={styles.framerateContainer}>
                <div className={styles.framerateLabel}>
                    <FormattedMessage
                        defaultMessage="Smooth motion"
                        description="Stage header label when smooth motion (interpolation) is on"
                        id="sq.stage.smoothMotion"
                    />
                </div>
            </div>
        )}
    </React.Fragment>
);

FramerateIndicator.propTypes = {
    framerate: PropTypes.number,
    interpolation: PropTypes.bool
};

export default FramerateIndicator;
