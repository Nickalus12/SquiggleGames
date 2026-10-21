import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {setMiniStage} from '../../reducers/layout-mode';

import styles from './phone-shell.css';

const messages = defineMessages({
    show: {
        id: 'gui.phone.showMiniStage',
        defaultMessage: 'Show small stage',
        description: 'Button that shows a small stage over the code area on phones'
    },
    hide: {
        id: 'gui.phone.hideMiniStage',
        defaultMessage: 'Hide small stage',
        description: 'Button that hides the small stage over the code area on phones'
    }
});

class PhoneMiniStageButton extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick']);
    }
    handleClick () {
        this.props.onSetMiniStage(!this.props.open);
    }
    render () {
        const {intl, open} = this.props;
        const label = intl.formatMessage(open ? messages.hide : messages.show);
        return (
            <button
                aria-label={label}
                aria-pressed={open}
                className={classNames(styles.iconButton, styles.miniStageButton)}
                data-phone-mini-stage-button
                title={label}
                type="button"
                onClick={this.handleClick}
            >
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                >
                    <path
                        d={open ? 'M4 5h16v11H4zM9 8l6 5M15 8l-6 5' : 'M4 5h16v11H4zM9 20h6M12 16v4M10 8.5v4l3.5-2z'}
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                    />
                </svg>
            </button>
        );
    }
}

PhoneMiniStageButton.propTypes = {
    intl: intlShape.isRequired,
    onSetMiniStage: PropTypes.func.isRequired,
    open: PropTypes.bool
};

const mapStateToProps = state => ({
    open: state.scratchGui.layoutMode.miniStage
});

const mapDispatchToProps = dispatch => ({
    onSetMiniStage: open => dispatch(setMiniStage(open))
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(PhoneMiniStageButton));
