import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';

import styles from './explain-sprite.css';

const Row = ({label, text}) => (
    <div className={styles.row}>
        <div className={styles.label}>{label}</div>
        <div className={styles.text}>{text}</div>
    </div>
);

Row.propTypes = {
    label: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired
};

class ExplainSpriteComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleAfterOpen', 'setCloseRef']);
        this.closeButton = null;
    }
    handleAfterOpen () {
        if (this.closeButton) this.closeButton.focus();
    }
    setCloseRef (el) {
        this.closeButton = el;
    }
    render () {
        const props = this.props;
        return (
            <Modal
                className={styles.modalContent}
                contentLabel={`About ${props.name}`}
                id="explainSpriteModal"
                onAfterOpen={this.handleAfterOpen}
                onRequestClose={props.onClose}
            >
                <Box className={styles.body}>
                    {props.status === 'loading' ? (
                        <div
                            aria-live="polite"
                            className={styles.status}
                        >
                            {'Looking at the blocks...'}
                        </div>
                    ) : null}
                    {props.status === 'error' ? (
                        <div
                            aria-live="polite"
                            className={styles.status}
                        >
                            {'Could not explain this right now.'}
                        </div>
                    ) : null}
                    {props.status === 'done' ? (
                        <div aria-live="polite">
                            <Row
                                label="What it does"
                                text={props.summary}
                            />
                            <Row
                                label="Likely problem"
                                text={props.issue}
                            />
                            <Row
                                label="Try this"
                                text={props.suggestion}
                            />
                        </div>
                    ) : null}
                    <Box className={styles.buttonRow}>
                        <button
                            className={styles.closeButton}
                            ref={this.setCloseRef}
                            onClick={props.onClose}
                        >
                            {'Close'}
                        </button>
                    </Box>
                </Box>
            </Modal>
        );
    }
}

ExplainSpriteComponent.propTypes = {
    issue: PropTypes.string,
    name: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
    status: PropTypes.oneOf(['loading', 'done', 'error']).isRequired,
    suggestion: PropTypes.string,
    summary: PropTypes.string
};

ExplainSpriteComponent.defaultProps = {
    issue: '',
    suggestion: '',
    summary: ''
};

export default ExplainSpriteComponent;
