import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import {STARTER_TEMPLATES, applyStarterTemplate} from '../../lib/starter-templates.js';
import styles from './template-picker-modal.css';

class TemplatePickerModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            selectedId: STARTER_TEMPLATES[0].id,
            busy: false
        };
        this.handleSelect = this.handleSelect.bind(this);
        this.handleStart = this.handleStart.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleBackdropMouseDown = this.handleBackdropMouseDown.bind(this);
    }

    handleSelect (id) {
        this.setState({selectedId: id});
    }

    async handleStart () {
        if (this.state.busy) return;
        this.setState({busy: true});
        const {vm, onNewProject, onRequestClose} = this.props;
        const {selectedId} = this.state;
        if (selectedId === 'blank-16-9' && typeof onNewProject === 'function') {
            onNewProject();
        }
        await applyStarterTemplate(vm, selectedId);
        this.setState({busy: false});
        if (typeof onRequestClose === 'function') {
            onRequestClose();
        }
    }

    handleKeyDown (e) {
        if (e.key === 'Escape' && typeof this.props.onRequestClose === 'function') {
            e.stopPropagation();
            this.props.onRequestClose();
        }
    }

    handleBackdropMouseDown (e) {
        if (e.target === e.currentTarget && typeof this.props.onRequestClose === 'function') {
            this.props.onRequestClose();
        }
    }

    render () {
        if (!this.props.isOpen) return null;
        const {selectedId, busy} = this.state;
        return (
            <div
                className={styles.scrim}
                data-testid="template-picker-modal"
                onMouseDown={this.handleBackdropMouseDown}
                onKeyDown={this.handleKeyDown}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="sq-template-picker-title"
                    className={styles.sheet}
                >
                    <div className={styles.header}>
                        <div>
                            <h2
                                id="sq-template-picker-title"
                                className={styles.title}
                            >
                                {'Pick a Game Template'}
                            </h2>
                            <p className={styles.subtitle}>
                                {'Every template starts in 16:9 widescreen at 60 FPS with mobile thumbstick and HUD ready to customize.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            className={styles.closeBtn}
                            aria-label="Close"
                            onClick={this.props.onRequestClose}
                        >
                            {'×'}
                        </button>
                    </div>
                    <div className={styles.grid}>
                        {STARTER_TEMPLATES.map(item => {
                            const active = item.id === selectedId;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={classNames(styles.card, {[styles.cardActive]: active})}
                                    aria-pressed={active}
                                    data-template-id={item.id}
                                    onClick={() => this.handleSelect(item.id)}
                                >
                                    <div className={styles.cardTop}>
                                        <span className={styles.cardTitle}>{item.title}</span>
                                        <span className={styles.cardBadge}>{item.badge}</span>
                                    </div>
                                    <span className={styles.cardGenre}>{item.genre}</span>
                                    <p className={styles.cardSummary}>{item.summary}</p>
                                </button>
                            );
                        })}
                    </div>
                    <div className={styles.footer}>
                        <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={this.props.onRequestClose}
                        >
                            {'Cancel'}
                        </button>
                        <button
                            type="button"
                            className={styles.primaryBtn}
                            data-testid="template-picker-apply"
                            disabled={busy}
                            onClick={this.handleStart}
                        >
                            {busy ? 'Loading template…' : 'Start with Template'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

TemplatePickerModal.propTypes = {
    isOpen: PropTypes.bool,
    vm: PropTypes.shape({
        runtime: PropTypes.object
    }),
    onNewProject: PropTypes.func,
    onRequestClose: PropTypes.func
};

export default TemplatePickerModal;
