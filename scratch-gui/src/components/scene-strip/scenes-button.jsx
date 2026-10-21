import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import SqIcon from '../sq-icon';
import SceneStrip from './scene-strip.jsx';
import styles from './scene-strip.css';

const GUTTER = 16;

const messages = defineMessages({
    scenes: {
        id: 'sq.scenes.header.button',
        defaultMessage: 'Scenes',
        description: 'Stage header button that opens the scene strip'
    }
});

const currentName = controller => {
    const now = controller.current();
    return now && now.scene ? now.scene.name : '';
};

class ScenesButton extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChange',
            'handleDocumentKeyDown',
            'handleDocumentPointerDown',
            'handleToggle',
            'handleWindowChange',
            'setButton',
            'setPanel'
        ]);
        this.state = {open: false, name: currentName(props.controller), place: null};
    }
    componentDidMount () {
        const events = this.props.controller.events;
        this.disposers = [events.on('current', this.handleChange), events.on('scenes', this.handleChange)];
    }
    componentWillUnmount () {
        this.disposers.forEach(dispose => dispose());
        this.unlisten();
    }
    handleChange () {
        this.setState({name: currentName(this.props.controller)});
    }
    place () {
        if (!this.button) return null;
        const rect = this.button.getBoundingClientRect();
        const win = this.button.ownerDocument.defaultView;
        return {
            top: Math.round(rect.bottom + 6),
            right: Math.max(GUTTER, Math.round(win.innerWidth - rect.right))
        };
    }
    listen () {
        const doc = this.button.ownerDocument;
        doc.addEventListener('keydown', this.handleDocumentKeyDown, true);
        doc.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
        doc.defaultView.addEventListener('resize', this.handleWindowChange);
        this.listening = doc;
    }
    unlisten () {
        const doc = this.listening;
        if (!doc) return;
        doc.removeEventListener('keydown', this.handleDocumentKeyDown, true);
        doc.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
        doc.defaultView.removeEventListener('resize', this.handleWindowChange);
        this.listening = null;
    }
    close (refocus) {
        this.unlisten();
        this.setState({open: false});
        if (refocus && this.button) this.button.focus();
    }
    handleToggle () {
        if (this.state.open) {
            this.close(false);
            return;
        }
        this.setState({open: true, place: this.place()}, () => {
            this.listen();
            const first = this.panel && this.panel.querySelector('[tabindex="0"], button');
            if (first) first.focus();
        });
    }
    handleWindowChange () {
        this.setState({place: this.place()});
    }
    handleDocumentKeyDown (event) {
        if (event.key !== 'Escape') return;
        if (event.target && event.target.tagName === 'INPUT') return;
        event.stopPropagation();
        this.close(true);
    }
    handleDocumentPointerDown (event) {
        const inside = (this.panel && this.panel.contains(event.target)) ||
            (this.button && this.button.contains(event.target));
        if (!inside) this.close(false);
    }
    setButton (el) {
        this.button = el;
    }
    setPanel (el) {
        this.panel = el;
    }
    render () {
        const {controller, intl} = this.props;
        const label = intl.formatMessage(messages.scenes);
        const place = this.state.place || {top: 0, right: GUTTER};
        return (
            <span className={styles.anchor}>
                <button
                    aria-expanded={this.state.open}
                    aria-haspopup="dialog"
                    aria-label={this.state.name ? `${label}: ${this.state.name}` : label}
                    className={styles.headerButton}
                    ref={this.setButton}
                    title={label}
                    onClick={this.handleToggle}
                >
                    <SqIcon name="scenes" />
                    <span
                        aria-hidden="true"
                        className={styles.headerLabel}
                    >{this.state.name || label}</span>
                </button>
                {this.state.open ? (
                    <div
                        aria-label={label}
                        className={styles.popover}
                        ref={this.setPanel}
                        role="dialog"
                        style={{top: `${place.top}px`, right: `${place.right}px`}}
                    >
                        <SceneStrip controller={controller} />
                    </div>
                ) : null}
            </span>
        );
    }
}

ScenesButton.propTypes = {
    controller: PropTypes.shape({
        current: PropTypes.func.isRequired,
        events: PropTypes.shape({on: PropTypes.func.isRequired}).isRequired
    }).isRequired,
    intl: intlShape.isRequired
};

export default injectIntl(ScenesButton);
