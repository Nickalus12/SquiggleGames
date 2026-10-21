import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';

import SqIcon from '../sq-icon/sq-icon.jsx';
import messages from './messages';
import styles from './checker-pill.css';

const SEVERITY_CLASS = {
    error: styles.error,
    warn: styles.warn,
    info: styles.info
};

const CheckerPill = ({buttonRef, count, intl, onToggle, open, panelId, severity}) => {
    const spoken = intl.formatMessage(messages.count, {count});
    return (
        <button
            aria-controls={open ? panelId : null}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={classNames(styles.pill, SEVERITY_CLASS[severity], {[styles.open]: open})}
            data-checker-pill
            onClick={onToggle}
            ref={buttonRef}
            title={spoken}
            type="button"
        >
            <SqIcon
                className={styles.icon}
                name="check"
                size={18}
            />
            <span
                aria-hidden="true"
                className={styles.count}
            >
                {count}
            </span>
            <span
                aria-live="polite"
                className={styles.srOnly}
            >
                {spoken}
            </span>
        </button>
    );
};

CheckerPill.propTypes = {
    buttonRef: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
    count: PropTypes.number.isRequired,
    intl: intlShape.isRequired,
    onToggle: PropTypes.func.isRequired,
    open: PropTypes.bool,
    panelId: PropTypes.string.isRequired,
    severity: PropTypes.oneOf(['error', 'warn', 'info'])
};

export default injectIntl(CheckerPill);
