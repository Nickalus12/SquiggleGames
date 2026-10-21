import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {TOUCH_KEYS} from '../../lib/touch-keys';

import styles from './touch-game-controls.css';

const messages = defineMessages({
    ArrowLeft: {
        id: 'gui.touchKeys.left',
        defaultMessage: 'Left arrow',
        description: 'On-screen game button that acts like the left arrow key'
    },
    ArrowUp: {
        id: 'gui.touchKeys.up',
        defaultMessage: 'Up arrow',
        description: 'On-screen game button that acts like the up arrow key'
    },
    ArrowDown: {
        id: 'gui.touchKeys.down',
        defaultMessage: 'Down arrow',
        description: 'On-screen game button that acts like the down arrow key'
    },
    ArrowRight: {
        id: 'gui.touchKeys.right',
        defaultMessage: 'Right arrow',
        description: 'On-screen game button that acts like the right arrow key'
    },
    space: {
        id: 'gui.touchKeys.space',
        defaultMessage: 'Space',
        description: 'On-screen game button that acts like the space bar'
    }
});

const ARROW_PATHS = {
    ArrowLeft: 'M15 5l-7 7 7 7',
    ArrowUp: 'M5 15l7-7 7 7',
    ArrowDown: 'M5 9l7 7 7-7',
    ArrowRight: 'M9 5l7 7-7 7'
};

const ARROW_SLOTS = {
    ArrowUp: styles.up,
    ArrowLeft: styles.left,
    ArrowRight: styles.right,
    ArrowDown: styles.down
};

class TouchGameControls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handlePointerDown',
            'handlePointerUp',
            'handleContextMenu',
            'releaseAll'
        ]);
        this.pointers = new Map();
        this.held = new Map();
        this.state = {down: {}};
    }
    componentDidMount () {
        window.addEventListener('blur', this.releaseAll);
    }
    componentWillUnmount () {
        window.removeEventListener('blur', this.releaseAll);
        this.releaseAll();
    }
    press (name) {
        const count = (this.held.get(name) || 0) + 1;
        this.held.set(name, count);
        if (count > 1) return;
        this.props.onKey(name, true);
        this.setState(state => ({down: Object.assign({}, state.down, {[name]: true})}));
    }
    release (name) {
        const count = (this.held.get(name) || 0) - 1;
        if (count > 0) {
            this.held.set(name, count);
            return;
        }
        this.held.delete(name);
        this.props.onKey(name, false);
        this.setState(state => ({down: Object.assign({}, state.down, {[name]: false})}));
    }
    releaseAll () {
        for (const name of this.held.keys()) this.props.onKey(name, false);
        this.held.clear();
        this.pointers.clear();
        this.setState({down: {}});
    }
    handlePointerDown (e) {
        e.preventDefault();
        const name = e.currentTarget.getAttribute('data-touch-key');
        if (this.pointers.has(e.pointerId)) return;
        if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, name);
        this.press(name);
    }
    handlePointerUp (e) {
        const name = this.pointers.get(e.pointerId);
        if (!name) return;
        this.pointers.delete(e.pointerId);
        this.release(name);
    }
    handleContextMenu (e) {
        e.preventDefault();
    }
    renderKey (touchKey, className) {
        const down = !!this.state.down[touchKey.name];
        const arrow = ARROW_PATHS[touchKey.name];
        const label = this.props.intl.formatMessage(messages[touchKey.name]);
        return (
            <button
                aria-label={label}
                aria-pressed={down}
                className={classNames(styles.key, className, {[styles.isDown]: down})}
                data-touch-key={touchKey.name}
                key={touchKey.name}
                tabIndex={-1}
                type="button"
                onContextMenu={this.handleContextMenu}
                onLostPointerCapture={this.handlePointerUp}
                onPointerCancel={this.handlePointerUp}
                onPointerDown={this.handlePointerDown}
                onPointerUp={this.handlePointerUp}
            >
                {arrow ? (
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                    >
                        <path
                            d={arrow}
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="3"
                        />
                    </svg>
                ) : (
                    <span className={styles.keyLabel}>{label}</span>
                )}
            </button>
        );
    }
    render () {
        const {className, keys, layout} = this.props;
        const shown = keys && keys.length ? TOUCH_KEYS.filter(k => keys.indexOf(k.scratchKey) !== -1) : TOUCH_KEYS;
        const arrows = shown.filter(k => ARROW_PATHS[k.name]);
        const actions = shown.filter(k => !ARROW_PATHS[k.name]);
        return (
            <div
                className={classNames(styles.controls, styles[layout], className)}
                data-touch-controls={layout}
                onContextMenu={this.handleContextMenu}
            >
                {arrows.length ? (
                    <div className={styles.pad}>
                        {arrows.map(k => this.renderKey(k, ARROW_SLOTS[k.name]))}
                    </div>
                ) : null}
                {actions.length ? (
                    <div className={styles.actions}>
                        {actions.map(k => this.renderKey(k, styles.action))}
                    </div>
                ) : null}
            </div>
        );
    }
}

TouchGameControls.propTypes = {
    className: PropTypes.string,
    intl: intlShape.isRequired,
    keys: PropTypes.arrayOf(PropTypes.string),
    layout: PropTypes.oneOf(['bottom', 'sides', 'overlay']),
    onKey: PropTypes.func.isRequired
};

TouchGameControls.defaultProps = {
    layout: 'bottom'
};

export default injectIntl(TouchGameControls);
